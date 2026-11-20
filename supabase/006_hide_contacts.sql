-- 6단계: 신청자 연락처(핸드폰·카카오톡)는 '선정' 처리 후에만 광고주에게 보이게 함
-- Supabase > SQL Editor 에 붙여넣고 Run. 아직 실제 실행해 검증하지 않은 초안입니다.
-- (운영자는 Supabase Table Editor 에서 계속 전체를 볼 수 있습니다.)

-- 1) 로그인 회원이 표를 직접 읽을 때는 연락처 칸을 뺀 나머지 칸만 읽게 제한
revoke select on public.applications from authenticated;
grant select (id, campaign_id, applicant_id, message, status, created_at, applicant_name, channel_url,
              visit_date, visit_time, party_size, is_naver_influencer, clip_ok, mission_agreed,
              consent_at, reuse_consent_at)
  on public.applications to authenticated;

-- 2) 광고주는 이 함수로만 신청자 목록을 받음: 본인 체험단만, 연락처는 선정된 신청자만 채워서 돌려줌
create or replace function public.owner_applications(cid uuid)
returns table (id uuid, campaign_id uuid, message text, status text, created_at timestamptz,
               applicant_name text, contact text, kakao_id text, channel_url text,
               visit_date date, visit_time text, party_size int,
               is_naver_influencer boolean, clip_ok boolean, mission_agreed boolean)
language sql security definer set search_path = public as $$
  select a.id, a.campaign_id, a.message, a.status, a.created_at, a.applicant_name,
         case when a.status = 'selected' then a.contact end,
         case when a.status = 'selected' then a.kakao_id end,
         a.channel_url, a.visit_date, a.visit_time, a.party_size,
         a.is_naver_influencer, a.clip_ok, a.mission_agreed
  from public.applications a
  where a.campaign_id = cid
    and exists (select 1 from public.campaigns c where c.id = cid and c.owner_id = auth.uid())
  order by a.created_at desc
$$;
revoke all on function public.owner_applications(uuid) from public, anon;
grant execute on function public.owner_applications(uuid) to authenticated;
