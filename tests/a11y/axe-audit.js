// 접근성 자동 검사 (axe-core). 모든 기능 스위치를 켠 상태와 결과 화면까지 검사해요.
const { chromium } = require('playwright');
const fs = require('fs');
let AXE;
try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch (_) { console.error('axe-core 가 필요해요: 이 폴더에서 npm i axe-core'); process.exit(2); }
const ROOT = require('url').pathToFileURL(require('path').resolve(__dirname, '../..')).href + '/';
const ALL_ON = { PREFILL_LIVE: true, PHOTO_UPLOAD_LIVE: true, ORDER_UI: true, DIAGNOSE_LIVE: false, INQUIRY_LIVE: true, ORDER: { products: [{ name: '예시 상품 A', unitLabel: '건당', price: 3000, note: '설명 한 줄' }, { name: '예시 상품 B', note: '가격 미정' }] } };

const mockSb = () => {
  const rows = [{ id: 1, status: 'draft', blocking: 1, created_at: '2026-11-24T05:00:00Z', model: 'm', business: { name: '샘플', region: '서울' }, facts: ['사실 하나입니다', '사실 둘입니다'], lint: [{ level: 'block', code: 'x', msg: '"최고" 표현이 있어요.' }], article: { slug: 'g-1', title: '제목입니다 확인', description: '설명입니다 열자 이상', category: '웨딩홀', publishedAt: '2026-11-24', business: { name: '샘플' }, questions: ['질문입니다'], sections: [{ heading: '소제목 하나', paragraphs: ['본문입니다'] }], sources: [], faq: [] } }];
  const inq = [{ id: 1, created_at: '2026-11-24T05:00:00Z', company: '샘플', name: '홍', phone: '01012345678', topic: '웨딩', website: null, message: '문의', agreed: true, status: 'new', order_info: { product: 'A', perDay: 1, days: 1, total: 1 }, photo_batch: null }];
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u', email: 'a@e.com' } } } }), signOut: async () => {} },
    functions: { invoke: async () => ({ data: { data: { name: '멜론성형외과', region: '서울 강남구', industry: '병의원', service: '서비스' } }, error: null }) },
    rpc: async () => ({ error: null }),
    storage: { from: () => ({}) },
    from: t => t === 'guide_drafts' ? { select: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }), eq: () => ({ maybeSingle: async () => ({ data: rows[0], error: null }) }) }) }
      : t === 'inquiries' ? { select: () => ({ order: () => ({ limit: async () => ({ data: inq, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nickname: '관리자', role: 'admin' }, error: null }) }) }) },
  }) };
};

(async () => {
  const b = await chromium.launch();
  const summary = [];
  async function audit(name, url, w, steps) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.route('**/supabase-js*', r => r.abort());
    await p.route('**/landing-config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LANDING=' + JSON.stringify(ALL_ON) + ';' }));
    await p.route('**/cdn.jsdelivr.net/**', r => r.abort());           // 외부 글꼴·스크립트 없이 (오프라인 환경)
    await p.addInitScript(mockSb);
    await p.goto(ROOT + url); await p.waitForTimeout(500);
    if (steps) await steps(p);
    await p.addScriptTag({ content: AXE });
    const res = await p.evaluate(async () => await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }));
    for (const v of res.violations) summary.push({ page: name + '@' + w, id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 2).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 3).join(' | ')) });
    await p.close();
  }
  const diag = async p => { await p.fill('#f-name', '샘플'); await p.click('#go'); await p.waitForTimeout(400); };
  for (const w of [1280, 390]) {
    await audit('landing', 'landing.html', w);
    await audit('diagnose(all-on)', 'diagnose.html', w);
    await audit('diagnose(report)', 'diagnose.html', w, diag);
    await audit('overseas-report', 'overseas-report.html', w);
    await audit('overseas-report(cn tab)', 'overseas-report.html', w, async p => { await p.click('#tab-cn'); });
    await audit('privacy', 'landing-privacy.html', w);
    await audit('guide-article', 'guide/sample-outdoor-wedding.html', w);
    await audit('guide-index', 'guide/index.html', w);
    await audit('admin-inquiries', 'admin-inquiries.html', w);
    await audit('admin-drafts', 'admin-drafts.html', w, async p => { await p.click('.dr-item'); await p.waitForTimeout(300); });
  }
  await b.close();
  // 같은 위반은 한 줄로 합치기
  const seen = new Map();
  for (const s of summary) { const k = s.id + '|' + s.page.split('@')[0]; if (!seen.has(k)) seen.set(k, { ...s, widths: [s.page.split('@')[1]] }); else seen.get(k).widths.push(s.page.split('@')[1]); }
  if (!seen.size) console.log('PASS 접근성 위반 없음 (axe-core, 데스크톱·모바일)');
  if (seen.size) process.exitCode = 1;
  for (const s of seen.values()) console.log('FAIL ' + `[${s.impact}] ${s.page.split('@')[0]} (${s.widths.join(',')}) ${s.id}: ${s.help} — ${s.n}곳\n    ${s.sample.join('\n    ')}`);
})();
