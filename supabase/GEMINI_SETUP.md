# AI 노출 진단 (Gemini) 설정

`diagnose.html` 의 **진단하기**가 실제로 측정하게 만드는 순서예요. 끝내기 전에는 `landing-config.js` 의 `DIAGNOSE_LIVE` 를 `false` 로 두세요(샘플 리포트만 보여 줘요).

## 하는 일
업체명·지역·업종(·홈페이지)을 받아 서버(Edge Function `aeo-diagnose`)가

1. Gemini 로 "그 지역·업종을 찾는 고객이 AI에게 물을 질문" 10개를 만들고,
2. 질문마다 Gemini(구글 검색 연동)에게 물어 답변과 출처를 받고,
3. 답변에 업체명이 나왔는지(멘션), 출처에 홈페이지 도메인이 있었는지(인용), 어떤 출처·경쟁 업체가 나왔는지 세요.

한 번 진단 = Gemini 호출 **12번**(질문 생성 1 + 답변 10 + 경쟁 업체 정리 1).

## 1. API 키 받기
- 주소: **https://aistudio.google.com/apikey** (구글 계정으로 로그인 → "API 키 만들기")
- 무료 한도·가격은 바뀔 수 있어요. **https://ai.google.dev/pricing** 에서 직접 확인하세요.
  - 무료 등급은 분당·일일 호출 수가 적어서, 방문자에게 열어 두면 금방 찰 수 있어요. 진단이 `rate_limited` 로 자주 실패하면 유료 결제를 연결하는 것을 고려하세요.
  - 무료 등급에 보낸 내용은 구글 제품 개선에 쓰일 수 있다는 약관이 있어요(약관은 바뀔 수 있으니 직접 확인). 이 기능이 보내는 것은 업체명·지역·업종·질문뿐이고, 방문자 개인정보는 보내지 않아요.
- 키는 **서버 비밀값**으로만 두세요. 브라우저 코드·`config.js`·GitHub 에 넣으면 안 돼요.

## 2. 비밀값 등록
Supabase 대시보드 > Edge Functions > Secrets (또는 `supabase secrets set NAME=값`)

| 이름 | 필수 | 설명 |
|---|---|---|
| `GEMINI_API_KEY` | 필수 | 위에서 받은 키 |
| `GEMINI_MODEL` | 선택 | 기본 `gemini-2.5-flash`. 모델 이름이 바뀌었으면 여기서 바꿔요 |
| `IP_HASH_SALT` | 선택 | IP 해시에 섞는 임의 문자열. 비워 두면 서비스 키를 써요 |
| `DIAGNOSE_IP_LIMIT` | 선택 | IP 하나당 24시간 이용 횟수. 기본 3 |
| `DIAGNOSE_DAILY_LIMIT` | 선택 | 전체 24시간 이용 횟수. 기본 100 (= 하루 Gemini 약 1,200회) |

## 3. DB 와 함수 배포
1. Supabase > SQL Editor 에서 `supabase/022_diagnose.sql` 을 실행해요.
2. Edge Functions 에 `aeo-diagnose` 를 만들고 `supabase/functions/aeo-diagnose/index.ts` 를 배포해요. (`supabase functions deploy aeo-diagnose`)
   - 브라우저에서 부르므로 JWT 확인은 기본값(켜짐)으로 두세요. 사이트의 공개 키(`config.js`)로 호출돼요.
3. `landing-config.js` 에서 `DIAGNOSE_LIVE: true` 로 바꾸고 사이트를 다시 올려요.
4. `diagnose.html` 에서 실제 업체 하나를 진단해 보고, 결과(특히 출처 도메인·인용 수)가 맞게 나오는지 눈으로 확인하세요.

## 남용 방지 (무료 공개라서 넣었어요)
- IP 당 24시간 `DIAGNOSE_IP_LIMIT` 회, 전체 24시간 `DIAGNOSE_DAILY_LIMIT` 회. 한도 확인과 자리 예약은 DB 에서 잠금을 잡고 세서 동시에 눌러도 넘지 않아요.
- 같은 조건(업체명+지역+업종)은 24시간 동안 저장된 결과를 다시 보여 줘요(한도를 쓰지 않음).
- 원본 IP 는 저장하지 않고 해시값만 저장해요. 결과는 30일 뒤 삭제돼요.
- 실패한 호출은 IP 한도에는 넣지 않고, 전체 한도에는 넣어요(비용이 들 수 있어서).

## 측정의 한계 (화면에도 표시해요)
- Gemini API + 구글 검색 연동 결과예요. **실제 Gemini 앱·네이버·ChatGPT 의 답변과 다를 수 있어요.** 리포트는 "Gemini 1개 엔진 기준"이라고 표시해요.
- AI 답변은 질문·시점마다 달라서 1회 측정은 참고용이에요.
- "멘션"은 답변에 업체명 글자가 들어 있는지로 판단해요. 업체명이 흔한 단어면 실제와 다르게 잡힐 수 있어요.
- 월 검색량·구글 순위는 아직 없어요(별도 데이터 출처 필요).
- 출처 도메인은 응답의 `groundingMetadata.groundingChunks[].web.title` 을 써요. 링크 주소는 구글 중계 주소라 도메인으로 쓰지 않아요.

## 상태
- 모의 Gemini 응답으로 시험했어요: 입력 검사, 멘션·인용 집계, 동시 호출 제한, 재시도, 키 오류, 한도·캐시 흐름, 화면 표시.
- `022_diagnose.sql` 은 로컬 PostgreSQL 16 에서 한도·캐시·접근 차단·30일 삭제를 시험했어요.
- **실제 Gemini API 와 실제 Supabase 에서는 아직 실행해 보지 않았어요.** 응답 필드 이름(`candidates`, `groundingMetadata.groundingChunks`, 오류 코드 400 의 "API key not valid" 문구)은 공식 문서 형식을 기준으로 가정했으니, 첫 실호출 때 확인이 필요해요.
