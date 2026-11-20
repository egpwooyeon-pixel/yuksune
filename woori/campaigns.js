// 체험단 모집 목록 — 샘플 데이터 (나중에 DB에서 불러오기)
// 실제 서비스에서는 업체가 네이버 플레이스 주소를 등록하면 이 항목이 자동으로 만들어집니다.
const REGIONS = ["전체", "서울", "수도권", "지방", "제주", "배송형"];
const TITLES = {블로그:"블로그체험단", 구매평:"구매평체험단", 인스타:"인스타체험단"};
const EMOJI = {맛집:"🍜", 뷰티:"💄", 숙박:"🛏️", 카페:"☕", 놀이:"🎮", 생활:"🏠"};
const COLOR = {맛집:"#ffe9d6", 뷰티:"#ffe0ea", 숙박:"#dff4f7", 카페:"#f1e6da", 놀이:"#e6e0ff", 생활:"#e3f3e6"};

// [종류, 분야, 지역, 방식, 제목, 혜택, 남은일수, 신청, 모집, 업체명, 신규]
const base = [
  ["블로그","맛집","수도권","방문형","부천 돌잔치뷔페 블로그 체험단 급구! 모집!","80,000원 식사권 2인 성인 기준",14,0,30,"신통컴퍼니S",1],
  ["블로그","맛집","수도권","방문형","인천 월미도 와일드벅스 방문형 체험단","5만원 상당의 3인 입장권 이용",4,0,20,"더블에스컨설팅",1],
  ["블로그","숙박","수도권","방문형","가평 미엘키즈풀빌라에서 블로그 체험단을 모집합니다!","기준인원 3인 1박 숙박 제공",10,11,5,"한국펜션마케팅",0],
  ["블로그","맛집","수도권","방문형","(인천 강화도) 낙조를 눈앞에서 보는 노을맛집","금,토요일 제외한 1일 숙박권",11,6,3,"코리아트레블마케팅",0],
  ["블로그","맛집","서울","방문형","이층고깃집 수원영통점 블로그 체험단 모집","결제기준 4만원 상당의 식사권",4,4,4,"주식회사와글와글",0],
  ["블로그","놀이","수도권","방문형","인천 구월동 게임 파티룸 체험단 모집 합니다","파티룸 4시간 이용권 10대",13,0,10,"다모여",0],
  ["블로그","카페","서울","방문형","성수동 루프탑 카페 신메뉴 체험단","음료 2잔 + 디저트",6,9,6,"성수루프",0],
  ["블로그","뷰티","서울","방문형","강남 속눈썹 펌 시술 체험단","시술권 (5만원 상당)",9,15,5,"라엘뷰티",0],
  ["블로그","생활","배송형","배송형","저자극 세탁세제 2주 사용 체험단","제품 제공 (택배)",12,22,10,"클린홈",0],
  ["블로그","맛집","지방","방문형","부산 해운대 횟집 방문 체험단","2인 코스 식사권",7,13,4,"해운대바다",0],
  ["블로그","숙박","제주","방문형","제주 애월 오션뷰 독채 1박 체험단","1박 숙박권",3,40,2,"애월스테이",0],
  ["블로그","맛집","배송형","배송형","프리미엄 닭가슴살 5종 체험단","제품 제공 (택배)",15,31,20,"푸드랩",0],
];
// 광고주가 등록한 캠페인(시험용: 이 브라우저에만 저장됨)
let mine = [];
try { mine = JSON.parse(localStorage.getItem("woori.campaigns") || "[]"); } catch (e) {}
const daysLeft = d => Math.max(0, Math.ceil((new Date(d + "T23:59:59") - Date.now()) / 864e5));
const registered = mine.map(m => ({...m, days: daysLeft(m.deadline), isNew: Date.now() - m.created < 3 * 864e5}));
const campaigns = [...registered, ...base.map(([type,cat,region,mode,title,reward,days,applied,slots,biz,isNew],i) =>
  ({id:i+1,type,cat,region,mode,title,reward,days,applied,slots,biz,isNew}))];

const params = new URLSearchParams(location.search);
const type = TITLES[params.get("type")] ? params.get("type") : "블로그";
const state = {region:"전체", q:"", shown:10};
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

document.getElementById("page-title").textContent = TITLES[type];
document.getElementById("guide-title").textContent = type + " 체험단";
if (type === "구매평") document.getElementById("point-note").innerHTML = "<br>구매평 체험단은 <b>포인트가 지급되지 않습니다.</b>";
document.title = TITLES[type] + " - 우리들 체험단";

function render() {
  const list = campaigns.filter(c => c.type === type &&
    (state.region === "전체" || (state.region === "배송형" ? c.mode === "배송형" : c.region === state.region)) &&
    (!state.q || (c.title + c.biz).includes(state.q)));

  document.getElementById("empty").hidden = list.length > 0;
  document.getElementById("more").parentElement.hidden = list.length <= state.shown;
  document.getElementById("cards").innerHTML = list.slice(0, state.shown).map(c => `
    <li class="cc">
      <a href="#">
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
chips.onclick = e => { const r = e.target.dataset.r; if (!r) return; state.region = r; state.shown = 10; drawChips(); render(); };
document.getElementById("search-form").onsubmit = e => { e.preventDefault(); state.q = document.getElementById("q").value.trim(); state.shown = 10; render(); };
document.getElementById("more").onclick = () => { state.shown += 10; render(); };
drawChips(); render();
