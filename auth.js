// 로그인 상태 관리 + 헤더 표시 (모든 페이지 공통)
(function () {
  const cfg = window.WOORI || {};
  window.sbReady = !!(cfg.SUPABASE_ANON_KEY && window.supabase);
  window.sb = window.sbReady ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  if (!window.sb) return;

  const util = document.getElementById("util");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  sb.auth.getSession().then(async ({ data }) => {
    const user = data.session && data.session.user;
    window.currentUser = user || null;
    if (user) {   // 'AI 리뷰 원고' 메뉴는 승인된 인플루언서(와 운영자)에게만 보임. 실제 접근 제한은 서버가 따로 확인함
      const rd = document.getElementById("gnb-rd");
      if (rd) { const { data: p } = await sb.from("profiles").select("role,community").eq("id", user.id).maybeSingle(); if (p && (p.role === "admin" || p.community === "influencer")) { rd.hidden = false; document.querySelectorAll(".rd-link").forEach(x => { x.hidden = false; }); } }
    }
    if (!user || !util) return;
    const nick = (user.user_metadata && user.user_metadata.nickname) || user.email.split("@")[0];
    util.innerHTML = `<span><b>${esc(nick)}</b>님</span><i></i><a href="mypage.html">마이페이지</a><i></i><a href="my.html">내 체험단</a><i></i><a href="#" id="logout">로그아웃</a>`;
    document.getElementById("logout").onclick = async e => { e.preventDefault(); await sb.auth.signOut(); location.reload(); };
  });
})();
