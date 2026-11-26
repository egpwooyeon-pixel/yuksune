const ROOT_DIR = require('path').resolve(__dirname, '../..');
const ROOT = require('url').pathToFileURL(ROOT_DIR).href + '/';
const OUTDIR = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
const errs = [];
const OUT = OUTDIR;
const URL = ROOT + 'review-draft.html';

const draft = (over = {}) => ({ requiredKeywords: ['강남 한식'], goodKeywords: ['친절'], signatureMenu: ['갈비탕'], titles: ['강남 한식 맛집 솔직 후기'], hashtags: ['#강남맛집', '#한식'], draft: '강남에서 찾은 한식당 후기입니다. 분위기도 좋고 친절했어요.', photoCaptions: ['진한 갈비탕'], ...over });
const NEW_DRAFT = draft();
const ROWS = [
  { id: 1, status: 'draft', created_at: new Date().toISOString(), model: 'gemini-x', business: { name: '내식당' }, reviews: ['리뷰 하나입니다', '리뷰 둘입니다'], photo_urls: ['https://example.com/a.jpg'], draft: draft() },
];

(async () => {
  const b = await chromium.launch();
  async function open(o = {}, w = 1280, url = URL) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__clip = t; } } }); } catch (_) { navigator.clipboard = { writeText: async t => { window.__clip = t; } }; } });
    if (o.noKey) {
      await p.route('**/supabase-js*', r => r.abort());
    } else {
      await p.addInitScript(({ o, ROWS, NEW_DRAFT }) => {
        window.__fn = []; const rows = JSON.parse(JSON.stringify(ROWS));
        window.supabase = { createClient: () => ({
          auth: { getSession: async () => ({ data: { session: o.loggedOut ? null : { user: { id: 'u1', email: 'a@e.com' } } } }), signOut: async () => {} },
          functions: { invoke: async (fn, { body }) => { window.__fn.push({ fn, body }); await new Promise(r => setTimeout(r, 80)); if (o.fnError) return { data: null, error: { context: { json: async () => ({ error: o.fnError }) } } }; return { data: { id: 2, draft: NEW_DRAFT }, error: null }; } },
          from: t => t === 'review_drafts'
            ? { select: () => ({ eq: (c, id) => ({ order: () => ({ limit: async () => ({ data: rows.filter(r => r.created_by === undefined || true), error: null }) }) }) }) }
            : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: o.role || 'member', business_status: o.businessStatus || 'none' }, error: null }) }) }) },
        }) };
      }, { o, ROWS, NEW_DRAFT });
    }
    await p.goto(url); await p.waitForTimeout(500); return p;
  }

  // ---------- 서버 연결 안 됨 / 비로그인 / 미인증 ----------
  let p = await open({ noKey: true });
  ok('no supabase key -> connection message', (await p.textContent('#rv-msg')).includes('서버 연결 키'));
  p = await open({ loggedOut: true });
  ok('logged-out redirects to login with next', p.url().includes('login.html') && p.url().includes('next=review-draft.html'));
  p = await open({ role: 'member', businessStatus: 'pending' });
  ok('unapproved member blocked, form hidden, cta to biz.html shown', !(await p.isVisible('#rv-form-box')) && (await p.textContent('#rv-msg')).includes('사업자 인증이 승인된') && (await p.getAttribute('a[href="biz.html"]', 'href')) === 'biz.html');

  // ---------- 승인 회원: 목록·사진·해시태그 렌더 ----------
  p = await open({ role: 'member', businessStatus: 'approved' });
  ok('approved member sees the form and list', await p.isVisible('#rv-form-box') && await p.isVisible('#rv-list-box'));
  ok('existing draft rendered with business name, title, hashtags, photo', (await p.textContent('.rvp-card')).includes('내식당') && (await p.textContent('.rvp-card')).includes('강남 한식 맛집') && (await p.textContent('.rvp-card')).includes('#강남맛집') && (await p.$$('.rvp-card img')).length === 1);
  await p.click('.rvp-card button');
  await p.waitForTimeout(100);
  ok('copy button copies draft + hashtags to clipboard', (await p.evaluate(() => window.__clip || '')).includes('분위기도 좋고 친절했어요') && (await p.evaluate(() => window.__clip)).includes('#강남맛집'));

  // ---------- 원고 생성 ----------
  await p.fill('#rv-name', '새가게'); await p.fill('#rv-area', '서울 마포구'); await p.fill('#rv-reviews', '리뷰 하나입니다\n\n리뷰 둘입니다\n');
  await p.click('#rv-go'); await p.waitForTimeout(600);
  const body = (await p.evaluate(() => window.__fn))[0].body;
  ok('generate sends business/reviews (blank lines dropped)', body.business.name === '새가게' && body.reviews.length === 2);
  ok('success message shown', (await p.textContent('#rv-form-msg')).includes('만들었어요'));

  // ---------- 입력 검증 ----------
  p = await open({ role: 'member', businessStatus: 'approved' });
  await p.click('#rv-go'); await p.waitForTimeout(100);
  ok('empty name -> client-side validation message, no call made', (await p.textContent('#rv-form-msg')).includes('상호명') && (await p.evaluate(() => (window.__fn || []).length)) === 0);

  // ---------- 서버 오류: 일일 한도 ----------
  p = await open({ role: 'member', businessStatus: 'approved', fnError: 'daily_limit' });
  await p.fill('#rv-name', '새가게'); await p.fill('#rv-reviews', '리뷰 하나입니다');
  await p.click('#rv-go'); await p.waitForTimeout(400);
  ok('daily_limit error -> readable message', (await p.textContent('#rv-form-msg')).includes('오늘 만들 수 있는'));

  // ---------- 운영자도 사용 가능 ----------
  p = await open({ role: 'admin', businessStatus: 'none' });
  ok('admin (not approved advertiser) still sees the form', await p.isVisible('#rv-form-box'));

  // ---------- 모바일·메뉴 ----------
  const m = await open({ role: 'member', businessStatus: 'approved' }, 390);
  ok('mobile no xscroll', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await m.screenshot({ path: OUT + '/review-draft-member-m.png', fullPage: true });
  const d = await open({ role: 'member', businessStatus: 'approved' });
  await d.screenshot({ path: OUT + '/review-draft-member-d.png', fullPage: true });
  ok('nav includes AI 리뷰 원고 link, highlighted active on this page', (await d.$$('.gnb a[href="review-draft.html"]')).length === 1 && (await d.$eval('.gnb a[href="review-draft.html"]', el => el.classList.contains('on'))));
  console.log('page errors:', errs.filter(x => !/supabase|Cannot read|reading/i.test(x)));
  await b.close();
})();
