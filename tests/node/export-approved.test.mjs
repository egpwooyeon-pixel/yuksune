import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const EXPORT_CLI = fileURLToPath(new URL('../../tools/export-approved.mjs', import.meta.url));
import assert from 'node:assert/strict';
import * as ex from '../../tools/export-approved.mjs';
import * as guide from '../../tools/build-guides.mjs';
import * as mod from '../../supabase/functions/aeo-draft/index.ts';

let fails = 0, pass = 0;
const t = (n, f) => Promise.resolve().then(f).then(() => { pass++; console.log('PASS', n); }, e => { fails++; console.log('FAIL', n, e.message); });
const BASE = path.join(os.tmpdir(), 'egp-export-test');
fs.rmSync(BASE, { recursive: true, force: true }); fs.mkdirSync(BASE, { recursive: true });
let n = 0; const tmp = () => { const d = path.join(BASE, 'd' + (++n)); fs.mkdirSync(d, { recursive: true }); return d; };

const KEY = 'SECRETKEY-abcdefghijklmnopqrstuvwxyz0123456789';
const art = (slug, over = {}) => ({ slug, sample: false, title: '야외 예식 웨딩홀을 고를 때 확인할 점', description: '야외 예식을 고려할 때 확인할 점을 정리한 글입니다.', category: '웨딩홀', publishedAt: '2026-11-24', updatedAt: '2026-11-24',
  business: { name: '샘플웨딩홀', region: '서울', address: '예시 주소', phone: '', hours: '', url: 'https://example.com/', summary: '가상 업체' }, questions: ['질문 하나입니다'],
  sections: [{ heading: '소제목 하나', paragraphs: ['본문 하나입니다. 세부 조건은 업체에 확인하세요.'] }, { heading: '소제목 둘', paragraphs: ['본문 둘입니다.'] }],
  sources: [{ label: '업체 공식 홈페이지', url: 'https://example.com/' }], faq: [{ q: '질문입니까?', a: '업체에 확인하세요.' }], ...over });
const row = (id, over = {}, aover = {}) => ({ id, status: 'approved', blocking: 0, business: { name: '샘플웨딩홀' }, facts: ['야외 예식 공간이 있습니다', '예약은 전화로 합니다'], article: art('g-20261124-' + String(id).padStart(8, '0'), aover), ...over });

const ROWS = [
  row(1),                                                                                              // 정상
  row(2, { blocking: 2 }),                                                                              // 차단 기록 있음
  row(3, {}, { sections: [{ heading: '소제목 하나', paragraphs: ['국내 최고 시설입니다.'] }, { heading: '소제목 둘', paragraphs: ['본문 둘입니다.'] }] }),   // 기록은 0 이지만 내보내기 직전 검사에서 차단
  row(4, { status: 'draft' }),                                                                          // 서버가 잘못 돌려준 초안
  row(5, {}, { sample: true }),                                                                         // 샘플
  row(6, {}, { title: 'x' }),                                                                           // 형식 오류
  row(7, {}, { sections: [{ heading: '소제목 하나', paragraphs: ['문의는 02-123-4567 로 하세요.'] }, { heading: '소제목 둘', paragraphs: ['본문 둘입니다.'] }] }),  // 지어낸 전화번호
];

const reqs = [];
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => {
    reqs.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (server.mode === 'error') { res.writeHead(401); return res.end('{"message":"bad key ' + KEY + '"}'); }
    if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(server.rows || ROWS)); }
    if (req.method === 'PATCH') { res.writeHead(server.mode === 'patchfail' ? 500 : 204); return res.end(); }
    res.writeHead(405); res.end();
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:' + server.address().port;
const run = (o = {}) => ex.exportApproved({ url: URL_, key: KEY, mod, guide, out: o.out, ...o });
const reset = () => { reqs.length = 0; server.mode = null; server.rows = null; };

await t('only the safe approved article is written; every other row skipped with a reason', async () => {
  reset(); const out = tmp(); const r = await run({ out });
  assert.deepEqual(r.written, ['g-20261124-00000001']); assert.deepEqual(fs.readdirSync(out), ['g-20261124-00000001.json']);
  const why = Object.fromEntries(r.skipped.map(s => [s.id, s.reason]));
  assert.ok(why[2].includes('차단 항목')); assert.ok(why[3].includes('내보내기 직전 자동 검사')); assert.ok(why[4].includes('승인이 아니에요')); assert.ok(why[5].includes('샘플')); assert.ok(why[6].includes('형식 검증')); assert.ok(why[7].includes('내보내기 직전 자동 검사') && why[7].includes('전화번호'));
  assert.equal(r.skipped.length, 6);
});
await t('written file is valid for the generator and round-trips', async () => {
  reset(); const out = tmp(); await run({ out }); const a = JSON.parse(fs.readFileSync(path.join(out, 'g-20261124-00000001.json'), 'utf8'));
  assert.equal(guide.validate(a).length, 0); assert.equal(a.sample, false);
});
await t('exported_at PATCH only for the written article; request uses key headers and a server-side filter', async () => {
  reset(); const out = tmp(); await run({ out });
  const patches = reqs.filter(r => r.method === 'PATCH'); assert.equal(patches.length, 1); assert.ok(patches[0].url.includes('id=eq.1')); assert.ok(JSON.parse(patches[0].body).exported_at);
  const get = reqs.find(r => r.method === 'GET'); assert.ok(get.url.includes('status=eq.approved') && get.url.includes('exported_at=is.null')); assert.equal(get.headers.apikey, KEY); assert.equal(get.headers.authorization, 'Bearer ' + KEY);
});
await t('--all drops the exported_at filter', async () => { reset(); await run({ out: tmp(), all: true }); assert.ok(!reqs.find(r => r.method === 'GET').url.includes('exported_at')); });
await t('re-run is idempotent: same content -> no rewrite, no PATCH', async () => {
  reset(); const out = tmp(); await run({ out }); const f = path.join(out, 'g-20261124-00000001.json'), m1 = fs.statSync(f).mtimeMs; reqs.length = 0;
  const r = await run({ out }); assert.deepEqual(r.same, ['g-20261124-00000001']); assert.equal(r.written.length, 0); assert.equal(reqs.filter(x => x.method === 'PATCH').length, 0); assert.equal(fs.statSync(f).mtimeMs, m1);
});
await t('different content under the same slug is NOT overwritten unless --force', async () => {
  reset(); const out = tmp(); fs.writeFileSync(path.join(out, 'g-20261124-00000001.json'), '{"hand":"edited"}\n');
  let r = await run({ out }); assert.equal(r.written.length, 0); assert.ok(r.skipped.some(s => s.id === 1 && s.reason.includes('--force'))); assert.equal(fs.readFileSync(path.join(out, 'g-20261124-00000001.json'), 'utf8'), '{"hand":"edited"}\n');
  reset(); r = await run({ out, force: true }); assert.deepEqual(r.written, ['g-20261124-00000001']); assert.ok(fs.readFileSync(path.join(out, 'g-20261124-00000001.json'), 'utf8').includes('샘플웨딩홀'));
});
await t('--dry-run writes nothing and sends no PATCH', async () => {
  reset(); const out = tmp(); const r = await run({ out, dryRun: true }); assert.deepEqual(fs.readdirSync(out), []); assert.equal(reqs.filter(x => x.method === 'PATCH').length, 0); assert.ok(r.written[0].includes('dry-run'));
});
await t('PATCH failure is a warning (file still written)', async () => { reset(); server.mode = null; const out = tmp(); server.mode = 'patchfail'; const r = await run({ out }); assert.equal(r.written.length, 1); assert.ok(r.warnings.length === 1); });
await t('HTTP error -> readable error that does not contain the key', async () => {
  reset(); server.mode = 'error'; await assert.rejects(() => run({ out: tmp() }), e => { assert.ok(e.message.includes('401')); assert.ok(!e.message.includes(KEY)); return true; });
});

// ---- CLI ----
const cli = (env, args = []) => new Promise(resolve => {      // 같은 프로세스의 가짜 서버가 응답해야 하므로 비동기로 실행
  const c = spawn('node', [EXPORT_CLI, ...args], { env: { PATH: process.env.PATH, ...env } });
  let stdout = '', stderr = ''; c.stdout.on('data', d => stdout += d); c.stderr.on('data', d => stderr += d);
  const timer = setTimeout(() => { c.kill(); resolve({ status: 'timeout', stdout, stderr }); }, 20000);
  c.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
});
await t('CLI: missing env -> exit 2 with guidance (no key printed)', async () => { const r = await cli({}); assert.equal(r.status, 2); assert.ok(r.stderr.includes('SUPABASE_SERVICE_ROLE_KEY')); });
await t('CLI: runs against the mock, exit 1 because rows were skipped, output never contains the key, writes only the safe file', async () => {
  reset(); const out = tmp(); const r = await cli({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY }, ['--out', out]);
  assert.equal(r.status, 1); assert.ok(!r.stdout.includes(KEY) && !r.stderr.includes(KEY)); assert.ok(r.stdout.includes('쓴 글 1개') && r.stdout.includes('건너뜀 #2')); assert.deepEqual(fs.readdirSync(out), ['g-20261124-00000001.json']);
});
await t('CLI: all-safe run exits 0 and prints the next step', async () => {
  reset(); server.rows = [ROWS[0]]; const out = tmp(); const r = await cli({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY }, ['--out', out]); assert.equal(r.status, 0); assert.ok(r.stdout.includes('build-guides'));
});
await t('CLI: server error -> exit 1, key not printed', async () => { reset(); server.mode = 'error'; const r = await cli({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY }, ['--out', tmp()]); assert.equal(r.status, 1); assert.ok(!r.stdout.includes(KEY) && !r.stderr.includes(KEY)); });
server.close();

// ---- 생성기: 낡은 페이지 정리 ----
await t('build prunes stale generated pages only (marker), keeps hand-made files, keeps index', () => {
  const src = tmp(), out = tmp();
  fs.writeFileSync(path.join(src, '_site.json'), JSON.stringify({ siteName: '테스트' }));
  fs.writeFileSync(path.join(src, 'a-one-slug.json'), JSON.stringify(art('a-one-slug'))); fs.writeFileSync(path.join(src, 'b-two-slug.json'), JSON.stringify(art('b-two-slug')));
  guide.build(src, out); assert.ok(fs.existsSync(path.join(out, 'a-one-slug.html')) && fs.existsSync(path.join(out, 'b-two-slug.html')));
  fs.writeFileSync(path.join(out, 'handmade.html'), '<html>손으로 만든 파일</html>');
  fs.rmSync(path.join(src, 'b-two-slug.json'));
  const r = guide.build(src, out);
  assert.deepEqual(r.removed, ['b-two-slug.html']); assert.ok(!fs.existsSync(path.join(out, 'b-two-slug.html'))); assert.ok(fs.existsSync(path.join(out, 'a-one-slug.html'))); assert.ok(fs.existsSync(path.join(out, 'handmade.html'))); assert.ok(fs.existsSync(path.join(out, 'index.html')));
  assert.ok(!fs.readFileSync(path.join(out, 'index.html'), 'utf8').includes('b-two-slug'));
});

process.exitCode = fails ? 1 : 0;
console.log(fails ? fails + ' FAILED' : pass + ' passed');
