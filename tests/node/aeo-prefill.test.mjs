import * as m from '../../supabase/functions/aeo-prefill/index.ts'; import assert from 'node:assert/strict';
let fails=0; const t=(n,f)=>Promise.resolve().then(f).then(()=>console.log('PASS',n),e=>{fails++;console.log('FAIL',n,e.message)});
const blocked=async(u,code='blocked_url')=>{ try{ m.checkUrl(u); }catch(e){ assert.equal(e.message,code,u); return;} assert.fail('not blocked: '+u); };

await t('SSRF: URLs that must be rejected', async()=>{
  for (const u of ['http://localhost/','http://127.0.0.1/','http://169.254.169.254/latest/meta-data/','http://10.0.0.5/','http://192.168.1.1/','http://[::1]/','http://0x7f.0.0.1/','http://2130706433/','http://intranet/','http://foo.internal/','http://db.local/','https://user:pw@example.com/','https://example.com:8080/','http://100.64.0.1/','http://example.com./x'.replace('example.com.','127.1')])
    await blocked(u);
  await blocked('ftp://example.com/','bad_url'); await blocked('javascript:alert(1)','bad_url'); await blocked('not a url','bad_url'); await blocked('','bad_url');
});
await t('SSRF: normal public URLs pass', ()=>{ for (const u of ['https://melonps.com/','http://www.example.co.kr/a?b=1','https://한글도메인.kr/']) m.checkUrl(u); });
await t('isPrivateIp', ()=>{ for (const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','172.31.255.255','192.168.0.1','169.254.1.1','100.64.0.1','0.0.0.0','::1','fe80::1','fd00::1','::ffff:10.0.0.1','999.1.1.1']) assert.ok(m.isPrivateIp(ip),ip);
  for (const ip of ['8.8.8.8','172.32.0.1','1.1.1.1','2606:4700::1111']) assert.ok(!m.isPrivateIp(ip),ip); });
await t('naver hosts flagged', ()=>{ for (const h of ['naver.com','map.naver.com','m.place.naver.com','naver.me']) assert.ok(m.isNaverHost(h)); assert.ok(!m.isNaverHost('notnaver.com')); assert.ok(!m.isNaverHost('naver.com.evil.kr')); });

// --- 정보 추출 ---
const HTML_LD=`<html><head><title>멜론성형외과 | 강남 성형외과 공식 홈페이지</title>
<meta name="description" content="강남역 인근 성형외과입니다. 눈·코 성형, 리프팅을 상담합니다.">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},{"@type":["MedicalBusiness","Hospital"],"name":"멜론성형외과","address":{"@type":"PostalAddress","addressRegion":"서울특별시","addressLocality":"강남구","streetAddress":"테헤란로 115"},"description":"눈·코 성형 및 리프팅 전문 병원"}]}</script></head><body><h1>환영</h1></body></html>`;
await t('extract: JSON-LD hospital', ()=>{ const r=m.extractInfo(HTML_LD); assert.equal(r.name,'멜론성형외과'); assert.equal(r.address,'서울특별시 강남구 테헤란로 115'.replace('서울특별시 강남구','서울특별시 강남구')); assert.equal(r.region,'서울 강남구'); assert.equal(r.industry,'병의원'); assert.ok(r.service.includes('성형')); });
const HTML_META=`<html><head><meta charset="utf-8"><title>홈 - 라움웨딩홀 - 서울 웨딩홀</title><meta property="og:site_name" content="라움웨딩홀"><meta property="og:description" content="야외 예식이 가능한 웨딩홀입니다. 100명 규모 상담."></head>
<body><footer>주소 : 서울 강남구 봉은사로25길 23 정선빌딩 2층 / 대표 : 홍길동</footer><script>var a="서울 종로구 세종대로 1";</script></body></html>`;
await t('extract: og + footer address (script text ignored)', ()=>{ const r=m.extractInfo(HTML_META); assert.equal(r.name,'라움웨딩홀'); assert.equal(r.address,'서울 강남구 봉은사로25길 23'); assert.equal(r.region,'서울 강남구'); assert.equal(r.industry,'웨딩홀'); assert.equal(r.service,'야외 예식이 가능한 웨딩홀입니다.'); });
await t('extract: title-only, generic first segment skipped', ()=>{ const r=m.extractInfo('<title>홈 | 맛있는집 레스토랑</title>'); assert.equal(r.name,'맛있는집 레스토랑'); assert.equal(r.industry,'음식점'); assert.equal(r.address,''); });
await t('extract: nothing', ()=>{ const r=m.extractInfo('<html><body>hi</body></html>'); assert.equal(r.name,''); assert.equal(r.address,''); });
await t('extract: entities + malformed JSON-LD survive', ()=>{ const r=m.extractInfo('<script type="application/ld+json">{bad json</script><meta property="og:site_name" content="A&amp;B 클리닉">'); assert.equal(r.name,'A&B 클리닉'); assert.equal(r.industry,'병의원'); });
await t('regionOf', ()=>{ assert.equal(m.regionOf('경기도 수원시 영통구 광교로 1'),'경기 수원시 영통구'); assert.equal(m.regionOf('부산광역시 해운대구 해운대로 1'),'부산 해운대구'); assert.equal(m.regionOf(''),''); });

// --- fetchPage: 리다이렉트·크기·형식 ---
const resp=(body,init={})=>new Response(body,{status:200,headers:{'content-type':'text/html; charset=utf-8'},...init});
await t('fetchPage: ok', async()=>{ const f=async(u,i)=>{ assert.equal(i.redirect,'manual'); return resp(HTML_LD); }; const r=await m.fetchPage('https://melonps.com/',{fetchImpl:f}); assert.ok(r.html.includes('멜론성형외과')); });
await t('fetchPage: redirect to metadata IP is blocked (and never fetched)', async()=>{ const seen=[]; const f=async u=>{ seen.push(u); return new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest/meta-data/'}}); };
  await assert.rejects(()=>m.fetchPage('https://evil.example.org/',{fetchImpl:f}),e=>e.message==='blocked_url'); assert.deepEqual(seen,['https://evil.example.org/']); });
await t('fetchPage: redirect to naver blocked; relative redirect followed', async()=>{ let n=0; const f=async u=>{ n++; return n===1?new Response(null,{status:301,headers:{location:'/ko/'}}):resp(HTML_META); };
  const r=await m.fetchPage('https://a-site.kr/',{fetchImpl:f}); assert.ok(r.finalUrl.endsWith('/ko/'));
  const g=async()=>new Response(null,{status:302,headers:{location:'https://m.place.naver.com/x'}}); await assert.rejects(()=>m.fetchPage('https://a-site.kr/',{fetchImpl:g}),e=>e.message==='unsupported_naver'); });
await t('fetchPage: redirect loop capped', async()=>{ const f=async()=>new Response(null,{status:302,headers:{location:'https://a-site.kr/'}}); await assert.rejects(()=>m.fetchPage('https://a-site.kr/',{fetchImpl:f}),e=>e.message==='fetch_failed'); });
await t('fetchPage: non-html, too large, http error', async()=>{
  await assert.rejects(()=>m.fetchPage('https://a-site.kr/',{fetchImpl:async()=>resp('x',{headers:{'content-type':'application/pdf'}})}),e=>e.message==='not_html');
  await assert.rejects(()=>m.fetchPage('https://a-site.kr/',{fetchImpl:async()=>resp('a'.repeat(700*1024))}),e=>e.message==='too_large');
  await assert.rejects(()=>m.fetchPage('https://a-site.kr/',{fetchImpl:async()=>resp('no',{status:404})}),e=>e.message==='fetch_failed'&&e.status===404); });
await t('fetchPage: DNS resolving to private IP is blocked', async()=>{ let fetched=false; const resolve=async(h,t)=>t==='A'?['10.0.0.8']:[];
  await assert.rejects(()=>m.fetchPage('https://sneaky.example.org/',{fetchImpl:async()=>{fetched=true;return resp('x')},resolve}),e=>e.message==='blocked_url'); assert.equal(fetched,false);
  await m.fetchPage('https://fine.example.org/',{fetchImpl:async()=>resp(HTML_LD),resolve:async(h,t)=>t==='A'?['8.8.8.8']:[]}); });

// --- handle ---
const post=b=>new Request('http://x',{method:'POST',body:JSON.stringify(b)});
const deps=(o={})=>({calls:{reserve:0},ipHash:async()=>'h',reserve:async function(){deps.n=(deps.n||0)+1; return o.limit?false:true},fetchPage:o.fetchPage||(async()=>({html:HTML_LD}))});
await t('handle: success returns only parsed fields', async()=>{ const r=await m.handle(post({url:'https://melonps.com/'}),deps()); const j=await r.json(); assert.equal(r.status,200); assert.deepEqual(Object.keys(j.data).sort(),['address','industry','name','region','service']); assert.ok(!JSON.stringify(j).includes('<script')); });
await t('handle: bad/blocked/naver rejected BEFORE rate limit or fetch', async()=>{ deps.n=0; let fetched=false; const d=deps({fetchPage:async()=>{fetched=true;return {html:''}}});
  assert.equal((await m.handle(post({url:'http://169.254.169.254/'}),d)).status,400);
  assert.equal((await m.handle(post({url:'nope'}),d)).status,400);
  const n=await m.handle(post({url:'https://map.naver.com/p/entry/place/1'}),d); assert.equal(n.status,422); assert.equal((await n.json()).error,'unsupported_naver');
  assert.equal(fetched,false); assert.equal(deps.n,0); });
await t('handle: rate limited -> 429, no fetch', async()=>{ let fetched=false; const r=await m.handle(post({url:'https://melonps.com/'}),deps({limit:true,fetchPage:async()=>{fetched=true}})); assert.equal(r.status,429); assert.equal(fetched,false); });
await t('handle: nothing found -> 422; fetch failure -> 502', async()=>{ const a=await m.handle(post({url:'https://melonps.com/'}),deps({fetchPage:async()=>({html:'<p>x</p>'})})); assert.equal(a.status,422); assert.equal((await a.json()).error,'nothing_found');
  const b=await m.handle(post({url:'https://melonps.com/'}),deps({fetchPage:async()=>{throw new m.PrefillErr('fetch_failed',500)}})); assert.equal(b.status,502); });
await t('handle: GET 405, OPTIONS ok', async()=>{ assert.equal((await m.handle(new Request('http://x'),deps())).status,405); assert.equal((await m.handle(new Request('http://x',{method:'OPTIONS'}),deps())).status,200); });
process.exitCode=fails?1:0; console.log(fails?fails+' FAILED':'all passed');
await t('pickService: keyword list -> first 4 clean items (real melonps meta)', ()=>{ assert.equal(m.pickService('여의사, 가슴 큐레이팅, 가슴확대, 모티바, 멘토, 세빈, 가슴교정, 가슴축소, 재수술, 마취과 전문의 상주, 강남역 12번 출구'),'여의사, 가슴 큐레이팅, 가슴확대, 모티바'); });
await t('pickService: sentence / long sentence / short / empty', ()=>{ assert.equal(m.pickService('야외 예식이 가능한 웨딩홀입니다. 100명 규모 상담.'),'야외 예식이 가능한 웨딩홀입니다.');
  const long='가'.repeat(5)+' '+'나다라마바사아자차카타파하'.repeat(8); const r=m.pickService(long); assert.ok(r.length<=70 && !r.endsWith(' ')); assert.equal(m.pickService('짧음'),''); assert.equal(m.pickService(''),''); });
