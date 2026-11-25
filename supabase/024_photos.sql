-- 24단계: 업체 사진 비공개 보관함 (Edge Function aeo-photo 와 함께 씀)
-- · 사진은 비공개 버킷 `business-photos` 에 저장돼요. 방문자는 저장소에 직접 쓸 수 없고,
--   서버 함수가 발급하는 "일회용 업로드 주소"로만 올릴 수 있어요. (형식·용량 제한은 버킷이 강제: JPG/PNG/WebP, 장당 4MB)
-- · 운영자(public.is_admin())만 사진 목록과 파일을 볼 수 있어요.
-- · 한도: 묶음(batch) 하나에 3장, IP(해시값) 하루 9장, 전체 하루 200장 (숫자는 아래 함수 인자로 함수 환경변수에서 조정)
-- · 개인정보: 원본 IP 는 저장하지 않고 해시값만 저장해요. 사진 보관 기간은 아직 정해지지 않았어요(docs/DECISIONS.md).
--   표의 기록을 지워도 저장소의 파일은 지워지지 않으니, 파일 삭제는 Supabase Storage 화면이나 Storage API 로 해야 해요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (008, 021 이후) 아직 실제 Supabase 에서 실행해 검증하지 않은 초안입니다.

-- 1) 비공개 버킷 (다시 실행해도 안전)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-photos', 'business-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 4194304, allowed_mime_types = excluded.allowed_mime_types;

-- 2) 사진 기록
create table if not exists public.business_photos (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  path text not null unique,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists business_photos_batch_idx on public.business_photos (batch_id);
create index if not exists business_photos_ip_idx on public.business_photos (ip_hash, created_at desc);
alter table public.business_photos enable row level security;
revoke all on public.business_photos from anon, authenticated;
drop policy if exists "사진: 운영자만 조회" on public.business_photos;
create policy "사진: 운영자만 조회" on public.business_photos for select to authenticated using (public.is_admin());
grant select on public.business_photos to authenticated;

-- 3) 저장소 파일: 운영자만 읽기 (업로드는 서버 함수가 발급한 일회용 주소로만)
drop policy if exists "사진 파일: 운영자만 조회" on storage.objects;
create policy "사진 파일: 운영자만 조회" on storage.objects for select to authenticated
  using (bucket_id = 'business-photos' and public.is_admin());

-- 4) 상담 접수와 연결: 같은 묶음 번호를 접수에 저장
alter table public.inquiries add column if not exists photo_batch uuid;

-- 5) 한도 확인 + 파일 경로 예약. 경로는 서버가 만들어요(방문자가 파일 이름·위치를 정할 수 없음).
--    성공: {"ok":true,"paths":["<batch>/<uuid>.jpg", ...]}   실패: {"ok":false,"reason":"bad_count|bad_type|batch_limit|ip_limit|global_limit"}
create or replace function public.reserve_photos(p_ip text, p_batch uuid, p_mimes text[], p_ip_daily int, p_global_daily int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int := coalesce(array_length(p_mimes, 1), 0); in_batch int; ip_n int; all_n int; i int; paths text[] := '{}'; ext text; pth text;
begin
  if n < 1 or n > 3 then return jsonb_build_object('ok', false, 'reason', 'bad_count'); end if;
  for i in 1..n loop
    if p_mimes[i] not in ('image/jpeg', 'image/png', 'image/webp') then return jsonb_build_object('ok', false, 'reason', 'bad_type'); end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext('business_photos'));
  select count(*) into in_batch from public.business_photos where batch_id = p_batch;
  if in_batch + n > 3 then return jsonb_build_object('ok', false, 'reason', 'batch_limit'); end if;
  select count(*) into ip_n from public.business_photos where ip_hash = p_ip and created_at > now() - interval '24 hours';
  if ip_n + n > p_ip_daily then return jsonb_build_object('ok', false, 'reason', 'ip_limit'); end if;
  select count(*) into all_n from public.business_photos where created_at > now() - interval '24 hours';
  if all_n + n > p_global_daily then return jsonb_build_object('ok', false, 'reason', 'global_limit'); end if;
  for i in 1..n loop
    ext := case p_mimes[i] when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
    pth := p_batch::text || '/' || gen_random_uuid()::text || '.' || ext;
    insert into public.business_photos (batch_id, path, mime, ip_hash) values (p_batch, pth, p_mimes[i], p_ip);
    paths := paths || pth;
  end loop;
  return jsonb_build_object('ok', true, 'paths', to_jsonb(paths));
end $$;
revoke all on function public.reserve_photos(text, uuid, text[], int, int) from public, anon, authenticated;
grant execute on function public.reserve_photos(text, uuid, text[], int, int) to service_role;
