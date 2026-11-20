// 1단계: 화면 뼈대 확인용 샘플 데이터 (나중에 DB/서버 데이터로 교체)
const posts = [
  {notice:true, title:"[공지] 수익인증 및 팁 공유 게시판입니다", author:"운영자", date:"2026.07.21", views:3281},
  {type:"profit", title:"블로그 체험단 8월 수익 인증합니다", c:3, author:"오후다", date:"2일 전", views:35},
  {type:"profit", title:"하루 30분만 투자해서 월 80만원 번 후기", c:12, author:"체험러", date:"2일 전", views:63},
  {type:"review", title:"밀키트 체험단 후기 (사진 많음)", c:2, author:"hayjin", date:"2일 전", views:43},
  {type:"profit", title:"인스타 릴스로 체험단 선정되는 방법", c:7, author:"릴스왕", date:"11:53", views:84},
  {type:"review", title:"뷰티 제품 2주 사용 후기 — 솔직 평가", c:5, author:"뷰티덕", date:"13:22", views:120},
  {type:"profit", title:"체험단 3개월차 수익 정리표 공유해요", c:9, author:"꾸준히", date:"2026.12.21", views:1200},
  {type:"review", title:"카페 방문형 체험단 다녀왔어요", c:0, author:"커피러", date:"2026.09.31", views:989},
  {type:"profit", title:"기자단 활동으로 부수입 만든 이야기", c:4, author:"기자단1호", date:"2026.09.07", views:777},
  {type:"review", title:"가전제품 체험단 장단점 후기", c:1, author:"리뷰어", date:"2026.09.13", views:1012},
  {type:"profit", title:"초보 블로거 첫 달 수익 인증", c:6, author:"새내기", date:"2026.09.12", views:2212},
  {type:"review", title:"펫용품 체험단 솔직 후기", c:2, author:"댕댕맘", date:"2026.09.09", views:1099},
];
const live = [
  ["맛집","서울 강남 신규 오픈 맛집 체험단 모집"],
  ["뷰티","립 틴트 신제품 체험단 10명"],
  ["여행","제주 숙소 1박 체험단 모집"],
  ["생활","주방용품 세트 후기단"],
  ["디지털","무선 이어폰 체험 리뷰어 모집"],
];
const hot = [
  ["핫딜","에어프라이어 40% 할인"],
  ["핫딜","프리미엄 닭가슴살 1kg 특가"],
  ["핫딜","유기농 샐러드 정기배송 쿠폰"],
  ["핫딜","무선 청소기 한정 수량 특가"],
];

const BADGE = {profit:["수익","profit"], review:["후기","review"]};
const tbody = document.getElementById("post-list");
const esc = s => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

let no = 190;
tbody.innerHTML = posts.map(p => {
  if (p.notice) return `<tr class="notice"><td class="num"><span class="badge notice">공지</span></td>
    <td class="title"><a href="#"><b>${esc(p.title)}</b></a></td><td>${p.author}</td><td class="date">${p.date}</td><td class="views">${p.views}</td></tr>`;
  const [label, cls] = BADGE[p.type];
  return `<tr><td class="num">${no--}</td>
    <td class="title"><span class="badge ${cls}">${label}</span><a href="#">${esc(p.title)}</a>${p.c ? `<span class="cmt">[${p.c}]</span>` : ""}</td>
    <td>${p.author}</td><td class="date">${p.date}</td><td class="views">${p.views}</td></tr>`;
}).join("");

const feed = (id, items) => document.getElementById(id).innerHTML =
  items.map(([c,t]) => `<li><span class="cat">${c}</span><a href="#">${esc(t)}</a></li>`).join("");
feed("live-feed", live);
feed("hot-feed", hot);

// 페이지 번호(표시만 — 실제 이동은 게시판 기능 단계에서)
document.getElementById("pager").innerHTML =
  Array.from({length:10},(_, i)=>`<button class="${i===0?"on":""}">${i+1}</button>`).join("");

// 탭 전환(전체/수익 인증/체험후기) 표시만
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("on"));
  t.classList.add("on");
}));

