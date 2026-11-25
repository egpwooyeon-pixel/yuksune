const ROOT_DIR = require('path').resolve(__dirname, '../..');
const ROOT = require('url').pathToFileURL(ROOT_DIR).href + '/';
const OUTDIR = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright'); const fs=require('fs');
const S = OUTDIR;   // 스크린샷 저장 폴더
async function fixtures() {      // 진단 함수를 모의 Gemini 로 돌려 결과 화면용 데이터를 만듦
  const m = await import(require('url').pathToFileURL(require('path').join(ROOT_DIR, 'supabase/functions/aeo-diagnose/index.ts')).href);
  const gem = (text, titles = []) => ({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: { groundingChunks: titles.map(t => ({ web: { title: t } })) } }] });
  const ok = j => ({ ok: true, status: 200, json: async () => j, text: async () => '' });
  const QS = Array.from({ length: 10 }, (_, i) => `강남에서 조건${i + 1} 웨딩홀 추천해줘`);
  const f = async (u, init) => {
    const b = JSON.parse(init.body);
    if (b.generationConfig?.responseSchema?.items?.type === 'STRING') return ok(gem(JSON.stringify(QS)));
    if (b.generationConfig?.responseSchema?.items?.type === 'OBJECT') return ok(gem(JSON.stringify([{ name: '예시홀A', why: '여러 질문에서 공통 추천' }])));
    if (b.contents[0].parts[0].text.includes('발행 계획을 제안하세요')) return ok(gem(JSON.stringify({ summary: '고객이 확인할 기준 중심으로 정리합니다.', topics: [
      { title: '야외 예식 웨딩홀을 고를 때 확인할 기준', purpose: '고객이 확인할 항목 안내', question: '야외 예식은 무엇을 먼저 확인하나요?', facts: ['야외 공간 유무'] },
      { title: '예식 상담 전에 준비하면 좋은 정보', purpose: '상담 준비 사항', question: '상담 전에 무엇을 준비하나요?', facts: ['희망 날짜'] },
      { title: '웨딩홀 방문 전에 확인할 질문 모음', purpose: '방문 질문 정리', question: '방문해서 무엇을 묻나요?', facts: ['운영 시간'] }],
      formats: [{ name: '질문-답변형', desc: '자주 묻는 질문에 답할 때' }], cadence: '먼저 핵심 주제부터 발행합니다.', checklist: ['운영 정보 확인'] })));
    const n = Number(b.contents[0].parts[0].text.match(/조건(\d+)/)[1]);
    return ok(gem(n % 2 === 0 ? '샘플 웨딩홀과 예시홀A를 추천합니다.' : '예시홀A를 추천합니다.', n % 3 === 0 ? ['blog.example.com', 'sample-hall.co.kr'] : ['blog.example.com']));
  };
  const R1 = await m.diagnose(m.parseInput({ name: '샘플 웨딩홀', region: '강남', industry: '웨딩홀', url: 'https://sample-hall.co.kr' }), { apiKey: 'k', model: 'x', fetch: f });
  const R2 = await m.diagnose(m.parseInput({ name: '샘플 웨딩홀', region: '강남', industry: '웨딩홀' }), { apiKey: 'k', model: 'x', fetch: f });
  return { R1, R2 };
}
(async () => {
  const { R1, R2 } = await fixtures();
  const b = await chromium.launch(); const ok=(n,c)=>console.log(c?'PASS':'FAIL',n);
  // --- 샘플 모드 (기본 설정) ---
  let p = await b.newPage({viewport:{width:1280,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/supabase-js*', r=>r.abort());
  await p.goto(ROOT + 'diagnose.html');
  await p.fill('#f-name','라움아트센터'); await p.click('#go'); await p.waitForTimeout(300);
  ok('sample banner', (await p.textContent('.banner')).includes('예시 리포트'));
  ok('sample: no questionList section', !(await p.textContent('#out')).includes('질문별 결과'));
  ok('sample: keywords shown', (await p.textContent('#out')).includes('키워드 · 검색 수요'));
  ok('sample: region/industry optional label', (await p.textContent('#l-region')).includes('선택'));

  // --- 실제 측정 모드 (모의 서버) ---
  async function live(mode){
    const pg = await b.newPage({viewport:{width:390,height:800}}); pg.on('pageerror',e=>errs.push(e.message));
    await pg.route('**/supabase-js*', r=>r.abort());
    await pg.route('**/landing-config.js', r=>r.fulfill({contentType:'application/javascript',body:'window.LANDING={DIAGNOSE_LIVE:true};'}));
    await pg.addInitScript(({mode,R1,R2})=>{
      window.__calls=[];
      window.supabase={createClient:()=>({functions:{invoke:async(fn,{body})=>{
        window.__calls.push({fn,body});
        await new Promise(r=>setTimeout(r,400));
        if(mode==='limit') return {data:null,error:{context:{json:async()=>({error:'ip_limit'})}}};
        if(mode==='fail') return {data:null,error:{context:{json:async()=>({error:'api_error'})}}};
        const base = body.url ? R1 : R2;
        const result = mode==='noplan' ? {...base, plan:null}
          : mode==='xss' ? {...base, plan:{...base.plan, summary:'<img src=x onerror=window.__ps=1>요약', topics:[{title:'<img src=x onerror=window.__p=1>제목입니다 길게', purpose:'<b>목적</b>', question:'q', facts:['<script>window.__q=1</script>']}]}}
          : mode==='medical' ? {...base, plan:{...base.plan, medical:true, caution:'병원·의료 업종 주의 문구입니다'}}
          : base;
        return {data:{result,cached:mode==='cached'},error:null};
      }}})};
    },{mode,R1,R2});
    await pg.goto(ROOT + 'diagnose.html'); return pg;
  }
  p = await live('ok');
  ok('live: region/industry marked required', (await p.textContent('#l-region')).includes('필수'));
  await p.fill('#f-name','샘플 웨딩홀'); await p.click('#go');
  ok('live: region/industry errors', (await p.textContent('#e-region')).includes('지역') && (await p.textContent('#e-ind')).includes('업종'));
  ok('live: no call yet', (await p.evaluate(()=>window.__calls.length))===0);
  await p.fill('#f-region','강남'); await p.selectOption('#f-ind','웨딩홀'); await p.fill('#f-url','https://sample-hall.co.kr');
  await p.click('#go'); await p.click('#go',{force:true}).catch(()=>{});
  ok('live: button disabled + progress', (await p.isDisabled('#go')) && (await p.textContent('#progress')).includes('질문하는 중'));
  await p.waitForSelector('.rep-top',{timeout:5000}); await p.waitForTimeout(200);
  ok('live: exactly one call (double-click guarded)', (await p.evaluate(()=>window.__calls.length))===1);
  ok('live: body sent', JSON.stringify(await p.evaluate(()=>window.__calls[0].body))===JSON.stringify({name:'샘플 웨딩홀',region:'강남',industry:'웨딩홀',url:'https://sample-hall.co.kr',service:''}));
  const txt=await p.textContent('#out');
  ok('live: banner Gemini', txt.includes('Gemini(구글 검색 연동) 1개 엔진 기준'));
  ok('live: stats 50% / 30%', txt.includes('50%') && txt.includes('30%') && txt.includes('5/10') && txt.includes('3/10'));
  ok('live: question list + rival + own chip', txt.includes('질문별 결과') && txt.includes('예시홀A') && txt.includes('sample-hall.co.kr 3회 · 자사'));
  ok('live: no keywords section', !txt.includes('키워드 · 검색 수요'));
  ok('live: plan section rendered (AI 제안 chip, disclaimer, 3 topics, formats, cadence, checklist)', txt.includes('콘텐츠 발행 제안') && txt.includes('AI 제안') && txt.includes('보장하지 않고') && txt.includes('야외 예식 웨딩홀을 고를 때 확인할 기준') && (await p.$$('.plan-topics li')).length===3 && txt.includes('질문-답변형') && txt.includes('발행 전에 준비할 자료'));
  ok('live: plan CTA links to contact with prefilled company/topic', await p.evaluate(()=>{const a=document.querySelector('.plan a.btn'); if(!a) return false; const u=new URL(a.getAttribute('href'),'http://x/'); return u.pathname.endsWith('landing.html') && u.searchParams.get('company')==='샘플 웨딩홀' && u.searchParams.get('topic')==='웨딩홀' && u.hash==='#contact';}));
  ok('live: button re-enabled, progress cleared', !(await p.isDisabled('#go')) && (await p.textContent('#progress'))==='');
  ok('live: mobile no xscroll', !(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
  await p.screenshot({path:S+'/live-m.png',fullPage:true});

  p = await live('ok'); await p.fill('#f-name','샘플 웨딩홀'); await p.fill('#f-region','강남'); await p.selectOption('#f-ind','웨딩홀'); await p.click('#go'); await p.waitForSelector('.rep-top');
  const t2=await p.textContent('#out');
  ok('live no-url: cite shown as "-" with hint', t2.includes('홈페이지 주소를 입력하면 계산돼요'));
  // 발행 제안: 없을 때 / 악성 문자열 / 의료 주의 문구 / 샘플 모드
  const fillGo = async pg => { await pg.fill('#f-name','샘플 웨딩홀'); await pg.fill('#f-region','강남'); await pg.selectOption('#f-ind','웨딩홀'); await pg.click('#go'); await pg.waitForSelector('.rep-top'); };
  p = await live('noplan'); await fillGo(p); ok('plan null -> no plan section (rest of report intact)', (await p.$$('.plan')).length===0 && (await p.textContent('#out')).includes('AI 검색 실측'));
  p = await live('xss'); await fillGo(p); await p.waitForTimeout(200);
  ok('plan XSS: nothing executed, no injected nodes, shown as text', !(await p.evaluate(()=>window.__p||window.__ps||window.__q)) && (await p.$$('.plan img')).length===0 && (await p.$$('.plan script')).length===0 && (await p.textContent('.plan')).includes('<img src=x onerror=window.__p=1>'));
  p = await live('medical'); await fillGo(p); ok('medical plan shows the caution banner', (await p.textContent('.plan')).includes('병원·의료 업종 주의 문구입니다'));
  p = await live('ok'); await fillGo(p); ok('non-medical plan shows no caution banner', (await p.$$('.plan .banner')).length===0);
  { const sp = await b.newPage({viewport:{width:390,height:800}}); sp.on('pageerror',e=>errs.push(e.message)); await sp.route('**/supabase-js*', r=>r.abort());
    await sp.goto(ROOT + 'diagnose.html'); await sp.fill('#f-name','샘플'); await sp.click('#go'); await sp.waitForTimeout(300);
    const st = await sp.textContent('#out');
    ok('sample mode also shows a sample plan (same disclaimer, 3 topics)', st.includes('콘텐츠 발행 제안') && st.includes('보장하지 않고') && (await sp.$$('.plan-topics li')).length===3);
    ok('sample plan: mobile no xscroll', !(await sp.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
    await sp.screenshot({path:S+'/plan-sample-m.png',fullPage:true}); }
  p = await live('cached'); await p.fill('#f-name','샘플 웨딩홀'); await p.fill('#f-region','강남'); await p.selectOption('#f-ind','웨딩홀'); await p.click('#go'); await p.waitForSelector('.rep-top');
  ok('live cached notice', (await p.textContent('.banner')).includes('24시간 이내'));
  p = await live('limit'); await p.fill('#f-name','샘플 웨딩홀'); await p.fill('#f-region','강남'); await p.selectOption('#f-ind','웨딩홀'); await p.click('#go'); await p.waitForSelector('[role=alert].banner');
  ok('live ip_limit message', (await p.textContent('.banner')).includes('모두 사용했어요'));
  p = await live('fail'); await p.fill('#f-name','샘플 웨딩홀'); await p.fill('#f-region','강남'); await p.selectOption('#f-ind','웨딩홀'); await p.click('#go'); await p.waitForSelector('[role=alert].banner');
  ok('live generic failure message', (await p.textContent('.banner')).includes('측정에 실패'));
  console.log('page errors:',errs); await b.close();
})();
