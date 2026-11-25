-- 26단계: 업플로우 웹훅 수신 기록 (관리자 > 네이버 플레이스가 '이 키워드의 이력을 다시 읽으라'는 신호로 사용)
-- · 웹훅 수신 함수(upflow-webhook)가 서명을 확인한 뒤 이 표에 한 줄씩 기록해요. 순위 데이터 자체는 저장하지 않아요.
-- · delivery_id(X-UpFlow-Delivery)가 기본키라 같은 전달이 두 번 와도 한 번만 기록돼요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (008 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

create table if not exists public.upflow_events (
  delivery_id text primary key check (char_length(delivery_id) between 1 and 100),
  event text not null check (event in ('rank.changed', 'refresh.completed', 'refresh.failed')),
  keyword_id text check (keyword_id is null or char_length(keyword_id) <= 64),
  received_at timestamptz not null default now(),
  handled_at timestamptz                                   -- 관리자 화면이 이력을 다시 읽으면 채워져요
);
create index if not exists upflow_events_open_idx on public.upflow_events (received_at desc) where handled_at is null;

alter table public.upflow_events enable row level security;
drop policy if exists "업플로우 이벤트: 운영자 조회" on public.upflow_events;
create policy "업플로우 이벤트: 운영자 조회" on public.upflow_events for select to authenticated using (public.is_admin());
drop policy if exists "업플로우 이벤트: 운영자 처리" on public.upflow_events;
create policy "업플로우 이벤트: 운영자 처리" on public.upflow_events for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- 등록(insert)은 정책이 없어요: 웹훅 함수가 서버 키로만 기록합니다.
grant select, update on public.upflow_events to authenticated;
