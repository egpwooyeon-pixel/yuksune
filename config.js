// Supabase 연결 정보. 둘 다 "공개용"이라 코드에 넣어도 안전합니다 (실제 보호는 DB의 RLS 규칙이 담당).
// 절대 service_role / secret 키를 여기에 넣지 마세요.
window.WOORI = {
  SUPABASE_URL: "https://yslmnvsetuzxytevydbw.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable__KXiHxPRWHbanj2fzAWXDg_xDUX5JMC", // 공개용(Publishable) 키
  // 운영자 정보: 개인정보처리방침·이용약관·하단 안내에 그대로 표시됩니다. 비워 두면 "(입력 필요)"로 보입니다. 공개 전에 꼭 채워 주세요.
  COMPANY: { name: "주식회사 이지피", ceo: "김우형", bizNo: "653-87-02666", address: "서울특별시 강남구 봉은사로25길 23 정선빌딩 2층", email: "egpholdings@naver.com", phone: "070-4518-9401", privacyOfficer: "" },  // privacyOfficer(개인정보 보호책임자)는 아직 미정 — 지정 후 입력
  LEGAL_DATE: "2026년 11월 24일",   // 시행일 (법적 문서를 공개하는 날짜로 바꿔 주세요)
  AD_WHATSSUB_URL: "",   // 왓섭 광고를 눌렀을 때 이동할 주소 (https:// 로 시작). 비워 두면 이동하지 않는 안내 카드로만 보여요.
  WHATSSUB_SHARE: true,   // 왓섭 상담 신청에서 "왓섭에 정보 제공" 동의 문구를 보여 줄지 (제3자 제공이 없다면 false)
  EMAIL_NOTIFY: false, // 선정 안내 메일 기능 스위치. 메일 설정(supabase/EMAIL_SETUP.md)을 끝낸 뒤 true 로 바꾸면 켜집니다.
};
