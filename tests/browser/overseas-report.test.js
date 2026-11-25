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
  const order = ['cover', 'auto', 'summary', 'map', 's1', 's2', 's3', 's4', 's5', 's5b', 'trend', 'compare', 'keep', 'fix', 'structure', 'content', 'roadmap', 'service', 'next'];
  ok('sections in required order', JSON.stringify(ids) === JSON.stringify(order));
  ok('cover shows client, date, sites, langs, rivals', await p.$eval('#cover', e => ['예시의원', '2026.11.20', '본점', '일본어', '경쟁의원 A'].every(t => e.textContent.includes(t))));
  ok('sample notice shown', (await p.$$('.sample-note')).length === 1);
  ok('auto section is the first section (page default highlight 자동 점검)', await p.$eval('#toc-list a[aria-current]', e => e.dataset.t) === 'auto');
  ok('summary has 3 reasons + 4 KPI cards + diag table', (await p.$$('#summary .num li')).length === 3 && (await p.$$('#summary .kpi')).length === 4 && (await p.$$('#summary tbody tr')).length === 6);
  ok('TOC has 11 items in page order', JSON.stringify(await p.$$eval('#toc-list a', a => a.map(x => x.textContent))) === JSON.stringify(['자동 점검', '요약', '색인', '주제', '신뢰', 'AI', '기회', '개선안', '콘텐츠', '일정', '서비스']));
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
  // ---------- 자동 점검 (예시 모드: 기본 설정) ----------
  await p.goto(URL0); await p.waitForSelector('html[data-ready="1"]');
  await p.fill('#auto-url', 'abc'); await p.click('#auto-go');
  ok('auto: bad url -> message, no result', (await p.textContent('#auto-msg')).includes('https://') && (await p.$('.auto-res')) === null && (await p.getAttribute('#auto-url', 'aria-invalid')) === 'true');
  await p.fill('#auto-url', 'https://m.place.naver.com/x'); await p.click('#auto-go');
  ok('auto: naver url unsupported msg', (await p.textContent('#auto-msg')).includes('네이버'));
  await p.fill('#auto-url', 'https://www.example-clinic.example'); await p.click('#auto-go');
  ok('auto(demo): shows 예시 결과 notice + findings + pages + 미측정', await p.$eval('#auto-out', e => e.textContent.includes('예시 결과') && e.querySelectorAll('tbody tr').length >= 10 && e.textContent.includes('월 검색량') && e.querySelectorAll('.rk.nm').length >= 4));
  ok('auto(demo): states it did not read the address', (await p.textContent('#auto-msg')).includes('예시 결과'));

  // ---------- 자동 점검 (실제 모드: 모의 서버) ----------
  const mk = async (res) => {
    const q = await b.newPage({ viewport: { width: 1100, height: 900 } }); const pe = []; q.on('pageerror', e => pe.push(String(e)));
    await q.route('**/supabase-js*', r => r.abort());
    await q.route('**/landing-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LANDING={OVERSEAS_LIVE:true};' }));
    await q.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.WOORI={SUPABASE_URL:"https://x.supabase.co",SUPABASE_ANON_KEY:"k"};' }));
    await q.addInitScript(res => { window.__calls = []; window.supabase = { createClient: () => ({ functions: { invoke: async (n, o) => { window.__calls.push({ n, o }); await new Promise(r => setTimeout(r, 150)); return res.code ? { data: null, error: { context: { json: async () => ({ error: res.code }) } } } : res; } } }) }; }, res);
    await q.goto(URL0); await q.waitForSelector('html[data-ready="1"]'); return { q, pe };
  };
  const audit = { site: { host: 'www.sample-clinic.kr' }, measuredAt: '2026-11-25', skipped: 1, unmeasured: ['월 검색량(국가별 검색어)'], pages: [{ lang: 'ko', title: '<img src=x onerror="window.__x=1">', titleWidth: 10, description: '', descWidth: 0, h1: '', h1Count: 2, hreflang: ['ko', 'ja'] }],
    findings: [{ area: '제목(title)', status: 'ok', found: '<b id="hack">정상</b>', todo: '유지' }, { area: 'AI 크롤러 접근', status: 'warn', found: 'GPTBot 차단', todo: '검토' }, { area: '사이트맵(sitemap)', status: 'none', found: '못 읽음', todo: '만드세요' }] };
  let { q, pe } = await mk({ data: { audit }, error: null });
  ok('auto(live): demo notice absent', !(await q.textContent('#auto-msg')).includes('예시 결과'));
  await q.fill('#auto-url', 'https://www.sample-clinic.kr/'); await q.click('#auto-go'); await q.click('#auto-go', { force: true }).catch(() => {});
  ok('auto(live): busy -> button disabled + progress', await q.isDisabled('#auto-go') && (await q.textContent('#auto-msg')).includes('읽는 중'));
  await q.waitForSelector('.auto-res'); await q.waitForTimeout(100);
  const calls = await q.evaluate(() => window.__calls);
  ok('auto(live): exactly one call to aeo-prefill with mode overseas', calls.length === 1 && calls[0].n === 'aeo-prefill' && calls[0].o.body.mode === 'overseas' && calls[0].o.body.url === 'https://www.sample-clinic.kr/');
  ok('auto(live): 측정 결과 notice with host/date/skipped, tally, button re-enabled', await q.$eval('#auto-out', e => e.textContent.includes('www.sample-clinic.kr') && e.textContent.includes('2026-11-25') && e.textContent.includes('읽지 못한 언어 페이지 1개') && e.textContent.includes('정상 1') && e.textContent.includes('개선 필요 1') && e.textContent.includes('확인 불가 1')) && !(await q.isDisabled('#auto-go')));
  ok('auto(live): XSS — markup from server is escaped', (await q.evaluate(() => window.__x)) === undefined && (await q.$('#hack')) === null && (await q.$eval('#auto-out', e => e.textContent.includes('<img src=x'))));
  ok('auto(live): no page errors', pe.length === 0); await q.close();
  for (const [code, text] of [['rate_limited', '시간당'], ['blocked_url', '읽을 수 없어요'], ['fetch_failed', '열지 못했어요']]) {
    const r = await mk({ code });
    await r.q.fill('#auto-url', 'https://www.sample-clinic.kr/'); await r.q.click('#auto-go'); await r.q.waitForFunction(t => document.getElementById('auto-msg').textContent.includes(t), text);
    ok('auto(live): error ' + code + ' -> friendly message, no result, button usable', (await r.q.$('.auto-res')) === null && !(await r.q.isDisabled('#auto-go'))); await r.q.close();
  }


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
