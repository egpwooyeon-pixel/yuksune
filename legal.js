// 법적 문서 공통: 운영자 정보 채우기 (config.js 의 COMPANY)
(function () {
  const co = (window.WOORI && window.WOORI.COMPANY) || {};
  document.querySelectorAll("[data-co]").forEach(el => {
    const v = co[el.dataset.co];
    if (v) el.textContent = v; else { el.textContent = "(입력 필요)"; el.classList.add("co-missing"); }
  });
  document.querySelectorAll("[data-date]").forEach(el => { el.textContent = (window.WOORI && window.WOORI.LEGAL_DATE) || "(시행일 입력 필요)"; });
})();
