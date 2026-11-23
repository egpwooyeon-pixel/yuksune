-- 12단계: 광고주 미선정횟수 · 페널티
-- 정책(숫자는 이 파일에서 바꿀 수 있어요):
--   · 마감일이 지났는데 신청자가 있고, 한 명도 선정하지 않았으며, 아직 처리(선정/탈락)하지 않은 신청이 남아 있으면 → 미선정횟수 +1
--     (신청자를 전부 탈락 처리한 경우는 응답한 것으로 보고 부과하지 않아요. 신청자가 없던 체험단도 부과하지 않아요.)
--   · 미선정횟수는 부과일로부터 6개월 지나면 자동 소멸
--   · 미선정횟수가 5회 쌓이면 페널티 1회로 전환 (전환된 건 소멸하지 않아요)
--   · 페널티는 영구 누적: 1회 → 체험단 등록 7일 정지, 2회 → 30일 정지, 3회 이상 → 영구 정지
--   · 운영자는 관리자 화면에서 직접 미선정/페널티를 부과하거나 취소할 수 있어요
-- Supabase > SQL Editor 에 붙여넣고 Run. (008 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

create table public.advertiser_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('missed','penalty')),
  reason text not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,            -- 미선정: 소멸 예정 시각
  converted_at timestamptz,          -- 미선정: 페널티로 전환된 시각 (전환되면 횟수에서 빠지고 소멸하지 않음)
  suspended_until timestamptz        -- 페널티: 등록 정지 끝나는 시각 ('infinity' = 영구)
);
create index advertiser_events_owner_idx on public.advertiser_events (owner_id, created_at desc);
alter table public.advertiser_events enable row level security;
create policy "내역: 본인 또는 운영자만 조회" on public.advertiser_events for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());
grant select on public.advertiser_events to authenticated;   -- 쓰기는 아래 함수로만

alter table public.campaigns add column if not exists missed_checked boolean not null default false;
update public.campaigns set missed_checked = true;           -- 이미 있던 체험단은 소급해서 부과하지 않음

-- 등록 정지 중인지
create or replace function public.is_suspended(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.advertiser_events where owner_id = uid and kind = 'penalty' and suspended_until > now())
$$;
grant execute on function public.is_suspended(uuid) to anon, authenticated;

-- (내부용) 페널티 1회 부과
create or replace function public._add_penalty(p_owner uuid, p_reason text, p_campaign uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) + 1 into n from public.advertiser_events where owner_id = p_owner and kind = 'penalty';
  insert into public.advertiser_events (owner_id, kind, reason, campaign_id, suspended_until)
  values (p_owner, 'penalty', p_reason, p_campaign,
          case when n = 1 then now() + interval '7 days' when n = 2 then now() + interval '30 days' else 'infinity'::timestamptz end);
end $$;

-- (내부용) 미선정 5회 누적 → 페널티 전환
create or replace function public._convert_missed(p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare active int;
begin
  select count(*) into active from public.advertiser_events
   where owner_id = p_owner and kind = 'missed' and converted_at is null and expires_at > now();
  if active >= 5 then
    update public.advertiser_events set converted_at = now()
     where id in (select id from public.advertiser_events
                  where owner_id = p_owner and kind = 'missed' and converted_at is null and expires_at > now()
                  order by created_at limit 5);
    perform public._add_penalty(p_owner, '미선정 5회 누적', null);
  end if;
end $$;

-- 마감된 체험단 검사 (여러 번 불러도 안전: 한 번 검사한 체험단은 다시 보지 않음). 화면이 열릴 때 불러요.
create or replace function public.process_expired_campaigns() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select c.id, c.owner_id, c.title from public.campaigns c
           where c.missed_checked = false and c.deadline < (now() at time zone 'Asia/Seoul')::date
           order by c.deadline limit 50 for update skip locked
  loop
    update public.campaigns set missed_checked = true where id = r.id;
    if exists (select 1 from public.applications where campaign_id = r.id)
       and not exists (select 1 from public.applications where campaign_id = r.id and status = 'selected')
       and exists (select 1 from public.applications where campaign_id = r.id and status = 'applied') then
      insert into public.advertiser_events (owner_id, kind, reason, campaign_id, expires_at)
      values (r.owner_id, 'missed', '신청자를 선정하지 않고 마감: ' || r.title, r.id, now() + interval '6 months');
      perform public._convert_missed(r.owner_id);
    end if;
  end loop;
end $$;
grant execute on function public.process_expired_campaigns() to anon, authenticated;

-- 운영자: 직접 부과 / 취소
create or replace function public.admin_add_event(p_owner uuid, p_kind text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_kind not in ('missed','penalty') or coalesce(trim(p_reason), '') = '' then raise exception 'bad_request'; end if;
  if p_kind = 'penalty' then
    perform public._add_penalty(p_owner, left(p_reason, 200), null);
  else
    insert into public.advertiser_events (owner_id, kind, reason, expires_at) values (p_owner, 'missed', left(p_reason, 200), now() + interval '6 months');
    perform public._convert_missed(p_owner);
  end if;
end $$;
create or replace function public.admin_delete_event(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.advertiser_events where id = p_id;
end $$;
revoke all on function public.admin_add_event(uuid, text, text), public.admin_delete_event(bigint) from public, anon;
grant execute on function public.admin_add_event(uuid, text, text), public.admin_delete_event(bigint) to authenticated;

-- 체험단 등록은 정지 중이 아닐 때만
drop policy if exists "캠페인: 운영자가 승인한 광고주만 등록" on public.campaigns;
create policy "캠페인: 운영자가 승인한 광고주만 등록" on public.campaigns for insert to authenticated
  with check (owner_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and business_status = 'approved')
    and not public.is_suspended(auth.uid()));

-- 신청자가 있는 체험단은 광고주가 직접 지울 수 없음 (선정 안 하고 지워서 미선정을 피하는 것을 막고, 신청자 정보도 보호). 모집 마감은 가능. 운영자는 삭제 가능.
create or replace function public.campaign_has_apps(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.applications where campaign_id = cid)
$$;
grant execute on function public.campaign_has_apps(uuid) to authenticated;
drop policy if exists "캠페인: 작성자만 삭제" on public.campaigns;
create policy "캠페인: 작성자만 삭제" on public.campaigns for delete to authenticated
  using (owner_id = auth.uid() and not public.campaign_has_apps(id));

-- (선택) 자동 검사를 정해진 시각에 돌리고 싶다면 Supabase의 pg_cron 확장을 켠 뒤:
-- select cron.schedule('woori-missed-check', '10 15 * * *', $$select public.process_expired_campaigns()$$);   -- 매일 한국시간 00:10
