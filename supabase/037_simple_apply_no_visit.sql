-- 37단계: 간편 신청에서 방문 희망 날짜·시간·인원 입력 제거 (apply_simple 함수만 교체)
-- 035 를 이미 실행한 경우 이 파일만 실행하세요. (035 를 처음 실행한다면 이 파일은 안 해도 됩니다.)
-- Supabase > SQL Editor 에 붙여넣고 Run.

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
