// Supabase Edge Function: 매장 후보 찾기 (NAVER API HUB 지역 검색)
//
// 운영자가 매장명(또는 '매장명 + 지점명')을 입력하면 후보 업체 최대 5곳(업체명·주소·업종)을 돌려줍니다.
// 호출: GET https://naverapihub.apigw.ntruss.com/search/v1/local?query=…&display=5&start=1&sort=random&format=json
// 비밀값(Supabase > Edge Functions > Secrets): NAVER_APIHUB_CLIENT_ID, NAVER_APIHUB_CLIENT_SECRET
//   → 각각 X-NCP-APIGW-API-KEY-ID, X-NCP-APIGW-API-KEY 헤더로만 보내며 브라우저·로그로 나가지 않습니다.
//
// 지켜야 할 것
//  · 검색 응답은 DB에도 로그에도 저장하지 않습니다 (이 함수는 DB에 아무것도 쓰지 않고, console.log 도 쓰지 않습니다).
//  · 응답의 link 에서 플레이스 ID 를 추정하지 않습니다. link 는 아예 돌려주지 않습니다. 순위 추적용 ID 는 운영자가 직접 입력합니다.
//  · 이 결과의 배열 순서는 '순위'가 아닙니다 (sort=random). 순위 기록(rank_logs)과는 아무 관계가 없습니다.
//
// 아직 실제 NAVER API HUB 에서는 실행해 보지 않았습니다 (키 없음). 모의 응답으로 시험했습니다.

const LOCAL_URL = "https://naverapihub.apigw.ntruss.com/search/v1/local";
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

// 오류 문구에 키가 섞이지 않게 가림
export function redact(s, secrets = []) {
  let out = String(s == null ? "" : s);
  for (const k of secrets) if (k) out = out.split(k).join("***");
  return out.replace(/[A-Za-z0-9_-]{24,}/g, "***").slice(0, 160);
}
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
export const stripTags = s => String(s == null ? "" : s).replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|#39|apos);/g, m => ENT[m]).replace(/\s+/g, " ").trim();
export const cleanQuery = q => { const s = String(q == null ? "" : q).replace(/\s+/g, " ").trim(); return s.length >= 2 && s.length <= 40 ? s : null; };

// 지역 검색 호출 → 후보 목록 (업체명·도로명주소·지번주소·업종만. link·좌표·전화번호는 돌려주지 않음)
export async function searchLocal(query, clientId, clientSecret, fetchImpl = fetch) {
  const u = new URL(LOCAL_URL);
  u.searchParams.set("query", query); u.searchParams.set("display", "5"); u.searchParams.set("start", "1");
  u.searchParams.set("sort", "random"); u.searchParams.set("format", "json");
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
  let r;
  try {
    r = await fetchImpl(u.toString(), { headers: { "X-NCP-APIGW-API-KEY-ID": clientId, "X-NCP-APIGW-API-KEY": clientSecret }, signal: ctl.signal });
  } catch (e) { throw new Error(e && e.name === "AbortError" ? "timeout" : "network"); }
  finally { clearTimeout(to); }
  if (r.status === 401 || r.status === 403) throw new Error("auth_failed");
  if (r.status === 429) throw new Error("rate_limited");
  if (!r.ok) throw new Error("api_error");
  let j; try { j = await r.json(); } catch (_) { throw new Error("api_error"); }
  const items = Array.isArray(j && j.items) ? j.items : [];
  return items.slice(0, 5).map(it => ({
    name: stripTags(it && it.title), roadAddress: stripTags(it && it.roadAddress), address: stripTags(it && it.address), category: stripTags(it && it.category),
  })).filter(x => x.name);
}

// 요청 처리 (의존 대상을 바깥에서 받아 시험하기 쉽게 분리)
export async function handle(req, deps) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await deps.isAdmin(req.headers.get("authorization") || ""))) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const q = cleanQuery(body && body.query);
  if (!q) return json({ error: "bad_query" }, 400);
  const { id, secret } = deps.keys();
  if (!id || !secret) return json({ error: "not_configured" }, 503);      // 키가 없으면 외부 호출을 하지 않음
  try {
    return json({ items: await deps.search(q, id, secret) });
  } catch (e) {
    const code = ["auth_failed", "rate_limited", "timeout", "network"].includes(e && e.message) ? e.message : "api_error";
    return json({ error: code }, code === "rate_limited" ? 429 : 502);
  }
}

function realDeps() {
  const env = k => Deno.env.get(k);
  const URL_ = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  return {
    keys: () => ({ id: env("NAVER_APIHUB_CLIENT_ID"), secret: env("NAVER_APIHUB_CLIENT_SECRET") }),
    search: (q, id, secret) => searchLocal(q, id, secret),
    async isAdmin(authHeader) {                                              // 관리자 로그인 확인 (읽기만 함)
      const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: authHeader } });
      if (!u.ok) return false;
      const { id } = await u.json();
      const p = await fetch(`${URL_}/rest/v1/profiles?id=eq.${id}&select=role`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
      const rows = p.ok ? await p.json() : [];
      return !!rows[0] && rows[0].role === "admin";
    },
  };
}
if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(req => handle(req, realDeps()));
