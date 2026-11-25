// Supabase Edge Function: 네이버 통합검색 플레이스 노출 순서 조회 (SerpApi 이용)
//
// 호출하는 곳: ① 관리자 화면의 '지금 조회' 버튼 (관리자 로그인 필요)  ② 하루 한 번 예약 실행 (x-cron-secret 필요, 자동 수집 스위치가 켜져 있을 때만)
// 필요한 비밀값 (Supabase > Edge Functions > Secrets): SERPAPI_API_KEY, CRON_SECRET
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동으로 넣어 줍니다. 키는 브라우저·로그에 절대 내보내지 않습니다.
//
// 조회 조건(고정): engine=naver, where=nexearch, device=mobile, query=등록한 키워드
// 한도(서버에서 강제): 한국 시간 하루 5회, 월 200회 (실패한 호출도 포함), 활성 키워드 5개. 한도 확인은 SerpApi 를 부르기 '전에' 합니다 (020 SQL).
// 같은 키워드의 여러 매장은 SerpApi 를 한 번만 불러 한 번의 응답으로 모두 확인합니다.
//
// 아직 실제 SerpApi·Supabase 에서는 실행해 보지 않았습니다. 판단 로직은 모의 응답으로 시험했습니다.

const SERP_URL = "https://serpapi.com/search.json";
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
export const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

// 오류 문구에서 API 키가 새어 나가지 않게 가림
export function redact(s) {
  return String(s == null ? "" : s).replace(/api_key=[^&\s"')]+/gi, "api_key=***").replace(/[A-Za-z0-9_-]{32,}/g, "***").slice(0, 200);
}

// 링크 속 경로 숫자가 플레이스 ID 와 정확히 같을 때만 같은 매장으로 봄 (같은 상호의 다른 지점·비슷한 숫자와 혼동하지 않음)
export function linkHasId(link, id) {
  return !!id && new RegExp(`/${String(id).replace(/[^0-9]/g, "")}(?:[/?#]|$)`).test(String(link || ""));
}
export function findPlace(items, placeId) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const same = (it.place_id != null && String(it.place_id) === String(placeId)) || linkHasId(it.link, placeId);
    if (same) return { position: Number.isInteger(it.position) ? it.position : i + 1, name: it.title || it.name || null };
  }
  return null;
}

// SerpApi 한 번 호출 → place_results 배열 (없으면 빈 배열)
export async function fetchSerp(keyword, apiKey, fetchImpl = fetch) {
  const u = new URL(SERP_URL);
  u.searchParams.set("engine", "naver"); u.searchParams.set("where", "nexearch"); u.searchParams.set("device", "mobile");
  u.searchParams.set("query", keyword); u.searchParams.set("api_key", apiKey);
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
  let r;
  try { r = await fetchImpl(u.toString(), { signal: ctl.signal }); }
  catch (e) { throw new Error(e && e.name === "AbortError" ? "timeout" : "network: " + redact(e && e.message)); }
  finally { clearTimeout(to); }
  if (!r.ok) throw new Error("http_" + r.status);
  let j; try { j = await r.json(); } catch (_) { throw new Error("bad_json"); }
  if (j && j.error) throw new Error("serpapi: " + redact(j.error));
  if (j && j.search_metadata && j.search_metadata.status === "Error") throw new Error("serpapi_error");
  return Array.isArray(j && j.place_results) ? j.place_results : [];
}

// 한 키워드(=한 번의 SerpApi 호출)로 그 키워드를 쓰는 모든 매장을 확인
export async function checkKeyword(keyword, trackers, deps, source) {
  const base = id => ({ tracker_id: id, day: kstDay(), source: "provider", keyword, checked_at: new Date().toISOString() });
  const done = await deps.todayDone(trackers.map(t => t.id));          // 오늘 이미 성공 기록이 있는 매장 (수동 확인·이전 조회 포함)
  const todo = trackers.filter(t => !done.has(t.id));
  if (!todo.length) return { keyword, cached: true, trackers: trackers.length };

  const noId = todo.filter(t => !t.place_id), withId = todo.filter(t => t.place_id);
  for (const t of noId) {                                               // ID 가 없으면 같은 상호의 다른 지점과 구분할 수 없어서 조회하지 않음
    await deps.saveLog({ ...base(t.id), rank: null, status: "failed", out_of_rank: false }, true);
    await deps.markTracker(t.id, { last_error: "플레이스 ID가 없어 조회할 수 없어요" });
  }
  if (!withId.length) return { keyword, failed: true, error: "no_place_id", trackers: todo.length };

  const rsv = await deps.reserve(keyword, source);                      // 한도·동시 요청 확인 (API 호출 전)
  if (!rsv.ok) return { keyword, denied: rsv.reason, usage: rsv };

  let places;
  try {
    places = await deps.fetchSerp(keyword);
    await deps.finish(rsv.id, "ok", null, withId.length);
  } catch (e) {
    const msg = redact(e && e.message);
    await deps.finish(rsv.id, "failed", msg, withId.length);
    for (const t of withId) { await deps.saveLog({ ...base(t.id), rank: null, status: "failed", out_of_rank: false }, true); await deps.markTracker(t.id, { last_error: msg }); }
    return { keyword, failed: true, error: msg, called: true };
  }
  const results = [];
  for (const t of withId) {
    const hit = findPlace(places, t.place_id);
    await deps.saveLog({ ...base(t.id), rank: hit ? hit.position : null, status: hit ? "ok" : "out", out_of_rank: !hit }, false);
    await deps.markTracker(t.id, { last_collected_at: new Date().toISOString(), last_error: null });
    results.push({ id: t.id, found: !!hit, position: hit ? hit.position : null });
  }
  return { keyword, called: true, results, usage: rsv };
}

const groupByKeyword = trackers => {
  const m = new Map();
  for (const t of trackers) { const k = String(t.keyword).trim().toLowerCase(); if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
  return [...m.values()];
};

// 관리자 '지금 조회': 선택한 매장의 키워드 하나만
export async function runManual(trackerId, deps) {
  if (!deps.providerReady()) return { error: "provider_not_configured" };
  const t = await deps.getTracker(trackerId);
  if (!t) return { error: "not_found" };
  if (!t.active) return { error: "inactive" };
  const group = (await deps.getActiveTrackers()).filter(x => String(x.keyword).trim().toLowerCase() === String(t.keyword).trim().toLowerCase());
  return await checkKeyword(t.keyword, group.length ? group : [t], deps, "manual");
}

// 하루 한 번 예약 실행: 자동 수집이 켜져 있을 때만. 오늘 이미 확인한 키워드는 건너뜀. 한도에 닿으면 멈춤.
export async function runCron(deps) {
  if (!(await deps.autoOn())) return { skipped: "auto_off" };
  if (!deps.providerReady()) return { error: "provider_not_configured" };
  const out = { keywords: [], stopped: null };
  for (const group of groupByKeyword(await deps.getActiveTrackers())) {
    const r = await checkKeyword(group[0].keyword, group, deps, "cron");
    out.keywords.push({ keyword: r.keyword, cached: !!r.cached, called: !!r.called, failed: !!r.failed, denied: r.denied || null });
    if (r.denied === "daily_limit" || r.denied === "monthly_limit") { out.stopped = r.denied; break; }
    await deps.sleep(1000);
  }
  return out;
}

// ---- 실제 서버 연결 (Deno 환경에서만 실행) ----
function realDeps() {
  const env = k => Deno.env.get(k);
  const URL_ = env("SUPABASE_URL");
  // 서버 전용 키: 새 방식 비밀 키(SUPABASE_SECRET_KEYS)가 있으면 그것을, 없으면 예전 service_role 키를 씀
  let KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  try { const k = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}"); const v = k.default || Object.values(k)[0]; if (typeof v === "string" && v) KEY = v; } catch (_) { /* 무시 */ }
  const H = KEY && KEY.startsWith("sb_") ? { apikey: KEY, "content-type": "application/json" } : { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  const get = async path => { const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H }); if (!r.ok) throw new Error("db_" + r.status); return await r.json(); };   // 실패를 빈 목록으로 숨기지 않음
  const rpc = async (fn, body) => { const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(body) }); if (!r.ok) throw new Error("rpc_" + fn + "_" + r.status); return await r.json(); };
  return {
    providerReady: () => !!env("SERPAPI_API_KEY"),
    async autoOn() { const r = await get("app_settings?key=eq.rank_auto&select=value"); return !!(r[0] && r[0].value === true); },
    async getTracker(id) { return (await get(`rank_trackers?id=eq.${id}&select=id,keyword,place_name,place_id,active`))[0] || null; },
    async getActiveTrackers() { return await get("rank_trackers?active=eq.true&select=id,keyword,place_name,place_id,active&order=created_at"); },
    async todayDone(ids) {
      if (!ids.length) return new Set();
      const r = await get(`rank_logs?tracker_id=in.(${ids.join(",")})&day=eq.${kstDay()}&status=in.(ok,out)&select=tracker_id`);
      return new Set(r.map(x => x.tracker_id));
    },
    reserve: (keyword, source) => rpc("reserve_serp_call", { p_keyword: keyword, p_source: source }),
    finish: (id, status, error, count) => rpc("finish_serp_call", { p_id: id, p_status: status, p_error: error, p_count: count }),
    fetchSerp: keyword => fetchSerp(keyword, env("SERPAPI_API_KEY")),
    async saveLog(row, keepExisting) {
      const r = await fetch(`${URL_}/rest/v1/rank_logs?on_conflict=tracker_id,day`, { method: "POST", headers: { ...H, prefer: keepExisting ? "resolution=ignore-duplicates" : "resolution=merge-duplicates" }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error("save_failed");
    },
    async markTracker(id, patch) { await fetch(`${URL_}/rest/v1/rank_trackers?id=eq.${id}`, { method: "PATCH", headers: H, body: JSON.stringify(patch) }); },
    async isAdmin(req) {                                                     // 관리자 로그인 확인 (읽기만 함). 브라우저가 보낸 로그인 토큰과 공개용 키로 확인
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
    sleep: ms => new Promise(r => setTimeout(r, ms)),
  };
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "access-control-allow-methods": "POST, OPTIONS" } });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const deps = realDeps(), cron = Deno.env.get("CRON_SECRET");
    try {
      if (cron && req.headers.get("x-cron-secret") === cron) return json(await runCron(deps));            // 하루 한 번 예약 실행
      const body = await req.json().catch(() => ({}));
      if (!body.tracker_id || !/^[0-9a-f-]{36}$/i.test(String(body.tracker_id))) return json({ error: "unauthorized", why: "bad_request" }, 401);
      const adm = await deps.isAdmin(req);
      if (!adm.ok) return json({ error: "unauthorized", why: adm.why }, 401);
      return json(await runManual(body.tracker_id, deps));                                                // 관리자 '지금 조회'
    } catch (e) {
      return json({ error: "server_error", detail: redact(e && e.message) }, 500);                       // 키가 섞여 나가지 않게 가린 뒤 반환
    }
  });
}
