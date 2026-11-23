-- 9단계: 게시판 확정 — notice(공지사항, 운영자만 글쓰기), place, ecom, review(체험단 후기·노하우)
-- 기존 값(free, tips, profit)도 허용 목록에 남겨 둡니다 (이미 쓴 시험 글이 있어도 오류가 나지 않게).
-- Supabase > SQL Editor 에 붙여넣고 Run. (004, 005 이후) 아직 실제 실행해 검증하지 않은 초안입니다.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%board%'
  loop
    execute format('alter table public.posts drop constraint %I', c);
  end loop;
end $$;
alter table public.posts add constraint posts_board_check
  check (board in ('notice','place','ecom','review','free','tips','profit'));

-- 공지사항 게시판과 '공지로 등록'은 운영자만
drop policy if exists "글: 로그인 회원 작성 (공지는 운영자만)" on public.posts;
create policy "글: 로그인 회원 작성 (공지는 운영자만)" on public.posts for insert to authenticated
  with check (author_id = auth.uid() and (is_notice = false or public.is_admin()) and (board <> 'notice' or public.is_admin()));
