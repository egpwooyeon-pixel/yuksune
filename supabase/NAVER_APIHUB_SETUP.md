# 매장 찾기 (NAVER API HUB 지역 검색) 설정

관리자 > 순위 추적 > "키워드 등록" 상자의 **매장 찾기**가 쓰는 기능이에요.
매장명(또는 "매장명 + 지점명")으로 후보 업체 최대 5곳의 업체명·도로명주소·업종을 보여 줘요.

## 꼭 알아둘 것
- 후보 목록은 **화면에만** 표시돼요. DB·로그에 저장하지 않아요.
- 플레이스 URL/ID는 응답의 `link`에서 추정하지 않아요(`link`는 브라우저로 보내지도 않아요). **운영자가 네이버 플레이스 주소에서 직접 복사해 붙여 넣어요.**
- 목록 순서는 순위가 아니에요(`sort=random`). 순위 기록(rank_logs)과 무관해요. 순위 조회는 기존 SerpApi(`collect-ranks`)가 맡아요.
- 검색 결과가 없어도 매장명·플레이스 주소/ID를 직접 입력해 등록할 수 있어요.

## 필요한 환경변수 (서버 비밀값)
| 이름 | 값 |
|---|---|
| `NAVER_APIHUB_CLIENT_ID` | NAVER API HUB 애플리케이션의 Client ID (`X-NCP-APIGW-API-KEY-ID` 헤더로 전송) |
| `NAVER_APIHUB_CLIENT_SECRET` | Client Secret (`X-NCP-APIGW-API-KEY` 헤더로 전송) |

설정 위치: **Supabase 대시보드 > Edge Functions > Secrets** (또는 `supabase secrets set NAME=값`).
브라우저 코드·config.js·저장소 파일에는 절대 넣지 않아요.

## 배포
1. Supabase > Edge Functions 에서 `search-place` 함수를 만들고 `supabase/functions/search-place/index.ts` 내용을 배포해요.
2. 위 두 비밀값을 등록해요.
3. 관리자 화면에서 "갓구운빵공장 명동점"을 검색해, 지점별 주소가 나뉘어 보이는지 확인해요.

키가 없으면 화면에 "API 키가 설정되지 않았어요" 안내가 나오고 외부 호출은 하지 않아요.

## 상태
- 모의 응답으로 요청 주소·파라미터·헤더, 태그 제거, 오류 처리, 화면 동작을 시험했어요.
- **실제 NAVER API HUB 호출은 아직 해 보지 않았어요.** 응답 필드(`title`, `roadAddress`, `address`, `category`)는 기존 네이버 지역 검색 형식을 기준으로 가정했으니, 첫 실호출 때 확인이 필요해요.
