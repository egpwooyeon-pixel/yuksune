// 광고주 인증: 사업자등록증을 비공개 저장소에 올리고 '승인 대기'로 바꿉니다. 승인/반려는 관리자 화면에서.
const $ = id => document.getElementById(id);
let me = null;
const MAX = 5 * 1024 * 1024, TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

async function load() {
  const { data, error } = await sb.from("profiles").select("business_status,business_note").eq("id", me.id).maybeSingle();
  if (error || !data) { $("b-msg").hidden = false; $("b-msg").textContent = "정보를 불러오지 못했어요."; return; }
  return data;
}
function show(p) {
  const st = p.business_status || "none", box = $("b-state"), form = $("b-form");
  $("biz").hidden = false;
  const note = p.business_note ? `<p class="biz-note">반려 사유: ${esc(p.business_note)}</p>` : "";
  const map = {
    none: ['<span class="tag mid">미신청</span>', "아직 광고주 인증을 신청하지 않았어요. 아래에서 사업자등록증을 제출해 주세요."],
    pending: ['<span class="tag mid">승인 대기</span>', "서류를 제출했어요. 운영자가 확인하는 중이에요. 승인되면 체험단을 등록할 수 있어요."],
    approved: ['<span class="tag ok">승인 완료</span>', "광고주로 승인되었어요. 이제 체험단을 등록할 수 있어요. <br><a class=\"btn-primary biz-go\" href=\"register.html\">체험단 등록하기</a>"],
    rejected: ['<span class="tag bad">반려</span>', "서류가 승인되지 않았어요. 사유를 확인하고 다시 제출해 주세요."],
  }[st] || ["", ""];
  box.innerHTML = `<div class="biz-head">${map[0]}</div><p>${map[1]}</p>${st === "rejected" ? note : ""}`;
  form.hidden = !(st === "none" || st === "rejected");
}

$("b-form").onsubmit = async e => {
  e.preventDefault();
  const err = $("b-err"), btn = $("b-btn"), f = $("b-file").files[0]; err.textContent = "";
  if (!f) return err.textContent = "파일을 선택해 주세요.";
  if (!TYPES[f.type]) return err.textContent = "JPG, PNG, PDF 파일만 올릴 수 있어요.";
  if (f.size > MAX) return err.textContent = "파일이 너무 커요. 5MB 이하로 올려 주세요.";
  btn.disabled = true;
  const path = `${me.id}/${Date.now()}.${TYPES[f.type]}`;
  const up = await sb.storage.from("business-docs").upload(path, f, { contentType: f.type });
  if (up.error) { err.textContent = "파일을 올리지 못했어요. 잠시 후 다시 시도해 주세요."; btn.disabled = false; return; }
  await sb.from("profiles").update({ business_doc_path: path, business_status: "pending" }).eq("id", me.id);
  const p = await load();                       // 실제로 '승인 대기'가 됐는지 다시 확인 (DB 규칙이 막으면 그대로임)
  if (!p || p.business_status !== "pending") { err.textContent = "제출을 완료하지 못했어요. 잠시 후 다시 시도해 주세요."; btn.disabled = false; return; }
  show(p); btn.disabled = false; $("b-form").reset();
};

(async () => {
  if (!sbReady) { $("b-msg").hidden = false; $("b-msg").textContent = "서버 연결 키가 설정되지 않았습니다."; return; }
  const { data } = await sb.auth.getSession();
  me = data.session && data.session.user;
  if (!me) return location.replace("login.html?next=biz.html");
  const p = await load(); if (p) show(p);
})();
