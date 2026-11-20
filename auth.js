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
    if (!user || !util) return;
    const nick = (user.user_metadata && user.user_metadata.nickname) || user.email.split("@")[0];
    util.innerHTML = `<span><b>${esc(nick)}</b>님</span><i></i><a href="my.html">내 체험단</a><i></i><a href="#" id="logout">로그아웃</a>`;
    document.getElementById("logout").onclick = async e => { e.preventDefault(); await sb.auth.signOut(); location.reload(); };
  });
})();
