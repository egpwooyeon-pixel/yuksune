-- 29단계: AI 리뷰 원고용 사진 "직접 업로드" (review-draft.html/.js, admin-review-drafts.js)
-- · 사진은 공개 버킷 `review-draft-photos` 에 저장돼요. 올리는 사람(로그인한 회원·운영자)은 자기 폴더(<내 uid>/...)에만 올리고 지울 수 있어요.
--   올라간 사진은 그대로 블로그에 쓸 걸 전제로 하므로 공개 URL로 보여요 — 진단 화면의 비공개 업체 사진(024_photos.sql)과는 성격이 달라요.
-- · 형식·용량 제한은 버킷이 강제해요(JPG/PNG/WebP, 장당 8MB). 화면의 검사(파일 앞부분 확인)는 편의일 뿐이에요.
-- Supabase > SQL Editor 에 붙여넣고 Run. (027_review_drafts.sql 이후) 여러 번 실행해도 안전해요.

-- 1) 공개 버킷 (다시 실행해도 안전)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-draft-photos', 'review-draft-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;

-- 2) 올리기·지우기는 로그인한 사람의 자기 폴더(<uid>/...)에만. 보기는 버킷이 공개라 별도 정책 없이 공개 URL로 돼요.
drop policy if exists "리뷰원고 사진: 본인 폴더에만 올리기" on storage.objects;
create policy "리뷰원고 사진: 본인 폴더에만 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'review-draft-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "리뷰원고 사진: 본인 것만 지우기" on storage.objects;
create policy "리뷰원고 사진: 본인 것만 지우기" on storage.objects for delete to authenticated
  using (bucket_id = 'review-draft-photos' and (storage.foldername(name))[1] = auth.uid()::text);
