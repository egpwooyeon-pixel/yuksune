// Supabase Edge Function: 순위 자동 수집 (하루 1번 예약 실행). 최대 300위까지 찾아서 rank_logs 에 저장.
// 필요한 비밀값: CRON_SECRET (예약 실행이 보내는 확인 값), 외부 순위 데이터 서비스의 API 키 (아래 provider 부분)
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동으로 넣어 줍니다.
// ⚠ 순위 데이터 공급자(provider) 연결부는 해당 서비스의 공식 문서를 확인한 뒤에 채웁니다 (아직 비어 있음).
// 찾기/저장 로직은 모의 데이터로 시험했고, 실제 Supabase·외부 서비스에서는 실행해 보지 않았습니다.

const MAX_PAGES = 5, MAX_RANK = 300;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

// 검색 결과 한 항목이 우리 추적 대상 매장인지 확인 (플레이스 ID 우선, 없으면 업체명 정확히 일치)
export function matches(item, t) {
  if (t.place_id) {
    if (String(item.placeId || "") === String(t.place_id)) return true;
    return new RegExp(`/${t.place_id}(?:[/?#]|$)`).test(String(item.link || ""));   // 주소 경로 속 숫자가 정확히 같을 때만 (/place/ID, /restaurant/ID/home 등)
  }
  return !!t.place_name && String(item.name || "").trim() === String(t.place_name).trim();
}

// fetchPage(page) → [{ name, placeId?, link?, position? }, ...]  페이지를 넘기며 최대 300위까지 찾음
export async function findRank(fetchPage, t, { maxPages = MAX_PAGES, maxRank = MAX_RANK } = {}) {
  let seen = 0;
  for (let page = 1; page <= maxPages; page++) {
    const items = await fetchPage(page);
    if (!items || !items.length) break;
    for (let i = 0; i < items.length; i++) {
      const rank = Number.isInteger(items[i].position) ? items[i].position : seen + i + 1;
      if (rank > maxRank) return { rank: null, out: true };
      if (matches(items[i], t)) return { rank, out: false };
    }
    seen += items.length;
    if (seen >= maxRank) break;
  }
  return { rank: null, out: true };   // 300위 안에서 못 찾음 = 순위 밖
}

const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 전체 실행: 자동 수집이 켜진 추적을 하나씩 처리. 한 건이 실패해도 나머지는 계속.
// ids 를 주면 그 추적만 처리('지금 조회'). 조회 실패는 '조회 실패'로 기록하되, 이미 있는 정상 기록은 덮어쓰지 않음.
export async function runAll(deps, ids) {
  const trackers = await deps.getTrackers(ids);
  const out = { ok: 0, failed: 0, notConfigured: false };
  for (const t of trackers) {
    const base = { tracker_id: t.id, day: kstDay(), source: "provider", keyword: t.keyword, checked_at: new Date().toISOString() };
    try {
      const r = await findRank(page => deps.fetchPage(t, page), t);
      await deps.saveLog({ ...base, rank: r.rank, status: r.out ? "out" : "ok", out_of_rank: r.out }, false);
      await deps.markTracker(t.id, { last_collected_at: base.checked_at, last_error: null });
      out.ok++;
    } catch (e) {
      const msg = String(e && e.message || e).slice(0, 200);
      if (msg === "provider_not_configured") out.notConfigured = true;
      else await deps.saveLog({ ...base, rank: null, status: "failed", out_of_rank: false }, true);   // 같은 날 정상 기록이 있으면 그대로 둠
      await deps.markTracker(t.id, { last_error: msg });
      out.failed++;
    }
    await deps.sleep(1000);                       // 서비스에 부담을 주지 않도록 간격
  }
  return out;
}

// 순위 데이터 공급자 연결부 — 공식 문서를 확인한 뒤 채움 (지금은 의도적으로 비어 있음)
async function providerFetchPage(_tracker, _page) {
  throw new Error("provider_not_configured");
}

function realDeps() {
  const URL_ = Deno.env.get("SUPABASE_URL"), KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  return {
    async getTrackers(ids) {
      const filter = ids && ids.length ? `id=in.(${ids.join(",")})` : "auto_collect=eq.true";
      const r = await fetch(`${URL_}/rest/v1/rank_trackers?active=eq.true&${filter}&select=id,keyword,place_name,place_id,lat,lng`, { headers: H });
      return r.ok ? await r.json() : [];
    },
    async isAdmin(authHeader) {                                   // 관리자 화면의 '지금 조회' 요청 확인
      const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: authHeader } });
      if (!u.ok) return false;
      const { id } = await u.json();
      const p = await fetch(`${URL_}/rest/v1/profiles?id=eq.${id}&select=role`, { headers: H });
      const rows = p.ok ? await p.json() : [];
      return !!rows[0] && rows[0].role === "admin";
    },
    fetchPage: providerFetchPage,
    async saveLog(row, keepExisting) {
      const r = await fetch(`${URL_}/rest/v1/rank_logs?on_conflict=tracker_id,day`, { method: "POST", headers: { ...H, prefer: keepExisting ? "resolution=ignore-duplicates" : "resolution=merge-duplicates" }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error("save_failed");
    },
    async markTracker(id, patch) {
      await fetch(`${URL_}/rest/v1/rank_trackers?id=eq.${id}`, { method: "PATCH", headers: H, body: JSON.stringify(patch) });
    },
    sleep: ms => new Promise(r => setTimeout(r, ms)),
  };
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "access-control-allow-methods": "POST, OPTIONS" } });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const deps = realDeps();
    const cron = Deno.env.get("CRON_SECRET");
    if (cron && req.headers.get("x-cron-secret") === cron) return json(await runAll(deps));           // 하루 한 번 예약 실행
    const body = await req.json().catch(() => ({}));
    if (body.tracker_id && /^[0-9a-f-]{36}$/i.test(String(body.tracker_id)) && await deps.isAdmin(req.headers.get("authorization") || "")) {
      const r = await runAll(deps, [body.tracker_id]);                                               // 관리자 '지금 조회'
      return json(r.notConfigured ? { error: "provider_not_configured" } : r);
    }
    return json({ error: "unauthorized" }, 401);
  });
}
