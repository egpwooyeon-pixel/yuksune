// 해외 검색·AI 노출 진단 보고서(overseas-report.html) 브라우저 시험 — 정적 파일을 직접 열어 확인
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const URL0 = 'file://' + path.resolve(__dirname, '../../overseas-report.html');
let fail = 0;
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; };

(async () => {
  const b = await chromium.launch();
  const errs = [];
  // 데스크톱
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/pretendard|net::ERR|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
  await p.goto(URL0); await p.waitForSelector('html[data-ready="1"]');
  const ids = await p.$$eval('main section[id], main .cover', els => els.map(e => e.id));
  const order = ['cover', 'summary', 'map', 's1', 's2', 's3', 's4', 's5', 's5b', 'trend', 'compare', 'keep', 'fix', 'structure', 'content', 'roadmap', 'service', 'next'];
  ok('sections in required order', JSON.stringify(ids) === JSON.stringify(order));
  ok('cover shows client, date, sites, langs, rivals', await p.$eval('#cover', e => ['예시의원', '2026.11.20', '본점', '일본어', '경쟁의원 A'].every(t => e.textContent.includes(t))));
  ok('sample notice shown', (await p.$$('.sample-note')).length === 1);
  ok('summary has 3 reasons + 4 KPI cards + diag table', (await p.$$('#summary .num li')).length === 3 && (await p.$$('#summary .kpi')).length === 4 && (await p.$$('#summary tbody tr')).length === 6);
  ok('TOC has 10 items in page order', JSON.stringify(await p.$$eval('#toc-list a', a => a.map(x => x.textContent))) === JSON.stringify(['요약', '색인', '주제', '신뢰', 'AI', '기회', '개선안', '콘텐츠', '일정', '서비스']));
  ok('desktop TOC visible & sticky, mobile TOC hidden', await p.$eval('.toc', e => getComputedStyle(e).position === 'sticky' && e.offsetParent !== null) && await p.$eval('#toc-mob', e => getComputedStyle(e).display === 'none'));

  // 막대: 조각 너비는 검색량에 비례, 같은 척도
  const data = await p.evaluate(() => window.REPORT.s5.countries);
  const segs = await p.$$eval('.brow', rows => rows.map(r => [...r.querySelectorAll('.seg')].map(s => s.getBoundingClientRect().width)));
  const trackW = await p.$eval('.btrack', e => e.getBoundingClientRect().width);
  const keys = ['jp', 'tw', 'en'];
  const tots = keys.map(k => data[k].keywords.reduce((s, x) => s + (x.vol || 0), 0)); const mx = Math.max(...tots);
  let prop = true;
  keys.forEach((k, ri) => data[k].keywords.forEach((x, i) => { const exp = x.vol / mx * trackW; if (Math.abs(segs[ri][i] - exp) > 1.5) prop = false; }));
  ok('segment width proportional to volume (shared scale)', prop);
  const sums = segs.map(r => r.reduce((a, c) => a + c, 0));
  ok('bar total length ratio equals total volume ratio', Math.abs(sums[1] / sums[0] - tots[1] / tots[0]) < 0.02);
  ok('country name + monthly total above; exposure counts below', await p.$eval('.brow', e => e.querySelector('.btop').textContent.includes('월간 합계') && e.querySelector('.bbot').textContent.includes('노출')));

  // 탭
  ok('tabs: 일본 default; 4 tabs', (await p.$$eval('[role=tab]', t => t.map(x => x.textContent + x.getAttribute('aria-selected'))).then(a => a.join())) === '일본true,대만false,영어권false,중국false');
  ok('JP table columns & rank kinds', await p.$eval('#pn-jp', e => ['현지 검색어', '한국어 뜻', '월 검색량', '예시의원 순위', '경쟁의원 A 순위'].every(t => e.textContent.includes(t)) && e.querySelector('.rk.out') && e.querySelector('.rk.na') && e.querySelector('.rk.rank')));
  await p.click('#tab-cn');
  ok('CN tab: panel shown, no search volume column', await p.$eval('#pn-cn', e => !e.hidden && !e.textContent.includes('월 검색량') && e.textContent.includes('간체') && e.textContent.includes('번체') && e.textContent.includes('본토')));
  ok('CN tab hides others', await p.$eval('#pn-jp', e => e.hidden));
  await p.focus('#tab-cn'); await p.keyboard.press('ArrowRight');
  ok('keyboard: ArrowRight wraps to 일본', await p.$eval('#tab-jp', e => e.getAttribute('aria-selected') === 'true'));
  await p.click('#tab-tw'); ok('TW table has nm ("미측정") distinct from out', await p.$eval('#pn-tw', e => e.querySelector('.rk.nm') && e.querySelector('.rk.out')));

  // 목차 이동·강조
  await p.click('#toc-list a[data-t="s3"]'); await p.waitForTimeout(700);
  ok('TOC click scrolls to 신뢰 and highlights it', await p.$eval('#toc-list a[aria-current]', e => e.dataset.t) === 's3' && (await p.$eval('#s3', e => Math.abs(e.getBoundingClientRect().top) < 140)));
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(300);
  ok('end of page highlights 서비스', await p.$eval('#toc-list a[aria-current]', e => e.dataset.t) === 'service');

  // XSS: 데이터에 태그가 있어도 문자로만 표시
  const x = await b.newPage({ viewport: { width: 900, height: 700 } });
  await x.addInitScript(() => { Object.defineProperty(window, 'REPORT', { configurable: true, set(v) { v.meta.client = '<img src=x onerror="window.__x=1">'; v.s5.countries.jp.keywords[0].kw = '<b id="hack">x</b>'; Object.defineProperty(window, 'REPORT', { value: v, writable: true, configurable: true }); }, get() { return undefined; } }); });
  await x.goto(URL0); await x.waitForSelector('html[data-ready="1"]');
  ok('XSS: markup in data is escaped', (await x.evaluate(() => window.__x)) === undefined && (await x.$('#hack')) === null);
  await x.close();

  await p.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/rep-d-top.png' : '/dev/null' }).catch(() => {});
  ok('no console/page errors (desktop)', errs.length === 0);
  if (errs.length) console.log(errs);

  // 모바일 + #s5 직접 접속
  const m = await b.newPage({ viewport: { width: 390, height: 800 } });
  const merr = []; m.on('pageerror', e => merr.push(String(e)));
  await m.goto(URL0 + '#s5'); await m.waitForSelector('html[data-ready="1"]'); await m.waitForTimeout(400);
  const t5 = await m.$eval('#s5', e => e.getBoundingClientRect().top);
  ok('#s5 direct load lands on 기회 section (below sticky bars)', t5 >= 0 && t5 < 160);
  ok('mobile: collapsible TOC shown, desktop TOC hidden', await m.$eval('#toc-mob', e => getComputedStyle(e).display !== 'none') && await m.$eval('.toc', e => getComputedStyle(e).display === 'none'));
  ok('mobile: TOC highlights 기회 after #s5 load', (await m.$eval('#toc-mob-list a[aria-current]', e => e.dataset.t)) === 's5');
  await m.click('#toc-mob summary'); await m.click('#toc-mob-list a[data-t="s2"]'); await m.waitForTimeout(600);
  ok('mobile: TOC link navigates and closes', await m.$eval('#toc-mob', e => !e.open) && (await m.$eval('#s2', e => Math.abs(e.getBoundingClientRect().top) < 170)));
  ok('mobile: no horizontal page scroll', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok('no page errors (mobile)', merr.length === 0);
  if (process.env.SHOTS) { await m.goto(URL0 + '#s5'); await m.waitForTimeout(500); await m.screenshot({ path: process.env.SHOTS + '/rep-m-s5.png' }); await p.goto(URL0 + '#s5'); await p.waitForTimeout(500); await p.screenshot({ path: process.env.SHOTS + '/rep-d-s5.png' }); await p.goto(URL0); await p.waitForTimeout(500); await p.screenshot({ path: process.env.SHOTS + '/rep-d-top.png' }); }
  await b.close();
  console.log(fail ? fail + ' FAILED' : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})();
