-- 34단계: 광고주 인증에 '대표자 핸드폰번호' 추가 (사업자등록번호 + 대표자 이름 + 대표자 핸드폰번호)
-- · 핸드폰번호는 형식(010-0000-0000 등 국내 휴대전화)만 확인해요. 문자 인증은 하지 않아요.
-- · 이미 인증을 마친 회원은 화면에서 핸드폰번호만 추가·변경할 수 있어요 (update_business_phone).
-- Supabase > SQL Editor 에 붙여넣고 Run. (033 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

alter table public.profiles
  add column if not exists business_phone text check (business_phone is null or business_phone ~ '^01[016789][0-9]{7,8}$');

create or replace function public.clean_phone(p text) returns text
language sql immutable as $$
  select case when regexp_replace(coalesce(p, ''), '\D', '', 'g') ~ '^01[016789][0-9]{7,8}$' then regexp_replace(p, '\D', '', 'g') end
$$;
grant execute on function public.clean_phone(text) to authenticated;

-- 광고주 인증: 사업자등록번호 + 대표자 이름 + 대표자 핸드폰번호 (이전 2개 입력 버전은 지움)
drop function if exists public.submit_business(text, text);
create or replace function public.submit_business(p_no text, p_ceo text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(p_no, ''), '\D', '', 'g'); c text := btrim(coalesce(p_ceo, '')); ph text := public.clean_phone(p_phone); st text;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'login_required'); end if;
  if not public.is_valid_biz_no(d) then return jsonb_build_object('error', 'bad_biz_no'); end if;
  if char_length(c) < 2 or char_length(c) > 20 or c !~ '^[가-힣a-zA-Z][가-힣a-zA-Z ·.]*$' then return jsonb_build_object('error', 'bad_ceo'); end if;
  if ph is null then return jsonb_build_object('error', 'bad_phone'); end if;
  select business_status into st from public.profiles where id = auth.uid();
  if st is null then return jsonb_build_object('error', 'no_profile'); end if;
  if st = 'approved' then return jsonb_build_object('ok', true, 'already', true); end if;
  if st = 'rejected' then return jsonb_build_object('error', 'rejected'); end if;
  perform set_config('app.biz_self', '1', true);
  update public.profiles set business_status = 'approved', business_no = d, business_ceo = c, business_phone = ph, business_note = null where id = auth.uid();
  perform set_config('app.biz_self', '', true);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.submit_business(text, text, text) to authenticated;

-- 이미 인증된 회원이 대표자 핸드폰번호만 추가·변경
create or replace function public.update_business_phone(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := public.clean_phone(p_phone); st text;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'login_required'); end if;
  if ph is null then return jsonb_build_object('error', 'bad_phone'); end if;
  select business_status into st from public.profiles where id = auth.uid();
  if st is distinct from 'approved' then return jsonb_build_object('error', 'not_approved'); end if;
  perform set_config('app.biz_self', '1', true);
  update public.profiles set business_phone = ph where id = auth.uid();
  perform set_config('app.biz_self', '', true);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.update_business_phone(text) to authenticated;

-- 프로필 보호 규칙: 핸드폰번호도 위 함수로만 바뀜 (나머지는 033 과 같음)
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
declare is_admin boolean;
begin
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
  if auth.uid() is not null and not is_admin then
    new.role := old.role;
    new.business_note := old.business_note;
    new.community := old.community;
    if coalesce(current_setting('app.biz_self', true), '') <> '1' then
      new.business_status := old.business_status;
      new.business_no := old.business_no;
      new.business_ceo := old.business_ceo;
      new.business_phone := old.business_phone;
      new.business_doc_path := old.business_doc_path;
    end if;
    if new.community_req = 'agency' then
      if new.community_doc_path is null then raise exception 'agency_doc_required'; end if;
      if old.community = 'agency' or old.community_req = 'agency' then new.community_doc_path := old.community_doc_path; end if;
    else
      new.community_doc_path := old.community_doc_path;
    end if;
  end if;
  if new.community_req is null then new.community_req_at := null;
  elsif new.community_req is distinct from old.community_req then new.community_req_at := now();
  end if;
  return new;
end $$;

-- 회원 목록(운영자): 대표자 핸드폰번호 포함
drop function if exists public.admin_members(text, int, int, text);
create function public.admin_members(p_search text, p_lim int, p_off int, p_status text default null)
returns table (id uuid, nickname text, email text, role text, business_status text, business_doc_path text, business_note text, created_at timestamptz, business_no text, business_ceo text, business_phone text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.nickname, u.email::text, p.role, p.business_status, p.business_doc_path, p.business_note, p.created_at, p.business_no, p.business_ceo, p.business_phone
  from public.profiles p join auth.users u on u.id = p.id
  where (p_search is null or p_search = '' or p.nickname ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%'
         or p.business_no like '%' || regexp_replace(p_search, '\D', '', 'g') || '%' or p.business_phone like '%' || regexp_replace(p_search, '\D', '', 'g') || '%')
    and (p_status is null or p_status = '' or p.business_status = p_status)
  order by (p.business_status = 'pending') desc, p.created_at desc
  limit least(greatest(p_lim, 1), 200) offset greatest(p_off, 0);
end $$;
revoke all on function public.admin_members(text, int, int, text) from public, anon;
grant execute on function public.admin_members(text, int, int, text) to authenticated;
