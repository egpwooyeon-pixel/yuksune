-- 28단계: 인플루언서 커뮤니티는 승인된 인플루언서만, 대행사 커뮤니티는 승인된 대행사만 (읽기·글쓰기·댓글 모두)
-- · 회원이 '커뮤니티 가입 신청'(community_req)을 하면 운영자가 확인해서 승인(community)해요. 회원이 스스로 승인 값을 바꿀 수는 없어요.
-- · 규칙은 DB(RLS)에서 강제해요. 주소를 직접 입력하거나 화면을 우회해도 다른 유형 회원에게는 글·댓글이 보이지 않아요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (004·009·027 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

alter table public.profiles
  add column if not exists community text check (community in ('influencer','agency')),          -- 운영자가 승인한 유형
  add column if not exists community_req text check (community_req in ('influencer','agency'));  -- 회원이 신청한 유형

-- 일반 회원은 승인 값(community)을 바꿀 수 없음 (신청 값 community_req 만 바꿀 수 있음)
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
declare is_admin boolean;
begin
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
  if auth.uid() is not null and not is_admin then
    new.role := old.role;
    new.business_note := old.business_note;
    new.community := old.community;
    if not (new.business_status = 'pending' and old.business_status in ('none','rejected')
            and new.business_doc_path is not null) then
      new.business_status := old.business_status;
      if old.business_status in ('approved','pending') then
        new.business_doc_path := old.business_doc_path;
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.my_community() returns text
language sql security definer stable set search_path = public as $$
  select community from public.profiles where id = auth.uid()
$$;
create or replace function public.can_read_board(b text) returns boolean
language sql security definer stable set search_path = public as $$
  select b not in ('influencer','agency') or public.is_admin() or public.my_community() = b
$$;
create or replace function public.post_visible(pid bigint) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select public.can_read_board(board) from public.posts where id = pid), false)
$$;
grant execute on function public.my_community() to anon, authenticated;
grant execute on function public.can_read_board(text) to anon, authenticated;
grant execute on function public.post_visible(bigint) to anon, authenticated;

-- 글: 조회·작성
drop policy if exists "글: 누구나 조회" on public.posts;
drop policy if exists "글: 게시판 접근 조회" on public.posts;
create policy "글: 게시판 접근 조회" on public.posts for select using (public.can_read_board(board));
drop policy if exists "글: 로그인 회원 작성 (공지는 운영자만)" on public.posts;
create policy "글: 로그인 회원 작성 (공지는 운영자만)" on public.posts for insert to authenticated
  with check (author_id = auth.uid() and (is_notice = false or public.is_admin()) and (board <> 'notice' or public.is_admin()) and public.can_read_board(board));

-- 댓글: 조회·작성 (그 글을 볼 수 있을 때만)
drop policy if exists "댓글: 누구나 조회" on public.comments;
drop policy if exists "댓글: 글 접근 조회" on public.comments;
create policy "댓글: 글 접근 조회" on public.comments for select using (public.post_visible(post_id));
drop policy if exists "댓글: 로그인 회원 작성" on public.comments;
create policy "댓글: 로그인 회원 작성" on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.post_visible(post_id));
