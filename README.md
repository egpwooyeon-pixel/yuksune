# 우리들 체험단

마케팅 커뮤니티(체험단 모집·신청) 사이트. 빌드 없는 정적 HTML/CSS/JS + Supabase(DB·로그인).

## 폴더
- `index.html` 홈(커뮤니티 게시판), `campaigns.html` 체험단 목록, `campaign.html` 상세·신청, `register.html` 광고주 등록, `login.html` 로그인/가입
- `supabase/` DB 스키마(`schema.sql` → `002_guest_apply.sql`)와 연결 가이드

## 기획 결정사항
# 우리들 체험단 — 기획 결정사항

- 신청 방식: **광고주 선정** (신청 → 광고주가 선정 → 체험 진행)
- 구매평 체험단: **포인트 지급 없음** (당분간)
- 캠페인 등록: 운영자가 사업자등록증을 확인·승인한 광고주가 **직접 입력**해서 등록 (네이버 플레이스 자동 입력은 보류). 서버(Supabase)에 저장
- 광고주 인증: 일반 가입은 누구나 → 사업자등록증 파일 업로드 → **운영자가 승인**해야 캠페인 등록 가능
- 신청: **비회원도 가능** (성함·핸드폰·채널주소·카카오톡ID 등). 후기 **2차 활용은 게시일로부터 6개월까지** 동의를 받음 (캠페인별 `reuse_months`, 기본 6)
- DB 변경 순서: `supabase/schema.sql` → `supabase/002_guest_apply.sql`
- 선정 안내 이메일: 코드는 준비되어 있으나 **보류** (config.js 의 `EMAIL_NOTIFY` 가 false). 켜려면 `supabase/EMAIL_SETUP.md` 순서대로 설정 후 true 로 변경
- 관리자 페이지: `admin-login.html`(관리자 로그인) → `admin.html`. 운영자 지정은 `profiles.role = 'admin'`, 집계/권한은 `supabase/008_admin.sql`. 사이트 메뉴에는 링크를 두지 않음 (주소로만 접속)
