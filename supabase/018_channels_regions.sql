-- 18단계: 체험단 채널에 '유튜브' 추가, 지역을 시·도 단위로 확대 (기존 값도 그대로 허용)
-- Supabase > SQL Editor 에 붙여넣고 Run. 아직 실제 실행해 검증하지 않은 초안입니다.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.campaigns'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) like '%블로그%' or pg_get_constraintdef(oid) like '%수도권%')
  loop
    execute format('alter table public.campaigns drop constraint %I', c);
  end loop;
end $$;
alter table public.campaigns add constraint campaigns_type_check check (type in ('블로그','구매평','인스타','유튜브'));
alter table public.campaigns add constraint campaigns_region_check check (region in
  ('서울','수도권','지방','제주','경기','인천','강원','대전','세종','충남','충북','부산','울산','경남','경북','대구','광주','전남','전북'));
