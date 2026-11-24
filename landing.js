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

  // 모바일 메뉴
  const mb = $("menu-btn"), nav = $("nav");
  const setMenu = o => { nav.classList.toggle("open", o); mb.setAttribute("aria-expanded", o); mb.setAttribute("aria-label", o ? "메뉴 닫기" : "메뉴 열기"); };
  mb.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  nav.addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });

  // 업종별 진단 예시 탭
  const DATA = [
    { tab: "병의원", q: "강남에서 토요일에도 여드름 상담을 받을 수 있는 피부과를 찾아줘.", c: ["지역", "진료 분야", "운영시간"] },
    { tab: "웨딩", q: "서울에서 야외 예식을 할 수 있고 100명 규모 상담이 가능한 웨딩홀을 찾아줘.", c: ["지역", "야외 공간", "하객 규모"] },
    { tab: "음식점", q: "성수에서 기념일에 조용히 식사할 수 있는 예약 가능한 레스토랑을 찾아줘.", c: ["지역", "방문 목적", "예약"] },
    { tab: "쇼핑몰", q: "좁은 방에서 쓰기 좋은 화이트 이동식 컴퓨터 책상을 찾아줘.", c: ["사용 공간", "색상", "이동성"] },
  ];
  const tabs = $("tabs"); let cur = 0;
  DATA.forEach((d, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tab"; b.id = "tab-" + i; b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", "panel"); b.textContent = d.tab; tabs.appendChild(b);
  });
  function select(i, focus) {
    cur = i; const d = DATA[i];
    [...tabs.children].forEach((b, j) => { b.setAttribute("aria-selected", j === i); b.tabIndex = j === i ? 0 : -1; });
    $("panel").setAttribute("aria-labelledby", "tab-" + i);
    $("q").textContent = d.q;
    $("chk").innerHTML = ""; d.c.forEach(t => { const li = document.createElement("li"); li.textContent = t; $("chk").appendChild(li); });
    $("copy-msg").textContent = "";
    const p = $("panel"); p.style.animation = "none"; void p.offsetWidth; p.style.animation = "";
    if (focus) tabs.children[i].focus();
  }
  tabs.addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) select([...tabs.children].indexOf(b)); });
  tabs.addEventListener("keydown", e => {
    const n = DATA.length; let i = cur;
    if (e.key === "ArrowRight") i = (cur + 1) % n; else if (e.key === "ArrowLeft") i = (cur + n - 1) % n;
    else if (e.key === "Home") i = 0; else if (e.key === "End") i = n - 1; else return;
    e.preventDefault(); select(i, true);
  });
  select(0);

  // 질문 복사
  $("copy").addEventListener("click", async () => {
    const text = DATA[cur].q, msg = $("copy-msg");
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); if (!ok) throw 0; }
      msg.textContent = "질문을 복사했어요.";
    } catch (_) { msg.textContent = "복사하지 못했어요. 질문을 직접 선택해 복사해 주세요."; }
  });

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
