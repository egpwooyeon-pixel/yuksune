// 체험단 모집 목록 — 샘플 데이터 (나중에 DB/서버 데이터로 교체)
const TYPES = ["전체", "구매평", "블로그", "인스타"];
const CATS  = ["전체", "맛집", "뷰티", "생활", "디지털", "여행", "반려"];
const EMOJI = {맛집:"🍜", 뷰티:"💄", 생활:"🏠", 디지털:"🎧", 여행:"🏝️", 반려:"🐶"};
const COLOR = {맛집:"#ffe9d6", 뷰티:"#ffe0ea", 생활:"#e3f3e6", 디지털:"#e0e9ff", 여행:"#dff4f7", 반려:"#fff3cf"};

const base = [
  ["블로그","맛집","[서울 강남] 신규 오픈 파스타 맛집 방문 체험단","식사권 5만원",8,23,3],
  ["인스타","뷰티","립 틴트 신제품 릴스 체험단","제품 제공 + 3만원",10,41,5],
  ["구매평","생활","주방 정리함 세트 구매평 체험단","제품 제공",15,12,9],
  ["블로그","여행","제주 오션뷰 숙소 1박 체험단","숙박권 1박",3,88,2],
  ["인스타","맛집","수제 디저트 카페 포토 체험단","디저트 세트",12,15,7],
  ["구매평","디지털","무선 이어폰 구매평 체험단","제품 제공",20,35,4],
  ["블로그","뷰티","저자극 선크림 2주 사용 후기단","제품 제공 + 2만원",10,52,1],
  ["인스타","반려","강아지 간식 체험 리뷰어","간식 3종",20,9,12],
  ["구매평","맛집","프리미엄 닭가슴살 구매평 체험단","제품 제공",30,64,6],
  ["블로그","생활","공기청정기 렌탈 체험 후기단","설치 + 체험",5,70,10],
  ["인스타","디지털","스마트워치 언박싱 릴스단","제품 제공",8,27,8],
  ["구매평","반려","고양이 모래 구매평 체험단","제품 제공",25,18,11],
];
const campaigns = base.map(([type,cat,title,reward,slots,applied,days],i) =>
  ({id:i+1,type,cat,title,reward,slots,applied,days}));

const params = new URLSearchParams(location.search);
const state = {
  type: TYPES.includes(params.get("type")) ? params.get("type") : "전체",
  cat: "전체", sort: "new", shown: 8,
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function render() {
  let list = campaigns.filter(c =>
    (state.type === "전체" || c.type === state.type) && (state.cat === "전체" || c.cat === state.cat));
  if (state.sort === "new") list.sort((a,b) => b.id - a.id);
  if (state.sort === "deadline") list.sort((a,b) => a.days - b.days);
  if (state.sort === "hot") list.sort((a,b) => b.applied/b.slots - a.applied/a.slots);

  document.getElementById("count").textContent = list.length;
  document.getElementById("empty").hidden = list.length > 0;
  document.getElementById("more").parentElement.hidden = list.length <= state.shown;

  document.getElementById("cards").innerHTML = list.slice(0, state.shown).map(c => `
    <li class="cc">
      <a href="#">
        <div class="thumb" style="background:${COLOR[c.cat]}">
          <span class="emoji">${EMOJI[c.cat]}</span>
          <span class="dday ${c.days <= 3 ? "urgent" : ""}">D-${c.days}</span>
          <span class="ctype">${c.type}</span>
        </div>
        <p class="ccat">${c.cat}</p>
        <p class="ctitle">${esc(c.title)}</p>
        <p class="creward">🎁 ${esc(c.reward)}</p>
        <p class="capply">신청 <b>${c.applied}</b> / 모집 ${c.slots}명</p>
      </a>
    </li>`).join("");
}

function tabs() {
  const el = document.getElementById("type-tabs");
  el.innerHTML = TYPES.map(t => `<button class="tab ${t===state.type?"on":""}" data-t="${t}">${t==="전체"?"전체":t+"체험단"}</button>`).join("");
  el.onclick = e => { const t = e.target.dataset.t; if (!t) return; state.type = t; state.shown = 8; tabs(); render(); };
}
function chips() {
  const el = document.getElementById("cat-chips");
  el.innerHTML = CATS.map(c => `<button class="chip ${c===state.cat?"on":""}" data-c="${c}">${c}</button>`).join("");
  el.onclick = e => { const c = e.target.dataset.c; if (!c) return; state.cat = c; state.shown = 8; chips(); render(); };
}
document.getElementById("sort").onchange = e => { state.sort = e.target.value; render(); };
document.getElementById("more").onclick = () => { state.shown += 8; render(); };

tabs(); chips(); render();
