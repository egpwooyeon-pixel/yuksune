#!/usr/bin/env node
// 승인된 글 초안 → 사이트용 글 파일(content/guides/<slug>.json) 내보내기 (로컬에서 실행)
//
//   SUPABASE_URL=https://<프로젝트>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<키> node tools/export-approved.mjs [옵션]
//
//   옵션:  --dry-run   파일을 쓰지 않고 무엇이 내보내질지만 보여 줘요
//          --all       이미 내보낸 글도 다시 내보내요 (기본: 아직 안 내보낸 승인 글만)
//          --force     같은 이름의 다른 내용 파일이 있어도 덮어써요
//          --build     내보낸 뒤 바로 페이지를 만들어요 (node tools/build-guides.mjs)
//          --out <폴더>  글 파일을 쓸 폴더 (기본 content/guides)
//
// 지켜야 할 것
//  · 키(SUPABASE_SERVICE_ROLE_KEY)는 파일·저장소에 적지 말고 터미널에서만 설정하세요. 이 스크립트는 키를 출력하지 않아요.
//  · 승인(approved)된 글만, 그리고 **내보내기 직전에 다시 검사**해요. 아래 중 하나라도 걸리면 그 글은 건너뛰고(쓰지 않음) 이유를 알려 줘요.
//      상태가 승인이 아님 / 차단 항목 기록이 있음 / 샘플 글 / 글 형식 검증 실패 / 자동 검사(aeo-draft 와 같은 코드)에서 차단 항목이 나옴
//  · 내보낸 글은 사람이 확인(git diff)한 뒤 커밋해야 사이트에 올라가요. 이 스크립트는 사이트를 공개하지 않아요.
//  · Node 22.18 이상이 필요해요. (서버 함수의 검사 코드를 그대로 가져와 쓰기 때문)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function exportApproved({ url, key, out, dryRun = false, all = false, force = false, fetchImpl = fetch, mod, guide }) {
  const { lintArticle, allowedText, validateArticle } = mod, report = { written: [], same: [], skipped: [], warnings: [] };
  const h = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  const q = `select=*&status=eq.approved${all ? "" : "&exported_at=is.null"}&order=id.asc&limit=200`;
  const r = await fetchImpl(`${url.replace(/\/$/, "")}/rest/v1/guide_drafts?${q}`, { headers: h });
  if (!r.ok) throw new Error(`초안을 불러오지 못했어요 (HTTP ${r.status}). 주소·키·025 SQL 실행 여부를 확인하세요.`);
  const rows = await r.json();
  fs.mkdirSync(out, { recursive: true });
  for (const row of rows) {
    const id = row.id, skip = reason => report.skipped.push({ id, reason }), a = row.article;
    if (row.status !== "approved") { skip("상태가 승인이 아니에요"); continue; }          // 서버가 거른 뒤에도 한 번 더 확인
    if (!a || typeof a !== "object") { skip("글 내용이 없어요"); continue; }
    if (row.blocking > 0) { skip(`차단 항목 ${row.blocking}개가 기록돼 있어요`); continue; }
    if (a.sample) { skip("샘플 글은 내보내지 않아요"); continue; }
    const errs = [...guide.validate(a), ...validateArticle(a)];
    if (errs.length) { skip("글 형식 검증 실패: " + [...new Set(errs)].slice(0, 5).join(", ")); continue; }
    const { issues, blocking } = lintArticle(a, allowedText({ business: row.business || {}, facts: row.facts || [], sources: a.sources || [], topic: "" }));
    if (blocking > 0) { skip("내보내기 직전 자동 검사에서 차단 항목이 나왔어요: " + issues.filter(i => i.level === "block").map(i => i.msg).slice(0, 2).join(" / ")); continue; }
    const file = path.join(out, a.slug + ".json"), body = JSON.stringify(a, null, 2) + "\n";
    if (fs.existsSync(file)) {
      if (fs.readFileSync(file, "utf8") === body) { report.same.push(a.slug); continue; }
      if (!force) { skip(`같은 이름(${a.slug}.json)의 다른 내용 파일이 이미 있어요. 덮어쓰려면 --force`); continue; }
    }
    if (dryRun) { report.written.push(a.slug + " (dry-run)"); continue; }
    fs.writeFileSync(file, body);
    report.written.push(a.slug);
    const p = await fetchImpl(`${url.replace(/\/$/, "")}/rest/v1/guide_drafts?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: h, body: JSON.stringify({ exported_at: new Date().toISOString() }) });
    if (!p.ok) report.warnings.push(`#${id}: 내보낸 기록을 DB에 남기지 못했어요 (파일은 썼어요)`);
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2), has = f => args.includes(f), val = (f, d) => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : d; };
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요해요. (키는 파일에 적지 말고 터미널에서만 설정하세요)"); process.exit(2); }
  let mod; try { mod = await import("../supabase/functions/aeo-draft/index.ts"); } catch (_) { console.error("서버 함수의 검사 코드를 불러오지 못했어요. Node 22.18 이상이 필요해요."); process.exit(2); }
  const guide = await import("./build-guides.mjs");
  const out = path.resolve(val("--out", path.join(root, "content/guides")));
  let rep;
  try { rep = await exportApproved({ url, key, out, dryRun: has("--dry-run"), all: has("--all"), force: has("--force"), mod, guide }); }
  catch (e) { console.error(String(e && e.message || e).split(key).join("***")); process.exit(1); }
  console.log(`쓴 글 ${rep.written.length}개${rep.written.length ? ": " + rep.written.join(", ") : ""}`);
  if (rep.same.length) console.log(`이미 같은 내용이라 건너뜀 ${rep.same.length}개`);
  for (const s of rep.skipped) console.log(`건너뜀 #${s.id}: ${s.reason}`);
  for (const w of rep.warnings) console.log(`주의 ${w}`);
  if (has("--build") && !has("--dry-run")) { const r = guide.build(); console.log(`페이지 만들기: 글 ${r.count}개 → ${r.out}` + (r.removed.length ? ` (지운 낡은 페이지: ${r.removed.join(", ")})` : "")); }
  else if (rep.written.length && !has("--dry-run")) console.log("다음: node tools/build-guides.mjs 로 페이지를 만들고, git diff 로 확인한 뒤 커밋하세요.");
  process.exit(rep.skipped.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
