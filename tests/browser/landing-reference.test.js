const ROOT_DIR = require('path').resolve(__dirname, '../..');
const ROOT = require('url').pathToFileURL(ROOT_DIR).href + '/';
const OUTDIR = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const ok=(n,c)=>console.log(c?'PASS':'FAIL',n);
 for (const [n,w,h] of [['d',1440,900],['m',390,800]]) {
  const p=await b.newPage({viewport:{width:w,height:h}}); const e=[]; p.on('pageerror',x=>e.push(x.message));
  await p.goto(ROOT + 'landing.html'); await p.waitForTimeout(300);
  ok(n+' ref visible', await p.isVisible('#reference'));
  ok(n+' no xscroll', !(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
  ok(n+' no errors', e.length===0);
  const r=await p.$eval('#reference',el=>Math.round(el.getBoundingClientRect().height)); console.log(n,'ref section height',r);
  await (await p.$('#reference')).screenshot({path:`${OUTDIR}/${n}-ref.png`});
 }
 // 끄기 시험
 const p=await b.newPage(); await p.route('**/landing-config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.LANDING={SHOW_REFERENCE:false};'}));
 await p.goto(ROOT + 'landing.html'); ok('SHOW_REFERENCE:false hides section', !(await p.isVisible('#reference')));
 await b.close(); })();
