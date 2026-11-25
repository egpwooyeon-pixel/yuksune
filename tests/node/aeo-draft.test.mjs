import * as m from '../../supabase/functions/aeo-draft/index.ts';
import * as g from '../../tools/build-guides.mjs';
import assert from 'node:assert/strict';

let fails = 0, pass = 0;
const t = (n, f) => Promise.resolve().then(f).then(() => { pass++; console.log('PASS', n); }, e => { fails++; console.log('FAIL', n, e.message); });

const BIZ = { name: '샘플웨딩홀', region: '서울 강남구', industry: '웨딩홀', address: '예시 주소 12', phone: '', hours: '평일 10:00~18:00', summary: '야외 예식 공간이 있는 가상 웨딩홀', url: 'https://example.com/' };
const FACTS = ['야외 예식 공간이 있습니다', '하객 100명 규모 상담이 가능합니다', '예약은 전화로 문의합니다'];
const SRC = [{ label: '업체 공식 홈페이지', url: 'https://example.com/' }];
const good = (o = {}) => ({ business: BIZ, facts: FACTS, sources: SRC, topic: '야외 예식 고를 때 확인할 점', ...o });

const MODEL_OK = {
  title: '야외 예식 웨딩홀을 고를 때 확인할 점', description: '야외 예식을 고려할 때 날씨 대비와 동선, 예약 조건을 확인하는 방법을 정리했습니다.',
  questions: ['야외 예식은 무엇을 먼저 확인하나요?', '날씨가 나쁘면 어떻게 하나요?', '하객 100명 규모 상담은 어떻게 준비하나요?'],
  sections: [{ heading: '야외 공간 확인 포인트', paragraphs: ['동선과 좌석 배치를 확인하세요. 세부 조건은 업체에 직접 확인하세요.'] }, { heading: '예약 전에 준비할 것', paragraphs: ['희망 날짜와 하객 수를 정리해 전화로 문의하세요.'] }],
  faq: [{ q: '야외 예식은 항상 가능한가요?', a: '날씨와 날짜에 따라 달라질 수 있으니 업체에 확인하세요.' }],
};

const mkDeps = (o = {}) => {
  const rec = { gemini: [], insert: [], update: [], get: [] };
  return {
    rec,
    d: {
      adminId: async () => (o.noAdmin ? null : 'admin-1'),
      config: () => ({ apiKey: o.noKey ? undefined : 'KEY', models: ['modelA'] }),
      gemini: async (body, models, key) => { rec.gemini.push({ body, models, key }); if (o.geminiErr) throw new Error(o.geminiErr); return o.text !== undefined ? o.text : JSON.stringify(o.model || MODEL_OK); },
      insert: async row => { rec.insert.push(row); return { id: 42 }; },
      get: async id => (o.row === undefined ? null : o.row),
      update: async (id, patch) => { rec.update.push({ id, patch }); },
    },
  };
};
const post = b => new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: JSON.stringify(b) });

// ---------- 입력 ----------
await t('parseInput: valid + sources/facts cleaned', () => {
  const r = m.parseInput(good({ facts: [...FACTS, '짧음', '   '] })); assert.equal(r.error, undefined); assert.equal(r.facts.length, 3); assert.equal(r.sources.length, 1);
});
await t('parseInput: errors', () => {
  assert.equal(m.parseInput(good({ business: { ...BIZ, name: 'a' } })).error, 'bad_name');
  assert.equal(m.parseInput(good({ business: { ...BIZ, industry: '' } })).error, 'need_industry');
  assert.equal(m.parseInput(good({ business: { ...BIZ, url: 'javascript:alert(1)' } })).error, 'bad_url');
  assert.equal(m.parseInput(good({ facts: ['사실 하나만 있습니다'] })).error, 'need_facts');
  assert.equal(m.parseInput(good({ facts: [] })).error, 'need_facts');
  assert.equal(m.parseInput(good({ sources: [{ label: 'x', url: 'ftp://a.b' }] })).error, 'bad_source');
  assert.equal(m.parseInput(good({ sources: [{ label: '', url: 'https://a.b' }] })).error, 'bad_source');
});

// ---------- 자동 검사 ----------
const art = (over = {}) => ({ ...JSON.parse(JSON.stringify({ title: '제목입니다 확인', description: '설명입니다 열자 이상', questions: [], sections: [{ heading: '소제목1', paragraphs: ['본문입니다'] }, { heading: '소제목2', paragraphs: ['본문입니다'] }], faq: [] })), ...over });
const ALLOWED = m.allowedText(m.parseInput(good()));
await t('lint: clean article has no issues', () => { const r = m.lintArticle(art(), ALLOWED); assert.equal(r.blocking, 0); assert.equal(r.issues.length, 0); });
await t('lint: blocks claim/medical/review/discount terms (with and without spaces)', () => {
  for (const bad of ['국내 최고의 시설입니다', '효과를 보장합니다', '100% 만족', '완치 사례', '실제 후기를 확인하세요', '지금 할인 이벤트', '전후 사진 공개', '부작용 없는 시술', '업계 1위', '성공률이 높습니다']) {
    const r = m.lintArticle(art({ sections: [{ heading: '소제목1', paragraphs: [bad] }, { heading: '소제목2', paragraphs: ['본문'] }] }), ALLOWED); assert.ok(r.blocking >= 1, bad);
  }
});
await t('lint: terms present in operator-provided facts are not auto-blocked', () => {
  const a = m.allowedText(m.parseInput(good({ facts: [...FACTS, '최대 200명까지 수용합니다'] })));
  assert.equal(m.lintArticle(art({ sections: [{ heading: '소제목1', paragraphs: ['최대 200명까지 수용합니다'] }, { heading: '소제목2', paragraphs: ['본문'] }] }), a).blocking, 0);
});
await t('lint: invented phone is blocked; provided phone is fine', () => {
  const bad = art({ sections: [{ heading: '소제목1', paragraphs: ['전화 02-123-4567 로 문의'] }, { heading: '소제목2', paragraphs: ['본문'] }] });
  assert.ok(m.lintArticle(bad, ALLOWED).issues.some(i => i.code === 'invented_phone' && i.level === 'block'));
  const withPhone = m.allowedText(m.parseInput(good({ business: { ...BIZ, phone: '02-123-4567' } })));
  assert.equal(m.lintArticle(bad, withPhone).issues.filter(i => i.code === 'invented_phone').length, 0);
});
await t('lint: unbacked numbers and unknown urls warn (not block); backed numbers pass', () => {
  const r = m.lintArticle(art({ sections: [{ heading: '소제목1', paragraphs: ['30% 이상 차이가 나고 200명이 방문, 하객 100명 상담, https://evil.example/x'] }, { heading: '소제목2', paragraphs: ['본문'] }] }), ALLOWED);
  const codes = r.issues.map(i => i.code + ':' + i.level);
  assert.ok(codes.includes('unbacked_number:warn') && codes.includes('unknown_url:warn')); assert.equal(r.blocking, 0);
  assert.ok(!r.issues.some(i => i.msg.includes('100명')), '100명 is in the facts');
});
await t('lint: short article warns', () => { assert.ok(m.lintArticle(art({ sections: [{ heading: '소제목1', paragraphs: ['본문'] }] }), ALLOWED).issues.some(i => i.code === 'short')); });

// ---------- 조립 ----------
const input = m.parseInput(good());
await t('assemble: server fills business/sources/slug/dates; model cannot inject them', () => {
  const evil = { ...MODEL_OK, slug: '../../evil', sample: true, sources: [{ label: 'x', url: 'https://evil.example' }], business: { name: '해킹', phone: '010-0000-0000' }, category: '다른', publishedAt: '1999-01-01' };
  const a = m.assemble(JSON.stringify(evil), input);
  assert.ok(/^g-\d{8}-[0-9a-f]{8}$/.test(a.slug)); assert.equal(a.sample, false); assert.deepEqual(a.sources, SRC); assert.equal(a.business.name, '샘플웨딩홀'); assert.equal(a.business.phone, ''); assert.equal(a.category, '웨딩홀'); assert.notEqual(a.publishedAt, '1999-01-01');
});
await t('assemble: code fences ok; invalid JSON / <2 sections -> null; caps lengths', () => {
  assert.ok(m.assemble('```json\n' + JSON.stringify(MODEL_OK) + '\n```', input));
  assert.equal(m.assemble('not json', input), null); assert.equal(m.assemble('[]', input), null);
  assert.equal(m.assemble(JSON.stringify({ ...MODEL_OK, sections: [MODEL_OK.sections[0]] }), input), null);
  const a = m.assemble(JSON.stringify({ ...MODEL_OK, title: '가'.repeat(500), sections: Array.from({ length: 20 }, (_, i) => ({ heading: '소제목' + i, paragraphs: ['나'.repeat(5000)] })) }), input);
  assert.ok(a.title.length <= 100 && a.sections.length <= 6 && a.sections[0].paragraphs[0].length <= 1200);
});
await t('validateArticle agrees with tools/build-guides.mjs validate (same fixtures)', () => {
  const base = m.assemble(JSON.stringify(MODEL_OK), input);
  const cases = [base, { ...base, slug: 'Bad Slug' }, { ...base, title: 'x' }, { ...base, description: 'short' }, { ...base, publishedAt: '2026/01/01' }, { ...base, business: { ...base.business, url: 'javascript:1' } }, { ...base, sections: [] }, { ...base, sections: [{ heading: 'x', paragraphs: [] }] }, { ...base, faq: [{ q: 'x', a: '' }] }, { ...base, sources: [{ label: 'a', url: 'ftp://x' }] }, { ...base, questions: ['a'] }];
  for (const c of cases) assert.equal(m.validateArticle(c).length === 0, g.validate(c).length === 0, JSON.stringify(c).slice(0, 80));
  assert.equal(g.validate(base).length, 0);
});

// ---------- 생성 ----------
await t('generate: non-admin -> 403, Gemini never called', async () => { const { d, rec } = mkDeps({ noAdmin: true }); const r = await m.handle(post(good()), d); assert.equal(r.status, 403); assert.equal(rec.gemini.length, 0); assert.equal(rec.insert.length, 0); });
await t('generate: bad input -> 400 before Gemini; no key -> 503', async () => {
  let x = mkDeps(); assert.equal((await m.handle(post(good({ facts: [] })), x.d)).status, 400); assert.equal(x.rec.gemini.length, 0);
  x = mkDeps({ noKey: true }); assert.equal((await m.handle(post(good()), x.d)).status, 503); assert.equal(x.rec.gemini.length, 0);
});
await t('generate: success stores draft with admin id, lint, model; prompt carries rules + facts only', async () => {
  const { d, rec } = mkDeps(); const r = await m.handle(post(good({ inquiryId: 7 })), d); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.id, 42); assert.equal(j.blocking, 0);
  const row = rec.insert[0]; assert.equal(row.created_by, 'admin-1'); assert.equal(row.inquiry_id, 7); assert.equal(row.model, 'modelA'); assert.deepEqual(row.article.sources, SRC);
  const prompt = rec.gemini[0].body.contents[0].parts[0].text;
  assert.ok(prompt.includes('[제공된 사실]에 없는 내용은 쓰지 마세요') && prompt.includes('하객 100명 규모 상담이 가능합니다') && prompt.includes('링크는 쓰지 마세요'));
  assert.ok(!prompt.includes('example.com'), 'urls are not sent to the model');
});
await t('generate: risky model output is STORED as draft but flagged blocking (cannot be approved)', async () => {
  const risky = { ...MODEL_OK, sections: [{ heading: '소개', paragraphs: ['국내 최고 시설이며 효과를 보장합니다. 문의 02-999-8888'] }, MODEL_OK.sections[1]] };
  const { d, rec } = mkDeps({ model: risky }); const j = await (await m.handle(post(good()), d)).json();
  assert.ok(j.blocking >= 2); assert.ok(j.lint.some(i => i.code === 'invented_phone')); assert.equal(rec.insert[0].blocking, j.blocking);
});
await t('generate: Gemini failure / garbage output -> 502 and NOTHING stored', async () => {
  for (const o of [{ geminiErr: 'timeout' }, { geminiErr: 'auth_failed' }, { text: 'not json' }, { text: '{}' }]) { const { d, rec } = mkDeps(o); const r = await m.handle(post(good()), d); assert.equal(r.status, 502); assert.equal(rec.insert.length, 0); }
});

// ---------- 수정 저장 ----------
const stored = () => { const a = m.assemble(JSON.stringify(MODEL_OK), input); return { id: 5, status: 'draft', business: BIZ, facts: FACTS, article: a }; };
const edit = (over = {}) => ({ action: 'save', id: 5, article: { title: '수정한 제목입니다', description: '수정한 설명입니다 열자 이상', questions: ['질문입니다'], sections: [{ heading: '소제목 하나', paragraphs: ['수정한 본문입니다.'] }, { heading: '소제목 둘', paragraphs: ['본문 둘입니다.'] }], faq: [{ q: '질문입니다?', a: '답변입니다.' }], ...over } });
await t('save: non-admin 403; bad id 400; missing 404; approved/rejected -> 409', async () => {
  assert.equal((await m.handle(post(edit()), mkDeps({ noAdmin: true }).d)).status, 403);
  assert.equal((await m.handle(post({ action: 'save', id: 'x' }), mkDeps({ row: stored() }).d)).status, 400);
  assert.equal((await m.handle(post(edit()), mkDeps().d)).status, 404);
  for (const status of ['approved', 'rejected']) { const x = mkDeps({ row: { ...stored(), status } }); assert.equal((await m.handle(post(edit()), x.d)).status, 409); assert.equal(x.rec.update.length, 0); }
});
await t('save: edits saved, lint recomputed (adding "최고" blocks, removing it clears)', async () => {
  let x = mkDeps({ row: stored() }); let j = await (await m.handle(post(edit()), x.d)).json(); assert.equal(j.blocking, 0); assert.equal(x.rec.update[0].patch.article.title, '수정한 제목입니다');
  x = mkDeps({ row: stored() }); j = await (await m.handle(post(edit({ sections: [{ heading: '소제목 하나', paragraphs: ['국내 최고입니다.'] }, { heading: '소제목 둘', paragraphs: ['본문 둘입니다.'] }] })), x.d)).json();
  assert.equal(j.blocking, 1); assert.equal(x.rec.update[0].patch.blocking, 1);
});
await t('save: editor cannot change business/sources/slug/dates; invalid article -> 422 not saved', async () => {
  const x = mkDeps({ row: stored() }); const e = edit(); e.article.business = { name: '해킹' }; e.article.sources = [{ label: 'x', url: 'https://evil.example' }]; e.article.slug = 'hacked-slug'; e.article.publishedAt = '1999-01-01';
  await m.handle(post(e), x.d); const a = x.rec.update[0].patch.article;
  assert.equal(a.business.name, '샘플웨딩홀'); assert.deepEqual(a.sources, SRC); assert.notEqual(a.slug, 'hacked-slug'); assert.notEqual(a.publishedAt, '1999-01-01');
  const y = mkDeps({ row: stored() }); const r = await m.handle(post(edit({ title: 'x', sections: [] })), y.d); assert.equal(r.status, 422); assert.equal(y.rec.update.length, 0);
});

// ---------- Gemini 호출 ----------
const gem = text => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }), text: async () => '' });
await t('callGemini: 404 on first model falls back to second', async () => {
  const urls = []; const f = async url => { urls.push(url); return url.includes('/modelA:') ? { ok: false, status: 404, text: async () => '' } : gem('OK'); };
  assert.equal(await m.callGemini({}, ['modelA', 'modelB'], 'k', f), 'OK'); assert.ok(urls[0].includes('modelA') && urls[1].includes('modelB'));
});
await t('callGemini: auth failure stops immediately (no fallback); key goes in header only', async () => {
  let n = 0, hdr; const f = async (url, init) => { n++; hdr = init.headers; assert.ok(!url.includes('KEYSECRET')); return { ok: false, status: 403, text: async () => '' }; };
  await assert.rejects(() => m.callGemini({}, ['a', 'b'], 'KEYSECRET', f), /auth_failed/); assert.equal(n, 1); assert.equal(hdr['x-goog-api-key'], 'KEYSECRET');
});

process.exitCode = fails ? 1 : 0;
console.log(fails ? fails + ' FAILED' : pass + ' passed');
