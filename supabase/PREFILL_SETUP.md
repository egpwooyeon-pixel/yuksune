# 홈페이지 주소로 업체 정보 자동 채우기 (aeo-prefill) 설정

진단 화면에서 홈페이지 주소를 넣고 **정보 불러오기**를 누르면 업체명·지역·업종·대표 서비스를 채워 주는 기능이에요.
**Gemini 키가 필요 없어요.** (서버가 홈페이지의 HTML 을 읽어 정리해요.) 끝내기 전에는 `landing-config.js` 의 `PREFILL_LIVE` 를 `false` 로 두세요(버튼이 숨겨져요).

## 읽는 방법
홈페이지의 JSON-LD(schema.org) → og/meta 태그 → `<title>` → 본문 속 한국 주소 형태 순서로 찾아요.
못 찾은 항목은 비워 두고, 사용자가 직접 쓴 칸은 덮어쓰지 않아요. 자동으로 채운 칸은 초록색으로 표시해요.

## 지원하지 않는 것
- **네이버 플레이스·지도 주소**(naver.com, naver.me): 화면이 동적이고 이용 약관 문제가 있어 읽지 않아요. 안내 문구만 보여 줘요.
- 로그인이 필요한 페이지, 자바스크립트로만 그려지는 홈페이지(서버가 받는 HTML 에 정보가 없는 경우)는 못 읽을 수 있어요.

## 보안 (서버가 남이 입력한 주소로 접속하는 기능이라 넣은 것)
- http/https, 기본 포트만 허용. IP 주소·localhost·내부 도메인·`user:pass@` 주소는 거절해요.
- 리다이렉트는 직접 따라가며(최대 3번) 이동할 때마다 같은 검사를 다시 해요.
- DNS 로 조회되는 IP 가 사설·루프백·링크로컬(클라우드 메타데이터 주소 포함)이면 거절해요. 단, 조회와 접속 사이의 DNS 변조까지는 막지 못해요.
- 응답 600KB·8초 제한, text/html 만 읽어요. 페이지 내용은 돌려주지 않고 추린 항목만 돌려줘요.
- IP(해시값)당 1시간 20회(환경변수 `PREFILL_HOURLY_LIMIT` 로 조정). 원본 IP 는 저장하지 않고 2일 뒤 기록을 지워요.

## 켜는 순서
1. Supabase > SQL Editor 에서 `supabase/023_prefill.sql` 을 실행해요.
2. Edge Functions 에 `aeo-prefill` 을 만들고 `supabase/functions/aeo-prefill/index.ts` 를 배포해요. (JWT 확인은 켜진 기본값 그대로)
   - `IP_HASH_SALT` 비밀값은 진단 기능(`GEMINI_SETUP.md`)과 같은 것을 써요. 없어도 동작해요.
3. `landing-config.js` 에서 `PREFILL_LIVE: true` 로 바꾸고 사이트를 다시 올려요.
4. 진단 화면에서 실제 홈페이지 주소 몇 개로 눈으로 확인해요. 틀리게 읽는 홈페이지가 있으면 알려 주세요.

## 상태
- 시험용 HTML·모의 응답으로 시험했어요: 주소 검사(내부망·IP 표기 변형·리다이렉트 우회), 정보 추출, 크기·형식 제한, 한도, 화면 동작.
- `023_prefill.sql` 은 로컬 PostgreSQL 16 에서 한도·만료 삭제·접근 차단을 시험했어요.
- **실제 홈페이지로는 아직 실행해 보지 않았어요**(이 개발 환경에서 외부 접속이 안 돼요). 실제 사이트마다 구조가 달라 읽히는 정도가 다를 수 있어요.

## 해외 진단 자동 점검 (mode: "overseas")
`overseas-report.html` 의 "홈페이지 주소로 자동 점검"이 같은 함수(`aeo-prefill`)를 `{ url, mode: "overseas" }` 로 불러요. **Gemini 키가 필요 없고**, 새 SQL 도 없어요(023 의 한도 표를 같이 써요).
- 서버가 읽는 것: 홈페이지 + 같은 사이트의 다른 언어 페이지(최대 3개, hreflang 기준) + robots.txt + sitemap.xml. 모든 접속은 위 SSRF 검사를 그대로 거쳐요. 다른 도메인의 언어 페이지는 읽지 않아요.
- 점검 항목: 언어별 페이지 연결(hreflang·되돌아 연결·x-default), title·description·H1·canonical 길이/중복, lang 표시, 구조화 데이터, robots.txt(AI 크롤러 GPTBot 등 포함), sitemap.
- **측정하지 않는 것**(결과에 "미측정"으로 표시): 월 검색량, 구글 순위, AI 인용 횟수, 외부 참조 도메인, 경쟁사 비교 — 외부 유료 도구가 필요해요.
- 한도: IP(해시)당 1시간 `OVERSEAS_HOURLY_LIMIT`회(기본 5). 일반 정보 불러오기 횟수와 같은 표에 기록돼서, 두 기능을 합쳐 센 값이 한도에 쓰여요.
- 켜는 법: ① 023 SQL 실행(이미 했다면 생략) ② `supabase/functions/aeo-prefill/index.ts` 를 다시 배포 ③ `landing-config.js` 의 `OVERSEAS_LIVE: true` ④ 실제 병원 홈페이지로 한 번 점검해 결과가 맞는지 눈으로 확인.
- 아직 **실제 홈페이지로는 실행해 보지 않았어요**(개발 환경에서 외부 접속 불가). 모의 HTML·robots·sitemap 으로만 시험했어요. 사이트마다 구조가 달라 못 읽는 항목은 "확인 불가"로 나와요.
