// 왓섭 상담 신청: 상담 문의 표(inquiries, 021 SQL)에 '왓섭' 주제로 저장해요. 관리자 > 상담 문의에서 확인합니다.
const $ = id => document.getElementById(id);
const TOPIC = "왓섭 결제기반 AI 마케팅";
const share = !(window.WOORI && window.WOORI.WHATSSUB_SHARE === false);       // 제3자(왓섭) 제공 동의 문구 (config.js 에서 끌 수 있음)
if (!share) $("ws-share-row").hidden = true;

// "egp.kr" 처럼 https:// 없이 써도 https:// 를 붙여 줘요. (http/https 외의 방식은 거절)
function normWeb(v) {
  v = String(v || "").trim(); if (!v) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) return null;
  const u = /^https?:\/\//i.test(v) ? v : "https://" + v.replace(/^\/\//, "");
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) && /^[^.\s]+(\.[^.\s]+)+$/.test(x.hostname) ? x.href.replace(/\/$/, x.pathname === "/" && !x.search && !x.hash ? "" : "/") : null; } catch (_) { return null; }
}
let busy = false;
$("ws-form").onsubmit = async e => {
  e.preventDefault(); if (busy) return;
  const out = $("ws-msgbox"), v = id => $(id).value.trim(); out.style.color = ""; out.textContent = "";
  if ($("ws-form").website2.value) return;                                      // 자동 입력 방지(보이지 않는 칸)
  if (!v("ws-company")) return out.textContent = "업체명을 입력해 주세요.";
  if (!v("ws-name")) return out.textContent = "담당자 이름을 입력해 주세요.";
  if (v("ws-phone").replace(/\D/g, "").length < 9) return out.textContent = "연락처를 정확히 입력해 주세요. (예: 010-0000-0000)";
  const web = normWeb(v("ws-web")); if (web === null) return out.textContent = "홈페이지 주소를 확인해 주세요. (예: egp.kr)";
  if (!$("ws-agree1").checked) return out.textContent = "개인정보 수집·이용에 동의해 주세요.";
  if (share && !$("ws-agree2").checked) return out.textContent = "왓섭에 정보를 제공하는 것에 동의해 주세요.";
  if (!window.sbReady) return out.textContent = "서버 연결 설정이 없어 접수할 수 없습니다.";
  busy = true; $("ws-go").disabled = true; out.textContent = "접수 중입니다…";
  const { error } = await sb.from("inquiries").insert({
    company: v("ws-company"), name: v("ws-name"), phone: v("ws-phone"), topic: TOPIC, website: web || null,
    message: (v("ws-msg") + (share ? "\n\n[동의] 개인정보 수집·이용, 왓섭 제공" : "\n\n[동의] 개인정보 수집·이용")).trim(), agreed: true,
  });
  busy = false; $("ws-go").disabled = false;
  if (error) { out.textContent = /relation|schema cache|does not exist|column/i.test(error.message || "") ? "접수 저장소 설정이 끝나지 않았습니다. 관리자에게 알려 주세요." : "전송에 실패했습니다. 잠시 후 다시 시도해 주세요."; return; }
  $("ws-form").reset(); out.style.color = "#0c8f66"; out.textContent = "상담 신청이 접수되었습니다. 확인 후 연락드리겠습니다.";   // 성공 응답을 받은 뒤에만 표시
};
