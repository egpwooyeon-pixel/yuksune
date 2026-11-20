-- 7단계: 선정 안내 이메일 — 신청자 이메일 칸과 발송 기록 칸 추가
-- Supabase > SQL Editor 에 붙여넣고 Run. (006 까지 실행된 뒤) 아직 실제 실행해 검증하지 않은 초안입니다.
alter table public.applications
  add column if not exists email text check (email is null or char_length(email) <= 120),
  add column if not exists notified_at timestamptz;   -- 선정 안내 메일을 보낸 시각

-- 새 칸은 006 에서 정한 '직접 읽기 허용 목록'에 없으므로 로그인 회원이 표에서 직접 읽을 수 없음 (이메일 보호).
-- 광고주는 아래 함수로만 받고, 이메일도 연락처처럼 '선정된 신청자'만 채워서 돌려줌.
drop function if exists public.owner_applications(uuid);
create function public.owner_applications(cid uuid)
returns table (id uuid, campaign_id uuid, message text, status text, created_at timestamptz,
               applicant_name text, contact text, kakao_id text, email text, notified_at timestamptz, channel_url text,
               visit_date date, visit_time text, party_size int,
               is_naver_influencer boolean, clip_ok boolean, mission_agreed boolean)
language sql security definer set search_path = public as $$
  select a.id, a.campaign_id, a.message, a.status, a.created_at, a.applicant_name,
         case when a.status = 'selected' then a.contact end,
         case when a.status = 'selected' then a.kakao_id end,
         case when a.status = 'selected' then a.email end,
         a.notified_at,
         a.channel_url, a.visit_date, a.visit_time, a.party_size,
         a.is_naver_influencer, a.clip_ok, a.mission_agreed
  from public.applications a
  where a.campaign_id = cid
    and exists (select 1 from public.campaigns c where c.id = cid and c.owner_id = auth.uid())
  order by a.created_at desc
$$;
revoke all on function public.owner_applications(uuid) from public, anon;
grant execute on function public.owner_applications(uuid) to authenticated;
