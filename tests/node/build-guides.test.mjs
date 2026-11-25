import * as g from '../../tools/build-guides.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import os from 'node:os';
let fails=0; const t=(n,f)=>Promise.resolve().then(f).then(()=>console.log('PASS',n),e=>{fails++;console.log('FAIL',n,e.message)});
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'egp-guide-'));
const base=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../content/guides/sample-outdoor-wedding.json', import.meta.url)),'utf8'));
const setup=(site,arts)=>{ const s=tmp(), o=tmp(); fs.writeFileSync(path.join(s,'_site.json'),JSON.stringify({siteName:'테스트',adDisclosure:'광고입니다',...site})); arts.forEach((a,i)=>fs.writeFileSync(path.join(s,`a${i}.json`),JSON.stringify(a))); return {s,o}; };
const evil='<img src=x onerror=alert(1)></script><script>alert(2)</script>', short='<img src=x onerror=alert(1)>';

await t('escaping: malicious strings never become tags', ()=>{ const a={...base,slug:'evil-one',sample:false,title:'제목 '+evil,description:'설명 '+evil+' 열자이상',category:short,business:{...base.business,name:short,address:evil,summary:evil},questions:[evil],sections:[{heading:'소제목 '+evil,paragraphs:[evil]}],faq:[{q:'질문 '+evil,a:evil}],sources:[{label:evil,url:'https://ok.example/',note:evil}]};
  const {s,o}=setup({},[a]); g.build(s,o); const h=fs.readFileSync(path.join(o,'evil-one.html'),'utf8');
  assert.ok(!/<img src=x/i.test(h)); assert.ok(!/<script>alert/i.test(h)); assert.equal((h.match(/<script/gi)||[]).length,2);  // JSON-LD 2개(Article, FAQ)만
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);   // JSON-LD 가 유효한 JSON
  assert.ok(h.includes('&lt;img src=x')); });
await t('links: javascript:/data: urls rejected by validation', ()=>{ for (const u of ['javascript:alert(1)','data:text/html,x','ftp://x.y']) { const a={...base,slug:'bad-url',business:{...base.business,url:u}}; const {s,o}=setup({},[a]); assert.throws(()=>g.build(s,o),/business\.url/); assert.equal(fs.readdirSync(o).length,0); } });
await t('validation failure writes NOTHING (even for the valid article)', ()=>{ const ok={...base,slug:'ok-article'}, bad={...base,slug:'Bad Slug!',title:'x'}; const {s,o}=setup({},[ok,bad]); assert.throws(()=>g.build(s,o),/검증 실패/); assert.equal(fs.readdirSync(o).length,0); });
await t('validation: duplicate slug, missing sections, bad date, malformed JSON', ()=>{ let {s,o}=setup({},[{...base,slug:'dup-slug'},{...base,slug:'dup-slug'}]); assert.throws(()=>g.build(s,o),/slug 중복/);
  ({s,o}=setup({},[{...base,slug:'no-sec',sections:[]}])); assert.throws(()=>g.build(s,o),/sections/);
  ({s,o}=setup({},[{...base,slug:'bad-date',publishedAt:'2026/11/24'}])); assert.throws(()=>g.build(s,o),/publishedAt/);
  ({s,o}=setup({},[])); fs.writeFileSync(path.join(s,'x.json'),'{oops'); assert.throws(()=>g.build(s,o),/JSON 형식 오류/); });
await t('default: noindex everywhere, no sitemap, sample chip shown', ()=>{ const {s,o}=setup({},[base]); g.build(s,o); for (const f of ['index.html','sample-outdoor-wedding.html']) assert.ok(fs.readFileSync(path.join(o,f),'utf8').includes('content="noindex,nofollow"'),f); assert.ok(!fs.existsSync(path.join(o,'sitemap.xml'))); assert.ok(fs.readFileSync(path.join(o,'sample-outdoor-wedding.html'),'utf8').includes('예시 글 · 가상 업체')); });
await t('indexable+baseUrl: real article indexable with canonical + sitemap; sample stays noindex and out of sitemap', ()=>{ const real={...base,slug:'real-article',sample:false}; const {s,o}=setup({indexable:true,baseUrl:'https://guide.example.com/'},[base,real]); g.build(s,o);
  const r=fs.readFileSync(path.join(o,'real-article.html'),'utf8'); assert.ok(r.includes('content="index,follow"')&&r.includes('rel="canonical" href="https://guide.example.com/real-article.html"'));
  assert.ok(fs.readFileSync(path.join(o,'sample-outdoor-wedding.html'),'utf8').includes('noindex'));
  const sm=fs.readFileSync(path.join(o,'sitemap.xml'),'utf8'); assert.ok(sm.includes('real-article.html')&&!sm.includes('sample-outdoor-wedding')); });
await t('indexable without baseUrl stays noindex (safety)', ()=>{ const {s,o}=setup({indexable:true,baseUrl:''},[{...base,slug:'real-b',sample:false}]); g.build(s,o); assert.ok(fs.readFileSync(path.join(o,'real-b.html'),'utf8').includes('noindex')); });
await t('sitemap removed when site is turned back to non-indexable', ()=>{ const {s,o}=setup({indexable:true,baseUrl:'https://g.example.com'},[{...base,slug:'real-c',sample:false}]); g.build(s,o); assert.ok(fs.existsSync(path.join(o,'sitemap.xml'))); fs.writeFileSync(path.join(s,'_site.json'),JSON.stringify({siteName:'t',indexable:false})); g.build(s,o); assert.ok(!fs.existsSync(path.join(o,'sitemap.xml'))); });
await t('external links carry rel sponsored/nofollow noopener', ()=>{ const {s,o}=setup({},[base]); g.build(s,o); const h=fs.readFileSync(path.join(o,'sample-outdoor-wedding.html'),'utf8'); assert.ok(/rel="sponsored nofollow noopener"/.test(h)); assert.ok(/rel="nofollow noopener"/.test(h)); });
await t('ad label + disclosure present; index sorted newest first', ()=>{ const a={...base,slug:'older-one',publishedAt:'2026-01-01'},b={...base,slug:'newer-one',publishedAt:'2026-06-01'}; const {s,o}=setup({},[a,b]); g.build(s,o); const h=fs.readFileSync(path.join(o,'index.html'),'utf8'); assert.ok(h.indexOf('newer-one')<h.indexOf('older-one')); assert.ok(h.includes('광고입니다')); assert.ok(fs.readFileSync(path.join(o,'newer-one.html'),'utf8').includes('class="gchip ad"')); });
process.exitCode=fails?1:0; console.log(fails?fails+' FAILED':'all passed');
