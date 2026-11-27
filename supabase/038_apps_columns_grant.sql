-- 38단계: 마이페이지 '신청 내역'이 읽을 수 있도록 새 칸(채널 등)의 조회 권한 추가
-- (006 에서 신청서 표는 허용한 칸만 읽게 제한했는데, 035 에서 만든 새 칸이 빠져 있었어요. 연락처 칸은 계속 막혀 있습니다.)
-- Supabase > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전해요.
grant select (via, applied_channel, sns_verified) on public.applications to authenticated;
