-- 19단계: 인스타그램·유튜브 체험단 신청에 팔로워·구독자 수 칸 추가
-- (007 을 아직 안 했어도 되도록 이메일·발송 기록 칸도 같이 만들고, 광고주용 신청자 목록 함수를 한 번에 새로 만듭니다)
-- Supabase > SQL Editor 에 붙여넣고 Run. 아직 실제 실행해 검증하지 않은 초안입니다.
alter table public.applications
  add column if not exists followers bigint check (followers is null or followers between 0 and 1000000000),   -- 팔로워/구독자 수
  add column if not exists email text check (email is null or char_length(email) <= 120),
  add column if not exists notified_at timestamptz;

drop function if exists public.owner_applications(uuid);
create function public.owner_applications(cid uuid)
returns table (id uuid, campaign_id uuid, message text, status text, created_at timestamptz,
               applicant_name text, contact text, kakao_id text, email text, notified_at timestamptz,
               followers bigint, channel_url text,
               visit_date date, visit_time text, party_size int,
               is_naver_influencer boolean, clip_ok boolean, mission_agreed boolean)
language sql security definer set search_path = public as $$
  select a.id, a.campaign_id, a.message, a.status, a.created_at, a.applicant_name,
         case when a.status = 'selected' then a.contact end,
         case when a.status = 'selected' then a.kakao_id end,
         case when a.status = 'selected' then a.email end,
         a.notified_at, a.followers,
         a.channel_url, a.visit_date, a.visit_time, a.party_size,
         a.is_naver_influencer, a.clip_ok, a.mission_agreed
  from public.applications a
  where a.campaign_id = cid
    and exists (select 1 from public.campaigns c where c.id = cid and c.owner_id = auth.uid())
  order by a.created_at desc
$$;
revoke all on function public.owner_applications(uuid) from public, anon;
grant execute on function public.owner_applications(uuid) to authenticated;
