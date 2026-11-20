// 플레이스 입력 확인 화면. 실제 AI 진단은 준비 중이라, 입력값 형식만 확인해서 안내합니다.
const $ = id => document.getElementById(id);
$("ph-form").onsubmit = e => {
  e.preventDefault();
  const v = $("ph-q").value.trim(), msg = $("ph-msg"), soon = $("ph-soon");
  msg.hidden = true; soon.hidden = true;
  if (!v) { msg.textContent = "플레이스 주소, ID 또는 업체명을 입력해 주세요."; msg.hidden = false; return; }

  let text;
  if (/naver\.me\//i.test(v)) {
    msg.textContent = "단축 주소(naver.me)로는 매장을 확인할 수 없어요. 주소창에 보이는 전체 주소(m.place.naver.com/place/숫자)를 넣어 주세요."; msg.hidden = false; return;
  }
  const m = v.match(/place\/(\d{5,})/i) || v.match(/^(\d{5,})$/);
  if (m) text = `플레이스 ID ${m[1]} 로 확인했어요.`;
  else if (/^https?:\/\//i.test(v) || /naver\.com/i.test(v)) {
    msg.textContent = "주소에서 플레이스 ID를 찾지 못했어요. m.place.naver.com/place/숫자 형태의 주소인지 확인해 주세요."; msg.hidden = false; return;
  } else if (v.length < 2) { msg.textContent = "업체명을 두 글자 이상 입력해 주세요."; msg.hidden = false; return; }
  else text = `업체명 "${v.slice(0, 40)}" 으로 입력하셨어요.`;

  $("ph-soon-text").textContent = text;
  soon.hidden = false;
};
