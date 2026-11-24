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
        return {data:{result:body.url?R1:R2,cached:mode==='cached'},error:null};
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
  ok('live: button re-enabled, progress cleared', !(await p.isDisabled('#go')) && (await p.textContent('#progress'))==='');
  ok('live: mobile no xscroll', !(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
  await p.screenshot({path:S+'/live-m.png',fullPage:true});

  p = await live('ok'); await p.fill('#f-name','샘플 웨딩홀'); await p.fill('#f-region','강남'); await p.selectOption('#f-ind','웨딩홀'); await p.click('#go'); await p.waitForSelector('.rep-top');
  const t2=await p.textContent('#out');
  ok('live no-url: cite shown as "-" with hint', t2.includes('홈페이지 주소를 입력하면 계산돼요'));
  p = await live('cached'); await p.fill('#f-name','샘플 웨딩홀'); await p.fill('#f-region','강남'); await p.selectOption('#f-ind','웨딩홀'); await p.click('#go'); await p.waitForSelector('.rep-top');
  ok('live cached notice', (await p.textContent('.banner')).includes('24시간 이내'));
  p = await live('limit'); await p.fill('#f-name','샘플 웨딩홀'); await p.fill('#f-region','강남'); await p.selectOption('#f-ind','웨딩홀'); await p.click('#go'); await p.waitForSelector('[role=alert].banner');
  ok('live ip_limit message', (await p.textContent('.banner')).includes('모두 사용했어요'));
  p = await live('fail'); await p.fill('#f-name','샘플 웨딩홀'); await p.fill('#f-region','강남'); await p.selectOption('#f-ind','웨딩홀'); await p.click('#go'); await p.waitForSelector('[role=alert].banner');
  ok('live generic failure message', (await p.textContent('.banner')).includes('측정에 실패'));
  console.log('page errors:',errs); await b.close();
})();
