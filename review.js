// 후기 링크 제출: 로그인 없이, 신청할 때 쓴 이름·연락처로 본인 확인 (DB 함수 submit_review / review_status_of, 032 SQL)
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ERR = {
  not_found: "신청 정보와 맞지 않아요. 이름·연락처가 신청할 때와 같은지, 선정된 체험단인지 확인해 주세요.",
  too_many: "확인에 여러 번 실패해서 잠시 막혔어요. 1시간 뒤에 다시 시도해 주세요.",
  bad_url: "후기 글 주소를 확인해 주세요. (예: blog.naver.com/내아이디/123456789)",
  deadline_passed: "후기 작성 마감일이 지나서 제출할 수 없어요. 광고주에게 문의해 주세요.",
  already_confirmed: "광고주가 이미 확인 완료한 후기라 바꿀 수 없어요.",
};
const ST = { submitted: ["제출됨 · 광고주 확인 대기", "mid"], confirmed: ["확인 완료", "ok"], revision: ["수정 요청", "bad"] };
let busy = false;
const say = (t, ok) => { const m = $("rv-msg"); m.textContent = t || ""; m.style.color = ok ? "#0c8f66" : ""; };

function showState(r) {
  const box = $("rv-state"); box.hidden = false;
  if (!r.submitted) { box.innerHTML = `<b>아직 제출한 후기가 없어요.</b><p class="muted small">선정이 확인됐어요. 위에 후기 글 주소를 입력해 제출해 주세요.${r.deadline ? ` (마감 ${esc(r.deadline)})` : ""}</p>`; return; }
  const [t, k] = ST[r.status] || ST.submitted;
  const link = /^https?:\/\//.test(r.url || "") ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a>` : esc(r.url);
  box.innerHTML = `<b>내 제출 내용</b> <span class="tag ${k}">${t}</span><p class="small">${link}</p>${r.status === "revision" ? `<p class="rv-note"><b>광고주 수정 요청:</b> ${esc(r.note || "")}</p><p class="muted small">고친 뒤 위에서 다시 제출해 주세요.${r.closed ? " (마감일이 지나 다시 제출할 수 없어요)" : ""}</p>` : ""}${r.status === "confirmed" ? '<p class="muted small">광고주가 확인했어요. 참여해 주셔서 고마워요!</p>' : ""}${r.closed && r.status !== "revision" ? '<p class="muted small">후기 작성 마감일이 지나 더 이상 바꿀 수 없어요.</p>' : ""}${r.deadline && !r.closed && r.status !== "confirmed" ? `<p class="muted small">마감 ${esc(r.deadline)}까지 다시 제출할 수 있어요.</p>` : ""}`;
}
function args() {
  const camp = $("rv-camp").value, name = $("rv-name").value.trim(), phone = $("rv-phone").value.trim();
  if (!camp) { say("체험단을 선택해 주세요."); return null; }
  if (!name) { say("신청할 때 쓴 이름을 입력해 주세요."); return null; }
  if (phone.replace(/\D/g, "").length < 9) { say("신청할 때 쓴 연락처를 정확히 입력해 주세요. (예: 010-0000-0000)"); return null; }
  return { p_campaign: camp, p_contact: phone, p_name: name };
}
async function run(kind) {
  if (busy) return; say(""); const a = args(); if (!a) return;
  if (kind === "submit" && !$("rv-url").value.trim()) return say("후기 글 주소를 입력해 주세요.");
  if (!window.sbReady) return say("서버 연결 설정이 없어 제출할 수 없어요.");
  busy = true; $("rv-go").disabled = $("rv-check").disabled = true; say("확인하는 중이에요…");
  const { data, error } = kind === "submit" ? await sb.rpc("submit_review", { ...a, p_url: $("rv-url").value }) : await sb.rpc("review_status_of", a);
  busy = false; $("rv-go").disabled = $("rv-check").disabled = false;
  if (error || !data) return say(/function|schema cache/i.test(error && error.message || "") ? "후기 제출 기능이 아직 준비되지 않았어요. 관리자에게 알려 주세요. (032 SQL)" : "처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  if (data.error) { $("rv-state").hidden = true; return say(ERR[data.error] || "처리하지 못했어요."); }
  if (kind === "submit") {
    say(data.resubmitted ? "후기 주소를 다시 제출했어요. 광고주가 확인할 거예요." : "후기 주소를 제출했어요. 광고주가 확인할 거예요.", true);
    $("rv-url").value = data.url;
    const s = await sb.rpc("review_status_of", a); if (s.data && s.data.ok) showState(s.data);
  } else { say("선정 정보를 확인했어요.", true); showState(data); }
}
$("rv-form").onsubmit = e => { e.preventDefault(); run("submit"); };
$("rv-check").onclick = () => run("check");

(async () => {                                     // 체험단 목록: 최근 체험단 (주소에 ?c= 가 있으면 그 체험단 선택)
  if (!window.sbReady) return say("서버 연결 설정이 없어요.");
  const want = new URLSearchParams(location.search).get("c") || "";
  const { data } = await sb.from("campaigns").select("id,title,biz,review_deadline").order("created_at", { ascending: false }).limit(200);
  const sel = $("rv-camp");
  (data || []).forEach(c => { const o = document.createElement("option"); o.value = c.id; o.textContent = `${c.biz} · ${c.title}`; sel.append(o); });
  if (want && [...sel.options].some(o => o.value === want)) { sel.value = want; sel.disabled = false; }
})();
