-- 35단계: SNS 프로필 등록 + 간편 체험단 신청 (회원용)
-- · 회원 휴대폰번호(profiles.phone) / SNS 프로필(member_sns) / 간편 신청 함수(apply_simple)
-- · SNS 는 'URL(아이디) 등록'만 해요. 소유 인증(verified)은 항상 false 입니다 (실제 인증 수단이 생기기 전까지).
-- · 신청 시점의 SNS 주소·연락처를 신청서에 복사(스냅샷)해서, 나중에 프로필을 바꿔도 이미 낸 신청은 안 바뀝니다.
-- · 같은 회원이 같은 체험단에 두 번 신청되는 것은 DB 제약(unique(campaign_id, applicant_id))으로 막습니다.
-- Supabase > SQL Editor 에 붙여넣고 Run. (002, 003, 034 이후) 로컬 PostgreSQL 에서만 검증, 실서버 실행 전 초안.

alter table public.profiles
  add column if not exists phone text check (phone is null or phone ~ '^01[016789][0-9]{7,8}$');

create or replace function public.clean_phone(p text) returns text
language sql immutable as $$
  select case when regexp_replace(coalesce(p, ''), '\D', '', 'g') ~ '^01[016789][0-9]{7,8}$' then regexp_replace(p, '\D', '', 'g') end
$$;
grant execute on function public.clean_phone(text) to authenticated;

-- 1) 회원 SNS 프로필 -----------------------------------------------------------
create table if not exists public.member_sns (
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('naver_blog','instagram')),
  url text not null check (char_length(url) <= 200),
  handle text,
  followers bigint check (followers is null or followers between 0 and 1000000000),
  verified boolean not null default false,       -- 소유 인증 여부: 지금은 항상 false
  verified_via text,
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);
alter table public.member_sns enable row level security;
drop policy if exists "SNS: 본인만 조회" on public.member_sns;
create policy "SNS: 본인만 조회" on public.member_sns for select using (user_id = auth.uid());
-- 쓰기 정책 없음: 아래 함수로만 저장 (verified 를 사용자가 직접 true 로 못 바꿈)
revoke insert, update, delete on public.member_sns from anon, authenticated;
grant select on public.member_sns to authenticated;

create or replace function public.save_sns(p_platform text, p_value text, p_followers bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := btrim(coalesce(p_value, '')); h text; u text; m text[];
begin
  if auth.uid() is null then return jsonb_build_object('error', 'login_required'); end if;
  if p_platform = 'naver_blog' then
    v := regexp_replace(v, '^https?://', '', 'i');
    if v ~* '^(m\.)?blog\.naver\.com/' then
      m := regexp_match(v, '[?&]blogId=([A-Za-z0-9_-]{2,40})', 'i');
      if m is null then m := regexp_match(v, '^(?:m\.)?blog\.naver\.com/([A-Za-z0-9_-]{2,40})(?:[/?#]|$)', 'i'); end if;
      h := lower(m[1]);
    elsif v ~ '^[A-Za-z0-9_-]{2,40}$' then
      h := lower(v);
    end if;
    if h is null or h in ('postview.naver','postlist.naver','prologue','myblog.naver') then return jsonb_build_object('error', 'bad_blog'); end if;
    u := 'https://blog.naver.com/' || h;
  elsif p_platform = 'instagram' then
    v := regexp_replace(v, '^@', '');
    if v ~* '^(https?://)?(www\.)?instagram\.com/' then
      m := regexp_match(v, '^(?:https?://)?(?:www\.)?instagram\.com/([A-Za-z0-9._]{1,30})(?:[/?#]|$)', 'i');
      h := lower(m[1]);
    elsif v ~ '^[A-Za-z0-9._]{1,30}$' then
      h := lower(v);
    end if;
    if h is null or h in ('p','reel','reels','explore','accounts','stories','direct') then return jsonb_build_object('error', 'bad_instagram'); end if;
    u := 'https://www.instagram.com/' || h || '/';
  else
    return jsonb_build_object('error', 'bad_platform');
  end if;
  if p_followers is not null and (p_followers < 0 or p_followers > 1000000000) then return jsonb_build_object('error', 'bad_followers'); end if;
  insert into public.member_sns as s (user_id, platform, url, handle, followers, verified, verified_via, updated_at)
  values (auth.uid(), p_platform, u, h, p_followers, false, null, now())
  on conflict (user_id, platform) do update
    set url = excluded.url, handle = excluded.handle,
        followers = coalesce(excluded.followers, s.followers),
        verified = false, verified_via = null, updated_at = now();
  return jsonb_build_object('ok', true, 'url', u, 'handle', h);
end $$;
grant execute on function public.save_sns(text, text, bigint) to authenticated;

create or replace function public.remove_sns(p_platform text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('error', 'login_required'); end if;
  delete from public.member_sns where user_id = auth.uid() and platform = p_platform;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.remove_sns(text) to authenticated;

create or replace function public.save_phone(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := public.clean_phone(p_phone);
begin
  if auth.uid() is null then return jsonb_build_object('error', 'login_required'); end if;
  if ph is null then return jsonb_build_object('error', 'bad_phone'); end if;
  update public.profiles set phone = ph where id = auth.uid();
  return jsonb_build_object('ok', true, 'phone', ph);
end $$;
grant execute on function public.save_phone(text) to authenticated;

-- 2) 신청서에 간편 신청 기록 칸 추가 ----------------------------------------------
alter table public.applications
  add column if not exists via text not null default 'guest' check (via in ('guest','simple')),
  add column if not exists applied_channel text check (applied_channel is null or applied_channel in ('naver_blog','instagram')),
  add column if not exists sns_verified boolean,
  add column if not exists answers jsonb;

-- 신청 내역 화면이 새 칸을 읽을 수 있게 (연락처 칸은 006 규칙대로 계속 막힘)
grant select (via, applied_channel, sns_verified) on public.applications to authenticated;

-- 3) 간편 신청 (서버에서 로그인·모집기간·채널·필수항목·동의를 모두 다시 확인) -----------------
create or replace function public.apply_simple(p_campaign uuid, p_channel text, p_phone text, p_answers jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c public.campaigns%rowtype;
  s public.member_sns%rowtype;
  a jsonb := coalesce(p_answers, '{}'::jsonb);
  ph text := public.clean_phone(p_phone);
  nick text; vt text; times text; vd date; party int; fol bigint; inf boolean; clp boolean;
  allowed text[]; new_id uuid; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if uid is null then return jsonb_build_object('error', 'login_required'); end if;
  select * into c from public.campaigns where id = p_campaign;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if c.status <> 'open' or c.deadline < today then return jsonb_build_object('error', 'closed'); end if;

  allowed := case c.type when '블로그' then array['naver_blog'] when '인스타' then array['instagram'] when '구매평' then array['naver_blog','instagram'] else array[]::text[] end;
  if p_channel is null or not (p_channel = any(allowed)) then return jsonb_build_object('error', 'channel_not_allowed'); end if;

  select * into s from public.member_sns where user_id = uid and platform = p_channel;
  if not found then return jsonb_build_object('error', 'sns_required'); end if;
  if ph is null then return jsonb_build_object('error', 'phone_required'); end if;

  if coalesce(a->>'consent', '') <> 'true' or coalesce(a->>'reuse', '') <> 'true' then return jsonb_build_object('error', 'consent_required'); end if;
  if nullif(btrim(coalesce(c.mission, '')), '') is not null and coalesce(a->>'mission', '') <> 'true' then return jsonb_build_object('error', 'mission_required'); end if;

  if p_channel = 'naver_blog' and c.type = '블로그' then
    if coalesce(a->>'influencer','') not in ('true','false') or coalesce(a->>'clip','') not in ('true','false') then return jsonb_build_object('error', 'blog_answers_required'); end if;
    inf := (a->>'influencer')::boolean; clp := (a->>'clip')::boolean;
  end if;
  if p_channel = 'instagram' then
    if coalesce(a->>'followers', '') !~ '^[0-9]{1,10}$' or (a->>'followers')::bigint > 1000000000 then
      if s.followers is null then return jsonb_build_object('error', 'followers_required'); end if;
      fol := s.followers;
    else
      fol := (a->>'followers')::bigint;
    end if;
  end if;

  -- 방문 날짜·시간·인원은 간편 신청에서 받지 않음 (방문 일정은 선정 후 광고주와 조율)

  select coalesce(nullif(btrim(nickname), ''), '회원') into nick from public.profiles where id = uid;
  if not found then return jsonb_build_object('error', 'no_profile'); end if;
  update public.profiles set phone = ph where id = uid and phone is distinct from ph;

  begin
    insert into public.applications (campaign_id, applicant_id, status, message, via, applied_channel, sns_verified, answers,
        applicant_name, contact, channel_url, followers, visit_date, visit_time, party_size, is_naver_influencer, clip_ok,
        mission_agreed, consent_at, reuse_consent_at)
    values (c.id, uid, 'applied', nullif(left(btrim(coalesce(a->>'message', '')), 500), ''), 'simple', p_channel, s.verified,
        jsonb_build_object('followers', fol, 'visit_date', vd, 'visit_time', vt, 'party', party, 'influencer', inf, 'clip', clp),
        nick, regexp_replace(ph, '^(\d{3})(\d{3,4})(\d{4})$', '\1-\2-\3'), s.url, fol, vd, vt, party, inf, clp,
        nullif(btrim(coalesce(c.mission, '')), '') is not null, now(), now())
    returning id into new_id;
  exception when unique_violation then
    return jsonb_build_object('error', 'duplicate');
  end;
  if p_channel = 'instagram' and fol is not null then   -- 다음 캠페인에서는 다시 안 쓰도록 프로필에 기억 (이미 낸 신청서의 값은 그대로)
    update public.member_sns set followers = fol where user_id = uid and platform = 'instagram' and followers is distinct from fol;
  end if;
  return jsonb_build_object('ok', true, 'application_id', new_id);
end $$;
grant execute on function public.apply_simple(uuid, text, text, jsonb) to authenticated;
