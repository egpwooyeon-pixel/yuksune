// 오른쪽 사이드바 (여러 페이지 공통): 로그인 박스, 포인트 리워드, 키워드 조회, 실시간 게시글, 핫딜
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

(function () {
  const slot = document.getElementById("sidebar-slot");
  if (!slot) return;
  slot.innerHTML = `
    <div class="card login">
      <p class="muted">우리들 체험단에 로그인하고<br>더 많은 혜택을 받아보세요.</p>
      <a class="btn-primary" href="#">우리들 계정으로 로그인</a>
      <p class="sub"><a href="#">아이디·비밀번호 찾기</a> | <a href="#">회원가입</a></p>
    </div>

    <div class="card">
      <h3>포인트 리워드</h3>
      <ul class="reward">
        <li><span class="ico">📦</span><span>구독한 체험하기<small>상품 구경하러 가기</small></span><em>76%</em></li>
        <li><span class="ico">💬</span><span>댓글 쓰기<small>0개 / 최대 5개</small></span><em>20</em></li>
        <li><span class="ico">🎁</span><span>포인트몰 쇼핑<small>쿠폰으로 교환</small></span><em>3%</em></li>
      </ul>
    </div>

    <h3 class="out">키워드 조회</h3>
    <form class="kw"><input placeholder="키워드를 입력하세요" aria-label="키워드"><button type="submit">검색</button></form>

    <div class="card">
      <h3>실시간 게시물</h3>
      <ul class="feed" id="live-feed"></ul>
    </div>

    <div class="card">
      <h3>핫딜</h3>
      <ul class="feed" id="hot-feed"></ul>
    </div>
  `;
  const feed = (id, items) => document.getElementById(id).innerHTML =
    items.map(([c, t]) => `<li><span class="cat">${c}</span><a href="#">${t.replace(/[&<>"]/g, x => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]))}</a></li>`).join("");
  feed("live-feed", live); feed("hot-feed", hot);

  // 로그인 상태면 로그인 박스를 환영 문구로 교체
  if (window.sbReady) sb.auth.getSession().then(({ data }) => {
    const u = data.session && data.session.user; if (!u) return;
    const nick = (u.user_metadata && u.user_metadata.nickname) || u.email.split("@")[0];
    const box = slot.querySelector(".login"); if (!box) return;
    const esc = x => String(x).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
    box.innerHTML = `<p class="muted"><b>${esc(nick)}</b>님, 환영합니다!</p><a class="btn-primary" href="register.html">체험단 등록하기</a><p class="sub"><a href="campaigns.html">체험단 둘러보기</a></p>`;
  });
})();
