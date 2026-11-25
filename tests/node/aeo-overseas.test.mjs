// 해외 검색 자동 점검(aeo-prefill 의 mode:"overseas") 시험 — 모의 홈페이지·robots·sitemap 으로
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const m = await import(pathToFileURL(path.resolve(import.meta.dirname, '../../supabase/functions/aeo-prefill/index.ts')).href);
let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, e.message); } };

const HOME = `<!doctype html><html lang="ko"><head><title>예시의원 | 서울 피부과</title><meta name="description" content="서울에 있는 피부과입니다. 처음 방문하는 분을 위한 진료 안내를 드립니다. 상담 전 확인할 내용을 정리했습니다.">
<link rel="canonical" href="https://www.sample-clinic.kr/"><link rel="alternate" hreflang="ko" href="https://www.sample-clinic.kr/"><link rel="alternate" hreflang="ja" href="https://www.sample-clinic.kr/ja/">
<link rel="alternate" hreflang="en" href="https://www.sample-clinic.kr/en/"><link rel="alternate" hreflang="zh-TW" href="https://tw.sample-clinic.kr/"><link rel="alternate" hreflang="fr" href="https://evil.example.org/fr/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"MedicalClinic","name":"예시의원"}</script></head><body><h1>예시의원</h1></body></html>`;
const JA = `<html lang="ja"><head><title>예시의원 | 서울 피부과</title><meta name="description" content="ソウルの皮膚科です。"><link rel="canonical" href="https://www.sample-clinic.kr/ja/"><link rel="alternate" hreflang="ko" href="https://www.sample-clinic.kr/"></head><body><h1>ようこそ</h1><h1>二つ目</h1></body></html>`;
const EN = `<html lang="en"><head><title>Sample Clinic Seoul Dermatology - first visit guide for international patients</title><meta name="description" content="A dermatology clinic in Seoul. This page explains the first visit flow, what to prepare and how to book in English."><link rel="canonical" href="https://www.sample-clinic.kr/en/"><link rel="alternate" hreflang="ko" href="https://www.sample-clinic.kr/"></head><body><h1>First visit guide</h1></body></html>`;
const TW = `<html lang="zh-TW"><head><title>首爾皮膚科 | 初診須知與預約流程說明</title><meta name="description" content="位於首爾的皮膚科診所，提供初診流程、準備事項與預約方式的繁體中文說明，方便海外患者事先了解。"><link rel="canonical" href="https://tw.sample-clinic.kr/"></head><body><h1>首爾皮膚科</h1></body></html>`;
const ROBOTS = `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\nSitemap: https://www.sample-clinic.kr/sitemap.xml\n`;
const SITEMAP = `<?xml version="1.0"?><urlset xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>https://www.sample-clinic.kr/</loc><xhtml:link rel="alternate" hreflang="ja" href="https://www.sample-clinic.kr/ja/"/></url><url><loc>https://www.sample-clinic.kr/ja/</loc></url></urlset>`;
const PAGES = { 'https://www.sample-clinic.kr/': HOME, 'https://www.sample-clinic.kr/ja/': JA, 'https://www.sample-clinic.kr/en/': EN, 'https://tw.sample-clinic.kr/': TW, 'https://www.sample-clinic.kr/robots.txt': ROBOTS, 'https://www.sample-clinic.kr/sitemap.xml': SITEMAP };
const mkDeps = (extra = {}) => { const log = []; return { log, fetchPage: async (u, o) => { log.push(u); if (extra.fail && extra.fail.test(u)) throw new m.PrefillErr('fetch_failed'); const h = PAGES[u]; if (h == null) throw new m.PrefillErr('fetch_failed', 404); return { html: h, finalUrl: u }; } }; };

await t('pageFacts reads lang/title/description/h1/canonical/alternates/schema', () => {
  const f = m.pageFacts(HOME, 'https://www.sample-clinic.kr/');
  assert.equal(f.lang, 'ko'); assert.equal(f.title, '예시의원 | 서울 피부과'); assert.ok(f.description.includes('피부과입니다'));
  assert.equal(f.h1, '예시의원'); assert.equal(f.h1Count, 1); assert.equal(f.canonical, 'https://www.sample-clinic.kr/');
  assert.deepEqual(f.alternates.map(a => a.lang), ['ko', 'ja', 'en', 'zh-TW', 'fr']); assert.deepEqual(f.schemaTypes, ['MedicalClinic']);
  assert.equal(m.pageFacts(JA, 'https://x.kr/').h1Count, 2);
  assert.equal(m.pageFacts('<html><body>x</body></html>', 'https://x.kr/').title, '');
});
await t('relative hreflang href resolved; javascript: hrefs dropped', () => {
  const f = m.pageFacts('<html><head><link rel="alternate" hreflang="ja" href="/ja/"><link rel="alternate" hreflang="en" href="javascript:alert(1)"></head></html>', 'https://x.kr/a/');
  assert.deepEqual(f.alternates, [{ lang: 'ja', href: 'https://x.kr/ja/' }]);
});
await t('parseRobots: AI bots blocked, sitemap listed, blockAll false', () => {
  const r = m.parseRobots(ROBOTS); assert.equal(r.blockAll, false); assert.deepEqual(r.blockedBots, ['GPTBot', 'CCBot']); assert.deepEqual(r.sitemaps, ['https://www.sample-clinic.kr/sitemap.xml']);
  assert.equal(m.parseRobots('User-agent: *\nDisallow: /').blockAll, true);
  assert.equal(m.parseRobots('User-agent: *\nDisallow: /\nAllow: /').blockAll, false);
  assert.equal(m.parseRobots('User-agent: *\nDisallow: /admin').blockAll, false);
  assert.deepEqual(m.parseRobots('').blockedBots, []);
});
await t('parseSitemap', () => { assert.deepEqual(m.parseSitemap(SITEMAP), { urls: 2, isIndex: false, hasAlternates: true }); assert.equal(m.parseSitemap('<sitemapindex><sitemap><loc>a</loc></sitemap></sitemapindex>').isIndex, true); });
await t('registrable / sameSite', () => {
  assert.equal(m.registrable('www.example.co.kr'), 'example.co.kr'); assert.equal(m.registrable('jp.example.com'), 'example.com'); assert.equal(m.registrable('example.kr'), 'example.kr');
  assert.ok(m.sameSite('tw.sample-clinic.kr', 'www.sample-clinic.kr')); assert.ok(!m.sameSite('evil.example.org', 'www.sample-clinic.kr')); assert.ok(!m.sameSite('a.co.kr', 'b.co.kr'));
});
await t('textWidth counts CJK as double', () => { assert.equal(m.textWidth('abc'), 3); assert.equal(m.textWidth('한글'), 4); assert.equal(m.textWidth('日本'), 4); });

await t('overseasAudit: reads home + same-site alternates only (max 3), robots, sitemap; never the foreign host', async () => {
  const d = mkDeps(); const a = await m.overseasAudit('https://www.sample-clinic.kr/', d);
  assert.deepEqual(a.pages.map(p => p.lang), ['ko', 'ja', 'en', 'zh-TW']);
  assert.ok(!d.log.some(u => u.includes('evil.example.org')), 'foreign alternate must not be fetched');
  assert.ok(d.log.includes('https://www.sample-clinic.kr/robots.txt') && d.log.includes('https://www.sample-clinic.kr/sitemap.xml'));
  assert.equal(a.site.host, 'www.sample-clinic.kr'); assert.match(a.measuredAt, /^\d{4}-\d\d-\d\d$/);
  assert.ok(a.unmeasured.includes('월 검색량(국가별 검색어)') && a.unmeasured.length >= 4);
});
await t('findings: duplicate JA title flagged; JA has 2 h1; AI bots blocked warns; schema ok; hreflang ok', async () => {
  const a = await m.overseasAudit('https://www.sample-clinic.kr/', mkDeps()); const by = n => a.findings.find(f => f.area.startsWith(n));
  assert.equal(by('언어별 페이지 연결').status, 'ok'); assert.equal(by('언어별 제목 중복').status, 'warn');
  assert.equal(by('대표 제목').status, 'warn'); assert.equal(by('AI 크롤러').status, 'warn'); assert.ok(by('AI 크롤러').found.includes('GPTBot'));
  assert.equal(by('구조화').status, 'ok'); assert.equal(by('검색 로봇').status, 'ok'); assert.equal(by('사이트맵').status, 'ok');
  assert.equal(by('기본 언어').status, 'warn');                    // x-default 없음
  assert.equal(by('설명').status, 'warn');                         // JA 설명이 너무 짧음
  assert.ok(a.findings.every(f => f.area && ['ok', 'warn', 'gap', 'none'].includes(f.status) && f.found && f.todo));
});
await t('no hreflang -> gap; no robots/sitemap -> none (not a crash)', async () => {
  const d = { fetchPage: async (u) => { if (u.endsWith('/')) return { html: '<html lang="ko"><head><title>짧음</title></head><body></body></html>', finalUrl: u }; throw new m.PrefillErr('fetch_failed', 404); } };
  const a = await m.overseasAudit('https://plain.example.kr/', d); const by = n => a.findings.find(f => f.area.startsWith(n));
  assert.equal(by('언어별 페이지 연결').status, 'gap'); assert.equal(by('검색 로봇').status, 'none'); assert.equal(by('사이트맵').status, 'none'); assert.equal(by('제목').status, 'warn'); assert.equal(by('설명').status, 'gap');
  assert.equal(a.robots, null); assert.equal(a.sitemap, null);
});
await t('an alternate page that fails to load is skipped, audit continues', async () => {
  const a = await m.overseasAudit('https://www.sample-clinic.kr/', mkDeps({ fail: /\/ja\/$/ }));
  assert.deepEqual(a.pages.map(p => p.lang), ['ko', 'en', 'zh-TW']); assert.equal(a.skipped, 1);
});
await t('robots blocking everything -> gap', async () => {
  const P = { ...PAGES, 'https://www.sample-clinic.kr/robots.txt': 'User-agent: *\nDisallow: /' };
  const d = { fetchPage: async u => { if (P[u] == null) throw new m.PrefillErr('fetch_failed'); return { html: P[u], finalUrl: u }; } };
  assert.equal((await m.overseasAudit('https://www.sample-clinic.kr/', d)).findings.find(f => f.area.startsWith('검색 로봇')).status, 'gap');
});

// handle(): 입력 검사·한도·오류 코드
const post = b => new Request('http://x', { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } });
const hdeps = (o = {}) => { const calls = { reserve: [] }; return { calls, ipHash: async () => 'h', reserve: async (ip, kind) => { calls.reserve.push(kind); return o.allow !== false; }, fetchPage: mkDeps().fetchPage }; };
await t('handle overseas: returns {audit}; reserve called once with kind "overseas"', async () => {
  const d = hdeps(); const r = await m.handle(post({ url: 'https://www.sample-clinic.kr/', mode: 'overseas' }), d); assert.equal(r.status, 200);
  const j = await r.json(); assert.ok(j.audit && j.audit.findings.length > 5 && !j.data); assert.deepEqual(d.calls.reserve, ['overseas']);
});
await t('handle overseas: rate limited -> 429 before any fetch', async () => { const d = hdeps({ allow: false }); let f = 0; d.fetchPage = async () => { f++; }; const r = await m.handle(post({ url: 'https://www.sample-clinic.kr/', mode: 'overseas' }), d); assert.equal(r.status, 429); assert.equal(f, 0); });
await t('handle overseas: SSRF targets rejected before reserve/fetch', async () => {
  for (const u of ['http://169.254.169.254/latest', 'http://localhost/', 'http://10.0.0.1/', 'file:///etc/passwd', 'https://user:pw@x.kr/']) { const d = hdeps(); const r = await m.handle(post({ url: u, mode: 'overseas' }), d); assert.ok([400, 422].includes(r.status), u); assert.equal(d.calls.reserve.length, 0); }
});
await t('handle overseas: unreachable home -> 502 fetch_failed', async () => { const d = hdeps(); d.fetchPage = async () => { throw new m.PrefillErr('fetch_failed'); }; const r = await m.handle(post({ url: 'https://www.sample-clinic.kr/', mode: 'overseas' }), d); assert.equal(r.status, 502); assert.equal((await r.json()).error, 'fetch_failed'); });
await t('handle: normal prefill still works and uses kind "prefill"', async () => {
  const d = hdeps(); d.fetchPage = async u => ({ html: '<html><head><title>예시의원</title><meta property="og:site_name" content="예시의원"></head></html>', finalUrl: u }); const r = await m.handle(post({ url: 'https://www.sample-clinic.kr/' }), d);
  assert.equal(r.status, 200); assert.ok((await r.json()).data.name); assert.deepEqual(d.calls.reserve, ['prefill']);
});
console.log(pass, 'passed', fail ? fail + ' FAILED' : '');
process.exit(fail ? 1 : 0);
