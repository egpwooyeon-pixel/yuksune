-- 25단계: 승인된 사업자(광고주)가 '내 플레이스'를 직접 등록해서 순위를 확인 (한 아이디당 플레이스 1곳)
-- · 사업자 인증이 승인된 회원만 신청할 수 있어요. 신청한 항목은 '대기'(active=false)로 들어가고, 운영자가 확인한 뒤 추적을 시작해요.
--   (SerpApi 한도 때문에 사업자가 바로 조회 횟수를 쓰지 못하게 하는 장치예요)
-- · 한 아이디에 플레이스는 1곳만, 키워드는 최대 3개까지. 신청한 사업자는 시작 전(대기)에만 직접 취소할 수 있어요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (014·017·020 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

alter table public.rank_trackers add column if not exists self_registered boolean not null default false;   -- true = 사업자가 직접 신청

create or replace function public.is_approved_business() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and business_status = 'approved')
$$;
grant execute on function public.is_approved_business() to authenticated;

drop policy if exists "추적: 사업자 본인 신청" on public.rank_trackers;
create policy "추적: 사업자 본인 신청" on public.rank_trackers for insert to authenticated
  with check (owner_id = auth.uid() and public.is_approved_business() and self_registered and not active
              and campaign_id is null and place_id is not null and not auto_collect);

drop policy if exists "추적: 사업자 신청 취소" on public.rank_trackers;
create policy "추적: 사업자 신청 취소" on public.rank_trackers for delete to authenticated
  using (owner_id = auth.uid() and self_registered and not active);

-- 한 아이디당 플레이스 1곳, 키워드 최대 3개
create or replace function public.limit_my_place() returns trigger
language plpgsql security definer set search_path = public as $$
declare other_places int; kws int;
begin
  if new.self_registered then
    select count(distinct place_id) into other_places from public.rank_trackers
      where owner_id = new.owner_id and place_id is not null and place_id <> new.place_id;
    if other_places > 0 then raise exception 'one_place_only'; end if;
    select count(*) into kws from public.rank_trackers where owner_id = new.owner_id;
    if kws >= 3 then raise exception 'keyword_limit_per_owner'; end if;
  end if;
  return new;
end $$;
drop trigger if exists rank_trackers_limit_my_place on public.rank_trackers;
create trigger rank_trackers_limit_my_place before insert on public.rank_trackers
  for each row execute function public.limit_my_place();
