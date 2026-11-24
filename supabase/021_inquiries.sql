-- 21단계: 랜딩 페이지 문의(landing.html) 저장
-- · 누구나(비회원 포함) 문의를 "등록"만 할 수 있고, 조회·수정·삭제는 운영자(public.is_admin())만 가능해요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (008 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

create table if not exists public.inquiries (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 50),
  phone text not null check (char_length(phone) between 7 and 20),
  email text check (email is null or char_length(email) <= 120),
  company text check (company is null or char_length(company) <= 100),
  topic text check (topic is null or char_length(topic) <= 50),
  website text check (website is null or (char_length(website) <= 200 and website ~* '^https?://')),
  message text not null default '' check (char_length(message) <= 3000),   -- 문의 내용은 선택 입력
  agreed boolean not null check (agreed),            -- 개인정보 수집·이용 동의 (필수)
  status text not null default 'new' check (status in ('new','done')),
  created_at timestamptz not null default now()
);
create index if not exists inquiries_created_idx on public.inquiries (created_at desc);

alter table public.inquiries enable row level security;

drop policy if exists "문의: 누구나 등록" on public.inquiries;
create policy "문의: 누구나 등록" on public.inquiries for insert to anon, authenticated
  with check (agreed and status = 'new');

drop policy if exists "문의: 운영자만 조회" on public.inquiries;
create policy "문의: 운영자만 조회" on public.inquiries for select to authenticated
  using (public.is_admin());

drop policy if exists "문의: 운영자만 수정" on public.inquiries;
create policy "문의: 운영자만 수정" on public.inquiries for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "문의: 운영자만 삭제" on public.inquiries;
create policy "문의: 운영자만 삭제" on public.inquiries for delete to authenticated
  using (public.is_admin());

grant insert on public.inquiries to anon, authenticated;
grant select, update, delete on public.inquiries to authenticated;
