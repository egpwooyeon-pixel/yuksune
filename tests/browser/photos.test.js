const ROOT_DIR = require('path').resolve(__dirname, '../..');
const ROOT = require('url').pathToFileURL(ROOT_DIR).href + '/';
const OUTDIR = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
const ok = (n, c) => console.log(c ? 'PASS' : 'FAIL', n);
const errs = [];
const OUT = OUTDIR;

const jpeg = (n = 2000) => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(n, 1)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(500, 2)]);
const webp = () => Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(500, 3)]);
const f = (name, buf, mimeType = 'image/jpeg') => ({ name, mimeType, buffer: buf });

(async () => {
  const b = await chromium.launch();

  async function open(cfg, mode = 'ok', w = 1280) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/supabase-js*', r => r.abort());
    await p.route('**/landing-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LANDING=' + JSON.stringify(cfg) + ';' }));
    await p.addInitScript(({ mode }) => {
      window.__calls = []; window.__up = [];
      window.supabase = {
        createClient: () => ({
          functions: {
            invoke: async (fn, { body }) => {
              window.__calls.push({ fn, body });
              await new Promise(r => setTimeout(r, 150));
              if (mode === 'limit') return { data: null, error: { context: { json: async () => ({ error: 'ip_limit' }) } } };
              if (mode === 'signfail') return { data: null, error: { context: { json: async () => ({ error: 'sign_failed' }) } } };
              return { data: { bucket: 'business-photos', files: body.types.map((t, i) => ({ path: body.batch + '/p' + i + '.' + t.split('/')[1], token: 'tok' + i })) }, error: null };
            },
          },
          storage: {
            from: bucket => ({
              uploadToSignedUrl: async (path, token, file, opts) => {
                window.__up.push({ bucket, path, token, size: file.size, ct: opts && opts.contentType });
                return mode === 'secondfails' && window.__up.length === 2 ? { error: { message: 'x' } } : { data: {}, error: null };
              },
            }),
          },
        }),
      };
    }, { mode });
    await p.goto(ROOT + 'diagnose.html');
    await p.waitForTimeout(250);
    return p;
  }
  const ON = { PHOTO_UPLOAD_LIVE: true };

  let p = await open({});
  ok('flag off: photo card hidden', !(await p.isVisible('#photos')));
  p = await open(ON);
  ok('flag on: photo card visible', await p.isVisible('#photos'));

  // ---- 파일 검증 ----
  await p.setInputFiles('#ph-file', [f('real.jpg', jpeg()), f('fake.jpg', Buffer.from('<html>not an image</html>')), f('big.jpg', jpeg(4 * 1024 * 1024 + 10)), f('pic.png', png(), 'image/png')]);
  await p.waitForTimeout(300);
  const names = await p.$$eval('#ph-list li span', e => e.map(x => x.textContent));
  ok('accepts real jpeg + png only (fake and oversize rejected)', names.length === 2 && names[0].includes('real.jpg') && names[1].includes('pic.png'));
  const note = await p.textContent('#ph-msg');
  ok('explains rejects (fake.jpg: not an image / big.jpg: over 4MB)', note.includes('fake.jpg') && note.includes('사진이 아니에요') && note.includes('big.jpg') && note.includes('4MB'));
  ok('first photo marked as representative', names[0].startsWith('대표'));
  await p.setInputFiles('#ph-file', [f('a.webp', webp(), 'image/webp'), f('b.jpg', jpeg())]);
  await p.waitForTimeout(300);
  ok('max 3 photos enforced (4th ignored with note)', (await p.$$('#ph-list li')).length === 3 && (await p.textContent('#ph-msg')).includes('최대 3장'));
  await p.click('#ph-list li:nth-child(3) button');
  ok('remove button drops a photo', (await p.$$('#ph-list li')).length === 2);

  // ---- 동의 없이 올리기 거부 ----
  await p.click('#ph-up');
  ok('upload requires consent checkbox', (await p.textContent('#ph-msg')).includes('체크') && (await p.evaluate(() => window.__calls.length)) === 0);

  // ---- 업로드 성공 ----
  await p.check('#ph-agree');
  await p.click('#ph-up');
  ok('busy state while uploading', await p.isDisabled('#ph-up'));
  await p.click('#ph-up', { force: true }).catch(() => {});
  await p.waitForFunction(() => document.getElementById('ph-msg').textContent.includes('올렸어요'));
  const calls = await p.evaluate(() => window.__calls), ups = await p.evaluate(() => window.__up);
  ok('exactly one sign request with sniffed types (not file names)', calls.length === 1 && calls[0].fn === 'aeo-photo' && JSON.stringify(calls[0].body.types) === JSON.stringify(['image/jpeg', 'image/png']));
  ok('batch is a UUID v4', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(calls[0].body.batch));
  ok('each file uploaded to its server path with sniffed content type', ups.length === 2 && ups.every(u => u.bucket === 'business-photos' && u.path.startsWith(calls[0].body.batch + '/')) && ups[0].ct === 'image/jpeg' && ups[1].ct === 'image/png');
  ok('thumbnails cleared, message shows total', (await p.$$('#ph-list li')).length === 0 && (await p.textContent('#ph-msg')).includes('사진 2장'));
  const href = await p.getAttribute('#ph-go', 'href');
  ok('next-step link carries pb=<batch>', await p.isVisible('#ph-next') && href.includes('pb=' + calls[0].body.batch));
  // 이미 2장 올렸으니 1장만 더 가능
  await p.setInputFiles('#ph-file', [f('c.jpg', jpeg()), f('d.jpg', jpeg())]);
  await p.waitForTimeout(300);
  ok('remaining room respects already-uploaded count (only 1 more)', (await p.$$('#ph-list li')).length === 1);
  await p.screenshot({ path: OUT + '/photo-d.png', fullPage: true });

  // ---- 실패 처리 ----
  p = await open(ON, 'limit');
  await p.setInputFiles('#ph-file', [f('a.jpg', jpeg())]); await p.waitForTimeout(250); await p.check('#ph-agree'); await p.click('#ph-up');
  await p.waitForFunction(() => document.getElementById('ph-msg').textContent.includes('모두 사용'));
  ok('ip_limit message, no uploads, photo kept for retry', (await p.evaluate(() => window.__up.length)) === 0 && (await p.$$('#ph-list li')).length === 1 && !(await p.isVisible('#ph-next')));
  p = await open(ON, 'signfail');
  await p.setInputFiles('#ph-file', [f('a.jpg', jpeg())]); await p.waitForTimeout(250); await p.check('#ph-agree'); await p.click('#ph-up');
  await p.waitForFunction(() => document.getElementById('ph-msg').textContent.includes('준비하지 못했어요'));
  ok('sign_failed message', true);
  p = await open(ON, 'secondfails');
  await p.setInputFiles('#ph-file', [f('a.jpg', jpeg()), f('b.jpg', jpeg())]); await p.waitForTimeout(250); await p.check('#ph-agree'); await p.click('#ph-up');
  await p.waitForFunction(() => document.getElementById('ph-msg').textContent.includes('번째'));
  ok('partial failure reports which photo failed and keeps list', (await p.textContent('#ph-msg')).includes('2번째') && (await p.textContent('#ph-msg')).includes('1장은 저장'));

  // ---- 랜딩: pb 를 UUID 형식일 때만 저장 ----
  async function landing(url) {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
    q.on('pageerror', e => errs.push(e.message));
    await q.route('**/supabase-js*', r => r.abort());
    await q.route('**/landing-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LANDING={INQUIRY_LIVE:true};' }));
    await q.addInitScript(() => { window.__ins = []; window.supabase = { createClient: () => ({ from: t => ({ insert: async row => { window.__ins.push(row); return { error: null }; } }) }) }; });
    await q.goto(url); await q.waitForTimeout(250);
    await q.fill('#f-name', '홍길동'); await q.fill('#f-phone', '010-1234-5678'); if (!(await q.inputValue('#f-company'))) await q.fill('#f-company', '샘플'); await q.selectOption('#f-topic', '웨딩'); await q.fill('#f-msg', '문의'); await q.check('#f-agree'); await q.click('#submit'); await q.waitForTimeout(300);
    return q.evaluate(() => window.__ins);
  }
  const L = ROOT + 'landing.html';
  let ins = await landing(L + '?pb=11111111-1111-4111-8111-111111111111');
  ok('landing: valid pb stored as photo_batch', ins.length === 1 && ins[0].photo_batch === '11111111-1111-4111-8111-111111111111');
  for (const bad of ['?pb=not-a-uuid', '?pb=../../x', '?pb=11111111-1111-9111-8111-111111111111', '']) { ins = await landing(L + bad); ok('landing: invalid pb "' + bad + '" -> null', ins.length === 1 && !('photo_batch' in ins[0])); }

  // ---- 관리자: 사진 보기 ----
  async function admin(photos, urlMode) {
    const a = await b.newPage({ viewport: { width: 1280, height: 900 } });
    a.on('pageerror', e => errs.push(e.message));
    await a.route('**/supabase-js*', r => r.abort());
    await a.addInitScript(({ photos, urlMode }) => {
      const rows = [
        { id: 1, created_at: '2026-11-24T05:00:00Z', company: '사진있는업체', name: '김', phone: '01011112222', topic: '웨딩', website: null, message: 'm', agreed: true, status: 'new', order_info: null, photo_batch: '11111111-1111-4111-8111-111111111111' },
        { id: 2, created_at: '2026-11-23T05:00:00Z', company: '사진없는업체', name: '이', phone: '01022223333', topic: '병의원', website: null, message: 'm', agreed: true, status: 'new', order_info: null, photo_batch: null }];
      window.__signed = [];
      window.supabase = {
        createClient: () => ({
          auth: { getSession: async () => ({ data: { session: { user: { id: 'u', email: 'a@e.com' } } } }), signOut: async () => {} },
          storage: { from: () => ({ createSignedUrl: async (path, ttl) => { window.__signed.push({ path, ttl }); return { data: { signedUrl: urlMode === 'bad' ? 'javascript:alert(1)' : 'https://x.supabase.co/sign/' + path + '?t=1' }, error: null }; } }) },
          from: t => t === 'business_photos'
            ? ({ select: () => ({ eq: () => ({ order: async () => ({ data: photos, error: null }) }) }) })
            : ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nickname: '관리자', role: 'admin' }, error: null }) }), order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }),
        }),
      };
    }, { photos, urlMode });
    await a.goto(ROOT + 'admin-inquiries.html'); await a.waitForTimeout(450);
    return a;
  }
  let a = await admin([{ path: 'b/1.jpg' }, { path: 'b/2.png' }]);
  ok('admin: 사진 보기 only on rows with photos', (await a.$$('#tb .iq-ph')).filter ? (await a.$$eval('#tb button.iq-ph', e => e.filter(x => x.textContent === '사진 보기').length)) === 1 : false);
  await a.click('button:has-text("사진 보기")'); await a.waitForTimeout(300);
  ok('admin: signed links (2 min) opened in new tab, noopener', (await a.evaluate(() => window.__signed)).every(s => s.ttl === 120) && (await a.$$eval('#tb a[target=_blank]', e => e.filter(x => /^https:\/\/x\.supabase\.co\/sign\//.test(x.href) && /noopener/.test(x.rel)).length)) === 2);
  a = await admin([{ path: 'b/1.jpg' }], 'bad'); await a.click('button:has-text("사진 보기")'); await a.waitForTimeout(300);
  ok('admin: unsafe signed url is not linked', (await a.$$('#tb a[href^="javascript"]')).length === 0 && (await a.textContent('#tb')).includes('불러오기 실패'));
  a = await admin([]); await a.click('button:has-text("사진 보기")'); await a.waitForTimeout(300);
  ok('admin: empty batch -> retry label', (await a.textContent('#tb')).includes('사진 없음'));

  // ---- 모바일 ----
  const m = await open(ON, 'ok', 390);
  await m.setInputFiles('#ph-file', [f('a.jpg', jpeg()), f('b.png', png(), 'image/png')]); await m.waitForTimeout(250);
  ok('mobile no xscroll', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await m.screenshot({ path: OUT + '/photo-m.png', fullPage: true });

  console.log('page errors:', errs.filter(x => !/supabase|Cannot read|reading/i.test(x)));
  await b.close();
})();
