# 네이버 로그인 · SNS 프로필 · 간편 신청 설정

## 1. SQL (Supabase > SQL Editor, 순서대로)
1. `035_sns_apply.sql` — 휴대폰번호, SNS 프로필(`member_sns`), 간편 신청 함수(`apply_simple`)
2. `036_naver_login.sql` — 네이버 로그인 연결 표 (네이버 로그인을 켤 때만 필요)

선행: 002, 003, 019, 034 가 이미 실행돼 있어야 해요.

## 2. 네이버 로그인을 켜려면 (안 켜도 간편 신청은 됩니다)
1. 네이버 개발자센터 > Application 등록 > 사용 API **네이버 로그인**, 제공 정보는 **회원이름 정도만 선택해도 충분**(우리는 고유 ID만 써요).
2. **Callback URL**: `https://<프로젝트>.supabase.co/functions/v1/naver-auth`  (현재: `https://yslmnvsetuzxytevydbw.supabase.co/functions/v1/naver-auth`)
3. Supabase > Edge Functions > Secrets 에 등록 (값은 채팅·코드에 적지 마세요)
   - `NAVER_LOGIN_CLIENT_ID`, `NAVER_LOGIN_CLIENT_SECRET`, `SITE_URL` (예: `https://woori-chehumdan.netlify.app`)
4. `naver-auth` 함수 배포, **Verify JWT 는 끔** (네이버가 로그인 없이 되돌려 보내는 주소라서). 로그인 연결(link)은 함수 안에서 로그인 여부를 직접 확인해요.
5. 도메인을 바꾸면 `SITE_URL` 만 바꾸면 돼요.

## 동작 원칙
- 계정 식별: 네이버 앱 전용 고유 ID(`response.id`)만. 같은 이메일이어도 자동으로 합치지 않아요 (새 회원은 메일이 갈 수 없는 자리표시 주소로 생성).
- 기존 회원과 연결: 로그인한 본인이 마이페이지에서 직접 누를 때만.
- Client Secret·토큰: 서버에서만 사용. 화면·주소·로그에 내보내지 않아요. 로그인 결과 토큰은 주소창에 싣지 않고, 요청한 브라우저만 1회 받아가요.
- 네이버 로그인 ≠ 블로그 소유 인증. 블로그는 "등록된 블로그", 인스타그램은 "프로필 등록 완료"로만 표시해요. "계정 연동 완료"는 실제 인증 수단이 생긴 계정에만 쓰도록 코드에 막아 뒀어요 (현재 인증 수단 없음 → 표시되지 않음).
