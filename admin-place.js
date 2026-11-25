// 관리자 > 네이버 플레이스 화면 (업플로우 공식 API · 읽기 중심)
// · 서버 함수 upflow-place 가 업플로우를 대신 부릅니다 (API 키는 서버에만 있음). 이 화면은 키를 모릅니다.
// · 페이지를 열거나 새로고침해도 '읽기'만 합니다. 1회 검색·키워드 등록·재검색은 버튼을 눌렀을 때만 실행해요.
// · 업플로우 '추적 키워드 ID'(id)와 '네이버 플레이스 ID'(placeId)는 따로 다룹니다.
// admin.js 보다 먼저 불러오므로, $ · sb · esc · kstDay 같은 공용 값은 함수가 실행될 때 사용합니다.
const NP = window.PlaceNorm;
const np = { groups: [], pending: {}, fresh: new Set(), sigErr: false, inited: false, tab: "rank", view: "kw", sample: false, status: null, kws: [], hist: {}, histErr: {}, histReq: new Set(), links: {}, linkErr: false, camps: [], f: { store: "", camp: "", group: "", q: "" }, open: new Set(), openS: new Set(), page: 0, busy: new Set(), cool: new Map(), loading: false, once: null, truncated: false };
const NP_PAGE = 20;
let NP_SAMPLE = null;

const npToast = (t, kind) => { const el = $("np-toast"); el.hidden = !t; el.textContent = t || ""; el.className = "rk-toast " + (kind || ""); };
const npBanner = (t, kind) => { const el = $("np-banner"); el.hidden = !t; el.textContent = t || ""; el.className = "note " + (kind || ""); };

const NP_ERR = {
  unreachable: "연결 함수(upflow-place)에 연결하지 못했어요. 함수가 배포되어 있는지 확인해 주세요.",
  unauthorized: "권한이 없어요. 운영자 계정으로 로그인했는지 확인해 주세요.",
  not_configured: "업플로우 API 키가 서버에 설정되지 않았어요. Supabase > Edge Functions > Secrets 에 UPFLOW_API_KEY 를 등록해 주세요.",
  auth_failed: "업플로우 API 키가 올바르지 않아요. 키를 다시 확인해 주세요.",
  approval_required: "업플로우에서 승인이 필요해요. 승인이 끝난 뒤 다시 시도해 주세요.",
  forbidden: "이 API 키에는 쓰기 권한이 없어요. 키워드·그룹 변경, 재검색, 등록은 쓰기 권한(write)이 있는 키에서만 쓸 수 있어요.",
  daily_limit: "오늘 검색 사용량을 모두 썼어요. 1회 검색·재검색은 업플로우 웹과 함께 쓰는 일일 한도에 합산돼요. 내일 다시 시도해 주세요.",
  slot_limit: "추적 슬롯이 부족해요. 업플로우에서 안 쓰는 키워드를 정리하거나 슬롯을 늘려 주세요.",
  rate_limited: "분당 호출 한도를 넘었어요. 잠시 뒤에 다시 시도해 주세요. (등록·검색·재검색은 자동으로 다시 보내지 않아요)",
  duplicate: "이미 업플로우에 등록된 키워드예요.",
  cooling_down: "같은 요청을 방금 보냈어요. 30초 뒤에 다시 눌러 주세요.",
  not_found: "업플로우에서 해당 키워드를 찾지 못했어요.",
  bad_request: "요청 내용이 올바르지 않아요.",
  sample_mode: "테스트 데이터에서는 실제 검색·등록·재검색을 하지 않아요.",
};
const npErr = r => (NP_ERR[r && r.error] || "업플로우 조회에 실패했어요.") + (r && r.why && r.error !== "forbidden" ? ` (${r.why})` : "") + (r && r.error === "forbidden" && r.why === "permission_unknown" ? " (권한을 확인하지 못해 막았어요)" : "") + (r && r.retry_after ? ` (${r.retry_after}초 뒤에 다시)` : "") + (r && r.detail && !NP_ERR[r.error] ? ` (${r.detail})` : "");

async function npCall(action, body = {}) {
  if (np.sample) {
    if (!NP_SAMPLE) NP_SAMPLE = window.PlaceSample.make();
    if (action === "status") return { ok: true, verified: false, approved: null, read: true, write: false, slots: null, daily: null };
    if (action === "keywords") return { ok: true, items: NP_SAMPLE.keywords };
    if (action === "groups") return { ok: true, items: [{ id: 1, name: "11월 신규" }, { id: 2, name: "재계약" }] };
    if (action === "summary") return { ok: true, result: { data: NP_SAMPLE.keywords.filter(k => (body.ids || []).includes(String(k.id))).map(k => ({ id: k.id, ranks_summary: k.ranks_summary })) } };
    if (action === "ranks" || action === "ranks_batch") { const ids = action === "ranks" ? [body.id] : body.ids, out = {}; ids.forEach(i => out[i] = NP_SAMPLE.ranks[i] || []); return { ok: true, ranks: out, errors: {} }; }
    return { error: "sample_mode" };
  }
  try {
    const { data, error } = await sb.functions.invoke("upflow-place", { body: { action, ...body } });
    let r = data; if (error && !r) { try { r = await error.context.json(); } catch (_) { r = null; } }
    return r || { error: "unreachable" };
  } catch (_) { return { error: "unreachable" }; }
}

/* ---------- 데이터 읽기 ---------- */
async function loadPlace() {
  if (!np.inited) npInit();
  if (np.loading) return;
  np.loading = true; npToast(""); npBanner("업플로우에서 등록된 키워드를 읽는 중이에요…");
  try {
    let st = await npCall("status");
    if (st.error === "not_configured") { np.sample = true; st = await npCall("status"); }
    else np.sample = false;
    if (st.error) { np.kws = []; np.status = null; npDrawStatus(); npBanner(npErr(st), "warn"); npRender(); return; }
    np.status = st; npDrawStatus();
    const [kr, gr] = await Promise.all([npCall("keywords"), npCall("groups")]);
    if (kr.error) { np.kws = []; npBanner(npErr(kr), "warn"); npRender(); return; }
    np.kws = (kr.items || []).map(NP.normKeyword).filter(Boolean); np.truncated = !!kr.truncated;
    np.groups = (gr.items || []).map(NP.normGroup).filter(Boolean);
    np.hist = {}; np.histErr = {}; np.histReq = new Set();
    const [lk, cp] = await Promise.all([sb.from("place_links").select("*"), sb.from("campaigns").select("id,biz,title,created_at").order("created_at", { ascending: false }).limit(300)]);
    np.linkErr = !!lk.error; np.links = {}; (lk.data || []).forEach(l => np.links[l.upflow_keyword_id] = l);
    np.camps = cp.data || [];
    let msg = "";
    if (np.sample) msg = "테스트 데이터예요. 서버에 UPFLOW_API_KEY가 없어서 업플로우에서 읽은 값이 아니에요. (공식 문서를 확인하기 전의 추정 형식으로 만든 샘플이라, 이 화면으로 실제 데이터를 판단하지 마세요)";
    else if (st.approved === false) msg = "업플로우 API 승인이 아직 안 됐어요. 승인 후에 목록을 읽을 수 있어요.";
    else if (st.write !== true) msg = "읽기 전용 키예요(또는 쓰기 권한을 확인하지 못했어요). 목록·이력·중복 확인·1회 검색은 쓸 수 있고, 등록·그룹 이동·재검색은 막혀 있어요.";
    if (np.truncated) msg += (msg ? " " : "") + "키워드가 많아 일부만 읽었어요.";
    if (np.linkErr) msg += (msg ? " " : "") + "매장·캠페인 연결 저장소가 없어요. supabase/024_place_links.sql 을 실행해 주세요.";
    npBanner(msg, np.sample || np.linkErr || st.approved === false ? "warn" : "");
    await npSignals(); npDrawHook(); npResumePending();
    npRender();
  } finally { np.loading = false; }
}

// 날짜별 이력은 행을 펼치거나 매장·기간을 고를 때만 읽어 와요 (읽기 전용, 새 검색 아님, 한 번 읽은 것은 다시 읽지 않음). 목록의 모든 행을 한꺼번에 읽지 않아요.
async function npEnsureHist(kws) {
  const ids = kws.map(k => k.id).filter(id => !np.hist[id] && !np.histReq.has(id));
  if (!ids.length) return;
  ids.forEach(id => np.histReq.add(id));
  for (let i = 0; i < ids.length; i += 15) {
    const r = await npCall("ranks_batch", { ids: ids.slice(i, i + 15) });
    if (r.error) { ids.slice(i, i + 15).forEach(id => np.histErr[id] = r.error); continue; }
    Object.entries(r.ranks || {}).forEach(([id, list]) => np.hist[id] = NP.normHistory(list));
    Object.entries(r.errors || {}).forEach(([id, e]) => np.histErr[id] = e);
  }
  npRender();
}

/* ---------- 파생 값 ---------- */
const npLink = kw => np.links[kw.id] || null;
const npStore = kw => { const l = npLink(kw); return (l && l.store_name) || kw.placeName || "매장 미지정"; };
const npCamp = kw => { const l = npLink(kw); return l && l.campaign_id ? np.camps.find(c => c.id === l.campaign_id) || null : null; };
const npStart = kw => { const l = npLink(kw), c = npCamp(kw); return (l && l.start_day) || (c ? NP.kstDay(new Date(c.created_at).getTime()) : null); };
const npStats = kw => NP.stats(kw, np.hist[kw.id], npStart(kw));
const npPending = kw => !np.hist[kw.id] && !np.histErr[kw.id];
const npStoreKey = kw => kw.placeId || ("n:" + npStore(kw));
const npRows = () => np.kws.filter(k => {
  const l = npLink(k), f = np.f;
  if (f.store && npStoreKey(k) !== f.store) return false;
  if (f.camp && (f.camp === "__none" ? (l && l.campaign_id) : !(l && l.campaign_id === f.camp))) return false;
  if (f.group) { if (f.group.startsWith("u:") ? k.groupId !== f.group.slice(2) : !(l && l.group_name === f.group.slice(2))) return false; }
  if (f.q) { const q = f.q.toLowerCase(); if (!(k.keyword + " " + npStore(k) + " " + k.placeId).toLowerCase().includes(q)) return false; }
  return true;
});
const npKst2 = iso => /T/.test(iso || "") ? hm(iso) : String(iso || "").slice(5);

/* ---------- 화면 조각 ---------- */
function npRankCell(rec) {
  if (!rec) return `<span class="np-r none">미수집</span>`;
  const cls = rec.status === "ok" ? "ok" : rec.status;
  let extra = ""; if (rec.status === "out") extra = `<small>확인 범위 내${NP.rangeText(rec.range) ? " · " + esc(NP.rangeText(rec.range)) : ""}</small>`;
  return `<span class="np-r ${cls}">${esc(NP.rankText(rec))}</span>${extra}`;
}
function npStartCell(kw, st) {
  if (st.startState === "nostart") return `<span class="muted">캠페인 미연결</span>`;
  if (npPending(kw) && !st.startRec) return `<span class="muted" title="행을 펼치면 날짜별 이력을 읽어요">펼쳐서 확인</span>`;
  return npRankCell(st.startRec);                                             // 시작일 기록이 없으면 '미수집' — 첫 수집값으로 대체하지 않음
}
function npDeltaCell(st) {
  const di = NP.deltaInfo(st);
  if (!di) { const t = st.latest && st.prev && !NP.comparable(st.latest, st.prev) ? "검색 조건이 달라 비교하지 않아요" : ""; return `<span class="muted" title="${esc(t)}">—</span>`; }
  const v = di.delta === 0 ? "변동 없음" : (di.delta > 0 ? `<span class="rk-d up">▲${di.delta}</span>` : `<span class="rk-d down">▼${-di.delta}</span>`);
  return `${v}<small class="muted">${esc(di.label)}</small>`;       // 연속 날짜가 아니면 '직전 수집 대비'와 두 날짜를 보여 줌
}
function npSparkCells(st) {
  return `<span class="np-7">${st.last7.map(({ day, rec }) => {
    const t = !rec ? "·" : rec.status === "ok" ? rec.rank : rec.status === "out" ? "×" : rec.status === "failed" ? "!" : "·";
    return `<i class="np-d ${rec ? rec.status : "none"}" title="${esc(day.slice(5) + " · " + NP.rankText(rec))}">${t}</i>`;
  }).join("")}</span>`;
}
function npKwRow(kw, child) {
  const st = npStats(kw), l = npLink(kw), c = npCamp(kw), open = np.open.has(kw.id), pend = npPending(kw);
  const pr = np.pending[kw.id], fresh = np.fresh.has(kw.id);
  const wBlock = npWriteBlock(), g = kw.groupId && np.groups.find(x => x.id === kw.groupId);
  const badge = (pr ? `<span class="tag mid">재검색 처리 중</span> ` : "") + (fresh ? `<span class="tag ok">새 기록 신호</span> ` : "");
  return `<tr class="np-row${open ? " open" : ""}${child ? " np-child" : ""}" data-k="${esc(kw.id)}">
    <td data-l="매장 · 키워드">${badge}<b>${esc(npStore(kw))}</b><small class="muted">${esc(kw.keyword)}${g ? " · 업플로우 그룹 " + esc(g.name) : ""}${l && l.group_name ? " · " + esc(l.group_name) : ""}${c ? " · " + esc(c.title) : ""}</small></td>
    <td data-l="캠페인 시작일 순위">${npStartCell(kw, st)}<small class="muted">${npStart(kw) ? "시작일 " + esc(npStart(kw).slice(5)) : ""}</small></td>
    <td data-l="최신 순위">${npRankCell(st.latest)}<small class="muted">${st.latest ? esc(st.latest.day.slice(5)) : ""}</small></td>
    <td data-l="직전 수집 대비">${npDeltaCell(st)}</td>
    <td data-l="최근 7일">${pend && !kw.summary.length ? '<span class="muted">…</span>' : npSparkCells(st)}</td>
    <td data-l="최고 순위">${st.best != null ? st.best + "위" : (pend ? '<span class="muted" title="행을 펼치면 읽어요">—</span>' : "—")}</td>
    <td data-l="마지막 수집">${st.lastCollected ? esc(npKst2(st.lastCollected)) : "—"}</td>
    <td data-l="메모" class="np-memo">${l && l.memo ? esc(l.memo) : ""}</td>
    <td class="np-act" data-l=""><button type="button" class="btn" data-np="link" ${np.linkErr && !np.groups.length ? "disabled" : ""}>연결</button><button type="button" class="btn" data-np="refresh" ${wBlock ? `disabled title="${esc(wBlock)}"` : ""}>재검색</button></td></tr>
    ${open ? npDetailRow(kw, st) : ""}`;
}
// 쓰기·검색 사용 가능 여부 (화면에서 한 번 더 확인. 서버에서도 다시 확인해요)
function npWriteBlock() {
  if (np.sample) return "테스트 데이터에서는 실행하지 않아요";
  const s = np.status || {};
  if (s.write !== true) return s.write === false ? "읽기 전용 키예요 (쓰기 권한 필요)" : "쓰기 권한을 확인하지 못했어요";
  if (s.daily && s.daily.limit != null && s.daily.used != null && s.daily.used >= s.daily.limit) return "오늘 검색 사용량을 모두 썼어요";
  return "";
}
function npSearchBlock() {
  if (np.sample) return "테스트 데이터에서는 실행하지 않아요";
  const s = np.status || {};
  if (s.read === false) return "읽기 권한이 없어요";
  if (s.daily && s.daily.limit != null && s.daily.used != null && s.daily.used >= s.daily.limit) return "오늘 검색 사용량을 모두 썼어요";
  return "";
}
function npDetailRow(kw, st) {
  const recs = st.recs.slice(0, 30);
  const body = npPending(kw) ? `<p class="muted">이력을 읽는 중이에요…</p>` : (np.histErr[kw.id] ? `<p class="muted">이력을 읽지 못했어요. (${esc(NP_ERR[np.histErr[kw.id]] || np.histErr[kw.id])})</p>` : (recs.length ? `<div class="rk-scroll"><table class="tb np-det-t"><thead><tr><th>날짜</th><th>순위</th><th>방문자 리뷰</th><th>블로그 리뷰</th><th>저장</th><th>확인 범위</th></tr></thead><tbody>${recs.map(r => `<tr><td>${esc(r.day)}</td><td>${npRankCell(r)}</td><td>${r.visitor != null ? NP.toNum(r.visitor).toLocaleString() : "—"}</td><td>${r.blog != null ? r.blog.toLocaleString() : "—"}</td><td>${r.save != null ? r.save.toLocaleString() : "—"}</td><td>${esc(NP.rangeText(r.range) || "—")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">수집된 기록이 아직 없어요.</p>`));
  return `<tr class="np-detail"><td colspan="9"><div class="np-dh"><span>업플로우 추적 키워드 ID <b>${esc(kw.id)}</b></span><span>네이버 플레이스 ID <b>${esc(kw.placeId || "—")}</b></span><span>월 검색량 <b>${kw.volume != null ? kw.volume.toLocaleString() : "—"}</b></span></div>${body}</td></tr>`;
}

/* ---------- 순위 추적 탭 ---------- */
function npFill(sel, opts, cur) { sel.innerHTML = opts.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(t)}</option>`).join(""); }
function npDrawFilters() {
  const stores = new Map(); np.kws.forEach(k => stores.set(npStoreKey(k), npStore(k)));
  npFill($("np-f-store"), [["", "매장 전체"], ...[...stores].sort((a, b) => a[1].localeCompare(b[1], "ko"))], np.f.store);
  const camps = new Map(); Object.values(np.links).forEach(l => { const c = l.campaign_id && np.camps.find(x => x.id === l.campaign_id); if (c) camps.set(c.id, c.title); });
  npFill($("np-f-camp"), [["", "캠페인 전체"], ["__none", "연결 안 됨"], ...camps], np.f.camp);
  const groups = [...new Set(Object.values(np.links).map(l => l.group_name).filter(Boolean))].sort();
  npFill($("np-f-group"), [["", "그룹 전체"], ...np.groups.map(g => ["u:" + g.id, "업플로우 · " + g.name]), ...groups.map(g => ["i:" + g, "내부 · " + g])], np.f.group);
}
function npDrawToday() {
  const items = []; np.kws.forEach(kw => { NP.todayItems(kw, npStats(kw)).forEach(it => items.push({ kw, it })); });
  $("np-today").hidden = !items.length;
  const T = { drop: ["급락", "bad"], top: ["상위권 진입", "ok"], out: ["미노출 전환", "mid"] };
  $("np-today-list").innerHTML = items.map(({ kw, it }) => `<li><span class="tag ${T[it.type][1]}">${T[it.type][0]}</span> <b>${esc(npStore(kw))}</b> · ${esc(kw.keyword)} — ${esc(it.text)}</li>`).join("");
}
function npDrawRank() {
  npDrawFilters(); npDrawToday();
  const rows = npRows();
  const head = `<thead><tr><th>매장 · 키워드</th><th>시작일 순위</th><th>최신 순위</th><th>직전 대비</th><th>최근 7일</th><th>최고 순위</th><th>마지막 수집</th><th>메모</th><th>처리</th></tr></thead>`;
  const empty = $("np-empty"), pager = $("np-pager");
  if (!rows.length) { $("np-table").innerHTML = ""; empty.hidden = false; empty.textContent = np.kws.length ? "조건에 맞는 항목이 없어요." : "업플로우에 등록된 플레이스 추적 키워드가 없거나 읽지 못했어요."; pager.hidden = true; return; }
  empty.hidden = true;
  let body = "", shown = [];
  if (np.view === "kw") {
    const pages = Math.max(1, Math.ceil(rows.length / NP_PAGE)); np.page = Math.min(np.page, pages - 1);
    shown = rows.slice(np.page * NP_PAGE, (np.page + 1) * NP_PAGE); body = shown.map(k => npKwRow(k)).join("");
    pager.hidden = pages <= 1; $("np-pg").textContent = `${np.page + 1} / ${pages}`; $("np-prev").disabled = np.page === 0; $("np-next").disabled = np.page >= pages - 1;
  } else {
    pager.hidden = true; const groups = new Map(); rows.forEach(k => { const key = npStoreKey(k); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(k); });
    body = [...groups].map(([key, ks]) => {
      const open = np.openS.has(key), lat = ks.map(k => npStats(k).latest).filter(r => r && r.status === "ok").map(r => r.rank), last = ks.map(k => npStats(k).lastCollected).filter(Boolean).sort().pop();
      if (open) shown.push(...ks);
      return `<tr class="np-row np-store${open ? " open" : ""}" data-s="${esc(key)}"><td data-l="매장"><b>${esc(npStore(ks[0]))}</b><small class="muted">네이버 플레이스 ID ${esc(ks[0].placeId || "—")}</small></td><td data-l="키워드 수">${ks.length}개</td><td data-l="가장 높은 최신 순위">${lat.length ? Math.min(...lat) + "위" : "—"}</td><td></td><td></td><td></td><td data-l="마지막 수집">${last ? esc(npKst2(last)) : "—"}</td><td></td><td class="np-act"><span class="muted">${open ? "접기 ▲" : "펼치기 ▼"}</span></td></tr>${open ? ks.map(k => npKwRow(k, true)).join("") : ""}`;
    }).join("");
  }
  $("np-table").innerHTML = head + "<tbody>" + body + "</tbody>";
}

/* ---------- 엑셀(CSV) 내려받기 ---------- */
async function npExport() {
  const rows = npRows(); if (!rows.length) return npToast("내려받을 항목이 없어요.", "warn");
  npToast("이력을 읽어 파일을 만드는 중이에요…"); await npEnsureHist(rows);
  const out = [["매장명", "키워드", "그룹", "캠페인", "캠페인 시작일", "시작일 순위", "최신 순위", "최신 날짜", "직전 기록 대비", "최고 순위", "마지막 수집", "월 검색량", "업플로우 추적 키워드 ID", "네이버 플레이스 ID", "메모"]];
  rows.forEach(kw => {
    const st = npStats(kw), l = npLink(kw), c = npCamp(kw);
    out.push([npStore(kw), kw.keyword, l && l.group_name || "", c ? c.title : "", npStart(kw) || "", npStart(kw) ? NP.rankText(st.startRec) : "캠페인 미연결", NP.rankText(st.latest), st.latest ? st.latest.day : "", st.delta == null ? "" : (st.delta > 0 ? "▲" + st.delta : st.delta < 0 ? "▼" + -st.delta : "변동 없음"), st.best != null ? st.best : "", st.lastCollected || "", kw.volume != null ? kw.volume : "", kw.id, kw.placeId, l && l.memo || ""]);
  });
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([NP.toCsv(out)], { type: "text/csv;charset=utf-8" })); a.download = `naver-place-${NP.kstDay().replace(/-/g, "")}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  npToast(`${rows.length}개 항목을 내려받았어요. (엑셀에서 열 수 있는 CSV 파일이에요)`, "ok");
}

/* ---------- 연결(매장·캠페인) ---------- */
function npOpenLink(id, extra) {
  const kw = np.kws.find(k => k.id === id) || (extra ? { id, keyword: extra.keyword || "", placeId: extra.placeId || "", placeName: extra.placeName || "", groupId: "" } : null); if (!kw) return;
  const l = npLink(kw) || {};
  $("np-l-info").textContent = ` ${kw.keyword} · 추적 키워드 ID ${kw.id} · 네이버 플레이스 ID ${kw.placeId || "—"}`;
  $("np-l-store").value = l.store_name || kw.placeName || ""; $("np-l-group").value = l.group_name || ""; $("np-l-memo").value = l.memo || ""; $("np-l-start").value = l.start_day || "";
  $("np-l-camp").innerHTML = `<option value="">연결 안 함</option>` + np.camps.map(c => `<option value="${esc(c.id)}"${c.id === l.campaign_id ? " selected" : ""}>${esc(c.biz)} · ${esc(c.title)} (${esc(NP.kstDay(new Date(c.created_at).getTime()).slice(5))})</option>`).join("");
  npFill($("np-l-ugroup"), [["", "그룹 없음"], ...np.groups.map(g => [g.id, g.name])], kw.groupId || "");
  const wb = npWriteBlock(); $("np-l-move").disabled = !!wb || !np.kws.some(k => k.id === kw.id); $("np-l-move").title = wb || "";
  $("np-l-form").dataset.id = kw.id; $("np-l-form").dataset.place = kw.placeId || ""; $("np-link").showModal();
}

/* ---------- 재검색 · 1회 검색 · 등록 (버튼을 눌렀을 때만) ---------- */
const npSig = h => h && h[0] ? `${h[0].day}|${h[0].rank}|${h[0].status}|${h[0].checkedAt || ""}` : "";
async function npOnce(e) {
  e.preventDefault(); if (np.busy.has("once")) return;
  const kw = $("np-o-kw").value.trim(), pid = parsePlaceId($("np-o-place").value), mode = document.querySelector('input[name="npmode"]:checked').value;
  if (kw.length < 2) return npToast("키워드를 2글자 이상 입력해 주세요.", "warn");
  if (pid.err || !pid.id) return npToast(pid.err || "플레이스 주소 또는 ID를 입력해 주세요.", "warn");
  const sb_ = npSearchBlock(); if (sb_) return npToast(sb_, "warn");
  if (!confirm(`'${kw}' 키워드로 1회 검색할까요?\n${mode === "location" ? "업체 위치 기준" : "표준"} 검색이며, 오늘 검색 사용량이 1회 사용돼요. (업플로우 웹과 한도를 함께 써요)`)) return;
  np.busy.add("once"); $("np-o-go").disabled = true; $("np-o-go").textContent = "검색 중…"; npToast("검색하는 중이에요…");
  const r = await npCall("search", { keyword: kw, place_id: pid.id, mode });
  np.busy.delete("once"); $("np-o-go").disabled = false; $("np-o-go").textContent = "1회 검색";
  const box = $("np-o-res");
  if (r.error) { box.hidden = true; return npToast(npErr(r), "warn"); }
  const res = NP.isObj(r.result) ? (NP.isObj(r.result.data) ? r.result.data : r.result) : null, rec = NP.normRank(res);
  if (!rec || rec.status === "none") { box.hidden = false; box.innerHTML = `<b>결과를 읽지 못했어요.</b><p class="muted">업플로우가 순위를 돌려주지 않았어요. 잠시 뒤 다시 시도해 주세요.</p>`; return npToast("검색은 접수됐지만 순위 값을 읽지 못했어요.", "warn"); }
  const range = NP.rangeText(rec.range);
  box.hidden = false;
  box.innerHTML = `<div class="np-big">${npRankCell(rec)}</div><p>${esc(mode === "location" ? "업체 위치 기준 검색" : "표준 검색")} · 키워드 <b>${esc(kw)}</b> · 플레이스 ID <b>${esc(pid.id)}</b></p><p class="muted">확인 범위: ${range ? esc(range) : "업플로우가 알려 주지 않았어요"}${rec.status === "out" ? " · 이 범위 안에서는 보이지 않았어요" : ""}</p>`;
  np.once = rec.status === "failed" ? null : { keyword: kw, place_id: pid.id, mode }; $("np-o-reg").disabled = !np.once || !!npWriteBlock();
  npToast(rec.status === "failed" ? "조회에 실패했어요. 실패한 호출도 한도에 포함될 수 있어요." : "검색을 마쳤어요.", rec.status === "failed" ? "warn" : "ok");
}
async function npRegister() {
  const o = np.once; if (!o || np.busy.has("reg")) return;
  const wb = npWriteBlock(); if (wb) return npToast(wb, "warn");
  if (!confirm(`'${o.keyword}' 키워드를 업플로우 추적 키워드로 등록할까요?\n업플로우 계정의 추적 개수와 한도를 사용해요.`)) return;
  np.busy.add("reg"); $("np-o-reg").disabled = true;
  const r = await npCall("register", { items: [{ keyword: o.keyword, place_id: o.place_id, mode: o.mode }] }); np.busy.delete("reg");
  if (r.error) { $("np-o-reg").disabled = false; return npToast(npErr(r), "warn"); }
  npToast("키워드 등록이 접수됐어요. 업플로우에서 첫 수집이 끝나면 '목록 다시 읽기'로 확인해 주세요.", "ok");
}

/* ---------- 업체·키워드·경쟁사·추세 분석 ---------- */
const npStoreList = () => { const m = new Map(); np.kws.forEach(k => { const key = npStoreKey(k); if (!m.has(key)) m.set(key, []); m.get(key).push(k); }); return m; };
function npFillStoreSel(id) { const cur = $(id).value; npFill($(id), [...npStoreList()].map(([k, ks]) => [k, npStore(ks[0])]).sort((a, b) => a[1].localeCompare(b[1], "ko")), cur); }
async function npDrawStore() {
  npFillStoreSel("np-s-sel"); const ks = npStoreList().get($("np-s-sel").value) || [], box = $("np-s-body");
  if (!ks.length) { box.innerHTML = `<p class="empty">표시할 매장이 없어요.</p>`; return; }
  const k0 = ks[0], l = npLink(k0), c = npCamp(k0), m = k0.metrics;
  box.innerHTML = `<div class="np-info"><h3>${esc(npStore(k0))}</h3><p class="muted">${esc(k0.category || "")} ${esc(k0.address || "")}</p><p>네이버 플레이스 ID <b>${esc(k0.placeId || "—")}</b>${c ? ` · 캠페인 <b>${esc(c.title)}</b>` : ""}${l && l.group_name ? ` · 그룹 <b>${esc(l.group_name)}</b>` : ""}</p>
    <p>방문자 리뷰 <b>${m.visitor != null ? m.visitor.toLocaleString() : "—"}</b> · 블로그 리뷰 <b>${m.blog != null ? m.blog.toLocaleString() : "—"}</b> · 저장 <b>${m.save != null ? m.save.toLocaleString() : "—"}</b> <small class="muted">(업플로우가 마지막으로 수집한 값)</small></p></div>
    <div class="rk-scroll"><table class="tb np-table"><thead><tr><th>매장 · 키워드</th><th>시작일 순위</th><th>최신 순위</th><th>직전 대비</th><th>최근 7일</th><th>최고 순위</th><th>마지막 수집</th><th>메모</th><th>처리</th></tr></thead><tbody>${ks.map(k => npKwRow(k, true)).join("")}</tbody></table></div>`;
  npEnsureHist(ks);
}
function npDrawKw() {
  const q = $("np-k-q").value.trim().toLowerCase(), g = new Map();
  np.kws.forEach(k => { if (q && !k.keyword.toLowerCase().includes(q)) return; const key = k.keyword.trim().toLowerCase(); if (!g.has(key)) g.set(key, []); g.get(key).push(k); });
  const rows = [...g.values()].sort((a, b) => (b[0].volume || 0) - (a[0].volume || 0));
  $("np-k-empty").hidden = rows.length > 0; $("np-k-empty").textContent = "표시할 키워드가 없어요.";
  $("np-k-table").innerHTML = rows.length ? `<thead><tr><th>키워드</th><th>월 검색량</th><th>추적 매장</th><th>매장별 최신 순위</th></tr></thead><tbody>${rows.map(ks => `<tr class="np-card"><td data-l="키워드"><b>${esc(ks[0].keyword)}</b></td><td data-l="월 검색량">${ks[0].volume != null ? ks[0].volume.toLocaleString() : "—"}</td><td data-l="추적 매장">${new Set(ks.map(npStoreKey)).size}곳</td><td data-l="매장별 최신 순위">${ks.map(k => `<span class="np-chip">${esc(npStore(k))} ${esc(NP.rankText(npStats(k).latest))}</span>`).join(" ")}</td></tr>`).join("")}</tbody>` : "";
}
function npDrawComp() {
  const g = new Map();
  np.kws.forEach(k => { const lat = k.summary[0]; const key = k.keyword.trim().toLowerCase() + "||" + NP.condKey(lat); if (!g.has(key)) g.set(key, []); g.get(key).push(k); });
  const groups = [...g.values()].filter(ks => new Set(ks.map(npStoreKey)).size >= 2), solo = g.size - groups.length;
  const ord = r => !r ? 4 : r.status === "ok" ? 0 : r.status === "out" ? 1 : r.status === "failed" ? 2 : 3;
  $("np-c-body").innerHTML = (groups.length ? groups.map(ks => {
    const lat = ks[0].summary[0], rows = ks.slice().sort((a, b) => ord(a.summary[0]) - ord(b.summary[0]) || (a.summary[0] && b.summary[0] ? a.summary[0].rank - b.summary[0].rank : 0));
    return `<div class="np-comp"><h3>${esc(ks[0].keyword)} <small class="muted">${esc([lat && lat.mode, lat && lat.device, lat && lat.source].filter(Boolean).join(" · ") || "검색 조건 같음")}</small></h3><table class="tb"><thead><tr><th>매장</th><th>순위</th><th>날짜</th><th>직전 대비</th></tr></thead><tbody>${rows.map(k => { const st = NP.stats(k, null, null), mine = !!npLink(k); return `<tr><td>${esc(npStore(k))}${mine ? ' <span class="tag blue">우리 연결</span>' : ""}</td><td>${npRankCell(st.latest)}</td><td>${st.latest ? esc(st.latest.day.slice(5)) : "—"}</td><td>${npDeltaCell(st)}</td></tr>`; }).join("")}</tbody></table></div>`;
  }).join("") : `<p class="empty">같은 키워드·같은 조건으로 추적 중인 매장이 2곳 이상인 경우가 아직 없어요.</p>`) + (solo > 0 && groups.length ? `<p class="muted">비교 대상이 없는 키워드 ${solo}개는 표시하지 않았어요.</p>` : "");
}
function npSparkline(vals) {
  const pts = vals.filter(v => v.rank != null); if (pts.length < 2) return `<span class="muted">기록 부족</span>`;
  const W = 160, H = 36, mn = Math.min(...pts.map(p => p.rank)), mx = Math.max(...pts.map(p => p.rank)), span = Math.max(1, mx - mn), n = vals.length;
  const xy = vals.map((v, i) => v.rank == null ? null : [(i / Math.max(1, n - 1)) * (W - 6) + 3, 3 + ((v.rank - mn) / span) * (H - 6)]).filter(Boolean);   // 순위 숫자가 작을수록 위
  return `<svg class="np-spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="순위 추이"><polyline fill="none" stroke="#2f5bff" stroke-width="2" points="${xy.map(p => p.join(",")).join(" ")}"/>${xy.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2" fill="#2f5bff"/>`).join("")}</svg>`;
}
async function npDrawTrend() {
  npFillStoreSel("np-t-sel"); const ks = npStoreList().get($("np-t-sel").value) || [], box = $("np-t-body");
  if (!ks.length) { box.innerHTML = `<p class="empty">표시할 매장이 없어요.</p>`; return; }
  let from = $("np-t-from").value, to = $("np-t-to").value || NP.kstDay(); if (!from) from = NP.dayAdd(to, -6);
  if (from > to) { box.innerHTML = `<p class="empty">시작일이 끝나는 날보다 늦어요.</p>`; return; }
  if (ks.some(k => npPending(k))) { box.innerHTML = `<p class="muted">이력을 읽는 중이에요…</p>`; await npEnsureHist(ks); }
  const diff = (a, b) => a != null && b != null ? b - a : null, sgn = n => n == null ? "—" : (n > 0 ? "+" + n.toLocaleString() : n.toLocaleString());
  box.innerHTML = `<p class="muted">${esc(from)} ~ ${esc(to)}</p><div class="rk-scroll"><table class="tb np-table"><thead><tr><th>키워드</th><th>기간 첫 순위</th><th>기간 끝 순위</th><th>순위 변화</th><th>방문자 리뷰</th><th>블로그 리뷰</th><th>저장</th><th>추이</th></tr></thead><tbody>${ks.map(k => {
    const seg = NP.currentSegment((np.hist[k.id] || []).filter(r => r.day >= from && r.day <= to));   // 검색 조건이 바뀐 이전 기록은 이어서 계산하지 않음
    const recs = seg.recs.slice().reverse();                                                          // 오래된 것부터
    if (!recs.length) return `<tr class="np-card"><td data-l="키워드"><b>${esc(k.keyword)}</b></td><td colspan="7" class="muted">이 기간에 수집된 기록이 없어요.</td></tr>`;
    const first = recs.find(r => r.status === "ok"), last = recs.slice().reverse().find(r => r.status === "ok");
    const same = first && last && NP.comparable(first, last), ch = same && first !== last ? first.rank - last.rank : null;
    const mv = key => { const v = recs.filter(r => r[key] != null); return v.length > 1 ? sgn(diff(v[0][key], v[v.length - 1][key])) : "—"; };
    return `<tr class="np-card"><td data-l="키워드"><b>${esc(k.keyword)}</b>${seg.excluded ? `<small class="muted">검색 조건이 바뀐 이전 기록 ${seg.excluded}건은 비교에서 뺐어요</small>` : ""}${!seg.condKnown ? '<small class="muted">기록에 검색 조건 정보가 없어 같은 조건으로 봤어요</small>' : ""}</td><td data-l="기간 첫 순위">${first ? npRankCell(first) : "—"}</td><td data-l="기간 끝 순위">${last ? npRankCell(last) : "—"}</td><td data-l="순위 변화">${first && last && !same ? '<span class="muted" title="조건이 달라 비교하지 않아요">비교 불가</span>' : (ch == null ? "—" : ch === 0 ? "변동 없음" : ch > 0 ? `<span class="rk-d up">▲${ch}</span>` : `<span class="rk-d down">▼${-ch}</span>`)}</td><td data-l="방문자 리뷰">${mv("visitor")}</td><td data-l="블로그 리뷰">${mv("blog")}</td><td data-l="저장">${mv("save")}</td><td data-l="추이">${npSparkline(recs)}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

/* ---------- 탭 · 렌더 · 이벤트 ---------- */
function npRender() {
  document.querySelectorAll("#np-tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === np.tab));
  ["rank", "reg", "once", "store", "kw", "comp", "trend"].forEach(t => $("np-p-" + t).hidden = t !== np.tab);
  if (np.tab === "reg") npFill($("np-r-group"), [["", "그룹 없음"], ...np.groups.map(g => [g.id, g.name])], $("np-r-group").value);
  if (np.tab === "rank") npDrawRank(); else if (np.tab === "store") npDrawStore(); else if (np.tab === "kw") npDrawKw(); else if (np.tab === "comp") npDrawComp(); else if (np.tab === "trend") npDrawTrend();
}
function npInit() {
  np.inited = true;
  $("np-tabs").onclick = e => { const t = e.target.dataset.t; if (!t) return; np.tab = t; npRender(); };
  $("np-view").onclick = e => { const v = e.target.dataset.v; if (!v) return; np.view = v; document.querySelectorAll("#np-view button").forEach(b => b.classList.toggle("on", b.dataset.v === v)); np.page = 0; npDrawRank(); };
  [["np-f-store", "store"], ["np-f-camp", "camp"], ["np-f-group", "group"]].forEach(([id, k]) => $(id).onchange = e => { np.f[k] = e.target.value; np.page = 0; npDrawRank(); });
  $("np-f-q").oninput = e => { np.f.q = e.target.value.trim(); np.page = 0; npDrawRank(); };
  $("np-prev").onclick = () => { np.page = Math.max(0, np.page - 1); npDrawRank(); }; $("np-next").onclick = () => { np.page++; npDrawRank(); };
  $("np-csv").onclick = npExport; $("np-reload").onclick = loadPlace;
  $("np-table").onclick = e => {
    const b = e.target.closest("[data-np]"), tr = e.target.closest("tr"); if (!tr) return;
    if (b) { const id = tr.dataset.k; if (b.dataset.np === "link") npOpenLink(id); else if (b.dataset.np === "refresh") npRefresh(id, b); return; }
    if (tr.dataset.s) { np.openS.has(tr.dataset.s) ? np.openS.delete(tr.dataset.s) : np.openS.add(tr.dataset.s); npDrawRank(); }
    else if (tr.dataset.k) { npToggle(tr.dataset.k, npDrawRank); }
  };
  $("np-p-store").onclick = e => { const b = e.target.closest("[data-np]"), tr = e.target.closest("tr[data-k]"); if (!tr) return; if (b) { if (b.dataset.np === "link") npOpenLink(tr.dataset.k); else npRefresh(tr.dataset.k, b); return; } npToggle(tr.dataset.k, npDrawStore); };
  $("np-s-sel").onchange = npDrawStore; $("np-k-q").oninput = npDrawKw; $("np-t-sel").onchange = npDrawTrend; $("np-t-from").onchange = $("np-t-to").onchange = npDrawTrend;
  $("np-t-range").onclick = e => { const d = Number(e.target.dataset.d); if (!d) return; document.querySelectorAll("#np-t-range button").forEach(b => b.classList.toggle("on", b === e.target)); $("np-t-to").value = ""; $("np-t-from").value = NP.dayAdd(NP.kstDay(), -(d - 1)); npDrawTrend(); };
  $("np-once").onsubmit = npOnce; $("np-o-reg").onclick = npRegister;
  $("np-sum").onclick = npSummary;
  $("np-r-check").onclick = nrCheck; $("np-reg").onsubmit = nrSend; $("np-r-lines").oninput = () => { nr.looked = false; $("np-r-go").disabled = true; };
  $("np-r-res").onclick = e => {
    if (e.target.id === "np-r-retry") { $("np-r-lines").value = nr.rows.filter(r => r.state === "invalid" || r.state === "slot").map(r => r.line || (r.keyword + (r.placeId ? ", " + r.placeId : ""))).join("\n"); nr.looked = false; $("np-r-go").disabled = true; $("np-r-res").hidden = true; return npToast("실패한 줄만 입력칸에 넣었어요. 고친 뒤 '중복 확인'부터 다시 해 주세요.", "ok"); }
    const b = e.target.closest("[data-nr]"), tr = e.target.closest("tr[data-i]"); if (!b || !tr) return;
    const r = nr.rows[Number(tr.dataset.i)], id = r.existingId || r.id; if (id) npOpenLink(String(id), { keyword: r.keyword, placeId: r.placeId });
  };
  $("np-l-move").onclick = async () => {
    const id = $("np-l-form").dataset.id, gid = $("np-l-ugroup").value || null, wb = npWriteBlock(); if (wb) return npToast(wb, "warn");
    if (!confirm("업플로우의 그룹을 바꿀까요? (우리 사이트 연결과는 별개예요)")) return;
    $("np-l-move").disabled = true; const r = await npCall("move_group", { id, group_id: gid }); $("np-l-move").disabled = false;
    if (r.error) return npToast(npErr(r), "warn");
    const kw = np.kws.find(k => k.id === id); if (kw) kw.groupId = gid || ""; npToast("업플로우 그룹을 바꿨어요.", "ok"); npRender();
  };
  $("np-l-close").onclick = () => $("np-link").close();
  $("np-l-form").onsubmit = async e => {
    e.preventDefault(); const id = e.target.dataset.id; if (!id) return;
    const row = { upflow_keyword_id: id, upflow_place_id: e.target.dataset.place || null, store_name: $("np-l-store").value.trim() || null, campaign_id: $("np-l-camp").value || null, group_name: $("np-l-group").value.trim() || null, memo: $("np-l-memo").value.trim() || null, start_day: $("np-l-start").value || null, updated_at: new Date().toISOString() };
    const { error } = await sb.from("place_links").upsert(row, { onConflict: "upflow_keyword_id" });
    if (error) return alert("저장하지 못했어요. (supabase/024_place_links.sql 실행 여부를 확인해 주세요)");
    np.links[id] = row; $("np-link").close(); npRender();
  };
  $("np-l-del").onclick = async () => {
    const id = $("np-l-form").dataset.id; if (!np.links[id]) return $("np-link").close();
    const { error } = await sb.from("place_links").delete().eq("upflow_keyword_id", id); if (error) return alert("해제하지 못했어요.");
    delete np.links[id]; $("np-link").close(); npRender();
  };
}

/* ---------- 연결 상태 · 권한 · 슬롯 · 오늘 검색 사용량 ---------- */
function npDrawStatus() {
  const el = $("np-status"), st = np.status; el.hidden = !st; if (!st) return;
  const yn = (v, a, b) => v === true ? a : v === false ? b : "확인 못 함";
  const bar = (u) => u && u.limit ? `${u.used != null ? u.used.toLocaleString() : "?"} / ${u.limit.toLocaleString()}` : (u && u.used != null ? u.used.toLocaleString() : "확인 못 함");
  const pct = u => u && u.limit && u.used != null ? Math.min(100, Math.round(u.used / u.limit * 100)) : null;
  const cell = (t, v, u) => `<div class="np-st"><small>${t}</small><b>${v}</b>${pct(u) != null ? `<i class="np-bar-i"><s style="width:${pct(u)}%"></s></i>` : ""}</div>`;
  el.innerHTML = cell("API 승인", np.sample ? "테스트 데이터" : yn(st.approved, "승인됨", "승인 필요")) + cell("키 권한", np.sample ? "—" : `읽기 ${yn(st.read, "가능", "불가")} · 쓰기 ${yn(st.write, "가능", "불가")}`) + cell("추적 슬롯", np.sample ? "—" : bar(st.slots), np.sample ? null : st.slots) + cell("오늘 검색 사용량", np.sample ? "—" : bar(st.daily), np.sample ? null : st.daily)
    + `<p class="muted small">순위 이력 읽기는 새 검색을 실행하지 않아요. <b>1회 검색과 재검색은 업플로우 웹과 함께 쓰는 일일 검색 사용량에 합산돼요.</b> 추적 슬롯은 등록된 키워드 수예요.</p>`;
}

function npToggle(id, redraw) {
  if (np.open.has(id)) np.open.delete(id); else { np.open.add(id); const kw = np.kws.find(k => k.id === id); if (kw) npEnsureHist([kw]); }   // 펼칠 때만 그 키워드의 이력을 읽음
  redraw();
}

/* ---------- 순위 요약 새로고침 (최신·직전·최초만, 새 검색 아님) ---------- */
async function npSummary() {
  const rows = npRows(); if (!rows.length) return npToast("새로고침할 항목이 없어요.", "warn");
  if (np.busy.has("sum")) return; np.busy.add("sum"); $("np-sum").disabled = true; npToast("순위 요약을 읽는 중이에요… (새 검색은 실행하지 않아요)");
  let n = 0, err = null;
  for (let i = 0; i < rows.length && !err; i += 200) {
    const ids = rows.slice(i, i + 200).map(k => k.id), r = await npCall("summary", { ids });
    if (r.error) { err = r; break; }
    NP.listOf(r.result && !NP.listOf(r.result).length ? r.result.result || r.result : r.result).forEach(it => { const k = NP.normKeyword({ id: it.id ?? it.keyword_id, ranks_summary: it.ranks_summary || it }), kw = k && np.kws.find(x => x.id === k.id); if (kw && k.summary.length) { kw.summary = k.summary; if (k.best != null) kw.best = k.best; n++; } });
  }
  np.busy.delete("sum"); $("np-sum").disabled = false;
  if (err) return npToast(npErr(err), "warn");
  npToast(`${n}개 키워드의 순위 요약을 갱신했어요.`, "ok"); npRender();
}

/* ---------- 웹훅 신호 (이력을 다시 읽으라는 표시만) ---------- */
async function npSignals() {
  const r = await sb.from("upflow_events").select("delivery_id,event,keyword_id,received_at").is("handled_at", null).order("received_at", { ascending: false }).limit(200);
  if (r.error) { np.sigErr = true; return; }
  np.sigErr = false; const ids = [];
  (r.data || []).forEach(e => { if (!e.keyword_id) return; np.fresh.add(e.keyword_id); delete np.hist[e.keyword_id]; np.histReq.delete(e.keyword_id); ids.push(e.delivery_id); if (np.pending[e.keyword_id] && e.event === "refresh.failed") { np.pending[e.keyword_id].failed = true; } });
  np.sigRows = r.data || [];
  if (ids.length) sb.from("upflow_events").update({ handled_at: new Date().toISOString() }).in("delivery_id", ids).then(() => {});   // 화면에서 확인했다고 표시
}
async function npDrawHook() {
  const base = (window.WOORI && window.WOORI.SUPABASE_URL || "").replace(/\/$/, "");
  $("np-hook-url").textContent = base ? base + "/functions/v1/upflow-webhook" : "(config.js 의 SUPABASE_URL 확인)";
  const r = await sb.from("upflow_events").select("received_at").order("received_at", { ascending: false }).limit(1);
  $("np-hook-last").textContent = r.error ? "확인 못 함 (supabase/026_upflow_events.sql 실행 필요)" : (r.data && r.data[0] ? npKst2(r.data[0].received_at) : "아직 받은 신호가 없어요");
}

/* ---------- 재검색: 접수 → 처리 중 → (새 기록이 확인되면) 완료 ---------- */
const npAfter = (rec, iso) => !!rec && !!rec.checkedAt && !!iso && new Date(rec.checkedAt).getTime() >= new Date(iso).getTime() - 3000;
function npSavePending() { try { sessionStorage.setItem("np-pending", JSON.stringify(np.pending)); } catch (_) { /* 저장 못 해도 동작 */ } }
function npResumePending() { try { const p = JSON.parse(sessionStorage.getItem("np-pending") || "{}"); Object.entries(p).forEach(([id, v]) => { if (Date.now() - new Date(v.acceptedAt).getTime() < 30 * 60e3 && np.kws.some(k => k.id === id)) np.pending[id] = v; }); } catch (_) { /* 무시 */ } }
async function npCheckPending(id) {                                      // 접수 시각 이후에 수집된 새 기록이 있을 때만 '완료'
  const pr = np.pending[id]; if (!pr) return false;
  const g = await npCall("ranks", { id }); if (g.error) return false;
  const h = NP.normHistory((g.ranks || {})[id] || []);
  if (h.length) np.hist[id] = h;
  if (h.length && npAfter(h[0], pr.acceptedAt)) { delete np.pending[id]; npSavePending(); np.fresh.delete(id); return true; }
  return false;
}
async function npRefresh(id, btn) {
  const kw = np.kws.find(k => k.id === id); if (!kw) return;
  const block = npWriteBlock(); if (block) return npToast(block, "warn");
  if (np.busy.has(id) || np.pending[id]) return npToast("이 키워드는 재검색을 처리하는 중이에요.", "warn");
  if (!confirm(`'${npStore(kw)} · ${kw.keyword}' 키워드를 업플로우에서 다시 검색할까요?\n오늘 검색 사용량이 1회 사용돼요. (업플로우 웹과 한도를 함께 써요)`)) return;
  np.busy.add(id); btn.disabled = true; npToast("재검색을 요청하는 중이에요…");
  const r = await npCall("refresh", { id });
  np.busy.delete(id);
  if (r.error) { btn.disabled = false; return npToast(npErr(r), "warn"); }                // 실패해도 자동으로 다시 보내지 않아요
  np.pending[id] = { acceptedAt: r.accepted_at || new Date().toISOString() }; npSavePending();
  const q = r.result && /queued|accept/i.test(JSON.stringify(r.result)) ? "재검색이 접수됐어요(queued)." : "재검색이 접수됐어요.";
  npToast(q + " 새 기록이 확인되면 알려 드릴게요. 잠깐 확인한 뒤에도 안 끝나면 '처리 중'으로 남겨 둘게요.", "ok"); npRender();
  for (let i = 0; i < 5; i++) {                                                           // 읽기만: 15초 간격으로 최대 5번
    await new Promise(res => setTimeout(res, 15000));
    if (!np.pending[id]) break;
    if (await npCheckPending(id)) { npToast(`'${npStore(kw)} · ${kw.keyword}' 재검색 결과가 확인됐어요.`, "ok"); npRender(); return; }
  }
  if (np.pending[id]) { npToast("아직 새 기록이 확인되지 않았어요. '처리 중'으로 남겨 둘게요. 잠시 뒤 '목록 다시 읽기'나 행을 펼쳐서 확인해 주세요.", "warn"); npRender(); }
}

/* ---------- 키워드 등록 · 대량 등록 (중복 확인 → 새 항목만 50건씩 → 항목별 결과) ---------- */
const NR_STATE = { created: ["신규 등록", "ok"], restored: ["기존 이력 복원", "blue"], duplicate: ["중복", "mid"], invalid: ["입력 오류", "bad"], slot: ["슬롯 부족", "bad"] };
const nr = { rows: [], looked: false };
const nrMode = () => document.querySelector('input[name="nrmode"]:checked').value;
function nrParse() {
  const p = NP.parseRegLines($("np-r-lines").value);
  if (!p.rows.length) { npToast("등록할 줄을 입력해 주세요.", "warn"); return null; }
  if (p.over) npToast("한 번에 50줄까지만 처리해요. 앞의 50줄만 사용했어요.", "warn");
  return p.rows;
}
function nrDraw(rows) {   // rows: {n, keyword, placeId, state, id, existingId, message, error}
  const box = $("np-r-res"); box.hidden = false;
  const cnt = {}; rows.forEach(r => cnt[r.state] = (cnt[r.state] || 0) + 1);
  const sum = Object.keys(NR_STATE).filter(k => cnt[k]).map(k => `${NR_STATE[k][0]} ${cnt[k]}`).join(" · ");
  const failed = rows.filter(r => r.state === "invalid" || r.state === "slot");
  box.innerHTML = `<p><b>${esc(sum || "결과 없음")}</b></p><div class="rk-scroll"><table class="tb"><thead><tr><th>줄</th><th>키워드</th><th>플레이스 ID</th><th>결과</th><th>처리</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="np-card" data-i="${i}"><td data-l="줄">${r.n}</td><td data-l="키워드">${esc(r.keyword)}</td><td data-l="플레이스 ID">${esc(r.placeId || "—")}</td><td data-l="결과"><span class="tag ${(NR_STATE[r.state] || ["", ""])[1]}">${esc((NR_STATE[r.state] || [r.state])[0])}</span>${r.id || r.existingId ? `<small class="muted">추적 ID ${esc(r.id || r.existingId)}</small>` : ""}${r.state === "restored" ? '<small class="muted">기존 추적 ID와 이력을 이어서 써요</small>' : ""}${r.error || r.message ? `<small class="muted">${esc(r.error || r.message)}</small>` : ""}</td><td data-l="처리">${(r.state === "duplicate" || r.state === "restored" || r.state === "created") && (r.existingId || r.id) ? `<button type="button" class="btn" data-nr="link">우리 매장·캠페인에 연결</button>` : ""}</td></tr>`).join("")}</tbody></table></div>${failed.length ? `<div class="np-acts"><button type="button" class="btn" id="np-r-retry">실패한 ${failed.length}줄만 입력칸에 넣기</button></div>` : ""}`;
  nr.rows = rows;
}
async function nrCheck() {
  const rows = nrParse(); if (!rows) return;
  const ok = rows.filter(r => !r.error); let res = [];
  for (let i = 0; i < ok.length; i += 50) {
    const sent = ok.slice(i, i + 50), r = await npCall("lookup", { items: sent.map(x => ({ keyword: x.keyword, place_id: x.placeId, mode: nrMode() })) });
    if (r.error) { if (np.sample) { npToast("테스트 데이터에서는 중복 확인을 하지 않아요.", "warn"); return; } return npToast(npErr(r), "warn"); }
    res.push(...NP.lookupResults(r.result, sent));
  }
  const byLine = new Map(res.map(x => [x.input.n, x]));
  nrDraw(rows.map(r => { const x = byLine.get(r.n); return { ...r, state: r.error ? "invalid" : (x && x.found ? "duplicate" : "created"), existingId: x && x.found ? x.id : null, message: r.error ? "" : (x && x.found ? "이미 업플로우에 있어요" : "새로 등록할 수 있어요") }; }));
  nr.looked = true; $("np-r-go").disabled = !!npWriteBlock() || !rows.some(r => !r.error && !(byLine.get(r.n) && byLine.get(r.n).found));
  npToast("중복 확인을 마쳤어요. 이미 있는 키워드는 '우리 매장·캠페인에 연결'로 기존 추적 ID를 연결할 수 있어요.", "ok");
}
async function nrSend(e) {
  e.preventDefault(); if (np.busy.has("nr")) return;
  const wb = npWriteBlock(); if (wb) return npToast(wb, "warn");
  if (!nr.looked) return npToast("먼저 '중복 확인'을 해 주세요.", "warn");
  const todo = nr.rows.filter(r => r.state === "created" && !r.error && r.placeId);
  if (!todo.length) return npToast("새로 등록할 항목이 없어요.", "warn");
  const gid = $("np-r-group").value || null;
  if (!confirm(`${todo.length}개 키워드를 업플로우에 등록할까요?\n추적 슬롯이 사용돼요.`)) return;
  np.busy.add("nr"); $("np-r-go").disabled = true; npToast("등록하는 중이에요… (자동으로 다시 보내지 않아요)");
  const out = nr.rows.slice(); let fatal = null;
  for (let i = 0; i < todo.length && !fatal; i += 50) {
    const chunk = todo.slice(i, i + 50), r = await npCall("register", { items: chunk.map(x => ({ keyword: x.keyword, place_id: x.placeId, mode: nrMode(), ...(gid ? { group_id: gid } : {}) })) });
    if (r.error === "duplicate") { chunk.forEach(x => { const o = out.find(y => y.n === x.n); o.state = "duplicate"; o.existingId = r.existing_id || null; o.message = "서버가 중복이라고 알려 줬어요"; }); continue; }
    if (r.error) { fatal = r; chunk.forEach(x => { const o = out.find(y => y.n === x.n); o.state = r.error === "slot_limit" ? "slot" : "invalid"; o.message = npErr(r); }); continue; }
    NP.bulkResults(r.result, chunk.map(x => ({ n: x.n }))).forEach(b => { const o = out.find(y => y.n === b.input.n); o.state = b.state; o.id = b.id; o.existingId = b.existingId; o.message = b.message; });   // HTTP 200 이어도 항목별로 확인
  }
  np.busy.delete("nr"); nrDraw(out); nr.looked = false;
  const ok = out.filter(r => r.state === "created" || r.state === "restored").length;
  npToast(fatal ? npErr(fatal) : `등록을 마쳤어요. 성공 ${ok}건. 결과를 항목별로 확인해 주세요. 업플로우에서 첫 수집이 끝나면 '목록 다시 읽기'로 보여요.`, fatal ? "warn" : "ok");
}
