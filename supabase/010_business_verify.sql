-- 10단계: 사장님 사업자등록증 제출 → 운영자 승인. (schema.sql 의 business-docs 저장소/프로필 규칙을 이어서 사용)
-- Supabase > SQL Editor 에 붙여넣고 Run. (008 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

-- 1) 서류 저장소: 5MB 이하, 이미지(jpg/png/webp) 또는 PDF만 (서버에서도 한 번 더 제한)
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
where id = 'business-docs';

-- 2) 운영자는 서류를 삭제할 수 있음 (승인 후 개인정보 보관을 줄이기 위해)
drop policy if exists "서류: 운영자 삭제" on storage.objects;
create policy "서류: 운영자 삭제" on storage.objects for delete to authenticated
  using (bucket_id = 'business-docs' and public.is_admin());

-- 3) 회원 목록 함수를 서류 경로·반려 사유·상태 필터가 되도록 교체 (운영자 전용)
drop function if exists public.admin_members(text, int, int);
create function public.admin_members(p_search text, p_lim int, p_off int, p_status text default null)
returns table (id uuid, nickname text, email text, role text, business_status text, business_doc_path text, business_note text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.nickname, u.email::text, p.role, p.business_status, p.business_doc_path, p.business_note, p.created_at
  from public.profiles p join auth.users u on u.id = p.id
  where (p_search is null or p_search = '' or p.nickname ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%')
    and (p_status is null or p_status = '' or p.business_status = p_status)
  order by (p.business_status = 'pending') desc, p.created_at desc
  limit least(greatest(p_lim, 1), 200) offset greatest(p_off, 0);
end $$;
revoke all on function public.admin_members(text, int, int, text) from public, anon;
grant execute on function public.admin_members(text, int, int, text) to authenticated;
