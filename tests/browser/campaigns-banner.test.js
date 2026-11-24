const ROOT_DIR = require('path').resolve(__dirname, '../..');
const ROOT = require('url').pathToFileURL(ROOT_DIR).href + '/';
const OUTDIR = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const ok=(n,c)=>console.log(c?'PASS':'FAIL',n);
 for (const [n,w,h] of [['wide',1594,900],['mid',1100,800],['m',390,800]]) {
  const p=await b.newPage({viewport:{width:w,height:h}}); const e=[]; p.on('pageerror',x=>e.push(x.message));
  await p.route('**/supabase-js*',r=>r.abort());
  await p.goto(ROOT + 'campaigns.html'); await p.waitForTimeout(500);
  const r=await p.$eval('.egp-banner',el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),pos:s.position}});
  const main=await p.$eval('main',el=>Math.round(el.getBoundingClientRect().x));
  console.log(n,r,'main.x',main);
  ok(n+' no xscroll', !(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
  ok(n+' no page errors (excluding supabase offline)', e.filter(x=>!/supabase/i.test(x)).length===0);
  if(n==='wide') ok('wide: banner sits in left gutter (right edge < content left)', r.x+r.w < main);
  if(n!=='wide') ok(n+': static strip inside content', r.pos==='static' && r.x>=main);
  ok(n+' link', (await p.getAttribute('.egp-banner','href'))==='landing.html' && (await p.getAttribute('.egp-banner','target'))==='_blank');
  await p.screenshot({path:`${OUTDIR}/${n}-cl.png`});
 } await b.close(); })();
