-- 8단계: 관리자 페이지(admin.html)용 — 운영자만 쓸 수 있는 집계/조회 함수와 권한
-- Supabase > SQL Editor 에 붙여넣고 Run. (004 의 is_admin() 함수가 있어야 함) 아직 실제 실행해 검증하지 않은 초안입니다.
-- 운영자 지정: update public.profiles set role = 'admin' where id = (select id from auth.users where email = '내 이메일');

-- 운영자는 모든 체험단을 마감/삭제할 수 있음
create policy "캠페인: 운영자 수정" on public.campaigns for update to authenticated using (public.is_admin());
create policy "캠페인: 운영자 삭제" on public.campaigns for delete to authenticated using (public.is_admin());

-- 기간별 요약 숫자
create or replace function public.admin_overview(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'members_total',   (select count(*) from public.profiles),
    'members_new',     (select count(*) from public.profiles   where (created_at at time zone 'Asia/Seoul')::date between p_from and p_to),
    'campaigns_total', (select count(*) from public.campaigns),
    'campaigns_open',  (select count(*) from public.campaigns where status = 'open' and deadline >= current_date),
    'campaigns_new',   (select count(*) from public.campaigns where (created_at at time zone 'Asia/Seoul')::date between p_from and p_to),
    'apps_total',      (select count(*) from public.applications),
    'apps_new',        (select count(*) from public.applications where (created_at at time zone 'Asia/Seoul')::date between p_from and p_to),
    'apps_selected_new',(select count(*) from public.applications where status = 'selected' and (created_at at time zone 'Asia/Seoul')::date between p_from and p_to),
    'posts_new',       (select count(*) from public.posts      where (created_at at time zone 'Asia/Seoul')::date between p_from and p_to),
    'biz_approved',    (select count(*) from public.profiles where business_status = 'approved'),
    'biz_pending',     (select count(*) from public.profiles where business_status = 'pending'),
    'by_type',         (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
                        from (select type, count(*) n from public.campaigns
                              where (created_at at time zone 'Asia/Seoul')::date between p_from and p_to group by type) t)
  ) into r;
  return r;
end $$;

-- 일별 가입/체험단/신청/글 수 (최대 400일)
create or replace function public.admin_daily(p_from date, p_to date)
returns table (day date, members int, campaigns int, apps int, posts int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_to - p_from > 400 then raise exception 'range_too_long'; end if;
  return query
  select d::date,
    (select count(*) from public.profiles     where (created_at at time zone 'Asia/Seoul')::date = d::date)::int,
    (select count(*) from public.campaigns    where (created_at at time zone 'Asia/Seoul')::date = d::date)::int,
    (select count(*) from public.applications where (created_at at time zone 'Asia/Seoul')::date = d::date)::int,
    (select count(*) from public.posts        where (created_at at time zone 'Asia/Seoul')::date = d::date)::int
  from generate_series(p_from, p_to, interval '1 day') d;
end $$;

-- 최근 신청 (연락처는 포함하지 않음)
create or replace function public.admin_recent_applications(lim int)
returns table (id uuid, created_at timestamptz, applicant_name text, status text, campaign_id uuid, campaign_title text, biz text, campaign_type text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select a.id, a.created_at, a.applicant_name, a.status, a.campaign_id, c.title, c.biz, c.type
  from public.applications a join public.campaigns c on c.id = a.campaign_id
  order by a.created_at desc limit least(greatest(lim, 1), 200);
end $$;

-- 회원 목록 (이메일 포함 — 운영자만)
create or replace function public.admin_members(p_search text, p_lim int, p_off int)
returns table (id uuid, nickname text, email text, role text, business_status text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.nickname, u.email::text, p.role, p.business_status, p.created_at
  from public.profiles p join auth.users u on u.id = p.id
  where p_search is null or p_search = '' or p.nickname ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%'
  order by p.created_at desc limit least(greatest(p_lim, 1), 200) offset greatest(p_off, 0);
end $$;

revoke all on function public.admin_overview(date, date), public.admin_daily(date, date),
  public.admin_recent_applications(int), public.admin_members(text, int, int) from public, anon;
grant execute on function public.admin_overview(date, date), public.admin_daily(date, date),
  public.admin_recent_applications(int), public.admin_members(text, int, int) to authenticated;
