-- 5단계: 게시판 추가 (플레이스 사장님 커뮤니티 'place', E-커머스 사장님 커뮤니티 'ecom')
-- 기존 값(free, tips, profit)도 허용 목록에 남겨 둡니다 (이미 쓴 시험 글이 있어도 오류가 나지 않게).
-- Supabase > SQL Editor 에 붙여넣고 Run. 아직 실제 실행해 검증하지 않은 초안입니다.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%board%'
  loop
    execute format('alter table public.posts drop constraint %I', c);
  end loop;
end $$;
alter table public.posts add constraint posts_board_check check (board in ('free','tips','profit','place','ecom'));
