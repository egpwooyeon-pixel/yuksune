// 오른쪽 사이드바 (여러 페이지 공통): 로그인 박스
(function () {
  const slot = document.getElementById("sidebar-slot");
  if (!slot) return;
  slot.innerHTML = `
    <div class="card login">
      <p class="muted">우리들 체험단에 로그인하고<br>더 많은 혜택을 받아보세요.</p>
      <a class="btn-primary" href="login.html">로그인</a>
      <p class="sub"><a href="login.html?mode=signup">회원가입</a></p>
    </div>`;

  // 로그인 상태면 로그인 박스를 환영 문구로 교체
  if (window.sbReady) sb.auth.getSession().then(({ data }) => {
    const u = data.session && data.session.user; if (!u) return;
    const nick = (u.user_metadata && u.user_metadata.nickname) || u.email.split("@")[0];
    const box = slot.querySelector(".login"); if (!box) return;
    const esc = x => String(x).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
    box.innerHTML = `<p class="muted"><b>${esc(nick)}</b>님, 환영합니다!</p><a class="btn-primary" href="register.html">체험단 등록하기</a><p class="sub"><a href="campaigns.html">체험단 둘러보기</a></p>`;
  });
})();
