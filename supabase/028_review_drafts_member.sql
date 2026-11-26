-- 28단계: AI 리뷰 원고를 "사업자 인증 승인된 회원"도 직접 쓸 수 있게 열기(자기 것만 보임)
-- · 관리자 전용이던 review_drafts(027) 를, rank.html(내 플레이스 순위확인하기) 과 같은 방식으로
--   business_status = 'approved' 회원에게도 엽니다. 생성은 여전히 Edge Function(service_role)만 하고,
--   조회만 "본인이 만든 것" 으로 범위를 넓힙니다. 쓰기는 여전히 서버 함수만(직접 insert/update 불가).
-- Supabase > SQL Editor 에 붙여넣고 Run. (027 이후) 아직 실제 실행해 검증하지 않은 초안입니다.

drop policy if exists "리뷰원고: 운영자만 조회" on public.review_drafts;
create policy "리뷰원고: 운영자는 전체, 회원은 본인 것만 조회" on public.review_drafts for select to authenticated
  using (public.is_admin() or created_by = auth.uid());
