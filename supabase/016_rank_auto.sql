-- 16단계: 순위 자동 수집 준비 — 추적 설정에 플레이스 ID·기준 좌표·자동 수집 스위치 추가
-- Supabase > SQL Editor 에 붙여넣고 Run. (014 이후) 아직 실제 실행해 검증하지 않은 초안입니다.
alter table public.rank_trackers
  add column if not exists place_id text check (place_id is null or place_id ~ '^[0-9]{5,15}$'),   -- 플레이스 주소 속 숫자
  add column if not exists lat double precision check (lat is null or lat between -90 and 90),      -- 기준 위치 (순위는 검색 위치에 따라 달라짐)
  add column if not exists lng double precision check (lng is null or lng between -180 and 180),
  add column if not exists auto_collect boolean not null default false,                              -- true 인 추적만 자동 수집
  add column if not exists last_collected_at timestamptz,
  add column if not exists last_error text;
