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
export async function runAll(deps) {
  const trackers = await deps.getTrackers();
  const out = { ok: 0, failed: 0 };
  for (const t of trackers) {
    try {
      const r = await findRank(page => deps.fetchPage(t, page), t);
      await deps.saveLog({ tracker_id: t.id, day: kstDay(), rank: r.rank, out_of_rank: r.out });
      await deps.markTracker(t.id, { last_collected_at: new Date().toISOString(), last_error: null });
      out.ok++;
    } catch (e) {
      await deps.markTracker(t.id, { last_error: String(e && e.message || e).slice(0, 200) });
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
    async getTrackers() {
      const r = await fetch(`${URL_}/rest/v1/rank_trackers?auto_collect=eq.true&select=id,keyword,place_name,place_id,lat,lng`, { headers: H });
      return r.ok ? await r.json() : [];
    },
    fetchPage: providerFetchPage,
    async saveLog(row) {
      const r = await fetch(`${URL_}/rest/v1/rank_logs?on_conflict=tracker_id,day`, { method: "POST", headers: { ...H, prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row) });
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
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!Deno.env.get("CRON_SECRET") || req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "unauthorized" }, 401);
    return json(await runAll(realDeps()));
  });
}
