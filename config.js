// Supabase 연결 정보. 둘 다 "공개용"이라 코드에 넣어도 안전합니다 (실제 보호는 DB의 RLS 규칙이 담당).
// 절대 service_role / secret 키를 여기에 넣지 마세요.
window.WOORI = {
  SUPABASE_URL: "https://yslmnvsetuzxytevydbw.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable__KXiHxPRWHbanj2fzAWXDg_xDUX5JMC", // 공개용(Publishable) 키
  EMAIL_NOTIFY: false, // 선정 안내 메일 기능 스위치. 메일 설정(supabase/EMAIL_SETUP.md)을 끝낸 뒤 true 로 바꾸면 켜집니다.
};
