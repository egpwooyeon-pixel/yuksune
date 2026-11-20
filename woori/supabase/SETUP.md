# Supabase 연결 준비 (처음 1회, 약 10분)

1. https://supabase.com 접속 → GitHub 또는 이메일로 가입 (무료 플랜으로 시작 가능)
2. **New project** → 이름: `woori-chehumdan`, 리전: **Northeast Asia (Seoul)**, DB 비밀번호는 따로 안전하게 보관
3. 왼쪽 **SQL Editor** → New query → `schema.sql` 내용을 전부 붙여넣고 **Run**
4. 왼쪽 **Project Settings → API** 에서 두 가지를 복사해서 알려주세요
   - **Project URL** (예: `https://xxxx.supabase.co`)
   - **anon public key** (공개용 키라서 채팅에 붙여넣어도 괜찮습니다)
   - ⚠ **service_role key 는 절대 알려주지 마세요** (전체 권한 키입니다)
5. **Authentication → Providers → Email**: 처음 시험할 때는 "Confirm email" 을 꺼두면 가입 즉시 로그인됩니다.

## 사업자 인증 (운영자가 직접 처리)
광고주가 사업자등록번호를 입력하면 `profiles.business_no` 에 저장됩니다.
확인 후 SQL Editor 에서 아래를 실행하면 캠페인 등록 권한이 열립니다.

    update public.profiles set business_verified = true where business_no = '123-45-67890';

본인을 운영자로 지정하려면:

    update public.profiles set role = 'admin' where id = '<내 user id>';
