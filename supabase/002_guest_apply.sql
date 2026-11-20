-- 2단계: 로그인 없이(비회원) 체험단 신청 허용
-- Supabase > SQL Editor 에 붙여넣고 Run (schema.sql 을 먼저 실행한 뒤). 아직 실제 실행해 검증하지 않은 초안입니다.

-- 캠페인에 신청 조건 추가: 추가 미션, 방문 가능 기간, 최대 방문 인원, 2차 활용 기간(개월)
alter table public.campaigns
  add column mission text,
  add column visit_start date,
  add column visit_end date,
  add column max_party int not null default 4 check (max_party between 1 and 10),
  add column reuse_months int not null default 6 check (reuse_months between 0 and 24);

-- 신청자 정보 칸 추가 (비회원은 이름/연락처/채널 주소를 직접 입력)
alter table public.applications alter column applicant_id drop not null;
alter table public.applications
  add column applicant_name text,
  add column contact text,          -- 휴대폰 번호 (010-0000-0000)
  add column kakao_id text,         -- 카카오톡 아이디
  add column channel_url text,      -- 블로그/인스타 등 활동 채널 주소
  add column visit_date date,       -- 방문 희망 날짜 (방문형)
  add column visit_time text,       -- 방문 희망 시간 (방문형)
  add column party_size int check (party_size is null or party_size between 1 and 10),
  add column is_naver_influencer boolean,  -- 네이버 인플루언서 여부
  add column clip_ok boolean,              -- 클립 진행 가능 여부
  add column mission_agreed boolean,       -- 추가 미션 동의 여부
  add column consent_at timestamptz,       -- 개인정보 수집·이용 동의 시각
  add column reuse_consent_at timestamptz; -- 후기 2차 활용 동의 시각

-- 비회원 신청은 이름·연락처·채널·동의가 모두 있어야 함
alter table public.applications add constraint applications_guest_check
  check (applicant_id is not null
         or (applicant_name is not null and contact is not null and channel_url is not null
                 and consent_at is not null and reuse_consent_at is not null));

-- 같은 연락처로 같은 캠페인에 중복 신청 방지 (비회원)
create unique index applications_guest_uniq
  on public.applications (campaign_id, lower(contact)) where applicant_id is null;

-- 신청 권한: 비회원 포함 누구나, 모집 중이고 마감 전인 캠페인에만. 상태는 '신청'으로만 시작.
drop policy if exists "신청: 로그인 회원이 모집 중인 캠페인에만" on public.applications;
create policy "신청: 누구나(비회원 포함) 모집 중인 캠페인에 신청" on public.applications
  for insert to anon, authenticated
  with check (
    status = 'applied'
    and (applicant_id is null or applicant_id = auth.uid())
    and exists (select 1 from public.campaigns c
                where c.id = campaign_id and c.status = 'open' and c.deadline >= current_date)
  );
grant insert on public.applications to anon;

-- 목록에 보여줄 '신청 인원수' (신청자 개인정보는 노출하지 않고 숫자만)
create or replace function public.campaign_counts()
returns table (campaign_id uuid, applied bigint)
language sql security definer set search_path = public as $$
  select campaign_id, count(*) from public.applications group by campaign_id
$$;
grant execute on function public.campaign_counts() to anon, authenticated;
