// 업플로우 응답 → 화면용 값으로 바꾸는 순수 함수 모음 (브라우저·Node 모두에서 동작, 화면 코드는 admin-place.js)
// 업플로우의 '추적 키워드 ID'(id)와 '네이버 플레이스 ID'(placeId)는 항상 따로 다룹니다.
// 아직 업플로우 공식 문서로 필드 이름을 확인하지 못했습니다. 여러 이름 후보를 허용하는 방식이라, 첫 실제 응답을 본 뒤 이 파일의 후보 목록만 고치면 됩니다.
(function (root) {
  const isObj = x => x && typeof x === "object" && !Array.isArray(x);
  const toNum = v => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
  const firstNum = (o, names) => { if (!isObj(o)) return null; for (const k of names) { const n = toNum(o[k]); if (n != null) return n; } return null; };
  const firstStr = (o, names) => { if (!isObj(o)) return null; for (const k of names) if (o[k] != null && o[k] !== "") return String(o[k]); return null; };
  const byKey = (o, ...res) => { if (!isObj(o)) return null; for (const k of Object.keys(o)) if (res.every(re => re.test(k))) { const n = toNum(o[k]); if (n != null) return n; } return null; };

  // 응답 안의 배열 찾기
  function listOf(b) {
    if (Array.isArray(b)) return b;
    if (!isObj(b)) return [];
    for (const k of ["data", "items", "results", "keywords", "ranks"]) { const v = b[k]; if (Array.isArray(v)) return v; if (isObj(v)) { const r = listOf(v); if (r.length) return r; } }
    return [];
  }

  // 방문자 리뷰·블로그 리뷰·저장 수
  function metricsOf(o) {
    const m = isObj(o && o.metrics) ? o.metrics : (isObj(o) ? o : {});
    const visitor = firstNum(m, ["visitor_review_count", "visit_review_count", "visitor_reviews", "visit_reviews", "visitor_review", "visitorReviews", "visitor"]) ?? byKey(m, /visit/i, /review/i);
    const blog = firstNum(m, ["blog_review_count", "blog_reviews", "blog_review", "blogReviews", "blog"]) ?? byKey(m, /blog/i, /review/i);
    const save = firstNum(m, ["save_count", "saves", "save", "bookmark_count", "bookmarks", "saved"]) ?? byKey(m, /save|bookmark/i);
    return { visitor, blog, save };
  }

  // 날짜별 기록 1건. 실제 날짜는 search_day 를 씁니다 (today/yesterday 같은 이름에 의존하지 않음).
  function normRank(r) {
    if (!isObj(r)) return null;
    const day = String(r.search_day || r.day || r.date || "").slice(0, 10);
    const rank = toNum(r.rank);
    const st = String(r.status == null ? "" : r.status).toLowerCase();
    let status;
    if (/fail|captcha|error|block|timeout/.test(st) || r.success === false) status = "failed";
    else if (rank == null) status = "none";               // 순위 값이 없으면 수집된 것으로 보지 않음
    else if (rank === 0) status = "out";                  // 정상 수집된 rank=0 → 확인 범위 내 미노출
    else if (rank > 0) status = "ok";
    else status = "failed";
    return {
      day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
      rank: status === "ok" ? rank : (status === "out" ? 0 : null),
      status,
      range: r.checked_range != null ? r.checked_range : null,
      source: firstStr(r, ["source", "provider", "collector"]) || "",
      mode: firstStr(r, ["search_mode", "search_type", "mode"]) || "",
      device: firstStr(r, ["device", "platform"]) || "",
      checkedAt: firstStr(r, ["checked_at", "collected_at", "updated_at", "created_at"]),
      ...(() => { const m = metricsOf(r); return { visitor: m.visitor, blog: m.blog, save: m.save }; })(),
    };
  }
  // 같은 출처·같은 검색 조건에서 수집한 기록끼리만 비교합니다.
  const condKey = r => r ? `${r.source}|${r.mode}|${r.device}` : "";
  const comparable = (a, b) => !!a && !!b && (a.status === "ok" || a.status === "out") && (b.status === "ok" || b.status === "out") && condKey(a) === condKey(b);

  // 기록 목록 → 날짜 내림차순, 같은 날짜는 가장 늦게 수집한 1건
  function normHistory(list) {
    const byDay = new Map();
    for (const raw of listOf(list)) {
      const r = normRank(raw); if (!r || !r.day) continue;
      const old = byDay.get(r.day);
      if (!old || String(r.checkedAt || "") >= String(old.checkedAt || "")) byDay.set(r.day, r);
    }
    return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
  }

  // 추적 키워드 1건. ranks_summary 안의 today/yesterday 등은 이름이 아니라 search_day 로 해석합니다.
  function normKeyword(k) {
    if (!isObj(k)) return null;
    const place = isObj(k.place) ? k.place : {};
    const id = k.id ?? k.keyword_id ?? k.tracking_keyword_id;
    if (id == null) return null;
    const entries = []; let best = null;
    const sum = k.ranks_summary;
    const take = x => { const r = normRank(x); if (r && r.day) entries.push(r); };
    if (Array.isArray(sum)) sum.forEach(take);
    else if (isObj(sum)) for (const [name, v] of Object.entries(sum)) { if (isObj(v) && (v.search_day || v.day || v.date)) take(v); else if (/best|highest/i.test(name)) best = toNum(isObj(v) ? v.rank : v); }
    entries.sort((a, b) => b.day.localeCompare(a.day));
    const vol = isObj(k.volume) ? firstNum(k.volume, ["total", "monthly_total", "monthly", "monthly_search_volume", "count"]) : toNum(k.volume);
    return {
      id: String(id),
      keyword: firstStr(k, ["keyword", "query"]) || "",
      placeId: firstStr(place, ["place_id", "id", "naver_place_id"]) || firstStr(k, ["place_id", "naver_place_id"]) || "",
      placeName: firstStr(place, ["name", "place_name", "title"]) || firstStr(k, ["place_name", "name"]) || "",
      category: firstStr(place, ["category", "category_name"]) || "",
      address: firstStr(place, ["road_address", "address"]) || "",
      volume: vol ?? firstNum(k, ["monthly_volume", "search_volume"]),
      metrics: metricsOf(k),
      summary: entries,
      best,
      active: k.active == null ? (k.status == null || !/stop|pause|inactive|off/i.test(String(k.status))) : !!k.active,
    };
  }

  const dayAdd = (day, n) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

  // 매장·키워드 한 줄에 보여 줄 값들. hist = 날짜 내림차순 기록(없으면 ranks_summary 로 대체), startDay = 캠페인 시작일(없으면 null)
  function stats(kw, hist, startDay, today = kstDay()) {
    const recs = (hist && hist.length) ? hist : kw.summary;
    const latest = recs[0] || null, prev = recs[1] || null;
    let startRec = null, startState = "nostart";                       // 시작일이 정해지지 않음
    if (startDay) { startRec = recs.find(r => r.day === startDay) || null; startState = startRec ? startRec.status : "none"; }   // 시작일 기록이 없으면 '미수집' (첫 수집값으로 대체하지 않음)
    let delta = null;                                                  // 직전 기록 대비 (둘 다 순위가 있고 같은 조건일 때만)
    if (comparable(latest, prev) && latest.status === "ok" && prev.status === "ok") delta = prev.rank - latest.rank;
    let sinceStart = null;
    if (startRec && comparable(latest, startRec) && latest.status === "ok" && startRec.status === "ok") sinceStart = startRec.rank - latest.rank;
    const oks = recs.filter(r => r.status === "ok").map(r => r.rank);
    const best = oks.length ? Math.min(...oks) : (kw.best != null && kw.best > 0 ? kw.best : null);
    const last7 = []; for (let i = 6; i >= 0; i--) { const d = dayAdd(today, -i); last7.push({ day: d, rec: recs.find(r => r.day === d) || null }); }
    return { recs, latest, prev, startRec, startState, delta, sinceStart, best, last7, lastCollected: latest ? (latest.checkedAt || latest.day) : null };
  }

  // 오늘 확인할 항목: 비교 가능한 기록이 있을 때만 (급락 / 상위권 진입 / 미노출 전환)
  const TODAY_RULES = { drop: 10, top: 10 };
  function todayItems(kw, st, today = kstDay()) {
    const out = [], { latest, prev } = st;
    if (!latest || !prev || !comparable(latest, prev) || !latest.day || latest.day < dayAdd(today, -1)) return out;
    if (latest.status === "ok" && prev.status === "ok" && latest.rank - prev.rank >= TODAY_RULES.drop) out.push({ type: "drop", text: `${prev.rank}위 → ${latest.rank}위로 ${latest.rank - prev.rank}계단 내려갔어요` });
    if (latest.status === "ok" && latest.rank <= TODAY_RULES.top && (prev.status === "out" || (prev.status === "ok" && prev.rank > TODAY_RULES.top))) out.push({ type: "top", text: `${prev.status === "out" ? "미노출" : prev.rank + "위"} → ${latest.rank}위로 ${TODAY_RULES.top}위 안에 들어왔어요` });
    if (latest.status === "out" && prev.status === "ok") out.push({ type: "out", text: `${prev.rank}위 → 확인 범위 내 미노출로 바뀌었어요` });
    return out;
  }

  const rangeText = r => r == null || r === "" ? "" : (typeof r === "number" ? `${r}위까지` : (isObj(r) ? (r.to != null ? `${r.from != null ? r.from + "~" : ""}${r.to}위` : "") : String(r)));
  // 순위 칸 글자: 미수집 / 순위 / 확인 범위 내 미노출 / 조회 실패
  function rankText(rec) {
    if (!rec || rec.status === "none") return "미수집";
    if (rec.status === "failed") return "조회 실패";
    if (rec.status === "out") return "미노출";
    return rec.rank + "위";
  }

  // 엑셀(CSV)용: 수식으로 해석되는 글자로 시작하면 앞에 ' 를 붙여 막습니다
  const csvCell = v => { let s = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const toCsv = rows => "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");

  const api = { isObj, toNum, listOf, metricsOf, normRank, normHistory, normKeyword, condKey, comparable, stats, todayItems, TODAY_RULES, rankText, rangeText, csvCell, toCsv, dayAdd, kstDay };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PlaceNorm = api;
})(typeof window !== "undefined" ? window : globalThis);
