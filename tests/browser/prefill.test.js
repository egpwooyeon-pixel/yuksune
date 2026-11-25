const ROOT_DIR = require('path').resolve(__dirname, '../..');
const ROOT = require('url').pathToFileURL(ROOT_DIR).href + '/';
const OUTDIR = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright'); const ok=(n,c)=>console.log(c?'PASS':'FAIL',n);
(async()=>{ const b=await chromium.launch(); const errs=[];
 async function open(flag, mode, w=1280){
  const p=await b.newPage({viewport:{width:w,height:900}}); p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/supabase-js*',r=>r.abort());
  await p.route('**/landing-config.js',r=>r.fulfill({contentType:'application/javascript',body:`window.LANDING={PREFILL_LIVE:${flag}};`}));
  await p.addInitScript(({mode})=>{ window.__calls=[]; window.supabase={createClient:()=>({functions:{invoke:async(fn,{body})=>{ window.__calls.push({fn,body}); await new Promise(r=>setTimeout(r,200));
    if(mode==='ok') return {data:{data:{name:'멜론성형외과',address:'서울특별시 강남구 테헤란로 115',region:'서울 강남구',industry:'병의원',service:'눈·코 성형 및 리프팅 전문 병원'}},error:null};
    const code={nf:'nothing_found',blk:'blocked_url',rl:'rate_limited'}[mode]; return {data:null,error:{context:{json:async()=>({error:code})}}}; }}})}; },{mode});
  await p.goto(ROOT + 'diagnose.html'); return p; }
 let p=await open(false,'ok'); ok('flag off: button hidden', !(await p.isVisible('#prefill-btn')));
 p=await open(true,'ok'); ok('flag on: button visible', await p.isVisible('#prefill-btn'));
 await p.click('#prefill-btn'); ok('empty/invalid url -> error, no call', (await p.textContent('#e-url')).includes('https://') && (await p.evaluate(()=>window.__calls.length))===0);
 await p.fill('#f-url','https://m.place.naver.com/restaurant/123'); await p.click('#prefill-btn');
 ok('naver url -> guidance, no call', (await p.textContent('#prefill-msg')).includes('네이버') && (await p.evaluate(()=>window.__calls.length))===0);
 await p.fill('#f-url','https://melonps.com/'); await p.fill('#f-name','내가쓴이름');
 await p.click('#prefill-btn'); ok('busy: button disabled + message', (await p.isDisabled('#prefill-btn')) && (await p.textContent('#prefill-msg')).includes('읽는 중'));
 await p.click('#prefill-btn',{force:true}).catch(()=>{});
 await p.waitForFunction(()=>document.getElementById('prefill-msg').textContent.includes('채웠어요')); 
 ok('one call only, correct body', (await p.evaluate(()=>window.__calls.length))===1 && (await p.evaluate(()=>window.__calls[0].fn))==='aeo-prefill' && (await p.evaluate(()=>window.__calls[0].body.url))==='https://melonps.com/');
 ok('user-typed name NOT overwritten', (await p.inputValue('#f-name'))==='내가쓴이름' && !(await p.evaluate(()=>document.getElementById('f-name').classList.contains('auto'))));
 ok('region/industry/service filled + marked', (await p.inputValue('#f-region'))==='서울 강남구' && (await p.inputValue('#f-ind'))==='병의원' && (await p.inputValue('#f-service')).includes('성형') && (await p.evaluate(()=>['f-region','f-ind','f-service'].every(i=>document.getElementById(i).classList.contains('auto')))));
 ok('message lists filled items, not name', (await p.textContent('#prefill-msg')).includes('지역') && !(await p.textContent('#prefill-msg')).includes('업체명'));
 await p.fill('#f-region','강남'); ok('editing clears auto mark', !(await p.evaluate(()=>document.getElementById('f-region').classList.contains('auto'))));
 await p.fill('#f-name',''); await p.click('#prefill-btn'); await p.waitForFunction(()=>document.getElementById('prefill-msg').textContent.includes('채웠어요'));
 ok('empty name now auto-filled; edited region kept', (await p.inputValue('#f-name'))==='멜론성형외과' && (await p.inputValue('#f-region'))==='강남');
 ok('button re-enabled', !(await p.isDisabled('#prefill-btn')));
 await p.screenshot({path:OUTDIR+'/prefill.png',fullPage:true});
 for (const [mode,txt] of [['nf','찾지 못했어요'],['blk','읽을 수 없어요'],['rl','다시 시도']]) { p=await open(true,mode); await p.fill('#f-url','https://a-site.kr/'); await p.click('#prefill-btn'); await p.waitForFunction(()=>!document.getElementById('prefill-msg').textContent.includes('읽는 중')); ok('error '+mode, (await p.textContent('#prefill-msg')).includes(txt)); }
 p=await open(true,'ok',390); ok('mobile no xscroll', !(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
 console.log('page errors:',errs); await b.close(); })();
