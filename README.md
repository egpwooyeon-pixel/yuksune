# 압도적육수 육수네 홈페이지

"육수네 압도적 코인육수" 홈페이지입니다. Next.js(App Router) 기반의 순수 정적 사이트로,
별도의 데이터베이스 없이 데이터 파일만 수정하면 내용이 바뀝니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속

배포용 빌드 확인:

```bash
npm run build
npm start
```

## 내용 수정 방법 (코드 몰라도 OK)

아래 두 파일만 수정하면 홈페이지 전체 내용이 바뀝니다.

- `data/site.js`
  - 브랜드명/로고, 전화번호/카카오톡/스마트스토어 링크, 판매자 정보(사업자등록번호 등), SEO(검색엔진 노출) 설정
  - `TODO` 라고 적힌 항목은 아직 실제 정보가 아닌 예시(placeholder)입니다.
- `data/posts.js`
  - 홈 화면 카드 목록(사골육수, 멸치육수 등). 배열에 객체를 추가/삭제/수정하면 카드가 그대로 늘어나거나 줄어듭니다.
  - `image`는 `public/images/` 안의 파일 경로입니다. 새 사진은 `public/images/`에 넣고 경로만 연결해주세요.

디자인(색상, 레이아웃)을 바꾸고 싶다면 `app/globals.css`의 `:root` 변수만 바꿔도
전체 색상 톤이 함께 바뀝니다.

## 아직 채워야 할 실제 정보 (TODO)

- 대표 전화번호, 카카오톡 채널 URL (`data/site.js`의 `contact`)
- `data/posts.js`의 마지막 카드("새 제품")는 제목/설명이 비어 있고 사진도 로고 이미지가 임시로
  들어가 있습니다 — 실제 제품 정보로 교체해주세요.
- 실제 배포 도메인 (`app/layout.js`, `app/robots.js`, `app/sitemap.js`의 `TODO` 주석 참고)

## 부가 도구

- `scripts/coupang-seller-scraper.mjs`: 쿠팡 상품 상세페이지의 판매자 정보(상호/이메일/연락처 등)를
  자동으로 수집해 CSV로 저장하는 스크립트입니다. 사용법과 주의사항은 `scripts/README.md` 참고.

## 배포

### Vercel (권장, 별도 설정 불필요)

이 프로젝트는 표준 Next.js 프로젝트 구조를 갖추고 있어 Vercel에서 Import 시
Framework Preset이 **Next.js**로 자동 인식됩니다. 커스텀 설정 없이 그대로 Deploy 하면 됩니다.

### GitHub Pages (대안)

`.github/workflows/deploy-pages.yml`이 이미 포함되어 있어 `main` 브랜치에 push할 때마다
자동으로 정적 사이트를 빌드해 GitHub Pages에 배포합니다. 다만 **최초 1회, 저장소 관리자가
직접 켜야 하는 설정**이 있습니다 (API로 대신 켤 수 없는 GitHub 권한 설정이라 수동으로 해주셔야 합니다):

1. 저장소 **Settings → Pages**로 이동
2. **Source**를 **GitHub Actions**로 선택

설정 후에는 `main`에 push될 때마다 자동으로 다시 배포되며,
`https://<계정명>.github.io/yuksune/` 주소로 접속할 수 있습니다.

GitHub Pages는 `/yuksune/` 하위 경로에서 서비스되므로, 로컬 빌드와 다르게
`GITHUB_PAGES=true npm run build` 환경변수로 빌드해야 이미지 경로가 올바르게 붙습니다
(워크플로우가 이미 이 환경변수를 설정해서 빌드합니다).
