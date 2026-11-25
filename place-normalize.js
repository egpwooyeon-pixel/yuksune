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
      groupId: k.group_id != null ? String(k.group_id) : (isObj(k.group) && k.group.id != null ? String(k.group.id) : ""),
      groupName: isObj(k.group) ? (firstStr(k.group, ["name", "title"]) || "") : (firstStr(k, ["group_name"]) || ""),
      mode: firstStr(k, ["search_mode", "search_type", "mode"]) || "",
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


  // ---- 운영 기능: 그룹 · 중복 확인 · 대량 등록 결과 · 직전 대비 표시 · 검색 조건 구간 ----
  const normGroup = g => isObj(g) && (g.id != null) ? { id: String(g.id), name: firstStr(g, ["name", "title"]) || ("그룹 " + g.id), count: toNum(g.keyword_count ?? g.count) } : null;

  // 플레이스 주소/ID 에서 숫자 ID 뽑기 (화면 입력 · 대량 입력 공용)
  function placeIdFrom(v) {
    v = String(v == null ? "" : v).trim(); if (!v) return { err: "플레이스 주소 또는 ID가 비었어요." };
    if (/^\d{5,15}$/.test(v)) return { id: v };
    if (/naver\.me\//i.test(v)) return { err: "단축 주소(naver.me)는 쓸 수 없어요." };
    if (/\/search\//.test(v) && !/\/place\/\d/.test(v)) return { err: "검색 결과 목록 주소예요." };
    const m = v.match(/\/(\d{5,15})(?:[\/?#]|$)/); return m ? { id: m[1] } : { err: "플레이스 ID를 찾지 못했어요." };
  }
  // 대량 입력: 한 줄에 "키워드, 플레이스 주소 또는 ID" (최대 50줄)
  function parseRegLines(text, max = 50) {
    const rows = []; const seen = new Set();
    String(text || "").split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim(); if (!line) return;
      const cut = line.search(/[,\t|]/); const keyword = (cut < 0 ? line : line.slice(0, cut)).trim(), rest = cut < 0 ? "" : line.slice(cut + 1).trim();
      const pid = placeIdFrom(rest); let error = null;
      if (!keyword || keyword.length > 40) error = "키워드는 1~40자로 입력해 주세요."; else if (pid.err) error = pid.err;
      const key = keyword.toLowerCase() + "|" + (pid.id || "");
      if (!error && seen.has(key)) error = "같은 줄이 두 번 있어요."; seen.add(key);
      rows.push({ n: i + 1, line, keyword, placeId: pid.id || "", error });
    });
    return { rows: rows.slice(0, max), over: rows.length > max };
  }
  // 대량 등록 응답의 항목 1건: HTTP 200 이어도 항목마다 결과를 확인
  function classifyBulkItem(it) {
    const o = isObj(it) ? it : {};
    const parts = [o.status, o.result, o.code, o.state, o.message, o.reason, isObj(o.error) ? (o.error.code + " " + (o.error.message || "")) : o.error].filter(x => x != null && typeof x !== "object");
    const t = parts.join(" ").toLowerCase();
    const id = o.id ?? o.keyword_id ?? o.tracking_keyword_id ?? (isObj(o.keyword) ? o.keyword.id : null) ?? null;
    const existing = o.existing_id ?? (isObj(o.error) ? o.error.existing_id : null) ?? null;
    let state;
    if (/restor|복원|reactivat/.test(t)) state = "restored";
    else if (/slot|슬롯|capacity/.test(t)) state = "slot";
    else if (/duplicate|exist|중복|conflict/.test(t) || existing != null) state = "duplicate";
    else if (/invalid|validation|bad_request|입력|error|fail|reject|denied|422|400/.test(t)) state = "invalid";
    else if (/creat|success|ok|new|added|등록|queued|accept/.test(t) || id != null) state = "created";
    else state = "invalid";
    return { state, id: id != null ? String(id) : null, existingId: existing != null ? String(existing) : null, message: String(o.message || (isObj(o.error) ? o.error.message : "") || "").slice(0, 120) };
  }
  // 보낸 항목과 응답을 순서대로 맞춤 (응답 개수가 모자라면 남는 항목은 '응답 없음' 처리)
  function bulkResults(result, sent) {
    const arr = listOf(isObj(result) && !listOf(result).length && isObj(result.result) ? result.result : result);
    return sent.map((input, i) => { const r = arr[i] !== undefined ? classifyBulkItem(arr[i]) : { state: "invalid", id: null, existingId: null, message: "응답에 이 항목의 결과가 없어요." }; return { input, ...r }; });
  }
  // 중복 확인 응답: 항목마다 기존 추적 ID 가 있는지
  function lookupResults(result, sent) {
    const arr = listOf(isObj(result) && !listOf(result).length && isObj(result.result) ? result.result : result);
    return sent.map((input, i) => {
      const o = isObj(arr[i]) ? arr[i] : {}, hit = isObj(o.keyword) ? o.keyword : o;
      const id = hit.id ?? hit.keyword_id ?? hit.existing_id ?? o.existing_id ?? null;
      const found = o.exists === true || o.found === true || o.duplicate === true || id != null;
      return { input, found, id: id != null ? String(id) : null, trashed: !!(o.trashed || o.deleted || hit.deleted_at), };
    });
  }
  // '전일 대비'는 두 기록이 실제로 연속된 날짜일 때만. 아니면 '직전 수집 대비'와 두 날짜를 보여 줌
  function deltaInfo(st) {
    if (st.delta == null || !st.latest || !st.prev) return null;
    const consecutive = dayAdd(st.prev.day, 1) === st.latest.day;
    return { delta: st.delta, daily: consecutive, from: st.prev.day, to: st.latest.day, label: consecutive ? "전일 대비" : `직전 수집 대비 (${st.prev.day.slice(5)}→${st.latest.day.slice(5)})` };
  }
  // 검색 조건이 바뀐 전후 기록은 이어서 계산하지 않음: 가장 최근 기록과 같은 조건이 이어진 구간만 사용
  function currentSegment(recsDesc) {
    if (!recsDesc.length) return { recs: [], excluded: 0, condKnown: true };
    const key = condKey(recsDesc[0]); let n = 0; while (n < recsDesc.length && condKey(recsDesc[n]) === key) n++;
    return { recs: recsDesc.slice(0, n), excluded: recsDesc.length - n, condKnown: key !== "||" };
  }

  const api = { normGroup, placeIdFrom, parseRegLines, classifyBulkItem, bulkResults, lookupResults, deltaInfo, currentSegment, isObj, toNum, listOf, metricsOf, normRank, normHistory, normKeyword, condKey, comparable, stats, todayItems, TODAY_RULES, rankText, rangeText, csvCell, toCsv, dayAdd, kstDay };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PlaceNorm = api;
})(typeof window !== "undefined" ? window : globalThis);
