let mode = new URLSearchParams(location.search).get("mode") === "signup" ? "signup" : "login";
const $ = id => document.getElementById(id), form = $("form"), msg = $("msg");

function setMode(m) {
  mode = m;
  $("tab-login").classList.toggle("on", m === "login");
  $("tab-signup").classList.toggle("on", m === "signup");
  $("nick-row").hidden = m !== "signup"; $("kind-row").hidden = m !== "signup";
  $("agree-row").hidden = m !== "signup"; form.agree.required = m === "signup";
  form.nickname.required = m === "signup";
  form.password.autocomplete = m === "signup" ? "new-password" : "current-password";
  $("pw2-row").hidden = m !== "signup"; form.password2.required = m === "signup"; form.password2.value = ""; $("pw-hint").textContent = "";
  $("submit").textContent = m === "signup" ? "가입하기" : "로그인";
  msg.textContent = "";
}
const KIND_HINT = {
  business: "가입 후 사업자등록번호와 대표자 이름만 입력하면 바로 광고주로 체험단을 등록할 수 있어요.",
  influencer: "가입 후 인플루언서 커뮤니티 가입을 신청하면 운영자가 확인해 열어 드려요.",
  agency: "가입 후 사업자등록증을 제출하면 운영자가 확인해 24시간 이내에 승인해 드려요.",
};
document.querySelectorAll('input[name="kind"]').forEach(r => r.onchange = () => { $("kind-hint").textContent = KIND_HINT[r.value]; });
// 가입 유형에 맞는 다음 단계 안내 (이미 마친 단계는 건너뜀). 가입 유형은 화면 안내용이고, 실제 권한은 운영자 승인이 정해요.
async function kindTarget() {
  const { data } = await sb.auth.getSession(); const u = data.session && data.session.user, kind = u && u.user_metadata && u.user_metadata.kind;
  if (!kind) return null;
  let { data: p, error } = await sb.from("profiles").select("role,business_status,community,community_req").eq("id", u.id).maybeSingle();
  if (error) ({ data: p } = await sb.from("profiles").select("role,business_status").eq("id", u.id).maybeSingle());
  if (!p || p.role === "admin") return null;
  if (kind === "business" && p.business_status === "none") return "biz.html";
  if (kind === "influencer" && !p.community && p.community_req !== "influencer") return "board.html?b=influencer";
  if (kind === "agency" && !p.community && p.community_req !== "agency") return "board.html?b=agency";
  return null;
}
// 비밀번호 확인: 입력하는 동안 같은지 바로 알려 줌
const checkPw = () => { const h = $("pw-hint"), a = form.password.value, b = form.password2.value; if (!b) { h.textContent = ""; return; } const ok = a === b; h.textContent = ok ? "✓ 비밀번호가 같아요." : "비밀번호가 서로 달라요."; h.style.color = ok ? "#0c8f66" : "#d63a3a"; };
form.password.addEventListener("input", checkPw); form.password2.addEventListener("input", checkPw);
document.querySelectorAll(".sns-btn").forEach(b => b.onclick = () => {      // SNS 연동 전: 안내만 (가입·로그인은 하지 않음)
  const m = $("sns-msg"); m.hidden = false; m.textContent = `${b.dataset.sns} 간편 가입은 준비 중이에요. 아래에서 이메일로 가입하거나 로그인해 주세요.`;
});
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
      if (form.password2.value !== password) throw new Error("비밀번호가 서로 달라요. 다시 확인해 주세요.");
      const nickname = form.nickname.value.trim();
      if (nickname.length < 2) throw new Error("닉네임은 2자 이상 입력해 주세요.");
      const kind = form.kind.value;
      if (!["business", "influencer", "agency"].includes(kind)) throw new Error("가입 유형(개인사업자·인플루언서·대행사)을 선택해 주세요.");
      const options = { data: { nickname, kind } };
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
    location.href = /^[a-z]+\.html(\?[\w=&%.-]*)?$/.test(next) ? next : ((await kindTarget()) || "index.html");
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
