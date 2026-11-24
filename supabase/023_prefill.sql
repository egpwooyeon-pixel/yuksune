-- 23단계: 홈페이지 자동 채우기(Edge Function aeo-prefill) — 이용 한도
-- · 서버가 방문자가 넣은 주소로 접속하는 기능이라, 남용을 막기 위해 IP(해시값)당 1시간 N회로 제한합니다. (N 은 함수 환경변수 PREFILL_HOURLY_LIMIT, 기본 20)
-- · 표와 함수는 Edge Function(service_role)만 쓸 수 있고 브라우저(anon/authenticated)는 접근할 수 없어요.
-- · 원본 IP 는 저장하지 않고 해시값만 저장하며, 2일이 지난 기록은 자동 삭제돼요.
-- Supabase > SQL Editor 에 붙여넣고 Run. 아직 실제 Supabase 에서 실행해 검증하지 않은 초안입니다.

create table if not exists public.prefill_calls (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists prefill_calls_ip_idx on public.prefill_calls (ip_hash, created_at desc);
alter table public.prefill_calls enable row level security;       -- 정책을 만들지 않음 = anon/authenticated 접근 불가
revoke all on public.prefill_calls from anon, authenticated;

-- 한도 확인 + 기록. 한도 안이면 true, 넘으면 false (동시에 여러 요청이 와도 넘지 않도록 잠금을 잡고 셈)
create or replace function public.reserve_prefill(p_ip text, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('prefill_calls'));
  delete from public.prefill_calls where created_at < now() - interval '2 days';
  select count(*) into n from public.prefill_calls where ip_hash = p_ip and created_at > now() - interval '1 hour';
  if n >= p_limit then return false; end if;
  insert into public.prefill_calls (ip_hash) values (p_ip);
  return true;
end $$;

revoke all on function public.reserve_prefill(text, int) from public, anon, authenticated;
grant execute on function public.reserve_prefill(text, int) to service_role;
