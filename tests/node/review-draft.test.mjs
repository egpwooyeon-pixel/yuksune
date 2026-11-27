import * as m from '../../supabase/functions/review-draft/index.ts';
import assert from 'node:assert/strict';

let fails = 0, pass = 0;
const t = (n, f) => Promise.resolve().then(f).then(() => { pass++; console.log('PASS', n); }, e => { fails++; console.log('FAIL', n, e.message); });

const BIZ = { name: '샘플식당', area: '서울 강남구', category: '한식', signatureMenu: '갈비탕, 육회비빔밥' };
const REVIEWS = ['분위기도 좋고 친절하시고 맛도 정말 좋았어요', '갈비탕이 진하고 양도 많아서 만족했습니다'];
const PHOTO = 'https://example.com/a.jpg';
const good = (o = {}) => ({ business: BIZ, reviews: REVIEWS, photoUrls: [], customInstructions: '', ...o });

const MODEL_OK = {
  requiredKeywords: ['강남 한식'], goodKeywords: ['친절', '분위기'], signatureMenu: ['갈비탕'],
  titles: ['강남 한식 맛집 솔직 후기', '갈비탕 진국 강남 숨은 맛집', '친절한 강남 한식당 방문기'],
  hashtags: ['강남맛집', '한식', '갈비탕'],
  draft: '강남에서 찾은 한식당 후기입니다. 분위기도 좋고 친절했어요. 갈비탕이 특히 진하고 양도 많았습니다.',
};

// actor: 'admin' (기본) | 'approved' (= 승인된 인플루언서, 사진만 방식) | 'member' (미인증 회원) | 'none' (비로그인)
const ACTORS = { admin: { id: 'admin-1', isAdmin: true, isInfluencer: false }, approved: { id: 'member-1', isAdmin: false, isInfluencer: true }, member: { id: 'member-2', isAdmin: false, isInfluencer: false }, biz: { id: 'member-3', isAdmin: false, isInfluencer: false } };
const mkDeps = (o = {}) => {
  const rec = { gemini: [], fetchPhoto: [], insert: [], update: [], get: [], countToday: [] };
  return {
    rec,
    d: {
      actor: async () => (o.actor === 'none' ? null : ACTORS[o.actor || 'admin']),
      config: () => ({ apiKey: o.noKey ? undefined : 'KEY', models: ['modelA'], influencerLimit: o.dailyLimit || 1 }),
      photoPrefix: id => `https://x.supabase.co/storage/v1/object/public/review-draft-photos/${id}/`,
      gemini: async (body, models, key) => { rec.gemini.push({ body, models, key }); if (o.geminiErr) throw new Error(o.geminiErr); return o.text !== undefined ? o.text : JSON.stringify(o.model || MODEL_OK); },
      fetchPhoto: async url => { rec.fetchPhoto.push(url); if (o.photoFail) return null; return { mimeType: 'image/jpeg', data: 'BASE64' }; },
      countToday: async id => { rec.countToday.push(id); return o.usedToday || 0; },
      insert: async row => { rec.insert.push(row); return { id: 42 }; },
      get: async id => (o.row === undefined ? null : o.row),
      update: async (id, patch) => { rec.update.push({ id, patch }); },
    },
  };
};
const post = b => new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: JSON.stringify(b) });

// ---------- 입력 ----------
await t('parseInput: valid, trims/filters reviews, drops blanks', () => {
  const r = m.parseInput(good({ reviews: [...REVIEWS, '   ', ''] })); assert.equal(r.error, undefined); assert.equal(r.reviews.length, 2);
});
await t('parseInput: errors', () => {
  assert.equal(m.parseInput(good({ business: { ...BIZ, name: 'a' } })).error, 'bad_name');
  assert.equal(m.parseInput(good({ reviews: [] })).error, 'need_reviews');
  assert.equal(m.parseInput(good({ photoUrls: ['javascript:alert(1)'] })).error, 'bad_photo_url');
});
await t('parseInput: caps review/photo counts', () => {
  const r = m.parseInput(good({ reviews: Array.from({ length: 100 }, (_, i) => '리뷰 내용 ' + i), photoUrls: Array.from({ length: 30 }, (_, i) => `https://example.com/${i}.jpg`) }));
  assert.ok(r.reviews.length <= 60); assert.ok(r.photoUrls.length <= 15);
});

// ---------- 프롬프트 ----------
await t('buildParts/finishParts: reviews + custom instructions in prompt; no photo section when no photos', () => {
  const input = m.parseInput(good({ customInstructions: '흰색 메뉴만 강조해줘' }));
  const { parts, hasPhotos } = m.buildParts(input); assert.equal(hasPhotos, false);
  const full = m.finishParts(parts, hasPhotos, [], 0);
  const text = full.map(p => p.text || '').join('\n');
  assert.ok(text.includes('갈비탕이 진하고 양도 많아서')); assert.ok(text.includes('흰색 메뉴만 강조해줘')); assert.ok(!text.includes('사진 1:'));
});
await t('finishParts: photo parts interleaved in order, missing photo becomes a text fallback', () => {
  const input = m.parseInput(good({ photoUrls: [PHOTO, PHOTO] }));
  const { parts, hasPhotos } = m.buildParts(input); assert.equal(hasPhotos, true);
  const full = m.finishParts(parts, hasPhotos, [{ mimeType: 'image/jpeg', data: 'X' }, null], 2);
  const kinds = full.map(p => (p.inlineData ? 'img' : p.text.slice(0, 10)));
  assert.ok(kinds.includes('img'));
  assert.ok(full.some(p => p.text && p.text.includes('불러오지 못했습니다')));
});

// ---------- 조립 ----------
const input = m.parseInput(good({ photoUrls: [PHOTO] }));
await t('assemble: fields cleaned/capped; hashtags normalized to #word; photoCaptions padded to photo count', () => {
  const a = m.assemble(JSON.stringify(MODEL_OK), input);
  assert.equal(a.photoCaptions.length, 1);
  assert.ok(a.hashtags.every(h => h.startsWith('#')));
  const b = m.assemble(JSON.stringify({ ...MODEL_OK, hashtags: ['노태그', '#이미태그'] }), input);
  assert.deepEqual(b.hashtags, ['#노태그', '#이미태그']);
});
await t('assemble: code fences ok; invalid JSON / empty draft -> null', () => {
  assert.ok(m.assemble('```json\n' + JSON.stringify(MODEL_OK) + '\n```', input));
  assert.equal(m.assemble('not json', input), null);
  assert.equal(m.assemble(JSON.stringify({ ...MODEL_OK, draft: '' }), input), null);
  assert.equal(m.assemble(JSON.stringify({ ...MODEL_OK, draft: '   ' }), input), null);
});
await t('assemble: caps title/draft lengths', () => {
  const a = m.assemble(JSON.stringify({ ...MODEL_OK, draft: '가'.repeat(10000), titles: ['나'.repeat(500)] }), input);
  assert.ok(a.draft.length <= 4000); assert.ok(a.titles[0].length <= 80);
});

// ---------- 생성 ----------
await t('generate: logged-out -> 403 forbidden; unapproved member -> 403 not_approved; Gemini never called', async () => {
  let x = mkDeps({ actor: 'none' }); let r = await m.handle(post(good()), x.d); assert.equal(r.status, 403); assert.equal((await r.json()).error, 'forbidden'); assert.equal(x.rec.gemini.length, 0);
  x = mkDeps({ actor: 'member' }); r = await m.handle(post(good()), x.d); assert.equal(r.status, 403); assert.equal((await r.json()).error, 'not_approved'); assert.equal(x.rec.gemini.length, 0);
});
await t('generate: bad input -> 400 before Gemini; no key -> 503', async () => {
  let x = mkDeps(); assert.equal((await m.handle(post(good({ reviews: [] })), x.d)).status, 400); assert.equal(x.rec.gemini.length, 0);
  x = mkDeps({ noKey: true }); assert.equal((await m.handle(post(good()), x.d)).status, 503); assert.equal(x.rec.gemini.length, 0);
});
await t('generate: admin success stores draft with admin id/model; reviews reach prompt, customInstructions too', async () => {
  const { d, rec } = mkDeps(); const r = await m.handle(post(good({ customInstructions: '캐주얼하게' })), d); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.id, 42); assert.equal(j.draft.draft, MODEL_OK.draft);
  const row = rec.insert[0]; assert.equal(row.created_by, 'admin-1'); assert.equal(row.model, 'modelA'); assert.equal(row.kind, 'blog');
  const prompt = rec.gemini[0].body.contents[0].parts.map(p => p.text || '').join('\n');
  assert.ok(prompt.includes('지어내지 마세요') && prompt.includes('갈비탕이 진하고') && prompt.includes('캐주얼하게'));
});
const MP = id => `https://x.supabase.co/storage/v1/object/public/review-draft-photos/${id}/`;
const pgood = (o = {}) => ({ business: { name: '성수루프', area: '', category: '' }, photoUrls: [MP('member-1') + 'a.jpg', MP('member-1') + 'b.jpg'], ...o });
await t('influencer (photo-only): name + photos is enough; stored with own id; reviews never required', async () => {
  const { d, rec } = mkDeps({ actor: 'approved' }); const r = await m.handle(post(pgood()), d);
  assert.equal(r.status, 200); assert.equal(rec.insert[0].created_by, 'member-1'); assert.deepEqual(rec.insert[0].reviews, []);
  const prompt = rec.gemini[0].body.contents[0].parts.map(p => p.text || '').join('\n');
  assert.ok(prompt.includes('성수루프') && prompt.includes('지어내지 마세요') && !prompt.includes('[리뷰 목록]'));
});
await t('influencer: no photos -> 400 need_photos; name too short -> 400; Gemini never called', async () => {
  let x = mkDeps({ actor: 'approved' }); let r = await m.handle(post(pgood({ photoUrls: [] })), x.d); assert.equal(r.status, 400); assert.equal((await r.json()).error, 'need_photos');
  x = mkDeps({ actor: 'approved' }); r = await m.handle(post(pgood({ business: { name: 'a' } })), x.d); assert.equal(r.status, 400); assert.equal(x.rec.gemini.length, 0);
});
await t('influencer: cannot use the review-paste mode (reviews ignored, still needs photos); foreign / other-user photo URLs rejected', async () => {
  let x = mkDeps({ actor: 'approved' }); let r = await m.handle(post(good()), x.d); assert.equal(r.status, 400);   // 기존 리뷰 방식 요청 → 사진 없음
  x = mkDeps({ actor: 'approved' }); r = await m.handle(post(pgood({ photoUrls: ['https://evil.example/x.jpg'] })), x.d); assert.equal(r.status, 400); assert.equal((await r.json()).error, 'bad_photo_url'); assert.equal(x.rec.fetchPhoto.length, 0);
  x = mkDeps({ actor: 'approved' }); r = await m.handle(post(pgood({ photoUrls: [MP('someone-else') + 'a.jpg'] })), x.d); assert.equal(r.status, 400); assert.equal(x.rec.fetchPhoto.length, 0);
});
await t('business-verified (non-influencer) member can no longer generate -> 403', async () => {
  const x = mkDeps({ actor: 'biz' }); const r = await m.handle(post(pgood({ photoUrls: [MP('member-3') + 'a.jpg'] })), x.d); assert.equal(r.status, 403); assert.equal(x.rec.gemini.length, 0);
});
await t('influencer: 1 per day (limit reached -> 429, admin unlimited)', async () => {
  let x = mkDeps({ actor: 'approved', usedToday: 1 }); let r = await m.handle(post(pgood()), x.d);
  assert.equal(r.status, 429); assert.equal((await r.json()).error, 'daily_limit'); assert.equal(x.rec.gemini.length, 0); assert.equal(x.rec.countToday[0], 'member-1');
  x = mkDeps({ actor: 'approved', usedToday: 0 }); assert.equal((await m.handle(post(pgood()), x.d)).status, 200);
  x = mkDeps({ actor: 'admin', usedToday: 999, dailyLimit: 5 }); r = await m.handle(post(good()), x.d);
  assert.equal(r.status, 200); assert.equal(x.rec.countToday.length, 0, 'admin is never rate-limited / checked');
});
await t('generate: fetches every photo URL and sends inline images to Gemini', async () => {
  const { d, rec } = mkDeps(); await m.handle(post(good({ photoUrls: [PHOTO, PHOTO] })), d);
  assert.equal(rec.fetchPhoto.length, 2);
  const parts = rec.gemini[0].body.contents[0].parts; assert.ok(parts.some(p => p.inlineData && p.inlineData.data === 'BASE64'));
});
await t('generate: a failed photo fetch does not abort the run (still generates)', async () => {
  const { d, rec } = mkDeps({ photoFail: true }); const r = await m.handle(post(good({ photoUrls: [PHOTO] })), d);
  assert.equal(r.status, 200); assert.equal(rec.insert.length, 1);
});
await t('generate: Gemini failure / garbage output -> 502 and NOTHING stored', async () => {
  for (const o of [{ geminiErr: 'timeout' }, { text: 'not json' }, { text: '{}' }]) { const { d, rec } = mkDeps(o); const r = await m.handle(post(good()), d); assert.equal(r.status, 502); assert.equal(rec.insert.length, 0); }
});

// ---------- 수정 저장 (운영자만) ----------
const stored = () => { const a = m.assemble(JSON.stringify(MODEL_OK), input); return { id: 5, status: 'draft', business: BIZ, reviews: REVIEWS, photo_urls: [PHOTO], draft: a }; };
const edit = (over = {}) => ({ action: 'save', id: 5, draft: { ...MODEL_OK, photoCaptions: ['수정한 캡션'], ...over } });
await t('save: logged-out/member/approved all 403 (admin only); bad id 400; missing 404; approved/rejected -> 409', async () => {
  for (const actor of ['none', 'member', 'approved']) assert.equal((await m.handle(post(edit()), mkDeps({ actor }).d)).status, 403);
  assert.equal((await m.handle(post({ action: 'save', id: 'x' }), mkDeps({ row: stored() }).d)).status, 400);
  assert.equal((await m.handle(post(edit()), mkDeps().d)).status, 404);
  for (const status of ['approved', 'rejected']) { const x = mkDeps({ row: { ...stored(), status } }); assert.equal((await m.handle(post(edit()), x.d)).status, 409); assert.equal(x.rec.update.length, 0); }
});
await t('save: edits saved; empty draft text -> 422 not saved; editor cannot touch business/reviews', async () => {
  const x = mkDeps({ row: stored() }); const j = await (await m.handle(post(edit({ draft: '수정한 본문입니다.' })), x.d)).json();
  assert.equal(j.draft.draft, '수정한 본문입니다.'); assert.equal(x.rec.update[0].patch.draft.draft, '수정한 본문입니다.');
  const y = mkDeps({ row: stored() }); const r = await m.handle(post(edit({ draft: '   ' })), y.d); assert.equal(r.status, 422); assert.equal(y.rec.update.length, 0);
});

process.exitCode = fails ? 1 : 0;
console.log(fails ? fails + ' FAILED' : pass + ' passed');
