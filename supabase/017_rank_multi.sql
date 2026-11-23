-- 17단계: 순위 추적을 '매장 1개에 키워드 여러 개'로 확장 (캠페인과 연결, 추적 중지, 출처·상태 기록)
-- Supabase > SQL Editor 에 붙여넣고 Run. (014 이후, 016 은 안 해도 이 파일에 같은 칸이 들어 있어요) 아직 실제 실행해 검증하지 않은 초안입니다.

-- 1) 광고주 1명당 1개 제한 풀기 → 매장(캠페인)마다, 키워드마다 한 줄
alter table public.rank_trackers drop constraint if exists rank_trackers_owner_id_key;
alter table public.rank_trackers
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,   -- 연결된 캠페인(없을 수도 있음)
  add column if not exists active boolean not null default true,                                   -- false = 추적 중지
  add column if not exists place_id text check (place_id is null or place_id ~ '^[0-9]{5,15}$'),
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists auto_collect boolean not null default false,
  add column if not exists last_collected_at timestamptz,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();
-- 같은 광고주의 같은 캠페인에 같은 키워드를 두 번 등록하는 것 방지
create unique index if not exists rank_trackers_kw_uniq
  on public.rank_trackers (owner_id, coalesce(campaign_id::text, '-'), lower(keyword));

-- 2) 기록에 상태·출처·조회 시각·키워드 기록 추가
--    status: ok(정상 순위) / out(조회 범위 밖) / failed(조회 실패). 기록 자체가 없으면 '미수집'
alter table public.rank_logs
  add column if not exists status text not null default 'ok' check (status in ('ok','out','failed')),
  add column if not exists source text not null default 'manual' check (source in ('manual','provider')),   -- manual = 수동 확인
  add column if not exists keyword text,                                                                      -- 그날 조회한 키워드 (전일 대비를 같은 조건끼리만 계산하려고)
  add column if not exists checked_at timestamptz not null default now();
update public.rank_logs set status = 'out' where out_of_rank is true and status = 'ok';
update public.rank_logs l set keyword = t.keyword from public.rank_trackers t where l.tracker_id = t.id and l.keyword is null;
