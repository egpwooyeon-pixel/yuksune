// 로컬 링크·이미지·스크립트·앵커 존재 확인 (외부 주소는 검사하지 않음)
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pages = ['landing.html', 'diagnose.html', 'landing-privacy.html', 'admin-inquiries.html', 'admin-drafts.html', 'campaigns.html', ...fs.readdirSync(ROOT + '/guide').filter(f => f.endsWith('.html')).map(f => 'guide/' + f)];
let bad = 0, checked = 0;
for (const pg of pages) {
  const html = fs.readFileSync(path.join(ROOT, pg), 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const base = path.dirname(path.join(ROOT, pg));
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const u = m[1];
    if (!u || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(u)) continue;
    checked++;
    const [file, hash] = u.split('#');
    if (!file) { if (hash && !ids.has(hash)) { bad++; console.log(`✗ ${pg}: 같은 페이지에 #${hash} 없음`); } continue; }
    const target = path.join(base, file.split('?')[0]);
    if (!fs.existsSync(target)) { bad++; console.log(`✗ ${pg}: ${u} 파일 없음`); continue; }
    if (hash && target.endsWith('.html')) {
      const th = fs.readFileSync(target, 'utf8');
      if (!new RegExp(`\\sid="${hash}"`).test(th)) { bad++; console.log(`✗ ${pg}: ${u} 대상 페이지에 #${hash} 없음`); }
    }
  }
}
console.log(bad ? 'FAIL 링크 문제 ' + bad + '개' : 'PASS 링크 ' + checked + '개 (' + pages.length + '개 페이지) 모두 존재');
process.exitCode = bad ? 1 : 0;
