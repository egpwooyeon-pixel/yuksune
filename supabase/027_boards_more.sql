-- 27단계: 커뮤니티 게시판 추가 — 인플루언서 커뮤니티(influencer), 대행사 커뮤니티(agency)
-- 기존 게시판 값(notice, place, ecom, review, free, tips, profit)은 그대로 허용합니다.
-- Supabase > SQL Editor 에 붙여넣고 Run. (009 이후) 아직 실제 실행해 검증하지 않은 초안입니다.
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
  check (board in ('notice','place','ecom','influencer','agency','review','free','tips','profit'));
