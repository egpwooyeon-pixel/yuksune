// 체험단 목록: 서버(Supabase)의 모집 중인 체험단을 지역·카테고리·채널·유형으로 걸러 보여줍니다.
const CH = {                                    // DB 값 → 화면 이름/아이콘
  블로그: { label: "블로그", cls: "blog", ic: "B" },
  인스타: { label: "인스타그램", cls: "ig", ic: "◎" },
  유튜브: { label: "유튜브", cls: "yt", ic: "▶" },
  구매평: { label: "구매평", cls: "rv", ic: "R" },
};
const REGIONS = ["서울", "경기", "인천", "강원", "대전", "세종", "충남", "충북", "부산", "울산", "경남", "경북", "대구", "광주", "전남", "전북", "제주"];
const METRO = ["서울", "경기", "인천"];
const CATS = ["맛집", "카페", "뷰티", "숙박", "놀이", "생활", "기타"];
const EMOJI = { 맛집: "🍜", 뷰티: "💄", 숙박: "🛏️", 카페: "☕", 놀이: "🎮", 생활: "🏠", 기타: "✨" };
const COLOR = { 맛집: "#ffe9d6", 뷰티: "#ffe0ea", 숙박: "#dff4f7", 카페: "#f1e6da", 놀이: "#e6e0ff", 생활: "#e3f3e6", 기타: "#eceff3" };
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// 한국 시간(KST) 기준 날짜. 마감일(date)은 한국 날짜로 저장돼 있고, 마감일 당일까지 모집 (상세 페이지·서버와 같은 기준)
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayDiff = d => Math.round((new Date(d + "T00:00:00Z") - new Date(kstToday() + "T00:00:00Z")) / 864e5);   // 마감일까지 남은 날 (오늘 마감 = 0)
const dLabel = n => n <= 0 ? "D-day" : "D-" + n;
const SOON = 3, NEW_DAYS = 3;

const params = new URLSearchParams(location.search);
const TABS = { all: "전체 모집", new: "새로 열린 체험단", soon: "곧 마감되는 체험단" };
const urlQ = (params.get("q") || "").trim();
// 탭·필터는 주소에 저장해서, 상세 보고 뒤로 가도 그대로 유지됨
const state = { tab: TABS[params.get("tab")] ? params.get("tab") : "all", region: params.get("region") || "", cat: params.get("cat") || "",
  ch: CH[params.get("ch") || params.get("type")] ? (params.get("ch") || params.get("type")) : "", mode: params.get("mode") || "", sort: params.get("sort") || "", q: urlQ, shown: 12 };
let campaigns = [], status = "loading", countsOk = true;    // status: loading | error | ready

function saveUrl() {
  const q = new URLSearchParams();
  if (state.tab !== "all") q.set("tab", state.tab);
  ["region", "cat", "ch", "mode", "sort", "q"].forEach(k => { if (state[k]) q.set(k, state[k]); });
  history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
}

// ---- 필터 UI
$("f-cat").innerHTML += CATS.map(c => `<option value="${c}">${c}</option>`).join("");
$("f-ch").innerHTML += Object.keys(CH).map(k => `<option value="${k}">${CH[k].label}</option>`).join("");
$("f-cat").value = state.cat; $("f-ch").value = state.ch; $("f-mode").value = state.mode; $("f-sort").value = state.sort;
function drawChips() {
  const items = [["", "전체"], ["배송형", "배송형"], ...REGIONS.map(r => [r, r])];
  $("region-chips").innerHTML = items.map(([v, t]) => `<button type="button" class="${state.region === v ? "on" : ""}" data-r="${v}">${t}</button>`).join("");
  $("rg-sel").textContent = state.region ? (state.region === "배송형" ? "배송형 (택배)" : state.region) : "지역을 선택해 주세요.";
  $("rg-sel").classList.toggle("has", !!state.region);
}
function drawTabs() {
  $("cl-tabs").innerHTML = Object.entries(TABS).map(([k, t]) => `<button type="button" role="tab" aria-selected="${state.tab === k}" class="${state.tab === k ? "on" : ""}" data-t="${k}">${t}</button>`).join("");
}
$("cl-tabs").onclick = e => { const t = e.target.dataset.t; if (!t) return; state.tab = t; state.shown = 12; drawTabs(); render(); };
$("region-chips").onclick = e => { const r = e.target.dataset.r; if (r === undefined) return; state.region = r; state.shown = 12; drawChips(); render(); };
$("rg-toggle").onclick = e => { const w = $("rg-wrap"); w.hidden = !w.hidden; e.currentTarget.setAttribute("aria-expanded", !w.hidden); e.currentTarget.querySelector("i").textContent = w.hidden ? "▸" : "▾"; };
[["f-cat", "cat"], ["f-ch", "ch"], ["f-mode", "mode"], ["f-sort", "sort"]].forEach(([id, k]) => { $(id).onchange = e => { state[k] = e.target.value; state.shown = 12; render(); }; });
$("more").onclick = () => { state.shown += 12; render(); };
function resetFilters() { Object.assign(state, { region: "", cat: "", ch: "", mode: "", sort: "", q: "", shown: 12 }); $("f-cat").value = $("f-ch").value = $("f-mode").value = $("f-sort").value = ""; drawChips(); render(); }

const regionOK = c => !state.region || (state.region === "배송형" ? c.mode === "배송형"
  : c.region === state.region || (c.region === "수도권" && METRO.includes(state.region)) || (c.region === "지방" && !METRO.includes(state.region) && state.region !== "제주"));
const inTab = c => state.tab === "all" || (state.tab === "new" ? c.isNew : c.days >= 0 && c.days <= SOON);
const byNew = (a, b) => new Date(b.created_at) - new Date(a.created_at);

const MSG = {
  loading: ["체험단을 불러오는 중이에요", ""],
  error: ["체험단을 불러오지 못했어요", "잠시 후 다시 시도해 주세요."],
  none: ["지금 모집 중인 체험단이 없어요", "새 체험단이 올라오면 이곳에 보여요."],
  tab: { new: ["새로 열린 체험단이 없어요", "최근 3일 안에 열린 체험단이 없어요."], soon: ["곧 마감되는 체험단이 없어요", "3일 안에 마감되는 체험단이 없어요."] },
  filter: ["선택한 조건에 맞는 체험단이 없어요", "조건을 바꾸거나 초기화해 보세요."],
};
function stateBox(title, sub, btns) {
  $("cards").innerHTML = ""; $("more").parentElement.hidden = true;
  const b = $("empty"); b.hidden = false; b.dataset.k = btns ? btns[0][0] : "";
  b.innerHTML = `<b class="em-t">${esc(title)}</b>${sub ? `<span class="em-s">${esc(sub)}</span>` : ""}${(btns || []).map(([k, t]) => `<button type="button" class="em-btn" data-a="${k}">${t}</button>`).join("")}`;
}
$("empty").onclick = e => { const a = e.target.dataset.a; if (a === "retry") load(); else if (a === "all") { state.tab = "all"; state.shown = 12; drawTabs(); render(); } else if (a === "reset") resetFilters(); };

function skeleton() {
  $("empty").hidden = true; $("more").parentElement.hidden = true;
  $("cards").innerHTML = Array.from({ length: 8 }, () => `<li class="cl-card cl-sk" aria-hidden="true"><div class="cl-th"></div><p></p><p></p></li>`).join("");
}

function render() {
  saveUrl();
  const q = state.q.toLowerCase();
  $("cl-kick").textContent = urlQ ? `"${urlQ}" 검색 결과` : state.ch ? CH[state.ch].label + " 체험단" : "체험단";
  $("cl-tabs").hidden = false;
  const note = $("cl-note"); note.hidden = true;
  if (status === "loading") { $("cards").setAttribute("aria-busy", "true"); skeleton(); $("empty").hidden = false; $("empty").className = "empty loading"; $("empty").innerHTML = `<b class="em-t">${MSG.loading[0]}</b>`; return; }
  $("cards").removeAttribute("aria-busy"); $("empty").className = "empty";
  if (status === "error") return stateBox(...MSG.error, [["retry", "다시 시도"]]);
  if (!campaigns.length) return stateBox(...MSG.none);

  // 신청자 수를 못 불러왔으면 '신청 많은순'은 쓸 수 없음
  const hotOpt = $("f-sort").querySelector('option[value="hot"]'); hotOpt.disabled = !countsOk;
  let sort = state.sort;
  if (sort === "hot" && !countsOk) { sort = ""; note.hidden = false; note.textContent = "신청자 수를 확인할 수 없어서 '신청 많은순'은 지금 사용할 수 없어요."; }
  else if (!countsOk) { note.hidden = false; note.textContent = "신청자 수를 확인하지 못해 '확인 불가'로 표시했어요."; }

  const tabList = campaigns.filter(inTab);
  if (!tabList.length) return stateBox(...MSG.tab[state.tab], [["all", "전체 모집 보기"]]);
  const list = tabList.filter(c => regionOK(c) && (!state.cat || c.cat === state.cat) && (!state.ch || c.type === state.ch) && (!state.mode || c.mode === state.mode)
    && (!q || (c.title + " " + c.biz + " " + c.reward).toLowerCase().includes(q)));
  if (!list.length) return stateBox(...MSG.filter, [["reset", "필터 초기화"]]);

  const dflt = state.tab === "soon" ? "deadline" : "new";
  sort = sort || dflt;
  if (sort === "deadline") list.sort((a, b) => a.days - b.days || byNew(a, b));
  else if (sort === "hot") list.sort((a, b) => b.applied - a.applied || byNew(a, b));
  else list.sort(byNew);

  $("empty").hidden = true;
  $("more").parentElement.hidden = list.length <= state.shown;
  $("cards").innerHTML = list.slice(0, state.shown).map(c => {
    const ch = CH[c.type] || { label: c.type, cls: "rv", ic: "•" };
    const th = c.photo ? `background:#eee url(${encodeURI(c.photo)}) center/cover` : `background:${COLOR[c.cat] || "#eceff3"}`;
    const where = c.mode === "배송형" ? "배송형" : (c.region || "방문형");
    const ppl = countsOk ? `신청 <b>${c.applied}</b>명 / 모집 ${c.slots}명` : `신청 <b>확인 불가</b> / 모집 ${c.slots}명`;
    return `<li class="cl-card"><a href="campaign.html?id=${encodeURIComponent(c.id)}">
      <div class="cl-th" style="${th}">${c.photo ? "" : `<span class="cl-emoji">${EMOJI[c.cat] || "✨"}</span>`}${c.isNew ? '<span class="cl-new">N</span>' : ""}</div>
      <div class="cl-mode"><span class="cl-ic ${ch.cls}" title="${esc(ch.label)}">${ch.ic}</span><span>[${esc(where)}] ${esc(c.biz)} · ${esc(ch.label)}</span></div>
      <p class="cl-title">${esc(c.title)}</p><p class="cl-reward">${esc(c.reward)}</p>
      <p class="cl-meta"><span class="cl-d${c.days <= SOON ? " hot" : ""}">${dLabel(c.days)}</span><i></i><span>${ppl}</span></p>
    </a></li>`;
  }).join("");
}

async function load() {
  if (!window.sbReady) { status = "error"; render(); return; }
  status = "loading"; render();
  const { data, error } = await sb.from("campaigns").select("*").eq("status", "open").gte("deadline", kstToday()).order("created_at", { ascending: false });
  if (error || !data) { status = "error"; render(); return; }
  const { data: cnt, error: cerr } = await sb.rpc("campaign_counts");      // 신청자 수만 실패해도 목록은 보여줌
  countsOk = !cerr && Array.isArray(cnt);
  const n = Object.fromEntries((countsOk ? cnt : []).map(r => [r.campaign_id, Number(r.applied)]));
  campaigns = data.map(r => ({ id: r.id, type: r.type, cat: r.cat, region: r.region, mode: r.mode, title: r.title, reward: r.reward, slots: r.slots, biz: r.biz,
    photo: r.photo_url, created_at: r.created_at, days: dayDiff(r.deadline), applied: countsOk ? (n[r.id] || 0) : null, isNew: Date.now() - new Date(r.created_at) < NEW_DAYS * 864e5 }));
  status = "ready"; render();
}
drawChips(); drawTabs(); render(); load();
