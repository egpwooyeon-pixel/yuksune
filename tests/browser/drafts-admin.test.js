const ROOT_DIR = require('path').resolve(__dirname, '../..');
const ROOT = require('url').pathToFileURL(ROOT_DIR).href + '/';
const OUTDIR = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
const errs = [];
const OUT = OUTDIR;
const URL = ROOT + 'admin-drafts.html';

const art = (title, extra = {}) => ({ slug: 'g-20261124-aaaaaaaa', sample: false, title, description: '설명입니다 열자 이상 쓰는 설명', category: '웨딩홀', publishedAt: '2026-11-24', updatedAt: '2026-11-24',
  business: { name: '샘플웨딩홀' }, questions: ['질문 하나입니다', '질문 둘입니다'], sections: [{ heading: '소제목 하나', paragraphs: ['본문 하나입니다.', '본문 둘입니다.'] }, { heading: '소제목 둘', paragraphs: ['본문입니다.'] }],
  sources: [{ label: '업체 공식 홈페이지', url: 'https://example.com/' }], faq: [{ q: '질문?', a: '답변입니다.' }], ...extra });
const ROWS = [
  { id: 1, status: 'draft', blocking: 0, created_at: '2026-11-24T05:00:00Z', model: 'gemini-x', business: { name: '<img src=x onerror=window.__x=1>업체', region: '서울' }, facts: ['사실 하나입니다', '<script>window.__y=1</script> 사실'], lint: [{ level: 'warn', code: 'unbacked_number', msg: '"30%" 숫자가 입력한 사실에 없어요.' }], article: art('<img src=x onerror=window.__z=1>제목입니다') },
  { id: 2, status: 'draft', blocking: 2, created_at: '2026-11-23T05:00:00Z', model: 'gemini-x', business: { name: '위험업체', region: '서울' }, facts: ['사실 하나입니다', '사실 둘입니다'], lint: [{ level: 'block', code: 'claim_term', msg: '"최고" 같은 과장 표현이 있어요.' }, { level: 'block', code: 'invented_phone', msg: '입력하지 않은 전화번호가 있어요.' }], article: art('위험한 제목입니다') },
  { id: 3, status: 'approved', blocking: 0, created_at: '2026-11-22T05:00:00Z', reviewed_at: '2026-11-22T06:00:00Z', review_note: '업체 확인 사실과 대조 완료', model: 'gemini-x', business: { name: '승인업체', region: '서울' }, facts: ['사실 하나입니다', '사실 둘입니다'], lint: [], article: art('승인된 제목입니다') },
];

(async () => {
  const b = await chromium.launch();
  async function open(o = {}, w = 1280, url = URL) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/supabase-js*', r => r.abort());
    await p.addInitScript(({ o, ROWS }) => {
      window.__rpc = []; window.__fn = []; const rows = JSON.parse(JSON.stringify(ROWS));
      window.supabase = { createClient: () => ({
        auth: { getSession: async () => ({ data: { session: o.loggedOut ? null : { user: { id: 'u', email: 'a@e.com' } } } }), signOut: async () => {} },
        rpc: async (name, args) => { window.__rpc.push({ name, args }); return o.rpcError ? { error: { message: o.rpcError } } : { error: null }; },
        functions: { invoke: async (fn, { body }) => { window.__fn.push({ fn, body }); await new Promise(r => setTimeout(r, 100)); if (o.fnError) return { data: null, error: { context: { json: async () => ({ error: o.fnError }) } } }; return { data: { id: 1, blocking: 0, lint: [] }, error: null }; } },
        from: t => t === 'guide_drafts'
          ? { select: cols => ({ order: () => ({ limit: async () => (o.noTable ? { data: null, error: { message: 'x' } } : { data: rows.map(r => ({ id: r.id, status: r.status, blocking: r.blocking, business: r.business, created_at: r.created_at })), error: null }) }), eq: (c, id) => ({ maybeSingle: async () => ({ data: rows.find(r => r.id === id) || null, error: null }) }) }) }
          : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nickname: '관리자', role: o.role || 'admin' }, error: null }) }) }) },
      }) };
    }, { o, ROWS });
    await p.goto(url); await p.waitForTimeout(500); return p;
  }

  // ---------- 권한·목록 ----------
  let p = await open({ role: 'member' });
  ok('non-admin blocked', !(await p.isVisible('#app')) && (await p.textContent('#gate')).includes('관리자만'));
  p = await open({ loggedOut: true }); ok('logged-out redirects to admin-login', p.url().includes('admin-login.html'));
  p = await open({ noTable: true }); ok('missing table shows 025 hint', (await p.textContent('#list-empty')).includes('025_drafts.sql'));
  p = await open();
  ok('list shows 3 drafts with status chips', (await p.$$('.dr-item')).length === 3 && (await p.textContent('#list')).includes('승인'));
  ok('blocking chip on draft with blocking items', (await p.textContent('#list')).includes('차단 2'));
  await p.selectOption('#st', 'approved'); ok('status filter -> 1 item', (await p.$$('.dr-item')).length === 1); await p.selectOption('#st', '');

  // ---------- 초안 열기·수정·저장 ----------
  await p.click('.dr-item[data-id="1"]'); await p.waitForTimeout(300);
  ok('XSS: nothing executed, no injected nodes', !(await p.evaluate(() => window.__x || window.__y || window.__z)) && (await p.$$('#panel img, #list img')).length === 0);
  ok('fields filled from the draft', (await p.inputValue('#e-title')).includes('제목입니다') && (await p.$$('.dr-sec')).length === 3 && (await p.inputValue('#e-q')).includes('질문 하나입니다'));
  ok('lint warnings shown', (await p.textContent('#panel')).includes('30%'));
  ok('sources shown as input values only (read-only text)', (await p.textContent('#panel')).includes('https://example.com/'));
  ok('selected draft highlighted', await p.evaluate(() => document.querySelector('.dr-item[data-id="1"]').classList.contains('on')));
  ok('approve disabled while note is short', await p.isDisabled('#e-approve'));
  await p.fill('#e-note', '사실과 대조했고 과장 표현 없음');
  ok('approve enabled with note (no blocking, not dirty)', !(await p.isDisabled('#e-approve')));
  await p.fill('.s-p >> nth=0', '수정한 문단 하나.\n\n수정한 문단 둘.');
  ok('editing makes approve disabled until saved; save enabled', (await p.isDisabled('#e-approve')) && !(await p.isDisabled('#e-save')));
  await p.click('#e-save'); await p.waitForTimeout(500);
  const fn = await p.evaluate(() => window.__fn);
  ok('save sends action=save with article read from the form (paragraphs split by blank line)', fn.length === 1 && fn[0].fn === 'aeo-draft' && fn[0].body.action === 'save' && fn[0].body.id === 1 && fn[0].body.article.sections[0].paragraphs.length === 2 && fn[0].body.article.sections[0].paragraphs[1] === '수정한 문단 둘.' && !('business' in fn[0].body.article) && !('sources' in fn[0].body.article));
  ok('after save the draft is reloaded and success shown', (await p.textContent('#e-msg')).includes('저장하고 자동 검사'));

  // ---------- 승인 ----------
  await p.fill('#e-note', '사실과 대조했고 과장 표현 없음'); await p.click('#e-approve'); await p.waitForTimeout(400);
  const rpc = await p.evaluate(() => window.__rpc);
  ok('approve calls review_guide_draft(approve) with the note', rpc.length === 1 && rpc[0].name === 'review_guide_draft' && rpc[0].args.p_action === 'approve' && rpc[0].args.p_id === 1 && rpc[0].args.p_note.includes('대조'));

  // ---------- 차단 초안 ----------
  p = await open(); await p.click('.dr-item[data-id="2"]'); await p.waitForTimeout(300);
  ok('blocking draft: block chips shown', (await p.textContent('#panel')).includes('최고') && (await p.$$('#panel .chip.block')).length >= 2);
  await p.fill('#e-note', '메모를 충분히 적었습니다');
  ok('blocking draft: approve stays disabled even with note', await p.isDisabled('#e-approve'));
  ok('blocking draft: reject allowed with note', !(await p.isDisabled('#e-reject')));
  await p.click('#e-reject'); await p.waitForTimeout(300);
  ok('reject calls rpc(reject)', (await p.evaluate(() => window.__rpc)).some(r => r.args.p_action === 'reject' && r.args.p_id === 2));
  // 서버 오류 문구 매핑
  p = await open({ rpcError: 'blocking_issues' }); await p.click('.dr-item[data-id="1"]'); await p.waitForTimeout(300); await p.fill('#e-note', '검수 메모를 적습니다'); await p.click('#e-approve'); await p.waitForTimeout(300);
  ok('server error blocking_issues -> readable message', (await p.textContent('#e-msg')).includes('차단 항목'));

  // ---------- 승인된 글: 읽기 전용 ----------
  p = await open(); await p.click('.dr-item[data-id="3"]'); await p.waitForTimeout(300);
  ok('approved draft is read-only (inputs disabled, no approve/save buttons), shows review note', (await p.isDisabled('#e-title')) && (await p.$$('#e-approve')).length === 0 && (await p.$$('#e-save')).length === 0 && (await p.textContent('#panel')).includes('업체 확인 사실과 대조 완료'));

  // ---------- 새 초안 ----------
  p = await open(); await p.click('#new-btn');
  await p.fill('#n-name', '샘플웨딩홀'); await p.fill('#n-ind', '웨딩홀'); await p.fill('#n-region', '서울 강남구'); await p.fill('#n-url', 'https://example.com/'); await p.fill('#n-topic', '야외 예식');
  await p.fill('#n-facts', '야외 예식 공간이 있습니다\n\n하객 100명 규모 상담이 가능합니다\n'); await p.fill('#n-src', '업체 공식 홈페이지 | https://example.com/\nhttps://example.org/page');
  await p.click('#n-go'); await p.waitForTimeout(500);
  const body = (await p.evaluate(() => window.__fn))[0].body;
  ok('new draft request: business, facts (blank lines dropped), sources parsed', body.business.name === '샘플웨딩홀' && body.facts.length === 2 && body.sources.length === 2 && body.sources[0].label === '업체 공식 홈페이지' && body.sources[1].url === 'https://example.org/page' && body.topic === '야외 예식');
  ok('success opens the created draft (#1)', (await p.textContent('#panel')).includes('초안 #1'));
  p = await open({ fnError: 'need_facts' }); await p.click('#new-btn'); await p.fill('#n-name', '샘플'); await p.fill('#n-ind', '웨딩홀'); await p.click('#n-go'); await p.waitForTimeout(400);
  ok('server error need_facts -> readable message', (await p.textContent('#n-msg')).includes('사실을 2개 이상'));
  p = await open({ fnError: 'api_error' }); await p.click('#new-btn'); await p.fill('#n-name', '샘플'); await p.fill('#n-ind', '웨딩홀'); await p.click('#n-go'); await p.waitForTimeout(400);
  ok('server error api_error -> readable message', (await p.textContent('#n-msg')).includes('과부하'));

  // ---------- 모바일·메뉴 ----------
  const m = await open({}, 390); await m.click('.dr-item[data-id="1"]'); await m.waitForTimeout(300);
  ok('mobile no xscroll', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await m.screenshot({ path: OUT + '/drafts-m.png', fullPage: true });
  const d = await open(); await d.click('.dr-item[data-id="2"]'); await d.waitForTimeout(300); await d.screenshot({ path: OUT + '/drafts-d.png', fullPage: true });
  const h = await b.newPage(); await h.route('**/supabase-js*', r => r.abort()); await h.goto(ROOT + 'admin.html');
  ok('admin.html nav links to drafts', (await h.$$('#nav a[href="admin-drafts.html"]')).length === 1);
  console.log('page errors:', errs.filter(x => !/supabase|Cannot read|reading/i.test(x)));
  await b.close();
})();
