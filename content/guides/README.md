# 정보 가이드 (정적 글 사이트)

업체 정보를 바탕으로 만든 안내 글을 정적 페이지로 만드는 폴더예요. 아직 **예시 글(가상 업체)** 하나만 있어요.

## 쓰는 법
0. **승인된 AI 초안은** `node tools/export-approved.mjs` 로 이 폴더에 내보내요. 전체 절차와 공개 전 체크리스트는 `docs/PUBLISHING.md` 를 보세요.
1. 글 하나를 `content/guides/<slug>.json` 으로 직접 만들어도 돼요. (형식은 `sample-outdoor-wedding.json` 참고)
2. `node tools/build-guides.mjs` 를 실행하면 `guide/` 에 페이지가 만들어져요. (Node 18 이상, 설치할 것 없음)
3. 만들어진 `guide/*.html` 을 저장소에 올리면 사이트에서 `/guide/` 로 열려요.

## 안전장치
- 글의 모든 문구는 HTML 로 이스케이프되고, 링크는 http/https 만 허용돼요.
- 검증에 실패하면 아무 파일도 쓰지 않아요.
- `_site.json` 의 `indexable` 이 true 이고 `baseUrl` 이 있기 전에는 모든 페이지가 noindex 이고 sitemap 도 만들지 않아요. `sample: true` 글은 항상 noindex 예요.
- 모든 글에 "광고" 표시와 안내 문구가 붙어요(`adLabel`, `adDisclosure`).

## 아직 없는 것 (다음 단계)
- 승인 즉시 자동 공개. 지금은 사람이 내보내기 → 확인 → 커밋 → 배포해요(`docs/PUBLISHING.md`).
- 병원·의료 글은 사실 확인과 의료광고 규정 검토 없이 발행하지 마세요.
