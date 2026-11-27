-- 39단계: 로그인 회원이 마이페이지에서 '내 후기 제출 현황'을 볼 수 있게 하는 조회 함수
-- · 본인 신청 건(applications.applicant_id = 내 계정)의 후기만 돌려줘요. 비회원 신청은 연락처가 같아도 연결하지 않아요.
-- · 후기 제출 자체는 기존 '후기 링크 제출' 화면(review.html, 032)을 그대로 써요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (032 이후) 여러 번 실행해도 안전해요.
create or replace function public.my_reviews() returns table (application_id uuid, campaign_id uuid, review_status text, revision_note text, submitted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.application_id, r.campaign_id, r.review_status, r.revision_note, r.submitted_at
  from public.review_submissions r
  join public.applications a on a.id = r.application_id
  where a.applicant_id = auth.uid() and auth.uid() is not null
$$;
revoke all on function public.my_reviews() from public, anon;
grant execute on function public.my_reviews() to authenticated;
