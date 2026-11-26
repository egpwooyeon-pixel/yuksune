# 우리들 체험단

마케팅 커뮤니티(체험단 모집·신청) 사이트. 빌드 없는 정적 HTML/CSS/JS + Supabase(DB·로그인).

## 폴더
- `index.html` 홈(커뮤니티 게시판), `campaigns.html` 체험단 목록, `campaign.html` 상세·신청, `register.html` 광고주 등록, `login.html` 로그인/가입
- `supabase/` DB 스키마(`schema.sql` → `002_guest_apply.sql`)와 연결 가이드

## 기획 결정사항
# 우리들 체험단 — 기획 결정사항

- 신청 방식: **광고주 선정** (신청 → 광고주가 선정 → 체험 진행)
- 구매평 체험단: **포인트 지급 없음** (당분간)
- 캠페인 등록: 운영자가 사업자등록증을 확인·승인한 광고주가 **직접 입력**해서 등록 (네이버 플레이스 자동 입력은 보류). 서버(Supabase)에 저장
- 광고주 인증: 일반 가입은 누구나 → 사업자등록증 파일 업로드 → **운영자가 승인**해야 캠페인 등록 가능
- 신청: **비회원도 가능** (성함·핸드폰·채널주소·카카오톡ID 등). 후기 **2차 활용은 게시일로부터 6개월까지** 동의를 받음 (캠페인별 `reuse_months`, 기본 6)
- DB 변경 순서: `supabase/schema.sql` → `supabase/002_guest_apply.sql`
- 선정 안내 이메일: 코드는 준비되어 있으나 **보류** (config.js 의 `EMAIL_NOTIFY` 가 false). 켜려면 `supabase/EMAIL_SETUP.md` 순서대로 설정 후 true 로 변경
- 관리자 페이지: `admin-login.html`(관리자 로그인) → `admin.html`. 운영자 지정은 `profiles.role = 'admin'`, 집계/권한은 `supabase/008_admin.sql`. 사이트 메뉴에는 링크를 두지 않음 (주소로만 접속)

### AI 리뷰 원고 (블로그)
매장 리뷰를 바탕으로 AI(Gemini)가 블로그 홍보 원고 초안을 쓰고 운영자가 검수하는 기능. 화면: 관리자 > **AI 리뷰 원고 (체험단)** (`admin-review-drafts.html`). 리뷰·사진 **수집은 포함되지 않음** — 별도의 크롬 확장프로그램(네이버 플레이스/스마트스토어/구글 리뷰 수집 도구)으로 모은 CSV에서 옮겨 붙이는 방식. 설정 순서는 [`supabase/REVIEW_DRAFT_SETUP.md`](supabase/REVIEW_DRAFT_SETUP.md). "검수완료"는 발행이 아님(이 기능엔 발행 파이프라인이 없음) — 원고를 복사해서 네이버 블로그 등에 직접 올리는 걸 전제로 함. 쓰레드(Threads) 등 다른 종류의 원고, 리뷰 수집 자체의 사이트 내 연동은 다음 단계로 남아있음.

---

## EGP AI 스튜디오 (랜딩 · AI 노출 진단 · 정보 가이드)

같은 저장소에 들어 있는 별도 서비스예요. 체험단 사이트와 화면·DB 는 섞이지 않지만 Supabase 프로젝트와 `config.js` 의 운영자 정보는 같이 써요.

| 화면 | 파일 |
|---|---|
| 랜딩(상담 신청 폼, 레퍼런스) | `landing.html` · `landing.css` · `landing.js` |
| AI 노출 진단 (홈페이지 주소로 자동 채우기, 사진, 발행 설정) | `diagnose.html` |
| 해외 검색·AI 노출 진단 보고서 (병원 고객 전달용, **가상 예시 데이터**) | `overseas-report.html` — 보고서 값은 `overseas-report-data.js`, 상단의 "홈페이지 주소로 자동 점검"은 `aeo-prefill`(mode:overseas) 사용, 스위치 `OVERSEAS_LIVE` |
| 개인정보처리방침 | `landing-privacy.html` |
| 정보 가이드 (정적 글 페이지) | `guide/` ← `content/guides/*.json` 을 `tools/build-guides.mjs` 로 생성 |
| 관리자: 상담 접수 / 글 초안 검수 | `admin-inquiries.html` · `admin-drafts.html` |

### 기능 스위치 — `landing-config.js` (모두 기본 꺼짐)
| 스위치 | 켜면 | 켜기 전에 필요한 것 |
|---|---|---|
| `INQUIRY_LIVE` | 상담 신청이 DB 에 저장 | `021` SQL, 개인정보 보호책임자·보관 기간 |
| `DIAGNOSE_LIVE` | 진단이 실제 Gemini 로 측정 | `022` SQL, `aeo-diagnose` 배포, `GEMINI_API_KEY` ([`GEMINI_SETUP.md`](supabase/GEMINI_SETUP.md)) |
| `PREFILL_LIVE` | "정보 불러오기" 버튼 | `023` SQL, `aeo-prefill` 배포 ([`PREFILL_SETUP.md`](supabase/PREFILL_SETUP.md)) |
| `PHOTO_UPLOAD_LIVE` | 업체 사진 올리기 | `024` SQL, `aeo-photo` 배포, 사진 보관 기간 ([`PHOTO_SETUP.md`](supabase/PHOTO_SETUP.md)) |
| `ORDER_UI` | 상품·수량·기간 선택 카드 | `ORDER.products` 에 상품·단가 입력 |
| `SHOW_REFERENCE` | 랜딩의 레퍼런스 카드 | 사례 업체의 사용 동의, 의료광고 확인 |

### 글 초안 → 승인 → 공개
`025` SQL, `aeo-draft` 배포 후 관리자 > **글 초안 (EGP)** 에서 AI 초안을 만들고 사람이 검수·승인해요 ([`DRAFT_SETUP.md`](supabase/DRAFT_SETUP.md)). 승인된 글은 `node tools/export-approved.mjs` → `node tools/build-guides.mjs` → 확인 → 커밋·배포 순서로 올려요 ([`docs/PUBLISHING.md`](docs/PUBLISHING.md)).

### 문서
- 제품 계획·상태: [`docs/PLAN.md`](docs/PLAN.md) · 사용자가 정해야 할 것: [`docs/DECISIONS.md`](docs/DECISIONS.md) · 개발 기록(시험 결과·한계): [`docs/OVERNIGHT_LOG.md`](docs/OVERNIGHT_LOG.md)

### 시험
`bash tests/run-all.sh` (Node 22.18 이상, 브라우저 시험은 `npm i --no-save playwright axe-core` 후). 외부 서비스는 모두 모의라서 실제 연결은 확인되지 않아요 — [`tests/README.md`](tests/README.md)

### 지키는 원칙
사람의 승인 없이 글이 공개되지 않아요 · 글에는 입력된 사실과 출처만 써요 · 새 기능은 스위치가 꺼진 채로 합쳐요 · 비밀키는 저장소에 넣지 않아요(Supabase Secrets 에만).

