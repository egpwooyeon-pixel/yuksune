// Supabase Edge Function: 정보 가이드 글 초안 만들기 + 수정 저장 (운영자 전용)
//
// 운영자가 넣은 [업체 정보]와 [사실 목록]만 바탕으로 Gemini 가 글 초안(JSON)을 쓰고, 서버가 자동 검사를 거쳐 guide_drafts 에 저장합니다.
// 이 글은 "초안"이에요. 공개되려면 운영자가 검수 메모와 함께 승인(review_guide_draft)해야 하고, 차단 항목이 있으면 승인할 수 없어요.
//
// 지켜야 할 것
//  · 운영자만: 호출자의 로그인(JWT)을 확인하고 profiles.role = 'admin' 인지 확인해요. 아니면 403.
//  · 글에 들어가는 **출처 링크·업체 정보는 운영자가 넣은 값만** 써요. AI 가 만든 링크·연락처·주소는 쓰지 않아요.
//  · AI 에게 "제공된 사실만 쓰고, 효과·가격·후기·순위·보장 표현을 쓰지 말라"고 지시하고, 결과를 다시 자동 검사해요.
//      차단(block): 과장·보장·최상급·의료 결과·전후·후기·할인 표현, 입력에 없는 전화번호
//      경고(warn): 입력에 없는 숫자(원·%·명·년 등)·링크, 효과 단정 표현, 글이 너무 짧음
//  · 비밀값: GEMINI_API_KEY (서버에만). 선택: GEMINI_MODEL(쉼표로 여러 개 가능, 기본 gemini-3.8-flash)
//
// 이 파일의 validate 는 tools/build-guides.mjs 의 검증과 같은 규칙이에요(시험에서 두 검증이 같은 결과를 내는지 확인).
//
// 아직 실제 Gemini·실제 Supabase 로는 실행해 보지 않았습니다. 모의 응답으로 시험했습니다.

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...CORS } });
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max);
export const safeUrl = u => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.toString() : ""; } catch (_) { return ""; } };

// ---------- 입력 ----------
export function parseInput(b) {
  const bi = (b && b.business) || {};
  const business = { name: clean(bi.name, 60), region: clean(bi.region, 40), industry: clean(bi.industry, 40), address: clean(bi.address, 120), phone: clean(bi.phone, 30), hours: clean(bi.hours, 80), summary: clean(bi.summary, 160), url: "" };
  if (bi.url) { business.url = safeUrl(bi.url); if (!business.url) return { error: "bad_url" }; }
  if (business.name.length < 2) return { error: "bad_name" };
  if (!business.industry) return { error: "need_industry" };
  const facts = (Array.isArray(b && b.facts) ? b.facts : []).map(x => clean(x, 300)).filter(x => x.length >= 6).slice(0, 20);
  if (facts.length < 2) return { error: "need_facts" };           // 사실이 없으면 AI 가 지어내므로 최소 2개 필요
  const sources = [];
  for (const s of (Array.isArray(b && b.sources) ? b.sources : []).slice(0, 5)) { const url = safeUrl(s && s.url), label = clean(s && s.label, 120); if (label && url) sources.push({ label, url, ...(s.note ? { note: clean(s.note, 120) } : {}) }); else return { error: "bad_source" }; }
  const topic = clean(b && b.topic, 100);
  const inquiryId = Number.isInteger(b && b.inquiryId) && b.inquiryId > 0 ? b.inquiryId : null;
  return { business, facts, sources, topic, inquiryId };
}

// ---------- 검증 (tools/build-guides.mjs 와 같은 규칙) ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function validateArticle(a) {
  const e = [], str = (v, min, max) => typeof v === "string" && v.trim().length >= min && v.length <= max;
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(a.slug || "")) e.push("slug");
  if (!str(a.title, 5, 100)) e.push("title");
  if (!str(a.description, 10, 160)) e.push("description");
  if (!str(a.category, 1, 30)) e.push("category");
  if (!DATE.test(a.publishedAt || "")) e.push("publishedAt");
  if (a.updatedAt && !DATE.test(a.updatedAt)) e.push("updatedAt");
  if (!a.business || !str(a.business.name, 1, 60)) e.push("business.name");
  if (a.business && a.business.url && !safeUrl(a.business.url)) e.push("business.url");
  if (!Array.isArray(a.sections) || !a.sections.length) e.push("sections");
  else a.sections.forEach((s, i) => { if (!str(s && s.heading, 2, 80) || !Array.isArray(s.paragraphs) || !s.paragraphs.length || s.paragraphs.some(p => !str(p, 1, 2000))) e.push(`sections[${i}]`); });
  (a.faq || []).forEach((f, i) => { if (!str(f && f.q, 2, 200) || !str(f && f.a, 2, 1500)) e.push(`faq[${i}]`); });
  (a.sources || []).forEach((s, i) => { if (!str(s && s.label, 1, 120) || (s.url && !safeUrl(s.url))) e.push(`sources[${i}]`); });
  (a.questions || []).forEach((q, i) => { if (!str(q, 2, 200)) e.push(`questions[${i}]`); });
  return e;
}

// ---------- 자동 검사 ----------
// 차단: 과장·보장·최상급·의료 결과·전후·후기·할인. (띄어쓰기를 뺀 글에서 찾음)
export const BLOCK_TERMS = ["완치", "100%", "백퍼센트", "부작용없", "부작용이없", "통증없", "무통", "최고", "최상", "최초", "최대", "유일", "독보적", "1위", "국내1", "업계1", "가장좋", "가장뛰어", "보장", "확실한효과", "효과적인", "치료효과", "성공률", "전후사진", "비포애프터", "비포&애프터", "후기", "체험담", "리뷰", "할인", "이벤트", "특가", "무료시술", "공짜", "추천드립니다", "강력추천", "믿고맡"];
const WARN_TERMS = ["효과", "추천", "좋은결과", "만족", "안전한", "검증된", "전문의가직접", "노하우"];
const NUM_UNIT = /\d[\d,.]*\s?(?:원|만원|천원|%|퍼센트|배|명|건|년|개월|일|시간|분|회|개|곳|위|점)/g;
const norm = s => String(s == null ? "" : s).replace(/\s+/g, "").toLowerCase();

export function textOf(a) {
  const parts = [a.title, a.description, ...(a.questions || []), ...(a.sections || []).flatMap(s => [s.heading, ...(s.paragraphs || [])]), ...(a.faq || []).flatMap(f => [f.q, f.a])];
  return parts.filter(Boolean).join("\n");
}
export function lintArticle(a, allowed) {
  const text = textOf(a), n = norm(text), allowN = norm(allowed), issues = [];
  const seen = new Set();
  for (const t of BLOCK_TERMS) { const k = norm(t); if (n.includes(k) && !allowN.includes(k) && !seen.has(k)) { seen.add(k); issues.push({ level: "block", code: "claim_term", msg: `"${t}" 같은 과장·보장·결과·후기·할인 표현이 있어요. 입력한 사실에 없는 표현이라 삭제하거나 고쳐야 해요.` }); } }
  for (const t of WARN_TERMS) { const k = norm(t); if (n.includes(k) && !allowN.includes(k)) issues.push({ level: "warn", code: "soft_claim", msg: `"${t}" 표현을 확인해 주세요. 근거가 입력한 사실에 있어야 해요.` }); }
  for (const m of new Set(text.match(/\d{2,4}-\d{3,4}-\d{4}/g) || [])) if (!allowed.includes(m)) issues.push({ level: "block", code: "invented_phone", msg: `입력하지 않은 전화번호(${m})가 있어요.` });
  for (const m of new Set(text.match(/https?:\/\/[^\s)]+/g) || [])) if (!allowed.includes(m)) issues.push({ level: "warn", code: "unknown_url", msg: `입력하지 않은 링크(${m})가 있어요.` });
  for (const m of new Set(text.match(NUM_UNIT) || [])) if (!allowN.includes(norm(m))) issues.push({ level: "warn", code: "unbacked_number", msg: `"${m}" 숫자가 입력한 사실에 없어요. 근거를 확인하거나 삭제하세요.` });
  if ((a.sections || []).length < 2) issues.push({ level: "warn", code: "short", msg: "소제목(섹션)이 2개 미만이에요." });
  return { issues, blocking: issues.filter(i => i.level === "block").length };
}

// ---------- Gemini ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function callGemini(body, models, apiKey, fetchImpl = fetch) {
  let last;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 60000);
      try {
        const r = await fetchImpl(GEMINI_BASE + encodeURIComponent(model) + ":generateContent", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body), signal: ctl.signal });
        clearTimeout(to);
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error("auth_failed"), { fatal: true });
        if (r.status === 400) { const t = await r.text().catch(() => ""); throw Object.assign(new Error(/api key/i.test(t) ? "auth_failed" : "api_error"), { fatal: true }); }
        if (r.status === 429 || r.status >= 500) { last = new Error("api_error"); await sleep(1500 * (attempt + 1)); continue; }
        if (r.status === 404) { last = new Error("api_error"); break; }                 // 모델이 종료됨 → 다음 모델
        if (!r.ok) throw Object.assign(new Error("api_error"), { fatal: true });
        const j = await r.json();
        const parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
        return (parts || []).map(p => (p && typeof p.text === "string" ? p.text : "")).join("").trim();
      } catch (e) { clearTimeout(to); if (e && e.fatal) throw e; last = new Error(e && e.name === "AbortError" ? "timeout" : "network"); }
    }
  }
  throw last || new Error("api_error");
}

export function buildPrompt(input) {
  const b = input.business;
  const info = [["업체명", b.name], ["지역", b.region], ["업종", b.industry], ["주소", b.address], ["운영시간", b.hours], ["한 줄 소개", b.summary]].filter(r => r[1]).map(r => `- ${r[0]}: ${r[1]}`).join("\n");
  return `당신은 한국어 정보 글 편집자입니다. 아래 [업체 정보]와 [제공된 사실]만 사용해 "${input.topic || "업체를 고를 때 확인할 점"}"을 안내하는 글을 쓰세요.

규칙 (반드시 지키세요):
1. [제공된 사실]에 없는 내용은 쓰지 마세요. 가격, 할인, 효과, 성공률, 수상, 순위, 후기, 인원·경력·규모를 지어내지 마세요. 모르는 것은 "업체에 직접 확인하세요"라고 쓰세요.
2. 최고·유일·1위·보장·100%·완치·전후·후기·체험담·할인·이벤트처럼 과장·보장·비교하는 표현을 쓰지 마세요.
3. 의료·법률 조언이나 효과 단정을 하지 마세요. 특정 치료나 상품을 권하지 마세요.
4. 업체를 홍보하지 말고, 고객이 스스로 확인할 기준과 질문을 중심으로 중립적으로 쓰세요.
5. 숫자·연락처·주소·링크는 [제공된 사실]과 [업체 정보]에 있는 것만 그대로 쓰세요. 링크는 쓰지 마세요.

[업체 정보]
${info}

[제공된 사실]
${input.facts.map(f => "- " + f).join("\n")}

출력은 JSON 객체 하나만: {"title": 제목(50자 안팎), "description": 120자 이내 설명, "questions": 이 글이 답하는 질문 3개, "sections": [{"heading": 소제목, "paragraphs": [문단 1~3개]}] 3~4개, "faq": [{"q": 질문, "a": 답}] 2~3개}`;
}

const today = () => new Date().toISOString().slice(0, 10);
export const makeSlug = () => { const r = crypto.getRandomValues(new Uint8Array(4)); return "g-" + today().replace(/-/g, "") + "-" + [...r].map(x => x.toString(16).padStart(2, "0")).join(""); };

// 모델 출력 → 글 JSON (제목·설명·질문·본문·FAQ 만 모델에서 받고, 업체 정보·출처·날짜·slug 는 서버가 채움)
export function assemble(model, input) {
  let m; try { m = JSON.parse(String(model).replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch (_) { return null; }
  if (!m || typeof m !== "object") return null;
  const arr = v => (Array.isArray(v) ? v : []);
  const sections = arr(m.sections).slice(0, 6).map(s => ({ heading: clean(s && s.heading, 80), paragraphs: arr(s && s.paragraphs).slice(0, 4).map(p => clean(p, 1200)).filter(Boolean) })).filter(s => s.heading.length >= 2 && s.paragraphs.length);
  if (sections.length < 2) return null;
  const b = input.business;
  return {
    slug: makeSlug(), sample: false, title: clean(m.title, 100), description: clean(m.description, 160), category: b.industry,
    publishedAt: today(), updatedAt: today(),
    business: { name: b.name, region: b.region, address: b.address, phone: b.phone, hours: b.hours, url: b.url, summary: b.summary },
    questions: arr(m.questions).slice(0, 5).map(q => clean(q, 200)).filter(q => q.length >= 2),
    sections,
    sources: input.sources,                                            // 출처는 운영자가 넣은 것만
    faq: arr(m.faq).slice(0, 4).map(f => ({ q: clean(f && f.q, 200), a: clean(f && f.a, 800) })).filter(f => f.q.length >= 2 && f.a.length >= 2),
  };
}
export const allowedText = input => [input.business.name, input.business.region, input.business.industry, input.business.address, input.business.phone, input.business.hours, input.business.summary, input.business.url, input.topic, ...input.facts, ...input.sources.map(s => s.label + " " + s.url)].filter(Boolean).join("\n");

// ---------- 요청 처리 ----------
export async function handle(req, deps) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const adminId = await deps.adminId(req.headers.get("authorization") || "");
  if (!adminId) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  if (body && body.action === "save") return save(body, adminId, deps);
  return generate(body, adminId, deps);
}

async function generate(body, adminId, deps) {
  const input = parseInput(body);
  if (input.error) return json({ error: input.error }, 400);
  const { apiKey, models } = deps.config();
  if (!apiKey) return json({ error: "not_configured" }, 503);
  let text;
  try { text = await deps.gemini({ contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }], generationConfig: { temperature: 0.4, responseMimeType: "application/json" } }, models, apiKey); }
  catch (e) { const c = e && e.message; return json({ error: ["auth_failed", "timeout", "network"].includes(c) ? c : "api_error" }, 502); }
  const article = assemble(text, input);
  if (!article) return json({ error: "bad_model_output" }, 502);
  const structural = validateArticle(article);
  if (structural.length) return json({ error: "bad_model_output", detail: structural.slice(0, 5) }, 502);
  const { issues, blocking } = lintArticle(article, allowedText(input));
  const row = await deps.insert({ inquiry_id: input.inquiryId, business: input.business, facts: input.facts, article, lint: issues, blocking, model: models[0] || null, created_by: adminId });
  return json({ id: row.id, blocking, lint: issues });
}

// 운영자가 고친 본문 저장: 구조 검증 + 자동 검사를 다시 하고, 초안 상태일 때만 저장
async function save(body, adminId, deps) {
  const id = Number.isInteger(body.id) && body.id > 0 ? body.id : null;
  if (!id) return json({ error: "bad_id" }, 400);
  const row = await deps.get(id);
  if (!row) return json({ error: "not_found" }, 404);
  if (row.status !== "draft") return json({ error: "not_draft" }, 409);
  const e = body.article || {}, arr = v => (Array.isArray(v) ? v : []);
  const a = {
    ...row.article, title: clean(e.title, 100), description: clean(e.description, 160), updatedAt: today(),
    questions: arr(e.questions).slice(0, 5).map(q => clean(q, 200)).filter(q => q.length >= 2),
    sections: arr(e.sections).slice(0, 6).map(s => ({ heading: clean(s && s.heading, 80), paragraphs: arr(s && s.paragraphs).slice(0, 4).map(p => clean(p, 2000)).filter(Boolean) })),
    faq: arr(e.faq).slice(0, 4).map(f => ({ q: clean(f && f.q, 200), a: clean(f && f.a, 1500) })).filter(f => f.q || f.a),
  };
  // 업체 정보·출처·slug·날짜는 저장된 값을 유지 (운영자 화면에서 바꾸지 못함)
  const structural = validateArticle(a);
  if (structural.length) return json({ error: "invalid_article", detail: structural.slice(0, 8) }, 422);
  const allowed = allowedText({ business: row.business, facts: row.facts || [], sources: row.article.sources || [], topic: "" });
  const { issues, blocking } = lintArticle(a, allowed);
  await deps.update(id, { article: a, lint: issues, blocking, updated_at: new Date().toISOString() });
  return json({ id, blocking, lint: issues });
}

function realDeps() {
  const env = k => Deno.env.get(k), URL_ = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  const h = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  return {
    config: () => ({ apiKey: env("GEMINI_API_KEY"), models: String(env("GEMINI_MODEL") || "gemini-3.8-flash").split(",").map(x => x.trim()).filter(Boolean) }),
    gemini: (body, models, key) => callGemini(body, models, key),
    async adminId(authHeader) {                                        // 로그인한 운영자인지 확인 (읽기만 함)
      if (!authHeader) return null;
      const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: authHeader } });
      if (!u.ok) return null;
      const { id } = await u.json();
      const p = await fetch(`${URL_}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=role`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
      const rows = p.ok ? await p.json() : [];
      return rows[0] && rows[0].role === "admin" ? id : null;
    },
    async insert(row) {
      const r = await fetch(`${URL_}/rest/v1/guide_drafts`, { method: "POST", headers: { ...h, prefer: "return=representation" }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error("db_error");
      return (await r.json())[0];
    },
    async get(id) { const r = await fetch(`${URL_}/rest/v1/guide_drafts?id=eq.${id}&select=*`, { headers: h }); const rows = r.ok ? await r.json() : []; return rows[0] || null; },
    async update(id, patch) { const r = await fetch(`${URL_}/rest/v1/guide_drafts?id=eq.${id}&status=eq.draft`, { method: "PATCH", headers: h, body: JSON.stringify(patch) }); if (!r.ok) throw new Error("db_error"); },
  };
}
if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(async req => { try { return await handle(req, realDeps()); } catch (_) { return json({ error: "server_error" }, 500); } });
}
