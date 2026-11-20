// 모든 페이지 공통: 헤더/푸터 + 전체메뉴 동작
const PAGE = document.body.dataset.page || "";  // 현재 메뉴 강조용
document.getElementById("header-slot").outerHTML = `<!-- 1. 헤더 -->
<header class="site-header" id="site-header">
  <div class="wrap header-top">
    <a class="logo" href="index.html">우리들<b>체험단</b></a>
    <form class="search" role="search">
      <input type="search" placeholder="원하시는 캠페인을 검색해주세요!" aria-label="검색">
      <button type="submit" aria-label="검색"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="9" r="6.5"/><path d="M14 14l4 4"/></svg></button>
    </form>
    <nav class="util" id="util"><a href="login.html">로그인</a><i></i><a href="login.html?mode=signup">회원가입</a><i></i><a href="#">고객센터</a></nav>
  </div>
  <div class="gnb-area">
    <nav class="gnb wrap" aria-label="주요 메뉴">
      <button class="burger" id="burger" aria-label="전체 메뉴" aria-expanded="false"><svg width="14" height="12" viewBox="0 0 14 12" stroke="currentColor" stroke-width="1.3"><path d="M0 1h14M0 6h9M0 11h14"/></svg></button>
      <a href="#">이용안내</a>
      <a href="#">기자단모집</a>
      <a href="campaigns.html" data-key="campaigns">체험단모집</a>
      <a href="#">작업모집&amp;의뢰</a>
      <a href="index.html" class="sep" data-key="community">커뮤니티</a>
      <a href="#" class="tag hot">핫딜</a>
      <a href="#" class="tag blog">우리들블로그</a>
    </nav>
    <div class="mega wrap" id="mega"><div class="mega-in">
      <div class="mgrid"><div class="mcol on"><a class="mh" href="#">이용안내</a><ul><li><a href="#">공지사항</a></li><li><a href="#">이용가이드</a></li><li><a href="#">이벤트</a></li><li><a href="#">1:1 문의</a></li><li><a href="#">페널티조회</a></li><li><a href="#">포인트출금</a></li></ul></div><div class="mcol"><a class="mh" href="#">기자단모집</a><ul><li><a href="#">블로그기자단</a></li><li><a href="#">카페기자단</a></li><li><a href="#">인스타기자단</a></li></ul></div><div class="mcol"><a class="mh" href="campaigns.html">체험단모집</a><ul><li><a href="campaigns.html?type=구매평">구매평체험단</a></li><li><a href="campaigns.html?type=블로그">블로그체험단</a></li><li><a href="campaigns.html?type=인스타">인스타체험단</a></li></ul></div><div class="mcol"><a class="mh" href="#">작업모집&amp;의뢰</a><ul><li><a href="#">원고작성</a></li><li><a href="#">평점리뷰</a></li><li><a href="#">사진촬영</a></li><li><a href="#">디자인</a></li><li><a href="#">마케팅</a></li></ul></div><div class="mcol"><a class="mh" href="index.html">커뮤니티</a><ul><li><a href="#">자유게시판</a></li><li><a href="#">꿀팁·교류</a></li><li><a href="index.html" class="cur">수익 인증·체험후기</a></li></ul></div><div class="mcol"><a class="mh" href="#">핫딜</a><ul></ul></div><div class="mcol"><a class="mh" href="#">우리들블로그</a><ul></ul></div></div>
      <button class="mclose" id="mclose" aria-label="메뉴 닫기"><svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 7l5-5 5 5"/></svg></button>
    </div></div>
  </div>
</header>`;
document.getElementById("footer-slot").outerHTML = `<footer class="site-footer">
  <div class="wrap">
    <p><b>우리들 체험단</b> · 체험단과 광고주를 잇는 마케팅 커뮤니티</p>
    <p class="muted">© 2026 우리들 체험단. All rights reserved.</p>
  </div>
</footer>`;

// 현재 페이지 메뉴 강조
document.querySelectorAll(".gnb>a").forEach(a => a.classList.toggle("on", a.dataset.key === PAGE));

const area = document.querySelector(".gnb-area"), burger = document.getElementById("burger");
let pinned = false;
const setOpen = v => { area.classList.toggle("open", v); burger.setAttribute("aria-expanded", v); };
burger.addEventListener("click", () => { pinned = !pinned; setOpen(pinned); });
document.getElementById("mclose").addEventListener("click", () => { pinned = false; setOpen(false); });
area.addEventListener("mouseenter", () => setOpen(true));
area.addEventListener("mouseleave", () => { if (!pinned) setOpen(false); });
document.querySelectorAll(".mcol").forEach(c => c.addEventListener("mouseenter", () => {
  document.querySelectorAll(".mcol").forEach(x => x.classList.remove("on")); c.classList.add("on");
}));
