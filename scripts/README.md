# scripts/coupang-seller-scraper.mjs

쿠팡 상품 상세페이지의 "판매자 정보"(전자상거래법상 통신판매업자가 의무적으로 공개해야 하는
사업자 연락처)에서 상호/이메일/연락처/사업자번호를 자동으로 수집해 CSV로 쌓아주는 스크립트입니다.

## 실행 전 꼭 확인할 것

- **쿠팡 이용약관**: 자동화된 수집(크롤링/스크래핑)을 금지하는 조항이 있을 수 있습니다.
  이 스크립트는 요청 사이에 3~7초 랜덤 지연을 두고 동시 접속 없이(직렬) 동작하지만,
  그래도 계정 정지·IP 차단 리스크는 사용자 본인 책임입니다. 소량으로 테스트해보세요.
- **개인정보 아님, 그러나 광고 메일은 별도 규제 대상**: 여기서 수집하는 이메일은
  판매자의 사업자 연락처(공개 의무 정보)이지, 개인 이용자의 개인정보가 아닙니다.
  다만 수집한 이메일로 **영리 목적의 광고성 메일**을 보낼 계획이라면
  정보통신망법 제50조에 따라 **사전 수신동의**가 필요하며, 위반 시 과태료(최대 3천만원) 대상입니다.
  수집과 "무단 광고 발송"은 법적으로 별개 문제입니다.
- 이 스크립트는 **로컬 PC(일반 인터넷 접근이 가능한 환경)에서 실행**해야 합니다.

## 준비

```bash
npm install   # playwright가 devDependency에 포함되어 있습니다
```

최초 1회, Playwright의 Chromium이 로컬에 없다면 아래 명령으로 받아주세요.
(회사/개인 PC에 이미 Playwright를 쓴 적이 있다면 생략 가능)

```bash
npx playwright install chromium
```

## 사용법

1. 수집할 URL 목록 파일을 만듭니다 (`urls.txt`). 한 줄에 하나씩:
   - 상품 상세페이지 URL: `https://www.coupang.com/vp/products/...`
   - 또는 검색결과 URL: `https://www.coupang.com/np/search?q=밀키트` (상세페이지 링크를 자동 수집)

   ```
   https://www.coupang.com/np/search?q=밀키트
   ```

2. 실행:

   ```bash
   node scripts/coupang-seller-scraper.mjs \
     --input urls.txt \
     --out data-out/coupang-sellers.csv \
     --limit 20 \
     --headless false
   ```

   처음에는 `--headless false`로 실행해서 브라우저 창을 직접 보면서
   탭 클릭·이메일 추출이 정상적으로 되는지 확인하는 것을 권장합니다.
   (쿠팡 페이지 구조는 수시로 바뀔 수 있어, 이메일을 못 찾으면 콘솔에 안내 메시지가 뜹니다.)

3. 결과는 `data-out/coupang-sellers.csv`에 누적 저장됩니다(같은 이메일/사업자번호는 중복 저장 안 함).
   이 폴더는 `.gitignore`에 포함되어 있어 저장소에는 커밋되지 않습니다.

## 옵션

| 옵션 | 설명 | 기본값 |
|---|---|---|
| `--input <file>` | URL 목록 파일 (필수) | - |
| `--out <file>` | 출력 CSV 경로 | `data-out/coupang-sellers.csv` |
| `--limit <n>` | 이번 실행에서 방문할 최대 상품 수 | 30 |
| `--search-limit <n>` | 검색결과 1개당 수집할 상품 링크 수 | 20 |
| `--delay-min` / `--delay-max` | 요청 간 지연 (ms) | 3000 / 7000 |
| `--headless <bool>` | headless 모드 여부 | true |

## 한계

쿠팡 페이지는 로그인 여부, A/B 테스트, 봇 탐지 로직에 따라 마크업이 달라질 수 있습니다.
"이메일을 찾지 못했습니다" 로그가 반복되면 `--headless false`로 실제 화면을 보면서
`extractSellerInfo` 함수의 라벨 매칭 로직을 해당 페이지 구조에 맞게 조정해야 합니다.
