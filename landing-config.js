// 랜딩 페이지 설정 — 브랜드명·연락 수단·문의 수신 모드를 여기 한 곳에서 바꿉니다.
window.LANDING = {
  BRAND: "EGP AI 스튜디오",   // 브랜드명
  PHONE: "",                   // 예: "02-0000-0000" (비워 두면 전화 버튼 숨김)
  KAKAO_URL: "",               // 예: "https://pf.kakao.com/..." (비워 두면 카카오 버튼 숨김)
  // 문의 수신 모드
  //  false: 데모. 입력 검사만 하고 저장·전송하지 않습니다. (기본값)
  //  true : 실제 상담. config.js 의 Supabase 로 supabase/021_inquiries.sql 테이블에 저장합니다.
  //         true 로 바꾸기 전에 021 SQL 실행 + 승인된 개인정보처리방침(privacy.html, config.js 의 COMPANY)을 준비하세요.
  INQUIRY_LIVE: false,
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
};
