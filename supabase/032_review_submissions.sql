-- 32단계: 선정된 체험단 참여자가 로그인 없이 후기 글 링크를 제출하고, 광고주가 확인 완료 / 수정 요청을 표시
-- · 본인 확인: 신청할 때 입력한 '연락처 + 이름'이 선정된 신청과 같을 때만 제출·조회할 수 있어요. 틀리면 신청 정보는 알려 주지 않아요.
-- · 마감 전(후기 작성 마감일까지)에는 다시 제출해서 덮어쓸 수 있어요. 광고주가 '확인 완료'를 누른 글은 바꿀 수 없어요.
-- · 표는 직접 읽거나 쓸 수 없고, 아래 함수로만 접근해요. 틀린 입력이 한 체험단에서 1시간에 30번을 넘으면 잠시 막아요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (002·003·008 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

create table if not exists public.review_submissions (
  application_id uuid primary key references public.applications(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  url text not null check (char_length(url) between 8 and 500 and url ~* '^https?://'),
  review_status text not null default 'submitted' check (review_status in ('submitted','confirmed','revision')),
  revision_note text check (revision_note is null or char_length(revision_note) <= 200),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists review_submissions_campaign_idx on public.review_submissions (campaign_id);
create table if not exists public.review_attempts (campaign_id uuid not null, at timestamptz not null default now());
create index if not exists review_attempts_idx on public.review_attempts (campaign_id, at desc);
alter table public.review_submissions enable row level security;     -- 정책이 없어서 함수로만 접근
alter table public.review_attempts enable row level security;

-- 주소 정리: https:// 가 없으면 붙이고, http/https 주소만 받음. 못 쓰면 null
create or replace function public.review_clean_url(p text) returns text
language plpgsql immutable as $$
declare v text := btrim(coalesce(p, ''));
begin
  if v = '' then return null; end if;
  if v !~* '^https?://' then
    if v ~* '^[a-z][a-z0-9+.-]*:' and v !~* '^[a-z0-9.-]+\.[a-z]{2,}(:[0-9]+)?(/|$)' then return null; end if;
    v := 'https://' || regexp_replace(v, '^//', '');
  end if;
  if char_length(v) > 500 or v !~* '^https?://[^\s/:?#.]+(\.[^\s/:?#.]+)+(:[0-9]+)?([/?#][^\s]*)?$' then return null; end if;
  return v;
end $$;

create or replace function public.review_find_app(p_campaign uuid, p_contact text, p_name text) returns uuid
language sql stable security definer set search_path = public as $$
  select a.id from public.applications a
  where a.campaign_id = p_campaign and a.status = 'selected'
    and length(regexp_replace(coalesce(p_contact, ''), '\D', '', 'g')) >= 9
    and regexp_replace(coalesce(a.contact, ''), '\D', '', 'g') = regexp_replace(coalesce(p_contact, ''), '\D', '', 'g')
    and length(btrim(coalesce(p_name, ''))) >= 1
    and lower(btrim(coalesce(a.applicant_name, ''))) = lower(btrim(p_name))
  limit 1
$$;

create or replace function public.review_throttled(p_campaign uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) >= 30 from public.review_attempts where campaign_id = p_campaign and at > now() - interval '1 hour'
$$;

-- 내 제출 상태 확인 (연락처 + 이름)
create or replace function public.review_status_of(p_campaign uuid, p_contact text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare app uuid; s record; dl date;
begin
  if public.review_throttled(p_campaign) then return jsonb_build_object('error', 'too_many'); end if;
  app := public.review_find_app(p_campaign, p_contact, p_name);
  if app is null then
    insert into public.review_attempts(campaign_id) values (p_campaign);
    return jsonb_build_object('error', 'not_found');
  end if;
  select review_deadline into dl from public.campaigns where id = p_campaign;
  select * into s from public.review_submissions where application_id = app;
  return jsonb_build_object('ok', true, 'deadline', dl, 'closed', dl is not null and dl < (now() at time zone 'Asia/Seoul')::date,
    'submitted', s.application_id is not null, 'url', s.url, 'status', s.review_status, 'note', s.revision_note);
end $$;

-- 후기 링크 제출 (마감 전까지 다시 제출하면 덮어쓰기)
create or replace function public.submit_review(p_campaign uuid, p_contact text, p_name text, p_url text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare app uuid; u text := public.review_clean_url(p_url); dl date; cur text;
begin
  if public.review_throttled(p_campaign) then return jsonb_build_object('error', 'too_many'); end if;
  app := public.review_find_app(p_campaign, p_contact, p_name);
  if app is null then
    insert into public.review_attempts(campaign_id) values (p_campaign);
    return jsonb_build_object('error', 'not_found');
  end if;
  if u is null then return jsonb_build_object('error', 'bad_url'); end if;
  select review_deadline into dl from public.campaigns where id = p_campaign;
  if dl is not null and dl < (now() at time zone 'Asia/Seoul')::date then return jsonb_build_object('error', 'deadline_passed'); end if;
  select review_status into cur from public.review_submissions where application_id = app;
  if cur = 'confirmed' then return jsonb_build_object('error', 'already_confirmed'); end if;
  insert into public.review_submissions (application_id, campaign_id, url) values (app, p_campaign, u)
  on conflict (application_id) do update set url = excluded.url, review_status = 'submitted', revision_note = null, updated_at = now();
  return jsonb_build_object('ok', true, 'status', 'submitted', 'url', u, 'resubmitted', cur is not null);
end $$;

-- 광고주(또는 운영자): 선정된 신청자별 제출 현황
create or replace function public.owner_reviews(cid uuid)
returns table (application_id uuid, applicant_name text, url text, review_status text, revision_note text, submitted_at timestamptz, updated_at timestamptz, deadline date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.campaigns c where c.id = cid and (c.owner_id = auth.uid() or public.is_admin())) then
    raise exception 'forbidden';
  end if;
  return query
    select a.id, a.applicant_name, s.url, s.review_status, s.revision_note, s.submitted_at, s.updated_at, c.review_deadline
    from public.applications a join public.campaigns c on c.id = a.campaign_id
    left join public.review_submissions s on s.application_id = a.id
    where a.campaign_id = cid and a.status = 'selected'
    order by a.created_at;
end $$;

-- 광고주(또는 운영자): 확인 완료 / 수정 요청 표시
create or replace function public.review_mark(p_app uuid, p_status text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_status not in ('confirmed', 'revision') then return jsonb_build_object('error', 'bad_status'); end if;
  if p_status = 'revision' and (n is null or char_length(n) > 200) then return jsonb_build_object('error', 'bad_note'); end if;
  if not exists (select 1 from public.applications a join public.campaigns c on c.id = a.campaign_id
                 where a.id = p_app and (c.owner_id = auth.uid() or public.is_admin())) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  update public.review_submissions set review_status = p_status, revision_note = case when p_status = 'revision' then n else null end, updated_at = now()
  where application_id = p_app;
  if not found then return jsonb_build_object('error', 'no_submission'); end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

revoke all on function public.review_find_app(uuid, text, text), public.review_throttled(uuid) from public, anon, authenticated;
grant execute on function public.review_clean_url(text) to anon, authenticated;
grant execute on function public.review_status_of(uuid, text, text), public.submit_review(uuid, text, text, text) to anon, authenticated;
grant execute on function public.owner_reviews(uuid), public.review_mark(uuid, text, text) to authenticated;
