-- 20단계: SerpApi 연동 — 조회 횟수 한도(하루 5회·월 200회, 한국 시간), 활성 키워드 5개 제한, 자동 수집 스위치
-- Supabase > SQL Editor 에 붙여넣고 Run. (017 이후) 아직 실제 Supabase 에서 실행해 검증하지 않은 초안입니다.
-- (같은 SQL을 로컬 PostgreSQL 에서 한도·동시 요청 동작을 시험했습니다.)

-- 1) 설정 저장 (자동 수집 on/off). 기본은 꺼짐.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "설정: 운영자 조회" on public.app_settings;
drop policy if exists "설정: 운영자 변경" on public.app_settings;
create policy "설정: 운영자 조회" on public.app_settings for select to authenticated using (public.is_admin());
create policy "설정: 운영자 변경" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.app_settings to authenticated;
insert into public.app_settings (key, value) values ('rank_auto', 'false'::jsonb) on conflict (key) do nothing;

-- 2) SerpApi 호출 기록 (성공/실패/진행 중 모두 한도에 포함)
create table if not exists public.serp_calls (
  id bigint generated always as identity primary key,
  keyword text not null,
  source text not null check (source in ('manual','cron')),
  status text not null default 'reserved' check (status in ('reserved','ok','failed')),
  error text,
  tracker_count int,
  day date not null default ((now() at time zone 'Asia/Seoul')::date),   -- 한국 시간 기준 날짜
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists serp_calls_day_idx on public.serp_calls (day);
alter table public.serp_calls enable row level security;   -- 정책을 만들지 않음 = 화면에서 직접 읽기·쓰기 불가 (서버 함수만 사용)

-- 3) 조회 예약: 한도 확인 + 동시 요청 방지를 한 번에 (서버 전용). API 호출 '전에' 부릅니다.
create or replace function public.reserve_serp_call(p_keyword text, p_source text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  mstart date := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
  d int; m int; new_id bigint;
begin
  perform pg_advisory_xact_lock(7420001);                                   -- 모든 예약을 한 줄로 세움 (동시에 와도 한도 초과·중복 호출 없음)
  update public.serp_calls set status = 'failed', error = 'timeout', finished_at = now()
   where status = 'reserved' and created_at < now() - interval '5 minutes';   -- 끝나지 않은 오래된 예약 정리 (한도에는 그대로 포함)
  if exists (select 1 from public.serp_calls where lower(keyword) = lower(p_keyword) and status = 'reserved') then
    return jsonb_build_object('ok', false, 'reason', 'in_progress');          -- 같은 키워드가 조회 중
  end if;
  select count(*) filter (where day = today), count(*) filter (where day >= mstart) into d, m from public.serp_calls;
  if d >= 5 then return jsonb_build_object('ok', false, 'reason', 'daily_limit', 'daily_used', d, 'monthly_used', m); end if;
  if m >= 200 then return jsonb_build_object('ok', false, 'reason', 'monthly_limit', 'daily_used', d, 'monthly_used', m); end if;
  insert into public.serp_calls (keyword, source) values (p_keyword, p_source) returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id, 'daily_used', d + 1, 'monthly_used', m + 1);
end $$;

create or replace function public.finish_serp_call(p_id bigint, p_status text, p_error text, p_count int) returns void
language sql security definer set search_path = public as $$
  update public.serp_calls set status = p_status, error = left(p_error, 200), tracker_count = p_count, finished_at = now()
   where id = p_id and status = 'reserved'
$$;
revoke all on function public.reserve_serp_call(text, text), public.finish_serp_call(bigint, text, text, int) from public, anon, authenticated;
grant execute on function public.reserve_serp_call(text, text), public.finish_serp_call(bigint, text, text, int) to service_role;

-- 4) 관리자 화면용: 오늘/이번 달 사용량
create or replace function public.serp_usage() returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  mstart date := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
  d int; m int; k int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select count(*) filter (where day = today), count(*) filter (where day >= mstart) into d, m from public.serp_calls;
  select count(distinct lower(keyword)) into k from public.rank_trackers where active;
  return jsonb_build_object('daily_used', d, 'daily_limit', 5, 'monthly_used', m, 'monthly_limit', 200, 'active_keywords', k, 'keyword_limit', 5);
end $$;
revoke all on function public.serp_usage() from public, anon;
grant execute on function public.serp_usage() to authenticated;

-- 5) 활성 검색 키워드(서로 다른 키워드) 최대 5개
create or replace function public.enforce_keyword_limit() returns trigger
language plpgsql set search_path = public as $$
declare n int;
begin
  if new.active then
    select count(distinct lower(k)) into n from (
      select keyword as k from public.rank_trackers where active and id <> new.id
      union all select new.keyword) s;
    if n > 5 then raise exception 'keyword_limit'; end if;
  end if;
  return new;
end $$;
drop trigger if exists rank_trackers_keyword_limit on public.rank_trackers;
create trigger rank_trackers_keyword_limit before insert or update of keyword, active on public.rank_trackers
  for each row execute function public.enforce_keyword_limit();

-- (선택) 자동 수집을 하루 한 번 돌리려면: Supabase 에서 pg_cron·pg_net 확장을 켠 뒤 아래를 실행 (한국 시간 오전 9시 = UTC 0시).
-- <프로젝트주소>·<CRON_SECRET 값> 은 직접 바꿔 넣으세요. 자동 수집 스위치가 꺼져 있으면 호출해도 아무 일도 하지 않아요.
-- select cron.schedule('woori-rank-daily', '0 0 * * *', $$
--   select net.http_post(url := 'https://<프로젝트주소>.supabase.co/functions/v1/collect-ranks',
--     headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET 값>"}'::jsonb, body := '{}'::jsonb) $$);
