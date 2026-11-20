# Supabase 연결 준비 (처음 1회, 약 10분)

1. https://supabase.com 접속 → GitHub 또는 이메일로 가입 (무료 플랜으로 시작 가능)
2. **New project** → 이름: `woori-chehumdan`, 리전: **Northeast Asia (Seoul)**, DB 비밀번호는 따로 안전하게 보관
3. 왼쪽 **SQL Editor** → New query → `schema.sql` 내용을 전부 붙여넣고 **Run**
4. 왼쪽 **Project Settings → API** 에서 두 가지를 복사해서 알려주세요
   - **Project URL** (예: `https://xxxx.supabase.co`)
   - **anon public key** (공개용 키라서 채팅에 붙여넣어도 괜찮습니다)
   - ⚠ **service_role key 는 절대 알려주지 마세요** (전체 권한 키입니다)
5. **Authentication → Providers → Email**: 처음 시험할 때는 "Confirm email" 을 꺼두면 가입 즉시 로그인됩니다.

## 광고주 인증 흐름
1. 누구나 일반 회원으로 가입 (이메일 + 비밀번호 + 닉네임만)
2. 캠페인을 올리고 싶은 회원이 **사업자등록증 파일**(사진/PDF)을 올려 "광고주 심사 요청"
3. 운영자(본인)가 관리자 화면에서 파일을 보고 **승인 / 반려(사유 입력)**
4. 승인된 회원만 캠페인 등록 가능 (DB 규칙으로도 막혀 있음)

사업자등록증은 비공개 저장소에 보관되고 본인과 운영자만 볼 수 있습니다.
관리자 화면은 서버 연결 후 만듭니다. 그 전에 급하면 SQL Editor에서:

    update public.profiles set business_status = 'approved' where id = '<회원 id>';

본인을 운영자로 지정하려면 (가입 후 1회):

    update public.profiles set role = 'admin' where id = '<내 user id>';
