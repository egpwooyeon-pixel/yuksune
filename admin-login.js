// 관리자 로그인: 일반 로그인과 같은 계정 시스템을 쓰되, 관리자(role = admin)가 아니면 바로 로그아웃시킵니다.
// (실제 권한은 화면이 아니라 DB가 막습니다: 008 SQL의 운영자 전용 함수/정책)
const $ = id => document.getElementById(id);
const cfg = window.WOORI || {};
const sbReady = !!(cfg.SUPABASE_ANON_KEY && window.supabase);
const sb = sbReady ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
const msg = t => { $("al-msg").textContent = t || ""; };

async function isAdmin(userId) {
  const { data } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  return !!data && data.role === "admin";
}
(async () => {
  if (!sbReady) return msg("서버 연결 키가 설정되지 않았습니다.");
  const { data } = await sb.auth.getSession();       // 이미 관리자로 로그인되어 있으면 바로 이동
  if (data.session && await isAdmin(data.session.user.id)) location.replace("admin.html");
})();

$("al-form").onsubmit = async e => {
  e.preventDefault(); msg("");
  if (!sbReady) return msg("서버 연결 키가 설정되지 않았습니다.");
  const btn = $("al-btn"); btn.disabled = true;
  const f = e.target;
  const { data, error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
  if (error) {
    msg(/Invalid login/i.test(error.message) ? "이메일 또는 비밀번호가 맞지 않습니다." : /rate limit|security purposes/i.test(error.message) ? "잠시 후 다시 시도해 주세요." : /not confirmed/i.test(error.message) ? "이메일 인증이 필요한 계정이에요." : "로그인하지 못했어요.");
    btn.disabled = false; return;
  }
  if (!(await isAdmin(data.user.id))) {
    await sb.auth.signOut();
    msg("관리자 권한이 없는 계정이에요.");
    btn.disabled = false; return;
  }
  location.href = "admin.html";
};
