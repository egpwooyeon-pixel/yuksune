import * as m from '../../supabase/functions/aeo-diagnose/index.ts';
import assert from 'node:assert/strict';
let pass=0; const t=(n,f)=>Promise.resolve().then(f).then(()=>{pass++;console.log('PASS',n)},e=>{console.log('FAIL',n,e.message);process.exitCode=1});

// Gemini 모의 응답 만들기
const gem = (text, titles=[]) => ({ candidates:[{ content:{parts:[{text}]}, groundingMetadata:{ groundingChunks: titles.map(t=>({web:{uri:'https://vertexaisearch.cloud.google.com/x',title:t}})) } }] });
const okRes = j => ({ ok:true, status:200, json:async()=>j, text:async()=>JSON.stringify(j) });
const QS = Array.from({length:10},(_,i)=>`강남에서 조건${i+1} 웨딩홀 추천해줘`);
const PLAN_OK = { summary:'업체를 고를 때 고객이 확인할 기준을 중심으로 정리합니다.',
  topics:[
    {title:'야외 예식 웨딩홀을 고를 때 확인할 기준', purpose:'고객이 스스로 확인할 항목을 안내', question:'야외 예식은 무엇을 먼저 확인하나요?', facts:['야외 공간 유무','우천 시 대체 공간 여부']},
    {title:'예식 상담 전에 준비하면 좋은 정보', purpose:'상담을 빠르게 하기 위한 준비 사항', question:'상담 전에 무엇을 준비하나요?', facts:['희망 날짜','예상 하객 수']},
    {title:'웨딩홀 방문 전 확인할 질문 모음', purpose:'방문 때 물어볼 질문 정리', question:'방문해서 무엇을 물어보나요?', facts:['운영 시간','예약 방법']},
    {title:'예약 절차와 확인할 서류 안내', purpose:'예약 과정 이해', question:'예약은 어떻게 진행되나요?', facts:['예약 방식']}],
  formats:[{name:'질문-답변형',desc:'자주 묻는 질문에 답할 때'},{name:'선택 기준형',desc:'고르는 기준을 알려 줄 때'},{name:'방문 준비형',desc:'방문 전 준비를 알려 줄 때'}],
  cadence:'먼저 핵심 주제부터 발행한 뒤 업체 확인을 거쳐 이어서 발행합니다.', checklist:['업체가 확인한 운영 정보','사진 사용 권한','출처로 쓸 공식 페이지'] };
function mockFetch(log){
  return async (url, init) => {
    const b = JSON.parse(init.body); log.push({url, key:init.headers['x-goog-api-key'], tools:!!b.tools});
    if (b.generationConfig?.responseSchema?.type==='ARRAY' && b.generationConfig.responseSchema.items.type==='STRING') return okRes(gem(JSON.stringify(QS)));
    if (b.generationConfig?.responseSchema?.items?.type==='OBJECT') return okRes(gem(JSON.stringify([{name:'예시홀A',why:'공통 추천'},{name:'지어낸홀',why:'없음'},{name:'샘플 웨딩홀',why:'자기자신'}])));
    const q = b.contents[0].parts[0].text;
    if (q.includes('발행 계획을 제안하세요')) return okRes(gem(JSON.stringify(PLAN_OK)));
    const n = Number(q.match(/조건(\d+)/)[1]);
    // 짝수 질문엔 업체명 등장, 3의 배수엔 자사 도메인 출처
    const text = (n%2===0 ? '샘플 웨딩홀과 예시홀A를 추천합니다.' : '예시홀A를 추천합니다.');
    return okRes(gem(text, n%3===0 ? ['blog.example.com','sample-hall.co.kr'] : ['blog.example.com']));
  };
}

await t('parseInput ok', ()=>{ const i=m.parseInput({name:' 샘플 웨딩홀 ',region:'강남',industry:'웨딩',url:'https://www.Sample-Hall.co.kr/a'}); assert.equal(i.name,'샘플 웨딩홀'); assert.equal(i.host,'sample-hall.co.kr'); });
await t('parseInput errors', ()=>{ assert.equal(m.parseInput({name:'a',region:'x',industry:'y'}).error,'bad_name'); assert.equal(m.parseInput({name:'샘플홀',region:'',industry:'y'}).error,'need_region_industry'); assert.equal(m.parseInput({name:'샘플홀',region:'x',industry:'y',url:'javascript:1'}).error,'bad_url'); assert.equal(m.parseInput({name:'샘플홀',region:'x',industry:'y',url:'ftp://a.b'}).error,'bad_url'); });
await t('mentions normalize spaces/case', ()=>{ assert.ok(m.mentions('저는 샘플웨딩홀을 추천','샘플 웨딩홀')); assert.ok(m.mentions('SAMPLE Hall 좋아요','sample hall')); assert.ok(!m.mentions('다른 곳','샘플 웨딩홀')); assert.ok(!m.mentions('가 나 다','가')); });
await t('isOwn host matching', ()=>{ assert.ok(m.isOwn('sample-hall.co.kr','sample-hall.co.kr')); assert.ok(m.isOwn('www.sample-hall.co.kr','sample-hall.co.kr')); assert.ok(m.isOwn('blog.sample-hall.co.kr','sample-hall.co.kr')); assert.ok(!m.isOwn('blog.example.com','sample-hall.co.kr')); assert.ok(!m.isOwn('x.com','')); });
await t('parseAnswer', ()=>{ const r=m.parseAnswer(gem('안녕',['A.com','a.com','B.com'])); assert.equal(r.text,'안녕'); assert.deepEqual(r.domains,['a.com','b.com']); assert.deepEqual(m.parseAnswer({}),{text:'',domains:[]}); assert.deepEqual(m.parseAnswer(null),{text:'',domains:[]}); });
await t('runPool limits concurrency & keeps order', async ()=>{ let cur=0,max=0; const out=await m.runPool([1,2,3,4,5,6,7],async x=>{cur++;max=Math.max(max,cur);await new Promise(r=>setTimeout(r,5));cur--;return x*2},3); assert.deepEqual(out,[2,4,6,8,10,12,14]); assert.equal(max,3); });

const input = m.parseInput({name:'샘플 웨딩홀',region:'강남',industry:'웨딩홀',url:'https://sample-hall.co.kr'});
await t('diagnose end-to-end (mock Gemini)', async ()=>{
  const log=[]; const r = await m.diagnose(input,{apiKey:'KEY123',model:'gemini-2.5-flash',fetch:mockFetch(log),questions:10});
  assert.equal(log.length,13);                                   // 질문 생성 1 + 답변 10 + 경쟁업체 1 + 발행 제안 1
  assert.ok(r.plan && r.plan.topics.length===4 && r.plan.disclaimer.includes('보장하지 않고') && r.plan.medical===false);
  assert.ok(log.every(l=>l.key==='KEY123' && l.url.includes('gemini-2.5-flash:generateContent')));
  assert.equal(log.filter(l=>l.tools).length,10);                // 검색 연동은 답변 호출에만
  const e=r.engines[0]; assert.equal(e.answers,10); assert.equal(e.mention,5); assert.equal(e.cite,3);   // 짝수 5개, 3의 배수 3개
  assert.equal(r.sources[0].d,'blog.example.com'); assert.equal(r.sources[0].n,10);
  assert.ok(r.sources.find(s=>s.d==='sample-hall.co.kr').own);
  assert.deepEqual(r.rivals.map(x=>x.name),['예시홀A']);        // 지어낸 업체·자기 자신은 제외
  assert.equal(r.questionList.length,10); assert.equal(r.live,true); assert.equal(r.citeAvailable,true);
});
await t('default is simple diagnosis: 5 questions, 8 calls', async ()=>{
  const log=[]; const r = await m.diagnose(input,{apiKey:'K',model:'x',fetch:mockFetch(log)});
  assert.equal(log.length,8); assert.equal(log.filter(l=>l.tools).length,5); assert.equal(r.questionList.length,5);
});
await t('too few answers -> too_few', async ()=>{
  const f = async (url,init)=>{ const b=JSON.parse(init.body); if(b.generationConfig?.responseSchema?.items?.type==='STRING') return okRes(gem(JSON.stringify(QS))); return okRes({candidates:[]}); };
  await assert.rejects(()=>m.diagnose(input,{apiKey:'k',model:'x',fetch:f}),/too_few/);
});
await t('bad key 400 -> auth_failed, no retry storm', async ()=>{
  let n=0; const f=async()=>{n++;return {ok:false,status:400,text:async()=>'{"error":{"message":"API key not valid. Please pass a valid API key."}}'}};
  await assert.rejects(()=>m.diagnose(input,{apiKey:'bad',model:'x',fetch:f}),/auth_failed/); assert.equal(n,1);
});
await t('429 retried then succeeds', async ()=>{
  let n=0; const f=async()=>{n++; return n<2?{ok:false,status:429,text:async()=>''}:okRes(gem('x'))};
  const j=await m.callGemini({},'x','k',f,2); assert.equal(m.parseAnswer(j).text,'x'); assert.equal(n,2);
});

// handle 흐름
const mkDeps=(o={})=>{ const calls={finish:[],reserve:0}; return { calls, d:{
  config:()=>({apiKey:o.noKey?undefined:'KEY123',model:'gemini-2.5-flash'}), fetch:mockFetch([]),
  cached:async()=>o.cached||null, ipHash:async()=>'h', reserve:async()=>{calls.reserve++;return o.rsv||{ok:true,id:7}},
  run:o.run||m.diagnose, finish:async(id,s,r)=>{calls.finish.push([id,s,!!r])},
}}};
const post=b=>new Request('http://x',{method:'POST',body:JSON.stringify(b)});
const body={name:'샘플 웨딩홀',region:'강남',industry:'웨딩홀',url:'https://sample-hall.co.kr'};
await t('handle: success finishes ok', async ()=>{ const {d,calls}=mkDeps(); const r=await m.handle(post(body),d); assert.equal(r.status,200); const j=await r.json(); assert.equal(j.cached,false); assert.equal(j.result.engines[0].answers,5); assert.deepEqual(calls.finish,[[7,'ok',true]]); });
await t('handle: cache hit skips reserve/Gemini', async ()=>{ const {d,calls}=mkDeps({cached:{brand:'c'}}); const r=await m.handle(post(body),d); const j=await r.json(); assert.equal(j.cached,true); assert.equal(calls.reserve,0); });
await t('handle: limit -> 429 and no Gemini call', async ()=>{ let ran=false; const {d}=mkDeps({rsv:{ok:false,reason:'ip_limit'},run:async()=>{ran=true}}); const r=await m.handle(post(body),d); assert.equal(r.status,429); assert.equal((await r.json()).error,'ip_limit'); assert.equal(ran,false); });
await t('handle: no key -> 503, nothing else', async ()=>{ const {d,calls}=mkDeps({noKey:true}); const r=await m.handle(post(body),d); assert.equal(r.status,503); assert.equal(calls.reserve,0); });
await t('handle: failure marks failed, error code', async ()=>{ const {d,calls}=mkDeps({run:async()=>{throw new Error('timeout')}}); const r=await m.handle(post(body),d); assert.equal(r.status,502); assert.equal((await r.json()).error,'timeout'); assert.deepEqual(calls.finish,[[7,'failed',false]]); });
await t('handle: bad input 400 before any DB/API', async ()=>{ const {d,calls}=mkDeps(); const r=await m.handle(post({name:'a'}),d); assert.equal(r.status,400); assert.equal(calls.reserve,0); });
await t('handle: GET 405, OPTIONS ok', async ()=>{ const {d}=mkDeps(); assert.equal((await m.handle(new Request('http://x'),d)).status,405); assert.equal((await m.handle(new Request('http://x',{method:'OPTIONS'}),d)).status,200); });
await t('redact hides key', ()=>{ const FAKE_KEY=['AIza','SyABCDEFGHIJKLMNOPQRSTUVWXYZ123'].join(''); assert.ok(!m.redact('boom '+FAKE_KEY,[FAKE_KEY]).includes('AIza')); });
console.log(pass,'passed');
await t('isOwn no substring false positive', ()=>{ assert.ok(!m.isOwn('notexample.com','example.com')); assert.ok(m.isOwn('m.example.com','example.com')); });
await t('upstream error detail surfaces (404 model) without leaking key', async ()=>{
  const f=async()=>({ok:false,status:404,text:async()=>JSON.stringify({error:{message:'models/foo is not found KEYSECRET1234567890ABCDEFGHIJ'}})});
  const {d}=mkDeps({run:(i,c)=>m.diagnose(i,{...c,apiKey:'KEYSECRET1234567890ABCDEFGHIJ',fetch:f})});
  const r=await m.handle(post(body),d); const j=await r.json();
  assert.equal(r.status,502); assert.equal(j.error,'api_error'); assert.equal(j.upstream,404); assert.ok(j.detail.includes('not found')); assert.ok(!JSON.stringify(j).includes('KEYSECRET'));
});
await t('timeout error carries stage + attempt trace', async ()=>{
  const f=(url,init)=>new Promise((_,rej)=>{ init.signal.addEventListener('abort',()=>{const e=new Error('a');e.name='AbortError';rej(e)}); });
  // 45초를 기다리지 않도록 setTimeout 을 짧게 바꿔 시험
  const orig=globalThis.setTimeout; globalThis.setTimeout=(fn,ms,...a)=>orig(fn,ms===45000?5:Math.min(ms,5),...a);
  try { await assert.rejects(()=>m.callGemini({},'x','k',f,2,'질문 생성'), e=>{ assert.equal(e.message,'timeout'); assert.ok(e.detail.includes('질문 생성')); assert.equal((e.detail.match(/시간초과@/g)||[]).length,3); return true; }); }
  finally { globalThis.setTimeout=orig; }
});
await t('5xx retried then reports trace', async ()=>{
  const orig=globalThis.setTimeout; globalThis.setTimeout=(fn,ms,...a)=>orig(fn,Math.min(ms,5),...a);
  try { const f=async()=>({ok:false,status:503,text:async()=>'{"error":{"message":"overloaded"}}'});
    await assert.rejects(()=>m.callGemini({},'x','k',f,2,'답변'), e=>{ assert.equal(e.status,503); assert.ok(e.detail.includes('overloaded')&&e.detail.includes('503@')); return true; }); }
  finally { globalThis.setTimeout=orig; }
});
const fast=async fn=>{ const o=globalThis.setTimeout; globalThis.setTimeout=(f,ms,...a)=>o(f,Math.min(ms,3),...a); try{return await fn()} finally{globalThis.setTimeout=o} };
await t('parseModels', ()=>{ assert.deepEqual(m.parseModels(' a , b,,'),['a','b']); assert.deepEqual(m.parseModels(''),[]); });
await t('fallback: first model 503 -> second model used for all 12 calls', ()=>fast(async ()=>{
  const urls=[]; const base=mockFetch([]);
  const f=async(url,init)=>{ urls.push(url); if(url.includes('/modelA:')) return {ok:false,status:503,text:async()=>'{"error":{"message":"high demand"}}'}; return base(url,init); };
  const r=await m.diagnose(input,{apiKey:'k',model:'modelA,modelB',fetch:f,questions:10});
  assert.equal(r.engines[0].answers,10);
  assert.ok(urls.some(u=>u.includes('/modelB:')));
  assert.equal(urls.filter(u=>u.includes('/modelA:')).length>=12,true);      // 각 호출이 먼저 A 를 한 번(+재시도 1) 시도
}));
await t('fallback: 404 on first model moves on; auth_failed does not', ()=>fast(async ()=>{
  const base=mockFetch([]);
  const f404=async(url,init)=> url.includes('/modelA:') ? {ok:false,status:404,text:async()=>'{"error":{"message":"gone"}}'} : base(url,init);
  const r=await m.diagnose(input,{apiKey:'k',model:'modelA,modelB',fetch:f404,questions:10}); assert.equal(r.engines[0].answers,10);
  let calls=[]; const f401=async(url)=>{calls.push(url); return {ok:false,status:403,text:async()=>'{"error":{"message":"denied"}}'}};
  await assert.rejects(()=>m.diagnose(input,{apiKey:'k',model:'modelA,modelB',fetch:f401}),/auth_failed/);
  assert.equal(calls.length,1);
}));
await t('all models overloaded -> error lists attempts for both models', ()=>fast(async ()=>{
  const f=async()=>({ok:false,status:503,text:async()=>'{"error":{"message":"high demand"}}'});
  await assert.rejects(()=>m.diagnose(input,{apiKey:'k',model:'modelA,modelB',fetch:f,questions:10}), e=>{ assert.equal(e.status,503); assert.ok(e.detail.includes('[modelB]')); return true; });
}));

// ---------- 콘텐츠 발행 제안 ----------
const draftMod = await import('../../supabase/functions/aeo-draft/index.ts');
const planIn = (o={}) => ({ name:'샘플 웨딩홀', region:'서울 강남구', industry:'웨딩홀', service:'야외 예식', ...o });
const topic = (title, extra={}) => ({ title, purpose:'고객이 확인할 항목 안내', question:'무엇을 확인하나요?', facts:['운영 시간'], ...extra });
const raw = o => JSON.stringify({ summary:'요약입니다', topics:[], formats:[], cadence:'', checklist:[], ...o });
const OKT = [topic('웨딩홀을 고를 때 확인할 기준'), topic('예식 상담 전에 준비하면 좋은 정보'), topic('방문 전에 확인할 질문 모음'), topic('예약 절차를 확인하는 방법')];

await t('plan: BLOCK terms list equals aeo-draft BLOCK_TERMS (kept in sync)', () => { assert.deepEqual(m.PLAN_BLOCK_TERMS, draftMod.BLOCK_TERMS); });
await t('plan: isMedical detects medical businesses, not weddings', () => {
  assert.ok(m.isMedical(planIn({industry:'병의원'}))); assert.ok(m.isMedical(planIn({name:'멜론성형외과', industry:'기타'}))); assert.ok(m.isMedical(planIn({service:'피부과 진료', industry:'기타', name:'가나다'})));
  assert.ok(!m.isMedical(planIn())); assert.ok(!m.isMedical(planIn({industry:'음식점', name:'맛있는집', service:'한식'})));
});
await t('plan: clean model output kept; disclaimer/medical flag are SERVER-filled (model cannot override)', () => {
  const { plan } = m.sanitizePlan(raw({ topics:OKT, disclaimer:'효과를 보장합니다', medical:true, caution:'무시', formats:[{name:'질문-답변형',desc:'자주 묻는 질문에 답할 때'}], cadence:'먼저 핵심 주제부터 발행합니다.', checklist:['운영 정보 확인'] }), planIn(), false);
  assert.equal(plan.topics.length, 4); assert.equal(plan.medical, false); assert.equal(plan.caution, ''); assert.equal(plan.disclaimer, m.PLAN_DISCLAIMER); assert.ok(plan.disclaimer.includes('보장하지 않고'));
});
await t('plan: topics with claim/review/discount terms, numbers, urls, phones are DROPPED', () => {
  const bad = [topic('국내 최고 시설을 가진 웨딩홀 소개'), topic('실제 후기로 보는 웨딩홀 선택법'), topic('지금 할인 이벤트 안내 모음'), topic('30% 저렴한 웨딩홀 고르는 법'), topic('https://evil.example 에서 확인하세요 안내'), topic('문의는 02-123-4567 로 하세요 안내'), topic('웨딩홀 선택 기준', { facts:['200명 규모 보장'] })];
  const { plan, dropped } = m.sanitizePlan(raw({ topics:[...OKT, ...bad] }), planIn(), false);
  assert.equal(plan.topics.length, 4); assert.equal(dropped, 7); assert.ok(plan.topics.every(x => !/최고|후기|할인|%|evil|02-123/.test(x.title)));
});
await t('plan: fewer than 3 safe topics -> whole plan omitted (null)', () => {
  assert.equal(m.sanitizePlan(raw({ topics:[OKT[0], OKT[1], topic('후기로 보는 선택법 모음')] }), planIn(), false).plan, null);
  assert.equal(m.sanitizePlan('not json', planIn(), false).plan, null); assert.equal(m.sanitizePlan('[]', planIn(), false).plan, null);
});
await t('plan: terms the operator typed themselves (e.g. in the business name) are not dropped', () => {
  const { plan } = m.sanitizePlan(raw({ topics:[topic('최고웨딩홀을 고를 때 확인할 기준'), OKT[1], OKT[2]] }), planIn({ name:'최고웨딩홀' }), false);
  assert.equal(plan.topics.length, 3);
});
const MED = planIn({ name:'샘플성형외과', industry:'병의원', service:'눈 성형, 가슴확대, 리프팅' });
await t('plan (medical): topics naming the business own services/procedures are dropped; info topics kept; caution is server-set', () => {
  const t1 = [topic('병원을 고를 때 확인할 기준'), topic('방문 전에 준비할 것 안내'), topic('상담 절차와 확인할 질문 정리'), topic('가슴확대 상담 전에 확인할 점'), topic('눈 성형 병원 선택 기준 안내'), topic('리프팅 종류별 차이 정리')];
  const { plan, dropped } = m.sanitizePlan(raw({ topics:t1 }), MED, true);
  assert.equal(plan.topics.length, 3); assert.equal(dropped, 3); assert.equal(plan.medical, true); assert.equal(plan.caution, m.PLAN_MEDICAL_CAUTION); assert.ok(plan.caution.includes('전문가 확인'));
  assert.ok(plan.topics.every(x => !/가슴확대|눈성형|눈 성형|리프팅/.test(x.title)));
});
await t('plan (medical): if the model only proposes procedure topics -> no plan at all', () => {
  assert.equal(m.sanitizePlan(raw({ topics:[topic('가슴확대 상담 전에 확인할 점'), topic('눈 성형 병원 선택 기준 안내'), topic('리프팅 종류별 차이 정리'), topic('병원을 고를 때 확인할 기준')] }), MED, true).plan, null);
});
await t('plan: same procedure-looking title is fine for a non-medical business (rule is medical-only)', () => {
  const { plan } = m.sanitizePlan(raw({ topics:OKT }), planIn({ service:'웨딩홀 선택 기준' }), false); assert.ok(plan && plan.topics.length >= 3);
});
await t('plan prompt: medical rules only for medical; never asks for article text; no urls in prompt', () => {
  const med = m.buildPlanPrompt(MED, ['질문 하나'], true), gen = m.buildPlanPrompt(planIn(), ['질문 하나'], false);
  assert.ok(med.includes('병원·의료 업종') && med.includes('시술명') && med.includes('정보형으로만')); assert.ok(!gen.includes('병원·의료 업종'));
  assert.ok(med.includes('글 본문을 쓰지 마세요') && med.includes('지어내지 마세요'));
});
await t('diagnose: plan failure (model error) does NOT fail the diagnosis -> plan null, rest intact', async () => {
  const base = mockFetch([]);
  const f = async (url, init) => { const b = JSON.parse(init.body); if (b.contents[0].parts[0].text.includes('발행 계획을 제안하세요')) return { ok:false, status:400, text: async () => '{"error":{"message":"bad request"}}' }; return base(url, init); };
  const r = await m.diagnose(m.parseInput({ name:'샘플 웨딩홀', region:'강남', industry:'웨딩홀', url:'https://sample-hall.co.kr' }), { apiKey:'k', model:'x', fetch:f, questions:10 });
  assert.equal(r.plan, null); assert.equal(r.engines[0].answers, 10);
});
await t('diagnose (medical input): plan is filtered end to end, no procedure names in titles', async () => {
  const base = mockFetch([]); const PLAN_MED = { ...PLAN_OK, topics:[{ ...PLAN_OK.topics[0], title:'병원을 고를 때 확인할 기준' }, { ...PLAN_OK.topics[1], title:'방문 전에 준비할 것 안내' }, { ...PLAN_OK.topics[2], title:'상담 절차와 확인할 질문 정리' }, { ...PLAN_OK.topics[3], title:'가슴확대 상담 전에 확인할 점' }] };
  const f = async (url, init) => { const b = JSON.parse(init.body); if (b.contents[0].parts[0].text.includes('발행 계획을 제안하세요')) return okRes(gem(JSON.stringify(PLAN_MED))); return base(url, init); };
  const r = await m.diagnose(m.parseInput({ name:'샘플성형외과', region:'서울', industry:'병의원', service:'가슴확대, 리프팅' }), { apiKey:'k', model:'x', fetch:f });
  assert.equal(r.plan.topics.length, 3); assert.equal(r.plan.medical, true); assert.ok(r.plan.topics.every(x => !x.title.includes('가슴확대')));
});

