#!/usr/bin/env node
/**
 * 쿠팡 상품 상세페이지의 "판매자 정보"(사업자등록/통신판매업 신고 의무 공개 항목)에서
 * 상호, 이메일, 연락처, 사업자번호 등을 수집해 CSV로 저장하는 스크립트.
 *
 * 사용 전 반드시 확인:
 *  - 쿠팡 이용약관상 자동 수집(크롤링)이 금지되어 있을 수 있습니다. 요청 간 지연(딜레이)을
 *    두고 동시 접속 없이(직렬) 소량만 조회하세요. 과도한 트래픽은 IP 차단으로 이어질 수 있습니다.
 *  - 여기서 수집하는 정보는 개인정보가 아닌, 통신판매업자가 법적으로 공개해야 하는
 *    사업자 연락처입니다. 다만 수집한 이메일로 광고성 메일을 보낼 경우
 *    정보통신망법 제50조(사전 수신동의 의무)가 별도로 적용되니 유의하세요.
 *
 * 사용법:
 *   node scripts/coupang-seller-scraper.mjs --input urls.txt --out data-out/coupang-sellers.csv
 *
 * urls.txt 형식: 한 줄에 하나씩
 *   - 상품 상세페이지 URL (https://www.coupang.com/vp/products/...)
 *   - 또는 검색결과 URL (https://www.coupang.com/np/search?q=...) -> 상세페이지 링크를 자동 수집
 *
 * 옵션:
 *   --input <file>       URL 목록 파일 (필수)
 *   --out <file>         출력 CSV 경로 (기본: data-out/coupang-sellers.csv)
 *   --limit <n>          이번 실행에서 방문할 최대 상품 상세페이지 수 (기본: 30)
 *   --delay-min <ms>     요청 간 최소 지연 (기본: 3000)
 *   --delay-max <ms>     요청 간 최대 지연 (기본: 7000)
 *   --headless <bool>    headless 모드 여부 (기본: true, 디버깅 시 false 권장)
 *   --search-limit <n>   검색결과 URL 1개당 수집할 상품 링크 최대 개수 (기본: 20)
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.input) {
  console.error('사용법: node scripts/coupang-seller-scraper.mjs --input urls.txt [--out data-out/coupang-sellers.csv]');
  process.exit(1);
}

const INPUT_FILE = path.resolve(process.cwd(), args.input);
const OUT_FILE = path.resolve(process.cwd(), args.out || 'data-out/coupang-sellers.csv');
const LIMIT = Number(args.limit ?? 30);
const SEARCH_LIMIT = Number(args['search-limit'] ?? 20);
const DELAY_MIN = Number(args['delay-min'] ?? 3000);
const DELAY_MAX = Number(args['delay-max'] ?? 7000);
const HEADLESS = args.headless === undefined ? true : args.headless !== 'false';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const CSV_COLUMNS = [
  'company',
  'email',
  'phone',
  'bizNumber',
  'mailOrderNumber',
  'address',
  'productTitle',
  'productUrl',
  'collectedAt',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return sleep(min + Math.random() * (max - min));
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function loadExisting(outFile) {
  const seenEmails = new Set();
  const seenBizNumbers = new Set();
  if (fs.existsSync(outFile)) {
    const text = fs.readFileSync(outFile, 'utf8');
    const lines = text.split('\n').slice(1);
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(',');
      const email = (cols[1] || '').replace(/^"|"$/g, '');
      const bizNumber = (cols[3] || '').replace(/^"|"$/g, '');
      if (email) seenEmails.add(email.toLowerCase());
      if (bizNumber) seenBizNumbers.add(bizNumber);
    }
  }
  return { seenEmails, seenBizNumbers };
}

function appendRow(outFile, row) {
  const dir = path.dirname(outFile);
  fs.mkdirSync(dir, { recursive: true });
  const isNew = !fs.existsSync(outFile);
  const line = CSV_COLUMNS.map((c) => csvEscape(row[c])).join(',') + '\n';
  if (isNew) {
    fs.writeFileSync(outFile, CSV_COLUMNS.join(',') + '\n' + line, 'utf8');
  } else {
    fs.appendFileSync(outFile, line, 'utf8');
  }
}

function isProductUrl(url) {
  return /\/vp\/products\//.test(url);
}

async function collectProductLinksFromSearch(page, searchUrl, limit) {
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  const hrefs = await page.$$eval('a[href*="/vp/products/"]', (as) =>
    as.map((a) => a.getAttribute('href')).filter(Boolean)
  );
  const abs = hrefs.map((h) => new URL(h, 'https://www.coupang.com').toString());
  return Array.from(new Set(abs)).slice(0, limit);
}

async function extractSellerInfo(page) {
  const tabLabels = ['배송/교환/반품 안내', '판매자 정보', '상품정보제공고시'];
  for (const label of tabLabels) {
    try {
      const tab = page.getByText(label, { exact: false }).first();
      if ((await tab.count()) > 0) {
        await tab.click({ timeout: 3000 });
        await page.waitForTimeout(800);
      }
    } catch {
      // 탭이 없거나 클릭 실패해도 계속 진행 (이미 렌더링된 페이지일 수 있음)
    }
  }

  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(1000);

  return page.evaluate(() => {
    const labelMap = [
      [['상호', '대표자'], 'company'],
      [['e-mail', 'email', '이메일'], 'email'],
      [['사업자번호', '사업자등록번호'], 'bizNumber'],
      [['통신판매업'], 'mailOrderNumber'],
      [['연락처', '전화'], 'phone'],
      [['사업장 소재지', '소재지'], 'address'],
    ];

    const findKey = (labelText) => {
      const lower = labelText.toLowerCase();
      for (const [keys, field] of labelMap) {
        if (keys.some((k) => lower.includes(k.toLowerCase()))) return field;
      }
      return null;
    };

    const result = {};
    const pairs = [];

    document.querySelectorAll('tr').forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll('th, td'));
      for (let i = 0; i < cells.length - 1; i += 2) {
        pairs.push([cells[i].innerText.trim(), cells[i + 1].innerText.trim()]);
      }
    });

    document.querySelectorAll('dl').forEach((dl) => {
      const dts = Array.from(dl.querySelectorAll('dt'));
      const dds = Array.from(dl.querySelectorAll('dd'));
      dts.forEach((dt, i) => {
        if (dds[i]) pairs.push([dt.innerText.trim(), dds[i].innerText.trim()]);
      });
    });

    for (const [label, value] of pairs) {
      const field = findKey(label);
      if (field && !result[field] && value) {
        result[field] = value;
      }
    }

    if (!result.email) {
      const text = document.body.innerText;
      const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (m) result.email = m[0];
    }

    return result;
  });
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`입력 파일을 찾을 수 없습니다: ${INPUT_FILE}`);
    process.exit(1);
  }

  const rawLines = fs
    .readFileSync(INPUT_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const { seenEmails, seenBizNumbers } = loadExisting(OUT_FILE);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'ko-KR' });
  const page = await context.newPage();

  let productUrls = [];
  for (const line of rawLines) {
    if (isProductUrl(line)) {
      productUrls.push(line);
    } else {
      console.log(`검색결과 URL에서 상품 링크 수집 중: ${line}`);
      try {
        const links = await collectProductLinksFromSearch(page, line, SEARCH_LIMIT);
        console.log(`  -> ${links.length}개 상품 링크 발견`);
        productUrls.push(...links);
        await randomDelay(DELAY_MIN, DELAY_MAX);
      } catch (e) {
        console.error(`  검색결과 처리 실패: ${e.message}`);
      }
    }
  }

  productUrls = Array.from(new Set(productUrls)).slice(0, LIMIT);
  console.log(`총 ${productUrls.length}개 상품 상세페이지를 방문합니다.`);

  let collected = 0;
  for (const [idx, url] of productUrls.entries()) {
    console.log(`[${idx + 1}/${productUrls.length}] ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1200);

      let productTitle = '';
      try {
        productTitle = await page.title();
      } catch {}

      const info = await extractSellerInfo(page);

      if (!info.email) {
        console.log('  이메일을 찾지 못했습니다. (탭 구조 변경 가능성, --headless false로 확인 권장)');
      } else if (seenEmails.has(info.email.toLowerCase()) || (info.bizNumber && seenBizNumbers.has(info.bizNumber))) {
        console.log(`  이미 수집된 판매자입니다: ${info.email}`);
      } else {
        const row = {
          ...info,
          productTitle,
          productUrl: url,
          collectedAt: new Date().toISOString(),
        };
        appendRow(OUT_FILE, row);
        seenEmails.add(info.email.toLowerCase());
        if (info.bizNumber) seenBizNumbers.add(info.bizNumber);
        collected++;
        console.log(`  수집 완료: ${info.company ?? '(상호 미확인)'} / ${info.email}`);
      }
    } catch (e) {
      console.error(`  실패: ${e.message}`);
    }

    if (idx < productUrls.length - 1) {
      await randomDelay(DELAY_MIN, DELAY_MAX);
    }
  }

  await browser.close();
  console.log(`완료. 신규 ${collected}건을 ${OUT_FILE} 에 저장했습니다.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
