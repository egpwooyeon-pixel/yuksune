-- 33단계: 광고주(개인사업자) 인증을 '사업자등록번호 + 대표자 이름 입력'만으로 바로 승인 (사업자등록증 제출·검토 없음)
--        대행사 커뮤니티는 그대로 사업자등록증 첨부 + 운영자 승인 (신청 시각을 기록해 24시간 이내 처리 여부를 관리자 화면에 표시)
-- · 사업자등록번호는 자릿수와 검증 숫자(체크섬)만 확인해요. 국세청에서 실제 등록·휴폐업 여부를 확인하지는 않아요.
-- · 운영자가 '반려'한 회원은 스스로 다시 승인받을 수 없어요 (운영자가 '미신청'으로 되돌려야 해요).
-- Supabase > SQL Editor 에 붙여넣고 Run. (010·028·031 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

alter table public.profiles
  add column if not exists business_no text check (business_no is null or business_no ~ '^[0-9]{10}$'),
  add column if not exists business_ceo text check (business_ceo is null or char_length(business_ceo) <= 20),
  add column if not exists community_req_at timestamptz;             -- 커뮤니티 가입 신청 시각 (대행사 24시간 처리 확인용)

-- 사업자등록번호 형식 확인 (10자리 + 검증 숫자)
create or replace function public.is_valid_biz_no(p text) returns boolean
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); w int[] := array[1,3,7,1,3,7,1,3,5]; s int := 0; i int;
begin
  if length(d) <> 10 then return false; end if;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * w[i]; end loop;
  s := s + (substr(d, 9, 1)::int * 5) / 10;
  return ((10 - (s % 10)) % 10) = substr(d, 10, 1)::int;
end $$;

-- 회원이 스스로 광고주로 인증: 사업자등록번호 + 대표자 이름만 받고 바로 승인
create or replace function public.submit_business(p_no text, p_ceo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(p_no, ''), '\D', '', 'g'); c text := btrim(coalesce(p_ceo, '')); st text;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'login_required'); end if;
  if not public.is_valid_biz_no(d) then return jsonb_build_object('error', 'bad_biz_no'); end if;
  if char_length(c) < 2 or char_length(c) > 20 or c !~ '^[가-힣a-zA-Z][가-힣a-zA-Z ·.]*$' then return jsonb_build_object('error', 'bad_ceo'); end if;
  select business_status into st from public.profiles where id = auth.uid();
  if st is null then return jsonb_build_object('error', 'no_profile'); end if;
  if st = 'approved' then return jsonb_build_object('ok', true, 'already', true); end if;
  if st = 'rejected' then return jsonb_build_object('error', 'rejected'); end if;     -- 운영자가 반려한 회원은 운영자 확인 필요
  perform set_config('app.biz_self', '1', true);                                        -- 아래 보호 규칙이 이 한 번만 통과시킴
  update public.profiles set business_status = 'approved', business_no = d, business_ceo = c, business_note = null where id = auth.uid();
  perform set_config('app.biz_self', '', true);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.submit_business(text, text) to authenticated;
grant execute on function public.is_valid_biz_no(text) to authenticated;

-- 프로필 보호 규칙 갱신 (028 · 031 내용 유지 + 사업자 인증은 위 함수로만 + 커뮤니티 신청 시각 기록)
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
declare is_admin boolean;
begin
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
  if auth.uid() is not null and not is_admin then
    new.role := old.role;
    new.business_note := old.business_note;
    new.community := old.community;                                    -- 커뮤니티 승인 값은 운영자만
    if coalesce(current_setting('app.biz_self', true), '') <> '1' then -- 광고주 인증 값은 submit_business 로만 바뀜
      new.business_status := old.business_status;
      new.business_no := old.business_no;
      new.business_ceo := old.business_ceo;
      new.business_doc_path := old.business_doc_path;
    end if;
    if new.community_req = 'agency' then                               -- 대행사 신청: 사업자등록증 필수
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

-- 회원 목록(운영자): 사업자등록번호·대표자 이름 포함
drop function if exists public.admin_members(text, int, int, text);
create function public.admin_members(p_search text, p_lim int, p_off int, p_status text default null)
returns table (id uuid, nickname text, email text, role text, business_status text, business_doc_path text, business_note text, created_at timestamptz, business_no text, business_ceo text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.nickname, u.email::text, p.role, p.business_status, p.business_doc_path, p.business_note, p.created_at, p.business_no, p.business_ceo
  from public.profiles p join auth.users u on u.id = p.id
  where (p_search is null or p_search = '' or p.nickname ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%' or p.business_no like '%' || regexp_replace(p_search, '\D', '', 'g') || '%')
    and (p_status is null or p_status = '' or p.business_status = p_status)
  order by (p.business_status = 'pending') desc, p.created_at desc
  limit least(greatest(p_lim, 1), 200) offset greatest(p_off, 0);
end $$;
revoke all on function public.admin_members(text, int, int, text) from public, anon;
grant execute on function public.admin_members(text, int, int, text) to authenticated;
