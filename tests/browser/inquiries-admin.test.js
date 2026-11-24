const ROOT_DIR = require('path').resolve(__dirname, '../..');
const ROOT = require('url').pathToFileURL(ROOT_DIR).href + '/';
const OUTDIR = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
const errs = [];
const OUT = OUTDIR;

(async () => {
  const b = await chromium.launch();

  // ---------- 1) 상담 폼: 신청 조건이 order_info 로 저장됨 ----------
  async function landing(url, cfg) {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/supabase-js*', r => r.abort());
    await p.route('**/landing-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LANDING=' + JSON.stringify(cfg) + ';' }));
    await p.addInitScript(() => {
      window.__ins = [];
      window.supabase = { createClient: () => ({ from: t => ({ insert: async row => { window.__ins.push({ t, row }); return { error: null }; } }) }) };
    });
    await p.goto(url);
    await p.waitForTimeout(300);
    return p;
  }
  async function fillSubmit(p) {
    await p.fill('#f-name', '홍길동');
    await p.fill('#f-phone', '010-1234-5678');
    if (!(await p.inputValue('#f-company'))) await p.fill('#f-company', '샘플');
    if (!(await p.inputValue('#f-topic'))) await p.selectOption('#f-topic', '웨딩');
    if (!(await p.inputValue('#f-msg'))) await p.fill('#f-msg', '문의');
    await p.check('#f-agree');
    await p.click('#submit');
    await p.waitForTimeout(400);
  }
  const L = ROOT + 'landing.html';
  const q = '?company=%EC%83%98%ED%94%8C&prod=%EC%98%88%EC%8B%9C%20%EC%83%81%ED%92%88%20A&per=3&days=7&price=3000&unit=%EA%B1%B4%EB%8B%B9&msg=x#contact';

  let p = await landing(L + q, { INQUIRY_LIVE: true });
  await fillSubmit(p);
  let ins = await p.evaluate(() => window.__ins);
  ok('live submit inserts into inquiries once', ins.length === 1 && ins[0].t === 'inquiries');
  ok('order_info structured {product,perDay,days,total,unit,price}', JSON.stringify(ins[0].row.order_info) === JSON.stringify({ product: '예시 상품 A', perDay: 3, days: 7, total: 21, unit: '건당', price: 3000 }));
  ok('row has no note/status fields (admin-only)', !('note' in ins[0].row) && !('status' in ins[0].row));

  p = await landing(L, { INQUIRY_LIVE: true });
  await fillSubmit(p);
  ins = await p.evaluate(() => window.__ins);
  ok('plain inquiry (no order params): order_info null', ins.length === 1 && ins[0].row.order_info === null);

  for (const bad of ['?prod=A&per=0&days=7', '?prod=A&per=3&days=999', '?prod=A&per=abc&days=7', '?per=3&days=7', '?prod=A&per=3.5&days=7']) {
    p = await landing(L + bad, { INQUIRY_LIVE: true });
    await fillSubmit(p);
    ins = await p.evaluate(() => window.__ins);
    ok('invalid params ' + bad + ' -> order_info null', ins.length === 1 && ins[0].row.order_info === null);
  }

  p = await landing(L + '?prod=B&per=2&days=5', { INQUIRY_LIVE: true });
  await fillSubmit(p);
  ins = await p.evaluate(() => window.__ins);
  ok('no price param: no price/unit in order_info', JSON.stringify(ins[0].row.order_info) === JSON.stringify({ product: 'B', perDay: 2, days: 5, total: 10 }));

  // 진단 화면 -> 랜딩으로 구조화된 값이 넘어가는지
  const dpage = await b.newPage();
  dpage.on('pageerror', e => errs.push(e.message));
  await dpage.route('**/supabase-js*', r => r.abort());
  await dpage.route('**/landing-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LANDING=' + JSON.stringify({ ORDER_UI: true, ORDER: { products: [{ name: '예시 상품 A', unitLabel: '건당', price: 3000 }] } }) + ';' }));
  await dpage.goto(ROOT + 'diagnose.html');
  await dpage.fill('#f-name', '샘플웨딩홀');
  await dpage.fill('#q-per', '3');
  await dpage.fill('#q-days', '7');
  await Promise.all([dpage.waitForURL('**/landing.html**'), dpage.click('#order-go')]);
  const u = new URL(dpage.url());
  ok('diagnose->landing carries prod/per/days/price', u.searchParams.get('prod') === '예시 상품 A' && u.searchParams.get('per') === '3' && u.searchParams.get('days') === '7' && u.searchParams.get('price') === '3000' && u.searchParams.get('unit') === '건당');

  // ---------- 2) 관리자 상담 접수 화면 ----------
  const ROWS = [
    { id: 1, created_at: '2026-11-24T05:00:00Z', company: '<img src=x onerror=window.__x=1>업체', name: '<b>김</b>', phone: '010-1111-2222', email: 'a@b.kr', topic: '웨딩', website: 'javascript:alert(1)', message: '<script>window.__y=1</script>' + '가'.repeat(200), agreed: true, status: 'new', order_info: { product: '예시 상품 A', perDay: 3, days: 7, total: 21, unit: '건당', price: 3000 } },
    { id: 2, created_at: '2026-11-23T05:00:00Z', company: '정상업체', name: '이영희', phone: '01022223333', email: null, topic: '병의원', website: 'https://example.com/x', message: '짧은 문의', agreed: true, status: 'done', order_info: null },
  ];
  async function admin(role, rows, err) {
    const a = await b.newPage({ viewport: { width: 1280, height: 900 } });
    a.on('pageerror', e => errs.push(e.message));
    await a.route('**/supabase-js*', r => r.abort());
    await a.addInitScript(({ role, rows, err }) => {
      window.supabase = {
        createClient: () => ({
          auth: {
            getSession: async () => ({ data: { session: role === null ? null : { user: { id: 'u1', email: 'a@e.com' } } } }),
            signOut: async () => {},
          },
          from: t => ({
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { nickname: '관리자', role }, error: null }) }),
              order: () => ({ limit: async () => (err ? { data: null, error: { message: 'no table' } } : { data: rows, error: null }) }),
            }),
          }),
        }),
      };
    }, { role, rows, err });
    await a.goto(ROOT + 'admin-inquiries.html');
    await a.waitForTimeout(500);
    return a;
  }

  let a = await admin('admin', ROWS);
  ok('admin: app visible, 2 rows rendered', (await a.isVisible('#app')) && (await a.$$('#tb tr')).length === 3);
  ok('admin: summary counts', (await a.textContent('#sum')).includes('2건 / 전체 2건') && (await a.textContent('#sum')).includes('새 신청 1건'));
  ok('XSS: no injected nodes/scripts executed', !(await a.evaluate(() => window.__x || window.__y)) && (await a.$$('#tb img')).length === 0 && (await a.$$('#tb b')).length === 2);
  ok('unsafe javascript: website not linked', (await a.$$('#tb a[href^="javascript"]')).length === 0);
  ok('safe https website linked with rel', await a.evaluate(() => { const l = document.querySelector('#tb a[href="https://example.com/x"]'); return !!l && /noopener/.test(l.rel); }));
  ok('phone masked by default', (await a.textContent('#tb')).includes('010-****-2222') && !(await a.textContent('#tb')).includes('010-1111-2222'));
  await a.click('.iq-ph >> nth=0');
  ok('click reveals phone', (await a.textContent('#tb')).includes('010-1111-2222'));
  await a.click('.iq-ph >> nth=0');
  ok('click again masks', !(await a.textContent('#tb')).includes('010-1111-2222'));
  ok('order summary text + total price', (await a.textContent('#tb')).includes('예시 상품 A · 하루 3건 × 7일 (총 21건) · 63,000원'));
  ok('long message collapsible', (await a.$$('#tb details')).length === 1);
  await a.selectOption('#st', 'done');
  ok('status filter -> 1 row', (await a.$$('#tb tr')).length === 2 && (await a.textContent('#tb')).includes('정상업체'));
  await a.selectOption('#st', '');
  await a.fill('#q', '이영희');
  ok('search by name -> 1 row', (await a.$$('#tb tr')).length === 2);
  await a.fill('#q', '없는단어zzz');
  ok('no match shows message', (await a.isVisible('#empty')) && (await a.textContent('#empty')).includes('조건에 맞는'));
  await a.fill('#q', '');
  await a.screenshot({ path: OUT + '/admin-iq.png', fullPage: true });

  a = await admin('member', ROWS);
  ok('non-admin blocked, app hidden', !(await a.isVisible('#app')) && (await a.textContent('#gate')).includes('관리자만'));

  a = await b.newPage();
  await a.route('**/supabase-js*', r => r.abort());
  await a.addInitScript(() => { window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }; });
  await a.goto(ROOT + 'admin-inquiries.html');
  await a.waitForTimeout(400);
  ok('logged-out redirects to admin-login', a.url().includes('admin-login.html'));

  a = await admin('admin', [], true);
  ok('missing table shows 021 hint', (await a.textContent('#empty')).includes('021_inquiries.sql'));
  a = await admin('admin', []);
  ok('empty list message', (await a.textContent('#empty')).includes('아직 접수된 상담이 없어요'));

  const h = await b.newPage();
  await h.route('**/supabase-js*', r => r.abort());
  await h.goto(ROOT + 'admin.html');
  ok('admin.html nav has link to inquiries', (await h.$$('#nav a[href="admin-inquiries.html"]')).length === 1);

  console.log('page errors:', errs.filter(x => !/supabase|Cannot read|reading/i.test(x)));
  await b.close();
})();
