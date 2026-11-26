-- 30단계: review-draft 서버 함수(service_role)가 review_drafts 표에 쓸 수 있도록 명시적 권한 부여
-- · 027에서는 "service_role 은 기본적으로 모든 표에 다 쓸 수 있다"고 가정했는데, 이 프로젝트는 그렇지 않았어요
--   (실제 배포 로그에서 42501 permission denied 로 확인됨). 그래서 명시적으로 권한을 줍니다.
-- · service_role 은 Edge Function 안에서만 쓰는 키라 브라우저에서 직접 악용할 수 없어요 — RLS 와는 별개로,
--   "이 역할이 이 표를 만질 수 있나"를 Postgres 가 먼저 확인하는 단계가 빠져 있었을 뿐이에요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (027 이후) 여러 번 실행해도 안전해요.
grant select, insert, update on public.review_drafts to service_role;
grant usage, select on public.review_drafts_id_seq to service_role;
