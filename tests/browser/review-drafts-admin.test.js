const ROOT_DIR = require('path').resolve(__dirname, '../..');
const ROOT = require('url').pathToFileURL(ROOT_DIR).href + '/';
const OUTDIR = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
const errs = [];
const OUT = OUTDIR;
const URL = ROOT + 'admin-review-drafts.html';

const draft = (over = {}) => ({ requiredKeywords: ['강남 한식'], goodKeywords: ['친절', '분위기'], signatureMenu: ['갈비탕'], titles: ['강남 한식 맛집 솔직 후기', '갈비탕 진국 숨은 맛집'], hashtags: ['#강남맛집', '#한식'], draft: '강남에서 찾은 한식당 후기입니다. 분위기도 좋고 친절했어요.', photoCaptions: ['진한 갈비탕'], ...over });
const NEW_DRAFT = draft(); // used inside addInitScript's page-context closure below, which can't see Node-side helper functions — only plain data passed through its arg survives
const ROWS = [
  { id: 1, status: 'draft', created_at: '2026-11-24T05:00:00Z', model: 'gemini-x', business: { name: '<img src=x onerror=window.__x=1>식당', area: '서울', category: '한식' }, reviews: ['사실적인 리뷰 하나입니다', '<script>window.__y=1</script> 리뷰'], photo_urls: ['https://example.com/a.jpg'], draft: draft({ titles: ['<img src=x onerror=window.__z=1>제목입니다'] }) },
  { id: 2, status: 'draft', created_at: '2026-11-23T05:00:00Z', model: 'gemini-x', business: { name: '두번째식당', area: '서울', category: '한식' }, reviews: ['리뷰 하나입니다'], photo_urls: [], draft: draft({ titles: ['두번째 제목입니다'] }) },
  { id: 3, status: 'approved', created_at: '2026-11-22T05:00:00Z', reviewed_at: '2026-11-22T06:00:00Z', review_note: '리뷰 내용과 대조 완료', model: 'gemini-x', business: { name: '승인된식당', area: '서울', category: '한식' }, reviews: ['리뷰 하나입니다'], photo_urls: [], draft: draft({ titles: ['승인된 제목입니다'] }) },
];
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

(async () => {
  const b = await chromium.launch();
  async function open(o = {}, w = 1280, url = URL) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/supabase-js*', r => r.abort());
    await p.addInitScript(({ o, ROWS, NEW_DRAFT }) => {
      window.__rpc = []; window.__fn = []; const rows = JSON.parse(JSON.stringify(ROWS));
      window.supabase = { createClient: () => ({
        auth: { getSession: async () => ({ data: { session: o.loggedOut ? null : { user: { id: 'u', email: 'a@e.com' } } } }), signOut: async () => {} },
        rpc: async (name, args) => { window.__rpc.push({ name, args }); return o.rpcError ? { error: { message: o.rpcError } } : { error: null }; },
        functions: { invoke: async (fn, { body }) => { window.__fn.push({ fn, body }); await new Promise(r => setTimeout(r, 100)); if (o.fnError) return { data: null, error: { context: { json: async () => ({ error: o.fnError }) } } }; return { data: { id: 1, draft: NEW_DRAFT }, error: null }; } },
        storage: { from: () => ({
          upload: async (path, file, opts) => { window.__uploads = window.__uploads || []; window.__uploads.push({ path, type: opts && opts.contentType }); return { data: { path }, error: null }; },
          getPublicUrl: path => ({ data: { publicUrl: 'https://cdn.example.com/' + path } }),
        }) },
        from: t => t === 'review_drafts'
          ? { select: cols => ({ order: () => ({ limit: async () => (o.noTable ? { data: null, error: { message: 'x' } } : { data: rows.map(r => ({ id: r.id, status: r.status, business: r.business, created_at: r.created_at })), error: null }) }), eq: (c, id) => ({ maybeSingle: async () => ({ data: rows.find(r => r.id === id) || null, error: null }) }) }) }
          : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nickname: '관리자', role: o.role || 'admin' }, error: null }) }) }) },
      }) };
    }, { o, ROWS, NEW_DRAFT });
    await p.goto(url); await p.waitForTimeout(500); return p;
  }

  // ---------- 권한·목록 ----------
  let p = await open({ role: 'member' });
  ok('non-admin blocked', !(await p.isVisible('#app')) && (await p.textContent('#gate')).includes('관리자만'));
  p = await open({ loggedOut: true }); ok('logged-out redirects to admin-login', p.url().includes('admin-login.html'));
  p = await open({ noTable: true }); ok('missing table shows 027 hint', (await p.textContent('#list-empty')).includes('027_review_drafts.sql'));
  p = await open();
  ok('list shows 3 drafts with status chips', (await p.$$('.rv-item')).length === 3 && (await p.textContent('#list')).includes('검수완료'));
  await p.selectOption('#st', 'approved'); ok('status filter -> 1 item', (await p.$$('.rv-item')).length === 1); await p.selectOption('#st', '');

  // ---------- 원고 열기·수정·저장 ----------
  await p.click('.rv-item[data-id="1"]'); await p.waitForTimeout(300);
  ok('XSS: nothing executed, no injected nodes from business/review/title', !(await p.evaluate(() => window.__x || window.__y || window.__z)));
  ok('fields filled from the draft', (await p.inputValue('#e-titles')).includes('제목입니다') && (await p.inputValue('#e-text')).includes('강남에서 찾은'));
  ok('reviews/photo count shown', (await p.textContent('#panel')).includes('참고한 리뷰 2건') && (await p.textContent('#panel')).includes('사진 1장'));
  ok('photo caption field present', (await p.$$('.cap-i')).length === 1);
  ok('selected draft highlighted', await p.evaluate(() => document.querySelector('.rv-item[data-id="1"]').classList.contains('on')));
  ok('approve disabled while note is short', await p.isDisabled('#e-approve'));
  await p.fill('#e-note', '리뷰 내용과 대조했고 지어낸 내용 없음');
  ok('approve enabled with note (not dirty)', !(await p.isDisabled('#e-approve')));
  await p.fill('#e-text', '수정한 본문입니다.');
  ok('editing makes approve disabled until saved; save enabled', (await p.isDisabled('#e-approve')) && !(await p.isDisabled('#e-save')));
  await p.click('#e-save'); await p.waitForTimeout(900);
  const fn = await p.evaluate(() => window.__fn);
  ok('save sends action=save with draft read from the form; business/reviews not included', fn.length === 1 && fn[0].fn === 'review-draft' && fn[0].body.action === 'save' && fn[0].body.id === 1 && fn[0].body.draft.draft === '수정한 본문입니다.' && !('business' in fn[0].body.draft) && !('reviews' in fn[0].body.draft));
  ok('after save the draft is reloaded and success shown', (await p.textContent('#e-msg')).includes('저장했어요'));

  // ---------- 검수완료 ----------
  await p.fill('#e-note', '리뷰 내용과 대조했고 지어낸 내용 없음'); await p.click('#e-approve'); await p.waitForTimeout(400);
  const rpc = await p.evaluate(() => window.__rpc);
  ok('approve calls review_review_draft(approve) with the note', rpc.length === 1 && rpc[0].name === 'review_review_draft' && rpc[0].args.p_action === 'approve' && rpc[0].args.p_id === 1 && rpc[0].args.p_note.includes('대조'));

  // ---------- 반려 ----------
  p = await open(); await p.click('.rv-item[data-id="2"]'); await p.waitForTimeout(300);
  await p.fill('#e-note', '메모를 충분히 적었습니다'); await p.click('#e-reject'); await p.waitForTimeout(300);
  ok('reject calls rpc(reject)', (await p.evaluate(() => window.__rpc)).some(r => r.args.p_action === 'reject' && r.args.p_id === 2));
  p = await open({ rpcError: 'note_required' }); await p.click('.rv-item[data-id="1"]'); await p.waitForTimeout(300); await p.fill('#e-note', '검수 메모를 적습니다 길게'); await p.click('#e-approve'); await p.waitForTimeout(300);
  ok('server error note_required -> readable message', (await p.textContent('#e-msg')).includes('검수 메모를 5자 이상'));

  // ---------- 검수완료된 원고: 읽기 전용 ----------
  p = await open(); await p.click('.rv-item[data-id="3"]'); await p.waitForTimeout(300);
  ok('approved draft is read-only (inputs disabled, no approve/save buttons), shows review note', (await p.isDisabled('#e-text')) && (await p.$$('#e-approve')).length === 0 && (await p.$$('#e-save')).length === 0 && (await p.textContent('#panel')).includes('리뷰 내용과 대조 완료'));
  ok('copy button present even when read-only', (await p.$$('button:has-text("원고 복사")')).length === 1);

  // ---------- 새 원고 ----------
  p = await open(); await p.click('#new-btn');
  await p.fill('#n-name', '샘플식당'); await p.fill('#n-area', '서울 강남구'); await p.fill('#n-cat', '한식'); await p.fill('#n-sig', '갈비탕, 육회비빔밥'); await p.fill('#n-instr', '캐주얼하게 써줘');
  await p.fill('#n-reviews', '분위기도 좋고 친절했어요\n\n갈비탕이 진하고 양도 많았습니다\n');
  await p.setInputFiles('#n-photo-file', [{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: JPEG_BYTES }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: JPEG_BYTES }]);
  await p.waitForTimeout(100);
  ok('picked photos previewed before submit', (await p.$$('#n-photo-list li')).length === 2);
  await p.click('#n-go'); await p.waitForTimeout(500);
  const body = (await p.evaluate(() => window.__fn))[0].body;
  ok('new draft request: business, reviews (blank lines dropped), photos uploaded as photoUrls, instructions carried', body.business.name === '샘플식당' && body.reviews.length === 2 && body.photoUrls.length === 2 && body.photoUrls[0].startsWith('https://cdn.example.com/u/') && body.customInstructions === '캐주얼하게 써줘');
  ok('success opens the created draft (#1)', (await p.textContent('#panel')).includes('원고 #1'));
  p = await open({ fnError: 'need_reviews' }); await p.click('#new-btn'); await p.fill('#n-name', '샘플'); await p.click('#n-go'); await p.waitForTimeout(400);
  ok('server error need_reviews -> readable message', (await p.textContent('#n-msg')).includes('리뷰를 1건 이상'));
  p = await open({ fnError: 'not_configured' }); await p.click('#new-btn'); await p.fill('#n-name', '샘플'); await p.fill('#n-reviews', '리뷰 하나입니다'); await p.click('#n-go'); await p.waitForTimeout(400);
  ok('server error not_configured -> readable message', (await p.textContent('#n-msg')).includes('Gemini 키가 설정되지'));

  // ---------- 모바일·메뉴 ----------
  const m = await open({}, 390); await m.click('.rv-item[data-id="1"]'); await m.waitForTimeout(300);
  ok('mobile no xscroll', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await m.screenshot({ path: OUT + '/review-drafts-m.png', fullPage: true });
  const d = await open(); await d.click('.rv-item[data-id="1"]'); await d.waitForTimeout(300); await d.screenshot({ path: OUT + '/review-drafts-d.png', fullPage: true });
  const h = await b.newPage(); await h.route('**/supabase-js*', r => r.abort()); await h.goto(ROOT + 'admin.html');
  ok('admin.html nav links to review drafts', (await h.$$('#nav a[href="admin-review-drafts.html"]')).length === 1);
  console.log('page errors:', errs.filter(x => !/supabase|Cannot read|reading/i.test(x)));
  await b.close();
})();
