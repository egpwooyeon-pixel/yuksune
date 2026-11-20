-- 3단계: 캠페인 상세 페이지용 추가 정보 (모두 선택 입력)
-- Supabase > SQL Editor 에 붙여넣고 Run. 반드시 이 파일을 먼저 실행한 뒤 새 등록 화면을 쓰세요.
alter table public.campaigns
  add column if not exists keywords text,             -- 검색 키워드 (쉼표로 구분)
  add column if not exists shipping_info text,        -- 배송/방문 안내
  add column if not exists product_url text,          -- 상품 정보 주소
  add column if not exists notice text,               -- 상단 안내 문구
  add column if not exists review_deadline date,      -- 후기 작성 마감일
  add column if not exists mission_photos int check (mission_photos is null or mission_photos between 0 and 100),
  add column if not exists mission_chars int check (mission_chars is null or mission_chars between 0 and 10000),
  add column if not exists mission_link boolean not null default false,
  add column if not exists mission_video boolean not null default false,
  add column if not exists mission_disclosure boolean not null default true;  -- 광고·협찬(공정위) 표기,
  -- 방문형 전용
  add column if not exists address text,              -- 방문 주소
  add column if not exists visit_weekdays text,       -- 방문 가능 요일 (0=일 … 6=토, 쉼표로 구분. 비우면 모든 요일)
  add column if not exists visit_times text,          -- 방문 가능 시간대 (예: 11:00,14:00,16:00. 비우면 직접 입력)
  add column if not exists visit_notes text,          -- 방문 및 예약 안내
  add column if not exists detail_photo_url text;     -- 상세 이미지(포스터 등)
