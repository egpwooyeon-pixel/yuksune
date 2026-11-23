# SerpApi 연결 설정 (처음 1회)

관리자 화면 "플레이스 순위 추적"의 **지금 조회**와 하루 한 번 자동 수집이 이 설정으로 동작합니다.
지표: **네이버 통합검색 플레이스 노출 순서** (engine=naver, where=nexearch, device=mobile, query=등록한 키워드)

## 1. DB 준비
SQL Editor 에서 순서대로 실행: `017_rank_multi.sql` → `020_serpapi.sql`
(020 은 조회 한도 하루 5회·월 200회(한국 시간), 활성 키워드 5개 제한, 자동 수집 스위치를 만듭니다)

## 2. SerpApi 키 만들기 (직접)
1. serpapi.com 가입 → Dashboard 에서 API Key 복사 (**비밀번호처럼 다루고 채팅·GitHub 에 올리지 마세요**)
2. 무료 한도·요금은 serpapi.com/pricing 에서 확인 (이 프로젝트는 하루 5회·월 200회까지만 호출하도록 서버에서 막아 둠)

## 3. Supabase 에 함수와 비밀값 올리기
1. Supabase > Edge Functions > Deploy a new function > Via Editor, 이름 `collect-ranks`, `supabase/functions/collect-ranks/index.ts` 내용을 붙여넣고 Deploy
2. Edge Functions > Secrets 에 등록 (이름은 `.env.example` 참고)
   - `SERPAPI_API_KEY` = 2번의 키
   - `CRON_SECRET` = 아무도 모르는 긴 문자열 (예약 실행 확인용)
3. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 가 자동으로 넣어 줍니다 (직접 입력 금지)

## 4. 첫 검증 (갓구운빵공장 명동점 / 명동 빵집 한 건)
1. 관리자 화면 > 플레이스 순위 추적 > **테스트 예시 채우기**
2. 네이버 플레이스 주소(또는 ID 숫자)를 붙여 넣고 **키워드 등록**
3. 목록에서 **지금 조회** → "N번째로 노출돼요" 또는 "이번 조회 결과에 미노출"이 나오고, 행을 눌러 날짜별 기록을 확인
4. 같은 키워드를 바로 한 번 더 누르면 "오늘 이미 조회한 결과예요(조회 횟수 사용 안 함)"가 나와야 정상

## 5. 자동 수집 (선택, 기본 꺼짐)
화면의 "자동 수집" 스위치를 켠 뒤, `020_serpapi.sql` 맨 아래 주석의 `cron.schedule` 예시를 (pg_cron·pg_net 확장을 켜고) 실행합니다.
오늘 이미 조회한 키워드는 건너뛰고, 한도에 닿으면 멈춥니다.
