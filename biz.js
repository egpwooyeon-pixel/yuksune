// 광고주 인증: 사업자등록번호 + 대표자 이름만 받고 바로 승인 (사업자등록증 제출·검토 없음). 처리는 DB 함수 submit_business (033 SQL).
// 번호는 자릿수와 검증 숫자만 확인해요. 국세청에서 실제 등록 여부를 확인하지는 않아요.
const $ = id => document.getElementById(id);
let me = null;

// 사업자등록번호 형식 확인 (10자리 + 검증 숫자). DB 함수와 같은 규칙
function validBizNo(v) {
  const d = String(v || "").replace(/\D/g, ""); if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let s = 0; for (let i = 0; i < 9; i++) s += +d[i] * w[i]; s += Math.floor(+d[8] * 5 / 10);
  return (10 - (s % 10)) % 10 === +d[9];
}
const fmtNo = d => /^\d{10}$/.test(d || "") ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : "";
const maskNo = d => /^\d{10}$/.test(d || "") ? `${d.slice(0, 3)}-${d.slice(3, 5)}-*****` : "";
const ERR = {
  bad_biz_no: "사업자등록번호를 확인해 주세요. (10자리, 예: 000-00-00000)",
  bad_ceo: "대표자 이름을 확인해 주세요. (한글·영문 2~20자)",
  rejected: "운영자가 인증을 제한한 계정이에요. 운영자에게 문의해 주세요.",
  login_required: "로그인이 필요해요.",
};

async function load() {
  let { data, error } = await sb.from("profiles").select("business_status,business_note,business_no").eq("id", me.id).maybeSingle();
  if (error) ({ data } = await sb.from("profiles").select("business_status,business_note").eq("id", me.id).maybeSingle());   // 033 SQL 이 아직 없어도 상태는 보이게
  if (!data) { $("b-msg").hidden = false; $("b-msg").textContent = "정보를 불러오지 못했어요."; return; }
  return data;
}
function show(p) {
  const st = p.business_status || "none", box = $("b-state"), form = $("b-form");
  $("biz").hidden = false;
  const note = p.business_note ? `<p class="biz-note">사유: ${esc(p.business_note)}</p>` : "";
  const map = {
    none: ['<span class="tag mid">미인증</span>', "아직 광고주 인증을 하지 않았어요. 아래에 사업자등록번호와 대표자 이름을 입력하면 바로 인증돼요."],
    pending: ['<span class="tag mid">확인 중</span>', "이전에 제출한 서류를 운영자가 확인하는 중이에요. 기다리지 않고 아래에 사업자등록번호와 대표자 이름을 입력하면 바로 인증돼요."],
    approved: ['<span class="tag ok">인증 완료</span>', `광고주로 인증되었어요${p.business_no ? ` (사업자등록번호 ${maskNo(p.business_no)})` : ""}. 이제 체험단을 등록할 수 있어요. <br><a class="btn-primary biz-go" href="register.html">체험단 등록하러 가기 →</a>`],
    rejected: ['<span class="tag bad">제한됨</span>', "운영자가 인증을 제한한 계정이에요. 사유를 확인하고 운영자에게 문의해 주세요."],
  }[st] || ["", ""];
  box.innerHTML = `<div class="biz-head">${map[0]}</div><p>${map[1]}</p>${st === "rejected" || st === "pending" ? note : ""}`;
  form.hidden = !(st === "none" || st === "pending");
}
$("b-form").onsubmit = async e => {
  e.preventDefault();
  const err = $("b-err"), btn = $("b-btn"), no = $("b-no").value, ceo = $("b-ceo").value.trim(); err.textContent = "";
  if (!validBizNo(no)) return err.textContent = ERR.bad_biz_no;
  if (ceo.length < 2 || ceo.length > 20 || !/^[가-힣a-zA-Z][가-힣a-zA-Z ·.]*$/.test(ceo)) return err.textContent = ERR.bad_ceo;
  if (!$("b-consent").checked) return err.textContent = "개인정보 수집·이용에 동의해 주세요.";
  btn.disabled = true;
  const { data, error } = await sb.rpc("submit_business", { p_no: no, p_ceo: ceo });
  btn.disabled = false;
  if (error || !data) { err.textContent = /function|schema cache/i.test(error && error.message || "") ? "인증 기능이 아직 준비되지 않았어요. 운영자에게 알려 주세요. (033 SQL)" : "처리하지 못했어요. 잠시 후 다시 시도해 주세요."; return; }
  if (data.error) { err.textContent = ERR[data.error] || "처리하지 못했어요."; return; }
  const p = await load(); if (p) show(p); $("b-form").reset();
};

(async () => {
  if (!sbReady) { $("b-msg").hidden = false; $("b-msg").textContent = "서버 연결 키가 설정되지 않았습니다."; return; }
  const { data } = await sb.auth.getSession();
  me = data.session && data.session.user;
  if (!me) return location.replace("login.html?next=biz.html");
  const p = await load(); if (p) show(p);
})();
