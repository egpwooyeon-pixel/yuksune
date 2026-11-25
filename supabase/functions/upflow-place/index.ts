// Supabase Edge Function: 업플로우 공식 API 연결 (네이버 플레이스 순위 · 읽기 전용 + 사용자가 누를 때만 쓰기)
//
// 호출하는 곳: 관리자 화면 > 네이버 플레이스 (관리자 로그인 필요)
// 필요한 비밀값 (Supabase > Edge Functions > Secrets): UPFLOW_API_KEY
//   → X-API-Key 헤더로만 보내며 브라우저·로그·응답에 내보내지 않습니다.
//
// Base URL: https://upflow.co.kr/api/v1 (고정. 다른 주소로는 요청하지 않음)
// 읽기 권한(read)으로 가능:  status(GET /auth/verify) · keywords(GET /keywords?service=place&include=…) · ranks / ranks_batch(GET /keywords/place/{id}/ranks?include=…)
//   · groups(GET /groups?service=place) · lookup(POST /keywords/place/lookup, 중복 확인) · summary(POST /keywords/place/ranks-summary, 최대 200개 ID) · search(POST /search/place, 1회 검색)
// 쓰기 권한(write)에서만 허용 (서버가 /auth/verify 로 권한을 확인해 막음): register(POST /keywords/place, 최대 50건) · refresh(POST /keywords/place/{id}/refresh) · move_group(PATCH /keywords/place/{id})
//   → 1회 검색·재검색은 업플로우 웹과 일일 검색 사용량을 함께 씁니다. 등록·1회 검색·재검색은 자동으로 되풀이하지 않고, 같은 요청이 30초 안에 반복되면 서버에서도 막습니다.
//   → 읽기 요청만 429 의 Retry-After 가 있을 때 (10초 이내면) 최대 2번 다시 시도합니다.
//
// 아직 업플로우 공식 문서·실제 API 로 확인하지 못했습니다 (이 환경에서 접속 불가). 아래 "가정" 표시가 있는 곳은 첫 실호출 때 확인이 필요합니다.
// 응답은 가공하지 않고 그대로 전달합니다 (가공은 화면의 place-normalize.js 가 합니다). 이 함수는 DB 에 아무것도 쓰지 않습니다.

const BASE = "https://upflow.co.kr/api/v1";
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

export const redact = (s, secrets = []) => {
  let out = String(s == null ? "" : s);
  for (const k of secrets) if (k) out = out.split(k).join("***");
  return out.replace(/[A-Za-z0-9_-]{28,}/g, "***").slice(0, 160);
};
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KEYWORD_INCLUDE = "ranks_summary,metrics,volume,place";
const RANK_INCLUDE = "metrics,volume,place";

// 오류를 화면에서 구분할 수 있게 분류: 승인 필요 · 키 설정 오류 · 권한 부족 · 분당 호출 초과 · 일일 검색 한도 초과 · 슬롯 부족 · 중복
// (업플로우의 오류 코드 이름은 가정: HTTP 상태와 본문의 코드·문구로 판별합니다)
export function classify(status, text) {
  const t = String(text || "").toLowerCase();
  if (status === 401) return "auth_failed";
  if (status === 409 && /duplicate|중복/.test(t)) return "duplicate";
  if (status === 403) return /approv|승인|pending/.test(t) ? "approval_required" : "forbidden";
  if (/slot|슬롯/.test(t) && status >= 400 && status < 500) return "slot_limit";
  if (status === 429) return /daily|일일|quota|한도/.test(t) ? "daily_limit" : "rate_limited";
  if (status === 402) return /slot|슬롯/.test(t) ? "slot_limit" : "daily_limit";
  if (status >= 400 && status < 500 && /daily|일일|quota/.test(t)) return "daily_limit";
  if (status === 404) return "not_found";
  if (status >= 400 && status < 500) return "bad_request";
  return "api_error";
}

// 다음 페이지 찾기 (가정: next_cursor / next / has_more·page / pagination.* 중 하나로 알려 줌)
export function nextPage(body, current) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const pg = body.pagination || body.meta || body.paging || {};
  const cursor = body.next_cursor || pg.next_cursor || pg.cursor_next;
  if (cursor) return { cursor: String(cursor) };
  const nxt = body.next || pg.next || body.links && body.links.next;
  if (typeof nxt === "string" && nxt) {
    try { const u = new URL(nxt, BASE + "/"); if (u.origin === "https://upflow.co.kr") { const c = u.searchParams.get("cursor"), p = u.searchParams.get("page"); if (c) return { cursor: c }; if (p) return { page: Number(p) }; } } catch (_) { /* 무시 */ }
  }
  const page = Number(pg.page || pg.current_page || body.page || current || 1);
  const total = Number(pg.total_pages || pg.last_page || pg.pages || body.total_pages || 0);
  if ((pg.has_more === true || pg.has_next === true || body.has_more === true) || (total && page < total)) return { page: page + 1 };
  return null;
}
export function itemsOf(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  for (const k of ["data", "items", "results", "keywords", "ranks"]) {
    if (Array.isArray(body[k])) return body[k];
    if (body[k] && typeof body[k] === "object") { const r = itemsOf(body[k]); if (r.length) return r; }
  }
  return [];
}

const sleepMs = ms => new Promise(r => setTimeout(r, ms));
// opts.retry = true 는 '읽기'에만: 429 에 Retry-After(10초 이내)가 있을 때만 최대 2번 다시 시도. 쓰기·검색은 절대 자동 반복하지 않음.
export async function callUpflow(method, path, params, body, apiKey, fetchImpl = fetch, opts = {}) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== "") u.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 25000);
    let r;
    try {
      r = await fetchImpl(u.toString(), { method, headers: { "X-API-Key": apiKey, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    } catch (e) { throw Object.assign(new Error(e && e.name === "AbortError" ? "timeout" : "network"), { code: e && e.name === "AbortError" ? "timeout" : "network" }); }
    finally { clearTimeout(to); }
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { /* 본문이 JSON 이 아님 */ }
    if (r.ok) return data;
    const ra = Number(r.headers && r.headers.get && r.headers.get("retry-after"));
    const retryAfter = Number.isFinite(ra) && ra >= 0 ? ra : null;
    if (opts.retry && r.status === 429 && retryAfter != null && retryAfter <= 10 && attempt < 2) { await (opts.sleep || sleepMs)(retryAfter * 1000); continue; }
    const err = data && (data.error && typeof data.error === "object" ? data.error : data) || {};
    const codeText = [err.code, typeof data?.error === "string" ? data.error : "", err.message, err.detail].filter(Boolean).join(" ");
    throw Object.assign(new Error("upstream"), { code: classify(r.status, codeText + " " + text), status: r.status, retry_after: retryAfter, existing_id: err.existing_id ?? data?.existing_id ?? null, detail: redact(err.message || err.detail || (typeof data?.error === "string" ? data.error : "") || text, [apiKey]) });
  }
}

// /auth/verify 응답에서 화면에 보여 줄 것만 추립니다 (키·회원 정보·헤더는 버림). 필드 이름은 가정이라 여러 후보를 봅니다.
export function summarizeVerify(v) {
  const o = v && typeof v === "object" ? (v.data && typeof v.data === "object" ? v.data : v) : {};
  const num = x => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x))) ? null : Number(x);
  const pair = (...names) => { for (const n of names) { const p = o[n]; if (p && typeof p === "object") { const used = num(p.used ?? p.current ?? p.count ?? p.usage), limit = num(p.limit ?? p.max ?? p.total ?? p.quota); if (used != null || limit != null) return { used, limit }; } } return null; };
  let approved = null;
  for (const n of ["approved", "is_approved", "api_approved"]) if (typeof o[n] === "boolean") { approved = o[n]; break; }
  if (approved === null && typeof o.status === "string") approved = /^(approved|active|ok)$/i.test(o.status) ? true : /^(pending|waiting|rejected|inactive)$/i.test(o.status) ? false : null;
  const raw = o.permissions ?? o.scopes ?? o.scope ?? (o.key && o.key.permissions);
  let read = null, write = null;
  const fromText = t => { const x = String(t).toLowerCase(); return { r: /read|rw|readwrite|write/.test(x), w: /write|rw|manage/.test(x) }; };
  if (Array.isArray(raw)) { const m = raw.map(fromText); read = m.some(x => x.r); write = m.some(x => x.w); }
  else if (typeof raw === "string") { const m = fromText(raw); read = m.r; write = m.w; }
  else if (raw && typeof raw === "object") { read = raw.read === true ? true : raw.read === false ? false : null; write = raw.write === true ? true : raw.write === false ? false : null; }
  if (write === true && read === null) read = true;
  return { approved, read, write, slots: pair("slots", "slot", "slot_usage", "keyword_slots"), daily: pair("daily_search", "daily_searches", "search_usage", "daily_usage", "searches") };
}

// 여러 쪽을 이어 붙여 읽기 (최대 30쪽)
export async function readAll(path, params, apiKey, fetchImpl, sleep) {
  const all = []; let p = { ...params }, guard = 0, last = null;
  while (guard++ < 30) {
    const body = await callUpflow("GET", path, p, null, apiKey, fetchImpl, { retry: true, sleep }); last = body;
    all.push(...itemsOf(body));
    const nx = nextPage(body, Number(p.page || 1)); if (!nx) break;
    p = { ...params, ...(nx.cursor ? { cursor: nx.cursor } : { page: nx.page }) };
  }
  return { items: all, pages: guard, truncated: guard >= 30 && !!nextPage(last, 1) };
}

function realDeps() {
  const env = k => Deno.env.get(k);
  const URL_ = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apiKey: () => env("UPFLOW_API_KEY"),
    async isAdmin(req) {                                             // 관리자 로그인 확인 (읽기만 함). 브라우저가 보낸 로그인 토큰과 공개용 키로 확인
      const auth = req.headers.get("authorization") || "";
      const apikey = req.headers.get("apikey") || env("SUPABASE_ANON_KEY") || KEY;
      if (!/^Bearer\s+\S+/.test(auth)) return { ok: false, why: "no_token" };
      let u; try { u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey, authorization: auth } }); } catch (_) { return { ok: false, why: "auth_unreachable" }; }
      if (!u.ok) return { ok: false, why: "auth_" + u.status };
      const { id } = await u.json();
      let p; try { p = await fetch(`${URL_}/rest/v1/profiles?id=eq.${id}&select=role`, { headers: { apikey, authorization: auth } }); } catch (_) { return { ok: false, why: "profile_unreachable" }; }
      if (!p.ok) return { ok: false, why: "profile_" + p.status };
      const rows = await p.json();
      return rows[0] && rows[0].role === "admin" ? { ok: true } : { ok: false, why: "not_admin" };
    },
  };
}
if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(req => handle(req, realDeps()));
