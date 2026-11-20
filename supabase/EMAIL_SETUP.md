# 선정 안내 이메일 설정 (처음 1회)

신청자가 선정되면 사이트가 **Supabase Edge Function**을 통해 **Resend**(메일 발송 서비스)로 안내 메일을 보냅니다.
아래 설정이 끝나기 전에는 선정은 정상 처리되고, 메일만 "메일을 보내지 못했어요"로 표시됩니다.

## 1. DB 준비
SQL Editor에서 `007_email_notify.sql` 실행 (006까지 끝낸 뒤).

## 2. 메일 발송 서비스(Resend) 준비
1. resend.com 가입
2. **Domains**에서 **내 도메인**을 추가하고, 안내하는 DNS 값(TXT/CNAME)을 도메인 등록 업체 화면에 입력해 인증
   - **[Uncertain]** 인증된 도메인이 없으면 아무 신청자에게나 메일을 보낼 수 없는 것으로 알고 있습니다(테스트용 주소는 본인 메일로만 가능). 도메인이 없다면 먼저 구매해야 합니다(연 1~2만 원대 안팎, 업체별 상이).
3. **API Keys**에서 키 생성 → 복사해 두기 (비밀번호처럼 취급, 채팅/코드에 올리지 마세요)
4. 요금·무료 한도는 resend.com/pricing 에서 확인

## 3. Supabase에 함수 올리기 (코드 몰라도 가능)
1. Supabase 왼쪽 메뉴 **Edge Functions → Deploy a new function → Via Editor**
2. 함수 이름: `notify-selected`
3. 저장소의 `supabase/functions/notify-selected/index.ts` 내용을 전부 붙여넣고 **Deploy**
4. **Edge Functions → Secrets**(또는 Manage secrets)에서 아래 두 개 추가
   - `RESEND_API_KEY` = 2번에서 만든 키
   - `MAIL_FROM` = `우리들 체험단 <no-reply@내도메인.com>`
5. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase가 자동으로 넣어 줍니다.
   (service_role 키는 절대 채팅·코드에 붙여넣지 마세요)

## 4. 시험
체험단 등록 → (로그아웃 상태에서) **본인 이메일**로 신청 → 내 체험단 관리에서 **선정** → 메일함(스팸함 포함) 확인
