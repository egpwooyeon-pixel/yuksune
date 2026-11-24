(function () {
  const L = window.LANDING || {}, W = window.WOORI || {};
  const $ = id => document.getElementById(id);

  // 브랜드명 / 운영자 정보 / 연락 버튼
  document.querySelectorAll("[data-brand]").forEach(el => el.textContent = L.BRAND || el.textContent);
  document.title = "AI 검색 최적화(AEO·GEO) 상담 - " + (L.BRAND || "");
  const co = W.COMPANY || {};
  document.querySelectorAll("[data-co]").forEach(el => { el.textContent = co[el.dataset.co] || ""; });
  document.querySelectorAll("[data-label]").forEach(el => el.textContent = el.dataset.label);
  if (L.PHONE) { const t = $("tel"); t.hidden = false; t.href = "tel:" + L.PHONE.replace(/[^\d+]/g, ""); }
  if (L.KAKAO_URL && /^https:\/\//.test(L.KAKAO_URL)) { const k = $("kakao"); k.hidden = false; k.href = L.KAKAO_URL; }

  // 레퍼런스 섹션 (SHOW_REFERENCE: false 로 끄기)
  if (L.SHOW_REFERENCE === false) { const r = $("reference"); if (r) r.hidden = true; }

  // 진단 화면에서 넘어온 값으로 상담 폼 채우기 (값은 입력칸에만 넣고 HTML 로는 쓰지 않음)
  (function () {
    const qp = new URLSearchParams(location.search); let any = false;
    const put = (id, v, max) => { const el = $(id); if (el && v) { el.value = String(v).slice(0, max); any = true; } };
    put("f-company", qp.get("company"), 100); put("f-web", qp.get("web"), 200); put("f-msg", qp.get("msg"), 1000);
    const t = qp.get("topic"), sel = $("f-topic");
    if (t && sel) { const o = [...sel.options].find(x => x.text === t || (t === "웨딩홀" && x.text === "웨딩")); if (o) { sel.value = o.value || o.text; any = true; } }
    const st = $("status"); if (any && st) { st.hidden = false; st.className = "status"; st.textContent = "진단 화면에서 입력한 내용을 가져왔어요. 확인하고 담당자·연락처를 입력해 주세요."; }
  })();

  // 모바일 메뉴
  const mb = $("menu-btn"), nav = $("nav");
  const setMenu = o => { nav.classList.toggle("open", o); mb.setAttribute("aria-expanded", o); mb.setAttribute("aria-label", o ? "메뉴 닫기" : "메뉴 열기"); };
  mb.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  nav.addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });

  // 상담 폼
  const live = L.INQUIRY_LIVE === true, form = $("form"), status = $("status"), btn = $("submit");
  const sb = live && W.SUPABASE_ANON_KEY && window.supabase ? window.supabase.createClient(W.SUPABASE_URL, W.SUPABASE_ANON_KEY) : null;
  const badge = $("demo-badge");
  if (live) { badge.textContent = "상담 신청 · 남겨 주신 내용은 운영자만 확인할 수 있어요."; badge.classList.add("live"); btn.textContent = "상담 신청"; $("consent-row").hidden = false; }

  const F = { company: "f-company", name: "f-name", phone: "f-phone", topic: "f-topic", web: "f-web", agree: "f-agree" };
  const setErr = (k, t) => { const el = $(F[k]), m = $("e-" + k); if (!m) return; m.textContent = t || ""; if (t) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid"); };
  const say = (t, cls) => { status.hidden = !t; status.textContent = t || ""; status.className = "status " + (cls || ""); };
  let busy = false;

  function validate() {
    const v = id => $(id).value.trim(), errs = {};
    if (!v("f-company")) errs.company = "업체명을 입력해 주세요.";
    if (!v("f-name")) errs.name = "담당자 이름을 입력해 주세요.";
    if (v("f-phone").replace(/\D/g, "").length < 9) errs.phone = "연락처를 정확히 입력해 주세요. (예: 010-0000-0000)";
    if (!v("f-topic")) errs.topic = "업종을 선택해 주세요.";
    if (v("f-web")) { try { const u = new URL(v("f-web")); if (!/^https?:$/.test(u.protocol)) throw 0; } catch (_) { errs.web = "https:// 로 시작하는 주소를 입력해 주세요."; } }
    if (live && !$("f-agree").checked) errs.agree = "개인정보 수집·이용에 동의해 주세요.";
    Object.keys(F).forEach(k => setErr(k, errs[k]));
    const first = Object.keys(errs)[0];
    if (first) $(F[first]).focus();
    return !first;
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;
    say("");
    if (!validate()) return say("입력 항목을 확인해 주세요.", "bad");
    if (!live) return say("입력 항목을 확인했습니다. 현재는 테스트 화면입니다.", "");   // 저장·전송하지 않음
    if (!sb) return say("서버 연결 설정이 없어 접수할 수 없습니다.", "bad");

    busy = true; btn.disabled = true; say("접수 중입니다…", "");
    const v = id => $(id).value.trim();
    const { error } = await sb.from("inquiries").insert({
      company: v("f-company"), name: v("f-name"), phone: v("f-phone"), topic: v("f-topic"),
      website: v("f-web") || null, message: v("f-msg"), agreed: true,
    });
    busy = false; btn.disabled = false;
    if (error) {
      const noTable = /relation|schema cache|does not exist|column/i.test(error.message || "");
      return say(noTable ? "접수 저장소 설정이 끝나지 않았습니다. 관리자에게 알려 주세요." : "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.", "bad");
    }
    form.reset(); say("상담 신청이 접수되었습니다. 확인 후 연락드리겠습니다.", "ok");   // 성공 응답을 받은 뒤에만 표시
  });
})();
