import * as m from '../../supabase/functions/aeo-photo/index.ts';
import assert from 'node:assert/strict';

let fails = 0, pass = 0;
const t = (n, f) => Promise.resolve().then(f).then(() => { pass++; console.log('PASS', n); }, e => { fails++; console.log('FAIL', n, e.message); });

const B = '11111111-1111-4111-8111-111111111111';
const post = body => new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
const deps = (o = {}) => {
  const calls = { reserve: [], sign: [] };
  return {
    calls,
    d: {
      ipHash: async () => 'h',
      reserve: async (ip, batch, types) => { calls.reserve.push({ ip, batch, types }); return o.rsv || { ok: true, paths: types.map((_, i) => `${batch}/f${i}.jpg`) }; },
      sign: async path => { calls.sign.push(path); return o.noToken ? null : 'tok-' + path; },
    },
  };
};

await t('parseInput: valid', () => {
  const r = m.parseInput({ batch: B.toUpperCase(), types: ['image/jpeg', 'image/png'] });
  assert.equal(r.batch, B); assert.deepEqual(r.types, ['image/jpeg', 'image/png']);
});
await t('parseInput: rejects bad batch / count / type', () => {
  for (const b of [undefined, '', 'not-a-uuid', '../../etc/passwd', B + '/../x', 'x'.repeat(200)]) assert.equal(m.parseInput({ batch: b, types: ['image/jpeg'] }).error, 'bad_batch');
  for (const ty of [undefined, [], 'image/jpeg', ['image/jpeg', 'image/jpeg', 'image/jpeg', 'image/jpeg'], {}]) assert.equal(m.parseInput({ batch: B, types: ty }).error, 'bad_count');
  for (const ty of [['image/gif'], ['image/svg+xml'], ['text/html'], ['image/jpeg', 'application/pdf'], [null]]) assert.equal(m.parseInput({ batch: B, types: ty }).error, 'bad_type');
});
await t('tokenFrom', () => {
  assert.equal(m.tokenFrom({ url: '/object/upload/sign/business-photos/a/b.jpg?token=abc.def' }), 'abc.def');
  assert.equal(m.tokenFrom({ url: 'https://p.supabase.co/storage/v1/object/upload/sign/x?token=T1' }), 'T1');
  assert.equal(m.tokenFrom({ url: '/no-token' }), null); assert.equal(m.tokenFrom(null), null); assert.equal(m.tokenFrom({}), null);
});
await t('handle: success returns server paths + tokens (one sign per path)', async () => {
  const { d, calls } = deps(); const r = await m.handle(post({ batch: B, types: ['image/jpeg', 'image/webp'] }), d); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.bucket, 'business-photos'); assert.equal(j.files.length, 2);
  assert.ok(j.files.every(f => f.path.startsWith(B + '/') && f.token === 'tok-' + f.path)); assert.equal(calls.sign.length, 2);
});
await t('handle: client cannot choose paths (extra fields ignored)', async () => {
  const { d, calls } = deps(); await m.handle(post({ batch: B, types: ['image/jpeg'], path: '../../evil.jpg', paths: ['x'], bucket: 'public' }), d);
  assert.deepEqual(calls.reserve[0].types, ['image/jpeg']); assert.ok(!calls.sign.some(p => p.includes('evil')));
});
await t('handle: bad input -> 400 before touching DB or storage', async () => {
  const { d, calls } = deps(); for (const body of [{}, { batch: 'x', types: ['image/jpeg'] }, { batch: B, types: ['image/gif'] }, { batch: B, types: [] }]) assert.equal((await m.handle(post(body), d)).status, 400);
  assert.equal(calls.reserve.length, 0); assert.equal(calls.sign.length, 0);
});
await t('handle: limits -> 429 and no signing', async () => {
  for (const reason of ['batch_limit', 'ip_limit', 'global_limit']) { const { d, calls } = deps({ rsv: { ok: false, reason } }); const r = await m.handle(post({ batch: B, types: ['image/jpeg'] }), d); assert.equal(r.status, 429); assert.equal((await r.json()).error, reason); assert.equal(calls.sign.length, 0); }
});
await t('handle: DB says bad_type/bad_count -> 400', async () => {
  const { d } = deps({ rsv: { ok: false, reason: 'bad_type' } }); assert.equal((await m.handle(post({ batch: B, types: ['image/jpeg'] }), d)).status, 400);
});
await t('handle: signing failure -> 502 sign_failed (no tokens leaked)', async () => {
  const { d } = deps({ noToken: true }); const r = await m.handle(post({ batch: B, types: ['image/jpeg'] }), d); const j = await r.json();
  assert.equal(r.status, 502); assert.equal(j.error, 'sign_failed'); assert.ok(!('files' in j));
});
await t('handle: GET 405, OPTIONS ok', async () => {
  const { d } = deps(); assert.equal((await m.handle(new Request('http://x'), d)).status, 405); assert.equal((await m.handle(new Request('http://x', { method: 'OPTIONS' }), d)).status, 200);
});

process.exitCode = fails ? 1 : 0;
console.log(fails ? fails + ' FAILED' : pass + ' passed');
