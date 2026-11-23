let mode = new URLSearchParams(location.search).get("mode") === "signup" ? "signup" : "login";
const $ = id => document.getElementById(id), form = $("form"), msg = $("msg");

function setMode(m) {
  mode = m;
  $("tab-login").classList.toggle("on", m === "login");
  $("tab-signup").classList.toggle("on", m === "signup");
  $("nick-row").hidden = m !== "signup";
  $("agree-row").hidden = m !== "signup"; form.agree.required = m === "signup";
  form.nickname.required = m === "signup";
  form.password.autocomplete = m === "signup" ? "new-password" : "current-password";
  $("submit").textContent = m === "signup" ? "가입하기" : "로그인";
  msg.textContent = "";
}
$("tab-login").onclick = () => setMode("login");
$("tab-signup").onclick = () => setMode("signup");
setMode(mode);
if (!window.sbReady) $("no-key").hidden = false;

// Supabase 영문 오류 → 한글
const KO = [
  ["Invalid login credentials", "이메일 또는 비밀번호가 맞지 않습니다."],
  ["User already registered", "이미 가입된 이메일입니다."],
  ["Password should be at least", "비밀번호는 8자 이상이어야 합니다."],
  ["Email not confirmed", "이메일 인증이 필요합니다. 메일함을 확인해 주세요."],
  ["For security purposes", "보안을 위해 1분 뒤에 다시 시도해 주세요. 이미 가입 요청을 보냈다면 '로그인' 탭에서 로그인해 보세요."],
  ["rate limit", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."],
];
const ko = e => (KO.find(([k]) => (e.message || "").includes(k)) || [0, e.message])[1];

form.onsubmit = async e => {
  e.preventDefault();
  if (!window.sbReady) { msg.textContent = "서버 연결 키가 설정되지 않았습니다."; return; }
  const btn = $("submit"); btn.disabled = true; msg.textContent = "";
  const email = form.email.value.trim(), password = form.password.value;
  try {
    if (mode === "signup") {
      const nickname = form.nickname.value.trim();
      if (nickname.length < 2) throw new Error("닉네임은 2자 이상 입력해 주세요.");
      const options = { data: { nickname } };
      // 인증 후 돌아올 주소 (인터넷 주소로 접속 중일 때만. Supabase 'Redirect URLs'에 등록된 주소여야 적용됨)
      if (location.protocol.startsWith("http")) options.emailRedirectTo = location.origin + location.pathname;
      const { data, error } = await sb.auth.signUp({ email, password, options });
      if (error) throw error;
      if (!data.session) { showSent(email); return; }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    const next = new URLSearchParams(location.search).get("next") || "";
    location.href = /^[a-z]+\.html(\?[\w=&%.-]*)?$/.test(next) ? next : "index.html";
  } catch (err) {
    msg.style.color = ""; msg.textContent = ko(err); btn.disabled = false;
  }
};

// 인증 메일 안내 화면
function showSent(email) {
  form.hidden = true; $("foot-note").hidden = true; document.querySelector(".tabs").hidden = true;
  $("sent-email").textContent = email; $("sent").hidden = false;
  $("goto-login").onclick = () => { location.href = "login.html"; };
  $("resend").onclick = async () => {
    const out = $("resend-msg"), b = $("resend"); b.disabled = true; out.style.color = ""; out.textContent = "";
    const { error } = await sb.auth.resend({ type: "signup", email });
    if (error) { out.textContent = ko(error); b.disabled = false; return; }
    out.style.color = "#2db27a"; out.textContent = "인증 메일을 다시 보냈어요.";
    setTimeout(() => { b.disabled = false; }, 60000);  // 서버 제한(약 1분)에 맞춤
  };
}
