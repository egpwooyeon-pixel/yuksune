-- 25단계: 정보 가이드 글 초안(guide_drafts) + 운영자 검수·승인
-- · 초안은 Edge Function `aeo-draft`(운영자 전용)가 만들어요. 이 표는 브라우저가 직접 쓸 수 없고(읽기만 운영자), 쓰기는 서버 함수와 아래 승인 함수로만 해요.
-- · AI 가 쓴 글은 **초안**이에요. 승인(approve)은 운영자가 검수 메모(5자 이상)를 남겨야 하고, 자동 검사에서 "차단" 항목이 남아 있으면 승인할 수 없어요.
-- · 승인된 글만 다음 단계(공개 발행)로 넘어가요. 이 SQL 은 공개까지 하지 않아요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (008, 021 이후) 아직 실제 Supabase 에서 실행해 검증하지 않은 초안입니다.

create table if not exists public.guide_drafts (
  id bigint generated always as identity primary key,
  inquiry_id bigint references public.inquiries(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  business jsonb not null check (jsonb_typeof(business) = 'object' and pg_column_size(business) <= 8000),
  facts jsonb not null default '[]'::jsonb check (jsonb_typeof(facts) = 'array' and pg_column_size(facts) <= 8000),
  article jsonb not null check (jsonb_typeof(article) = 'object' and pg_column_size(article) <= 60000),
  lint jsonb not null default '[]'::jsonb,          -- [{"level":"block"|"warn","code":"...","msg":"..."}]
  blocking int not null default 0 check (blocking >= 0),   -- 차단 항목 수 (0 이어야 승인 가능)
  model text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  exported_at timestamptz                          -- 승인된 글을 사이트용 파일로 내보낸 시각 (tools/export-approved.mjs 가 기록)
);
-- 이미 이 표를 만든 경우에도 안전하게 실행돼요
alter table public.guide_drafts add column if not exists exported_at timestamptz;
create index if not exists guide_drafts_status_idx on public.guide_drafts (status, created_at desc);
alter table public.guide_drafts enable row level security;
revoke all on public.guide_drafts from anon, authenticated;
drop policy if exists "초안: 운영자만 조회" on public.guide_drafts;
create policy "초안: 운영자만 조회" on public.guide_drafts for select to authenticated using (public.is_admin());
grant select on public.guide_drafts to authenticated;     -- 쓰기 권한은 주지 않음 (서버 함수 service_role 과 아래 승인 함수만)

-- 승인/반려: 운영자만, 검수 메모 필수, 초안 상태에서만, 차단 항목이 있으면 승인 불가
create or replace function public.review_guide_draft(p_id bigint, p_action text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.guide_drafts;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'bad_action'; end if;
  if p_note is null or char_length(btrim(p_note)) < 5 then raise exception 'note_required'; end if;
  select * into d from public.guide_drafts where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if d.status <> 'draft' then raise exception 'not_draft'; end if;
  if p_action = 'approve' and d.blocking > 0 then raise exception 'blocking_issues'; end if;
  update public.guide_drafts set status = case p_action when 'approve' then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = btrim(p_note), updated_at = now() where id = p_id;
end $$;
revoke all on function public.review_guide_draft(bigint, text, text) from public, anon;
grant execute on function public.review_guide_draft(bigint, text, text) to authenticated;
