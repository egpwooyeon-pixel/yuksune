// 체험단 모집 목록 — 샘플 데이터 (나중에 DB에서 불러오기)
// 실제 서비스에서는 업체가 네이버 플레이스 주소를 등록하면 이 항목이 자동으로 만들어집니다.
const REGIONS = ["전체", "서울", "수도권", "지방", "제주", "배송형"];
const TITLES = {블로그:"블로그체험단", 구매평:"구매평체험단", 인스타:"인스타체험단"};
const EMOJI = {맛집:"🍜", 뷰티:"💄", 숙박:"🛏️", 카페:"☕", 놀이:"🎮", 생활:"🏠"};
const COLOR = {맛집:"#ffe9d6", 뷰티:"#ffe0ea", 숙박:"#dff4f7", 카페:"#f1e6da", 놀이:"#e6e0ff", 생활:"#e3f3e6"};

const daysLeft = d => Math.max(0, Math.ceil((new Date(d + "T23:59:59") - Date.now()) / 864e5));
let campaigns = [...window.SAMPLES];  // 먼저 샘플을 보여주고, 서버에서 불러오면 실제 캠페인을 앞에 붙임

async function loadFromServer() {
  if (!window.sbReady) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from("campaigns").select("*").eq("status", "open")
    .gte("deadline", today).order("created_at", { ascending: false });
  if (error || !data) return;
  const { data: cnt } = await sb.rpc("campaign_counts");
  const n = Object.fromEntries((cnt || []).map(r => [r.campaign_id, Number(r.applied)]));
  const real = data.map(r => ({ id: r.id, type: r.type, cat: r.cat, region: r.region, mode: r.mode,
    title: r.title, reward: r.reward, slots: r.slots, biz: r.biz, photo: r.photo_url,
    days: daysLeft(r.deadline), applied: n[r.id] || 0, isNew: Date.now() - new Date(r.created_at) < 3 * 864e5 }));
  campaigns = [...real, ...window.SAMPLES];
  render();
}

const params = new URLSearchParams(location.search);
const type = TITLES[params.get("type")] ? params.get("type") : "블로그";
const urlQ = (params.get("q") || "").trim();
const searchAll = !!urlQ && !params.get("type");   // 상단 검색창에서 온 경우: 모든 종류에서 검색
const state = {region:"전체", q:urlQ, shown:10};
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

document.getElementById("page-title").textContent = searchAll ? `"${urlQ}" 검색 결과` : TITLES[type];
if (urlQ) document.getElementById("q").value = urlQ;
document.getElementById("guide-title").textContent = type + " 체험단";
if (type === "구매평") document.getElementById("point-note").innerHTML = "<br>구매평 체험단은 <b>포인트가 지급되지 않습니다.</b>";
document.title = TITLES[type] + " - 우리들 체험단";

function render() {
  const list = campaigns.filter(c => (searchAll || c.type === type) &&
    (state.region === "전체" || (state.region === "배송형" ? c.mode === "배송형" : c.region === state.region)) &&
    (!state.q || (c.title + c.biz).includes(state.q)));

  document.getElementById("empty").hidden = list.length > 0;
  document.getElementById("more").parentElement.hidden = list.length <= state.shown;
  document.getElementById("cards").innerHTML = list.slice(0, state.shown).map(c => `
    <li class="cc">
      <a href="campaign.html?id=${encodeURIComponent(c.id)}">
        <div class="thumb" style="background:${c.photo ? `#eee url(${c.photo}) center/cover` : COLOR[c.cat]}">
          ${c.photo ? "" : `<span class="emoji">${EMOJI[c.cat]}</span>`}
          ${c.isNew ? '<span class="new">N</span>' : ""}
        </div>
        <span class="mode ${c.mode === "배송형" ? "ship" : ""}">${c.mode}</span>
        <p class="ctitle">${esc(c.title)}</p>
        <p class="creward">${esc(c.reward)}</p>
        <p class="capply"><b>${c.days}일</b> 남음 <i></i> 신청 <b>${c.applied}</b>/${c.slots}</p>
        <p class="biz"><span>등록업체</span><span>${esc(c.biz)}</span></p>
      </a>
    </li>`).join("");
}

const chips = document.getElementById("region-chips");
function drawChips() {
  chips.innerHTML = REGIONS.map(r => `<button class="chip ${r===state.region?"on":""}" data-r="${r}">${r}</button>`).join("");
}
chips.onclick = e => { const r = e.target.dataset.r; if (!r) return; state.region = r; state.shown = 10; drawChips(); render(); loadFromServer(); };
document.getElementById("search-form").onsubmit = e => { e.preventDefault(); state.q = document.getElementById("q").value.trim(); state.shown = 10; render(); };
document.getElementById("more").onclick = () => { state.shown += 10; render(); };
drawChips(); render(); loadFromServer();
