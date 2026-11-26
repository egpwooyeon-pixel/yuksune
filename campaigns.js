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
const daysLeft = d => Math.max(0, Math.ceil((new Date(d + "T23:59:59") - Date.now()) / 864e5));

const params = new URLSearchParams(location.search);
const urlQ = (params.get("q") || "").trim();
const state = { region: "", cat: "", ch: CH[params.get("type")] ? params.get("type") : "", mode: "", sort: "new", q: urlQ, shown: 12 };
let campaigns = [], loaded = false;

// ---- 필터 UI
$("f-cat").innerHTML += CATS.map(c => `<option value="${c}">${c}</option>`).join("");
$("f-ch").innerHTML += Object.keys(CH).map(k => `<option value="${k}">${CH[k].label}</option>`).join("");
$("f-ch").value = state.ch;
function drawChips() {
  const items = [["", "전체"], ["배송형", "배송형"], ...REGIONS.map(r => [r, r])];
  $("region-chips").innerHTML = items.map(([v, t]) => `<button type="button" class="${state.region === v ? "on" : ""}" data-r="${v}">${t}</button>`).join("");
  $("rg-sel").textContent = state.region ? (state.region === "배송형" ? "배송형 (택배)" : state.region) : "지역을 선택해 주세요.";
  $("rg-sel").classList.toggle("has", !!state.region);
}
$("region-chips").onclick = e => { const r = e.target.dataset.r; if (r === undefined) return; state.region = r; state.shown = 12; drawChips(); render(); };
$("rg-toggle").onclick = e => { const w = $("rg-wrap"); w.hidden = !w.hidden; e.currentTarget.setAttribute("aria-expanded", !w.hidden); e.currentTarget.querySelector("i").textContent = w.hidden ? "▸" : "▾"; };
[["f-cat", "cat"], ["f-ch", "ch"], ["f-mode", "mode"], ["f-sort", "sort"]].forEach(([id, k]) => { $(id).onchange = e => { state[k] = e.target.value; state.shown = 12; render(); }; });
$("more").onclick = () => { state.shown += 12; render(); };

const regionOK = c => !state.region || (state.region === "배송형" ? c.mode === "배송형"
  : c.region === state.region || (c.region === "수도권" && METRO.includes(state.region)) || (c.region === "지방" && !METRO.includes(state.region) && state.region !== "제주"));

function render() {
  const q = state.q.toLowerCase();
  const list = campaigns.filter(c => regionOK(c) && (!state.cat || c.cat === state.cat) && (!state.ch || c.type === state.ch) && (!state.mode || c.mode === state.mode)
    && (!q || (c.title + " " + c.biz + " " + c.reward).toLowerCase().includes(q)));
  if (state.sort === "deadline") list.sort((a, b) => a.days - b.days);
  else if (state.sort === "hot") list.sort((a, b) => b.applied - a.applied);
  else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  $("cl-kick").textContent = urlQ ? `"${urlQ}" 검색 결과` : state.ch ? CH[state.ch].label + " 체험단" : "체험단";
  $("empty").hidden = !loaded || list.length > 0;
  $("empty").textContent = urlQ ? "검색 결과가 없어요." : loaded && !campaigns.length ? "지금 모집 중인 체험단이 없어요." : "조건에 맞는 체험단이 없어요.";
  $("more").parentElement.hidden = list.length <= state.shown;
  $("cards").innerHTML = list.slice(0, state.shown).map(c => {
    const ch = CH[c.type] || { label: c.type, cls: "rv", ic: "•" };
    const th = c.photo ? `background:#eee url(${encodeURI(c.photo)}) center/cover` : `background:${COLOR[c.cat] || "#eceff3"}`;
    return `<li class="cl-card"><a href="campaign.html?id=${encodeURIComponent(c.id)}">
      <div class="cl-th" style="${th}">${c.photo ? "" : `<span class="cl-emoji">${EMOJI[c.cat] || "✨"}</span>`}${c.isNew ? '<span class="cl-new">N</span>' : ""}</div>
      <div class="cl-bar"><span><b>${c.days}</b>일 남음</span><i></i><span>신청 <b>${c.applied}</b> / ${c.slots}</span></div>
      <div class="cl-mode"><span class="cl-ic ${ch.cls}" title="${esc(ch.label)}">${ch.ic}</span>${esc(c.mode)}</div>
      <p class="cl-title">${esc(c.title)}</p><p class="cl-reward">${esc(c.reward)}</p>
    </a></li>`;
  }).join("");
}

async function load() {
  if (!window.sbReady) { loaded = true; render(); return; }
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from("campaigns").select("*").eq("status", "open").gte("deadline", today).order("created_at", { ascending: false });
  if (error || !data) { loaded = true; render(); return; }
  const { data: cnt } = await sb.rpc("campaign_counts");
  const n = Object.fromEntries((cnt || []).map(r => [r.campaign_id, Number(r.applied)]));
  campaigns = data.map(r => ({ id: r.id, type: r.type, cat: r.cat, region: r.region, mode: r.mode, title: r.title, reward: r.reward, slots: r.slots, biz: r.biz,
    photo: r.photo_url, created_at: r.created_at, days: daysLeft(r.deadline), applied: n[r.id] || 0, isNew: Date.now() - new Date(r.created_at) < 3 * 864e5 }));
  loaded = true; render();
}
drawChips(); render(); load();

// 왓섭 광고: 연결 주소(config.js 의 AD_WHATSSUB_URL)가 https 일 때만 눌러서 이동하는 링크로 바꿈
(function () {
  const el = document.getElementById("ws-ad"), url = window.WOORI && window.WOORI.AD_WHATSSUB_URL;
  if (!el || !/^https:\/\//i.test(url || "")) return;
  const a = document.createElement("a"); a.id = "ws-ad"; a.className = el.className; a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer sponsored";
  a.setAttribute("aria-label", "광고: 왓섭 바로가기 (새 창)"); a.innerHTML = el.innerHTML; el.replaceWith(a);
})();
