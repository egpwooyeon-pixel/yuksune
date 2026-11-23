-- 14단계: 광고주별 순위 추적 (운영자가 광고주 1명당 키워드 1개를 설정하고 순위를 기록 → 광고주는 본인 것만 봄)
-- 순위 값은 자동 수집이 아니라 운영자가 확인해서 입력합니다. (자동 수집은 네이버 약관 확인 후 결정)
-- Supabase > SQL Editor 에 붙여넣고 Run. (008 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

create table public.rank_trackers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,   -- 광고주 1명당 1개
  keyword text not null check (char_length(keyword) between 1 and 40),
  place_name text check (place_name is null or char_length(place_name) <= 60),
  place_url text check (place_url is null or char_length(place_url) <= 300),
  created_at timestamptz not null default now()
);

create table public.rank_logs (
  id bigint generated always as identity primary key,
  tracker_id uuid not null references public.rank_trackers(id) on delete cascade,
  day date not null,
  rank int check (rank is null or rank between 1 and 1000),
  out_of_rank boolean not null default false,                -- true = '순위 밖'
  visitor_reviews int check (visitor_reviews is null or visitor_reviews >= 0),
  blog_reviews int check (blog_reviews is null or blog_reviews >= 0),
  competitors int check (competitors is null or competitors >= 0),
  created_at timestamptz not null default now(),
  unique (tracker_id, day)
);

alter table public.rank_trackers enable row level security;
alter table public.rank_logs enable row level security;

create or replace function public.owns_tracker(tid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.rank_trackers where id = tid and owner_id = auth.uid())
$$;
grant execute on function public.owns_tracker(uuid) to authenticated;

-- 조회: 본인 것 또는 운영자 / 쓰기: 운영자만
create policy "추적: 본인 또는 운영자 조회" on public.rank_trackers for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "추적: 운영자 등록" on public.rank_trackers for insert to authenticated with check (public.is_admin());
create policy "추적: 운영자 수정" on public.rank_trackers for update to authenticated using (public.is_admin());
create policy "추적: 운영자 삭제" on public.rank_trackers for delete to authenticated using (public.is_admin());

create policy "기록: 본인 또는 운영자 조회" on public.rank_logs for select to authenticated using (public.owns_tracker(tracker_id) or public.is_admin());
create policy "기록: 운영자 등록" on public.rank_logs for insert to authenticated with check (public.is_admin());
create policy "기록: 운영자 수정" on public.rank_logs for update to authenticated using (public.is_admin());
create policy "기록: 운영자 삭제" on public.rank_logs for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.rank_trackers, public.rank_logs to authenticated;
