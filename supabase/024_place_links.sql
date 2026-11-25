-- 24단계: 업플로우 추적 키워드 ↔ 우리들 체험단 매장·캠페인 연결 (관리자 > 네이버 플레이스)
-- · upflow_keyword_id = 업플로우의 '추적 키워드 ID', upflow_place_id = '네이버 플레이스 ID' (서로 다른 값이라 따로 저장해요)
-- · 순위 데이터 자체는 저장하지 않고(업플로우에서 읽어 옴), 연결 정보(매장명·캠페인·그룹·메모·시작일)만 저장해요.
-- · 운영자(public.is_admin())만 읽고 쓸 수 있어요. Supabase > SQL Editor 에 붙여넣고 Run. (008 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

create table if not exists public.place_links (
  upflow_keyword_id text primary key check (char_length(upflow_keyword_id) between 1 and 64),
  upflow_place_id text check (upflow_place_id is null or char_length(upflow_place_id) <= 30),
  store_name text check (store_name is null or char_length(store_name) <= 60),
  campaign_id uuid references public.campaigns(id) on delete set null,
  group_name text check (group_name is null or char_length(group_name) <= 30),
  memo text check (memo is null or char_length(memo) <= 300),
  start_day date,                                     -- 비우면 연결한 캠페인의 등록일(한국 시간)을 시작일로 써요
  updated_at timestamptz not null default now()
);
create index if not exists place_links_campaign_idx on public.place_links (campaign_id);

alter table public.place_links enable row level security;

drop policy if exists "플레이스 연결: 운영자만 조회" on public.place_links;
create policy "플레이스 연결: 운영자만 조회" on public.place_links for select to authenticated using (public.is_admin());
drop policy if exists "플레이스 연결: 운영자만 등록" on public.place_links;
create policy "플레이스 연결: 운영자만 등록" on public.place_links for insert to authenticated with check (public.is_admin());
drop policy if exists "플레이스 연결: 운영자만 수정" on public.place_links;
create policy "플레이스 연결: 운영자만 수정" on public.place_links for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "플레이스 연결: 운영자만 삭제" on public.place_links;
create policy "플레이스 연결: 운영자만 삭제" on public.place_links for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.place_links to authenticated;
