-- 우리들 체험단 DB 설계 (Supabase > SQL Editor 에 통째로 붙여넣고 Run)
-- 주의: 아직 실제 Supabase 프로젝트에서 실행해 검증하지 않은 초안입니다.

-- 1) 회원 프로필 (로그인 계정 auth.users 와 1:1)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '회원',
  role text not null default 'member' check (role in ('member','admin')),
  -- 광고주 인증: none(미신청) → pending(사업자등록증 제출) → approved(운영자 승인) / rejected(반려)
  business_status text not null default 'none' check (business_status in ('none','pending','approved','rejected')),
  business_doc_path text,                   -- 비공개 저장소의 사업자등록증 파일 경로
  business_note text,                       -- 반려 사유 등 운영자 메모
  created_at timestamptz not null default now()
);

-- 가입하면 프로필 자동 생성
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', '회원'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 일반 회원은 role / 승인 상태를 직접 바꿀 수 없음. 단, 사업자등록증을 올리고 '심사 요청(pending)'만 가능.
create function public.protect_profile() returns trigger
language plpgsql as $$
declare is_admin boolean;
begin
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
  if auth.uid() is not null and not is_admin then
    new.role := old.role;
    new.business_note := old.business_note;
    if not (new.business_status = 'pending' and old.business_status in ('none','rejected')
            and new.business_doc_path is not null) then
      new.business_status := old.business_status;
      if old.business_status in ('approved','pending') then
        new.business_doc_path := old.business_doc_path;   -- 승인/심사 중에는 파일 교체 불가
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger protect_profile_trg before update on public.profiles
  for each row execute function public.protect_profile();

-- 2) 체험단 캠페인 (광고주가 등록)
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('블로그','구매평','인스타')),
  mode text not null check (mode in ('방문형','배송형')),
  region text not null check (region in ('서울','수도권','지방','제주')),
  cat text not null,
  biz text not null,
  title text not null,
  reward text not null,
  slots int not null check (slots > 0),
  deadline date not null,
  place_url text,
  description text,
  photo_url text,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

-- 3) 신청 (광고주가 선정/탈락 처리)
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  status text not null default 'applied' check (status in ('applied','selected','rejected')),
  created_at timestamptz not null default now(),
  unique (campaign_id, applicant_id)        -- 같은 캠페인에 중복 신청 방지
);

-- 4) 접근 권한 (RLS): 켜 두고 아래 규칙에 맞는 것만 허용
alter table public.profiles     enable row level security;
alter table public.campaigns    enable row level security;
alter table public.applications enable row level security;

create policy "프로필: 누구나 조회" on public.profiles for select using (true);
create policy "프로필: 본인만 수정" on public.profiles for update using (auth.uid() = id);
create policy "프로필: 운영자는 전체 수정" on public.profiles for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "캠페인: 누구나 조회" on public.campaigns for select using (true);
create policy "캠페인: 운영자가 승인한 광고주만 등록" on public.campaigns for insert
  with check (owner_id = auth.uid() and exists
    (select 1 from public.profiles where id = auth.uid() and business_status = 'approved'));
create policy "캠페인: 작성자만 수정" on public.campaigns for update using (owner_id = auth.uid());
create policy "캠페인: 작성자만 삭제" on public.campaigns for delete using (owner_id = auth.uid());

create policy "신청: 본인 또는 해당 캠페인 광고주만 조회" on public.applications for select
  using (applicant_id = auth.uid() or exists
    (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));
create policy "신청: 로그인 회원이 모집 중인 캠페인에만" on public.applications for insert
  with check (applicant_id = auth.uid() and exists
    (select 1 from public.campaigns c where c.id = campaign_id and c.status = 'open'));
create policy "신청: 광고주만 선정/탈락 처리" on public.applications for update
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));

-- 5) 사진 저장소 (공개 읽기, 로그인 회원은 자기 폴더에만 업로드)
insert into storage.buckets (id, name, public) values ('campaign-photos','campaign-photos', true)
  on conflict do nothing;
create policy "사진: 누구나 보기" on storage.objects for select using (bucket_id = 'campaign-photos');
create policy "사진: 본인 폴더에만 업로드" on storage.objects for insert to authenticated
  with check (bucket_id = 'campaign-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 6) 사업자등록증 (비공개: 본인과 운영자만 열람. 대표자 이름·주소 등 개인정보가 들어 있음)
insert into storage.buckets (id, name, public) values ('business-docs','business-docs', false)
  on conflict do nothing;
create policy "서류: 본인 폴더에만 업로드" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "서류: 본인 또는 운영자만 열람" on storage.objects for select to authenticated
  using (bucket_id = 'business-docs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')));
