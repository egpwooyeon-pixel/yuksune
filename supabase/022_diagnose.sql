-- 22단계: AI 노출 진단(Edge Function aeo-diagnose) — 이용 한도·결과 캐시
-- · 방문자에게 무료로 열어 두는 기능이라, 유료 API(Gemini) 남용을 막기 위해 한도를 서버(DB)에서 셉니다.
--     - IP(해시값만 저장)당 24시간 N회, 전체 24시간 M회 (숫자는 Edge Function 환경변수로 조정)
--     - 같은 조건(업체명+지역+업종)은 24시간 안에 다시 측정하지 않고 저장된 결과를 보여 줌
-- · 이 표와 함수는 Edge Function(service_role)만 쓸 수 있고, 브라우저(anon/authenticated)는 접근할 수 없어요.
-- · 개인정보: 원본 IP는 저장하지 않고 salt 를 섞은 해시만 저장해요. 결과는 30일 뒤 자동 삭제돼요.
-- Supabase > SQL Editor 에 붙여넣고 Run. 아직 실제 Supabase 에서 실행해 검증하지 않은 초안입니다.
-- (같은 SQL을 로컬 PostgreSQL 16 에서 한도·캐시·접근 차단·30일 삭제 동작을 시험했습니다.)

create table if not exists public.diagnose_runs (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  cache_key text not null,
  brand text not null,
  region text,
  industry text,
  status text not null default 'reserved' check (status in ('reserved','ok','failed')),
  result jsonb,
  created_at timestamptz not null default now()
);
create index if not exists diagnose_runs_ip_idx on public.diagnose_runs (ip_hash, created_at desc);
create index if not exists diagnose_runs_cache_idx on public.diagnose_runs (cache_key, created_at desc);
alter table public.diagnose_runs enable row level security;       -- 정책을 만들지 않음 = anon/authenticated 접근 불가
revoke all on public.diagnose_runs from anon, authenticated;

-- 24시간 안에 같은 조건으로 성공한 결과가 있으면 돌려줌
create or replace function public.get_cached_diagnose(p_key text) returns jsonb
language sql security definer set search_path = public as $$
  select result from public.diagnose_runs
  where cache_key = p_key and status = 'ok' and created_at > now() - interval '24 hours'
  order by created_at desc limit 1
$$;

-- 한도 확인 + 자리 예약 (동시에 여러 요청이 와도 한도를 넘지 않도록 잠금을 잡고 셈)
--   성공: {"ok":true,"id":123}   실패: {"ok":false,"reason":"ip_limit" | "global_limit"}
create or replace function public.reserve_diagnose(p_ip text, p_key text, p_brand text, p_region text, p_industry text, p_ip_limit int, p_global_limit int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_ip int; n_all int; new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('diagnose_runs'));
  delete from public.diagnose_runs where created_at < now() - interval '30 days';
  select count(*) into n_ip from public.diagnose_runs
    where ip_hash = p_ip and status <> 'failed' and created_at > now() - interval '24 hours';
  if n_ip >= p_ip_limit then return jsonb_build_object('ok', false, 'reason', 'ip_limit'); end if;
  select count(*) into n_all from public.diagnose_runs where created_at > now() - interval '24 hours';   -- 실패한 호출도 비용이 들 수 있어 전체 한도에는 포함
  if n_all >= p_global_limit then return jsonb_build_object('ok', false, 'reason', 'global_limit'); end if;
  insert into public.diagnose_runs (ip_hash, cache_key, brand, region, industry) values (p_ip, p_key, p_brand, p_region, p_industry) returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

create or replace function public.finish_diagnose(p_id bigint, p_status text, p_result jsonb) returns void
language sql security definer set search_path = public as $$
  update public.diagnose_runs set status = p_status, result = p_result where id = p_id and status = 'reserved'
$$;

revoke all on function public.get_cached_diagnose(text) from public, anon, authenticated;
revoke all on function public.reserve_diagnose(text, text, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.finish_diagnose(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.get_cached_diagnose(text) to service_role;
grant execute on function public.reserve_diagnose(text, text, text, text, text, int, int) to service_role;
grant execute on function public.finish_diagnose(bigint, text, jsonb) to service_role;
