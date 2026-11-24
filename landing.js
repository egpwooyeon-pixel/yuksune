// 랜딩 페이지 문의 폼 → Supabase public.inquiries (supabase/021_inquiries.sql 먼저 실행)
(function () {
  const cfg = window.WOORI || {};
  const sb = cfg.SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  // 하단 운영자 정보 (config.js 의 COMPANY)
  const co = cfg.COMPANY || {}, foot = document.getElementById("foot-co");
  if (foot) foot.textContent = [co.name, co.ceo && "대표 " + co.ceo, co.bizNo && "사업자등록번호 " + co.bizNo, co.address, co.email, co.phone].filter(Boolean).join(" · ");

  const form = document.getElementById("inq-form"), btn = document.getElementById("inq-btn"), msg = document.getElementById("inq-msg");
  const show = (text, ok) => { msg.hidden = false; msg.textContent = text; msg.className = "lp-msg " + (ok ? "ok" : "err"); };
  let last = 0;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const f = form.elements, v = n => f[n].value.trim();
    if (!v("name")) return show("이름을 입력해 주세요.", false);
    if (v("phone").replace(/\D/g, "").length < 9) return show("연락처를 정확히 입력해 주세요.", false);
    if (v("email") && !f.email.checkValidity()) return show("이메일 형식을 확인해 주세요.", false);
    if (!v("message")) return show("문의 내용을 입력해 주세요.", false);
    if (!f.agreed.checked) return show("개인정보 수집·이용에 동의해 주세요.", false);
    if (!sb) return show("서버 연결 키가 설정되지 않았습니다.", false);
    if (Date.now() - last < 15000) return show("잠시 후 다시 시도해 주세요.", false);

    btn.disabled = true; show("보내는 중…", true);
    const { error } = await sb.from("inquiries").insert({
      name: v("name"), phone: v("phone"), email: v("email") || null, company: v("company") || null,
      topic: v("topic") || null, message: v("message"), agreed: true,
    });
    btn.disabled = false;
    if (error) {
      const noTable = /relation|schema cache|does not exist/i.test(error.message || "");
      return show(noTable ? "문의 저장소가 아직 준비되지 않았어요. (supabase/021_inquiries.sql 실행 필요)" : "전송에 실패했어요. 잠시 후 다시 시도해 주세요.", false);
    }
    last = Date.now(); form.reset();
    show("문의가 접수되었어요. 확인 후 연락드릴게요.", true);
  });
})();
