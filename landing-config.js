// 랜딩 페이지 설정 — 브랜드명·연락 수단·문의 수신 모드를 여기 한 곳에서 바꿉니다.
window.LANDING = {
  BRAND: "EGP AI 스튜디오",   // 브랜드명
  PHONE: "",                   // 예: "02-0000-0000" (비워 두면 전화 버튼 숨김)
  KAKAO_URL: "",               // 예: "https://pf.kakao.com/..." (비워 두면 카카오 버튼 숨김)
  // 문의 수신 모드
  //  false: 데모. 입력 검사만 하고 저장·전송하지 않습니다. (기본값)
  //  true : 실제 상담. config.js 의 Supabase 로 supabase/021_inquiries.sql 테이블에 저장합니다.
  //         true 로 바꾸기 전에 021 SQL 실행 + 승인된 개인정보처리방침(privacy.html, config.js 의 COMPANY)을 준비하세요.
  INQUIRY_LIVE: true,
  // AI 노출 진단(diagnose.html)
  //  false: 샘플 리포트만 보여 줍니다. (기본값)
  //  true : Supabase Edge Function aeo-diagnose 로 실제 측정합니다. 켜기 전에 supabase/GEMINI_SETUP.md 를 끝내세요.
  DIAGNOSE_LIVE: false,
  // 홈페이지 주소로 업체 정보 자동 채우기(진단 화면의 "정보 불러오기" 버튼).
  //  false: 버튼을 숨깁니다. (기본값)
  //  true : Supabase Edge Function aeo-prefill 을 부릅니다. 켜기 전에 023_prefill.sql 실행 + 함수 배포가 필요해요 (Gemini 키는 필요 없음).
  PREFILL_LIVE: true,
  // 레퍼런스(한방병원 사례) 카드 표시. false 로 바꾸면 숨겨집니다.
  //  켜 두기 전에 사례로 쓰는 업체(병원)의 사용 동의와 의료광고 관련 문구 적합성을 확인하세요.
  SHOW_REFERENCE: true,
  // 발행 설정(진단 화면 아래의 "상품 선택 · 발행 수량과 기간"). 상품과 단가를 정한 뒤 ORDER_UI 를 true 로 켜세요.
  //  · 결제나 발행이 바로 진행되지는 않고, 고른 조건이 상담 신청 폼으로 넘어가요.
  //  · products 가 비어 있으면 켜도 보이지 않아요. price 를 비우면(null) 금액 대신 "상담 후 안내"로 표시돼요.
  //  · 다른 회사 서비스의 상품명·가격·홍보 문구를 그대로 쓰지 마세요.
  ORDER_UI: false,
  ORDER: {
    maxPerDay: 20,   // 하루 발행 건수 상한
    maxDays: 180,    // 진행 일수 상한
    products: [
      // { name: "상품 이름", unitLabel: "건당", price: 0, note: "설명 한 줄" },
    ],
  },
};
