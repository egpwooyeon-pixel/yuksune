-- 27단계: 리뷰 기반 AI 원고(review_drafts) — 체험단 매장 리뷰로 블로그 원고를 쓰고 운영자가 검수
-- · 원고는 Edge Function `review-draft`(운영자 전용)가 만들어요. 이 표는 브라우저가 직접 쓸 수 없고(읽기만 운영자), 쓰기는 서버 함수와 아래 검수 함수로만 해요.
-- · AI 가 쓴 글은 **초안**이에요. 여기서 "승인"은 공개 발행을 뜻하지 않습니다 — 이 서비스는 발행 파이프라인이 없고, 운영자가 원고를 복사해서 네이버 블로그 등에 직접 올리는 것을 전제로 합니다. "승인"은 검수를 마쳤다는 기록일 뿐입니다.
-- · 입력(업체 정보·리뷰·사진 URL)은 운영자가 직접 붙여넣습니다(리뷰 수집 자동화는 이 단계에 포함되지 않음 — 크롬 확장프로그램으로 모은 뒤 CSV에서 옮겨 붙이는 방식을 전제로 합니다).
-- Supabase > SQL Editor 에 붙여넣고 Run. (008 이후) 아직 실제 Supabase 에서 실행해 검증하지 않은 초안입니다.

create table if not exists public.review_drafts (
  id bigint generated always as identity primary key,
  kind text not null default 'blog' check (kind in ('blog', 'threads')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  business jsonb not null check (jsonb_typeof(business) = 'object' and pg_column_size(business) <= 4000),
  reviews jsonb not null default '[]'::jsonb check (jsonb_typeof(reviews) = 'array' and pg_column_size(reviews) <= 40000),
  photo_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(photo_urls) = 'array' and pg_column_size(photo_urls) <= 8000),
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) <= 60000),
  model text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000)
);
create index if not exists review_drafts_status_idx on public.review_drafts (status, created_at desc);
alter table public.review_drafts enable row level security;
revoke all on public.review_drafts from anon, authenticated;
drop policy if exists "리뷰원고: 운영자만 조회" on public.review_drafts;
create policy "리뷰원고: 운영자만 조회" on public.review_drafts for select to authenticated using (public.is_admin());
grant select on public.review_drafts to authenticated;     -- 쓰기 권한은 주지 않음 (서버 함수 service_role 과 아래 검수 함수만)

-- 검수 완료 표시: 운영자만, 검수 메모 필수, 초안 상태에서만. guide_drafts 와 달리 "차단 항목" 개념이 없어요(리뷰 기반 홍보 원고에는 과장 금지어 규칙을 적용하지 않음 — 의료광고 규정 대상인 EGP 글과 성격이 다름).
create or replace function public.review_review_draft(p_id bigint, p_action text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.review_drafts;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'bad_action'; end if;
  if p_note is null or char_length(btrim(p_note)) < 5 then raise exception 'note_required'; end if;
  select * into d from public.review_drafts where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if d.status <> 'draft' then raise exception 'not_draft'; end if;
  update public.review_drafts set status = case p_action when 'approve' then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = btrim(p_note), updated_at = now() where id = p_id;
end $$;
revoke all on function public.review_review_draft(bigint, text, text) from public, anon;
grant execute on function public.review_review_draft(bigint, text, text) to authenticated;
