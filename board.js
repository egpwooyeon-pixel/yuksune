// 커뮤니티 게시판 (자유게시판 / 꿀팁·교류 / 수익 인증·체험후기) — 지금은 샘플 글. 글쓰기·저장은 다음 단계에서 서버(DB)와 연결.
const BOARDS = {
  free:   { title: "자유게시판", cat: "자유게시판", titles: [
    "출석체크 적립포인트는 최대 50포인트까지", "날이 흐리네요", "네이버 리뷰 작성 알바", "어우 날씨 무슨일", "10월 마지막",
    "곧 11월이네요", "애기 데리고", "구매평 입금..", "앱 바뀌었네요~", "오늘부터 다시 금주", "리트 때문에 난리네요", "방어 먹었네요", "영하권이네요", "과일모찌 사먹으러 갈까봐요" ] },
  tips:   { title: "꿀팁·교류", cat: "꿀팁·교류", titles: [
    "블로그 체험단 선정률 올리는 프로필 작성법", "사진 촬영 꿀팁 — 음식 편", "체험단 후기 글 구조 템플릿 공유", "키워드 잡는 법 정리해봤어요",
    "네이버 인플루언서 신청 후기", "클립 만들기 초보 가이드", "방문형 예약 시 매너 체크리스트", "광고 표기 문구 어떻게 쓰세요?", "후기 작성 시간 줄이는 방법", "체험단 일정 관리 엑셀 공유", "인스타 릴스 편집 앱 추천", "노쇼 안 하는 법", "선정 문자 못 받았을 때", "블로그 지수 관리 팁" ] },
  profit: { title: "수익 인증·체험후기", cat: "수익인증", titles: [
    "블로그 체험단 8월 수익 인증합니다", "하루 30분만 투자해서 월 80만원 번 후기", "밀키트 체험단 후기 (사진 많음)", "인스타 릴스로 체험단 선정되는 방법",
    "뷰티 제품 2주 사용 후기 — 솔직 평가", "체험단 3개월차 수익 정리표 공유해요", "카페 방문형 체험단 다녀왔어요", "기자단 활동으로 부수입 만든 이야기", "가전제품 체험단 장단점 후기", "초보 블로거 첫 달 수익 인증", "펫용품 체험단 솔직 후기", "숙박 체험단 1박 후기", "구매평 체험단 한 달 정산", "이번 달 체험 후기 모음" ] },
};
const AUTHORS = ["유미킴", "조빠", "yeeeeee", "미파", "킴작", "오후다", "체험러", "hayjin", "릴스왕", "뷰티덕", "꾸준히", "커피러", "리뷰어", "새내기"];
const TIMES = ["6시간 전", "6시간 전", "7시간 전", "1일 전", "1일 전", "1일 전", "2일 전", "2일 전", "3일 전", "2026.11.15", "2026.11.12", "2026.11.09", "2026.11.05", "2026.10.31"];
const NOTICES = ["포인트 적립을 위한 의미 없는 댓글 작성", "다른 사람들에게 피해되는 도배 글 금지합니다", "커뮤니티 게시판과 거리가 먼 불법 및 비방글 등 제재조치"];

const key = BOARDS[new URLSearchParams(location.search).get("b")] ? new URLSearchParams(location.search).get("b") : "free";
const B = BOARDS[key];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const $ = id => document.getElementById(id);

$("b-title").textContent = B.title;
document.title = B.title + " - 우리들 체험단";

// 샘플 글 생성 (번호는 위에서부터 내려감)
const posts = B.titles.map((t, i) => ({
  no: 15603 - i, title: t, c: (i * 7 + 3) % 30, author: AUTHORS[i % AUTHORS.length],
  time: TIMES[i], views: 25 + ((i * 37) % 90) + (i > 8 ? 900 : 0), isNew: i < 9,
}));

// 인기글
const popData = { m: [...posts].sort((a, b) => b.c - a.c).slice(0, 10), w: [...posts].sort((a, b) => b.views - a.views).slice(0, 10) };
function drawPop(t) {
  $("pop").innerHTML = popData[t].map(p => `<li><span class="pc">${esc(B.cat)}</span><a href="#">${esc(p.title)}</a><i>(${p.c})</i></li>`).join("");
}
document.querySelector(".pop-tabs").onclick = e => {
  const t = e.target.dataset.t; if (!t) return;
  document.querySelectorAll(".pop-tabs button").forEach(b => b.classList.toggle("on", b === e.target)); drawPop(t);
};
drawPop("m");

// 글 목록
function drawList(q = "", field = "title") {
  const list = posts.filter(p => !q || String(p[field]).includes(q));
  $("b-empty").hidden = list.length > 0;
  const notices = q ? "" : NOTICES.map((t, i) => `<tr class="notice"><td class="num"><span class="badge notice">공지</span></td>
    <td class="title"><a href="#"><b>${esc(t)}</b></a> <span class="cmt">${[73, 87, 42][i]}</span></td><td>우리들 체험단</td><td class="date">${["2026.05.13", "2026.04.01", "2026.01.23"][i]}</td><td class="views">${[3505, 12877, 8924][i]}</td></tr>`).join("");
  $("post-list").innerHTML = notices + list.map(p => `<tr><td class="num">${p.no}</td>
    <td class="title">${p.isNew ? '<span class="newic">N</span>' : ""}<a href="#">${esc(p.title)}</a>${p.c ? ` <span class="cmt">${p.c}</span>` : ""}</td>
    <td>${esc(p.author)}</td><td class="date ${/시간/.test(p.time) ? "hot" : ""}">${p.time}</td><td class="views">${p.views}</td></tr>`).join("");
}
drawList();
$("b-search").onsubmit = e => { e.preventDefault(); drawList($("b-q").value.trim(), $("b-field").value); };

$("pager").innerHTML = Array.from({ length: 10 }, (_, i) => `<button class="${i === 0 ? "on" : ""}">${i + 1}</button>`).join("");
$("write").onclick = () => alert("글쓰기는 곧 열릴 예정이에요. (게시판 저장 기능을 연결하는 중입니다)");
