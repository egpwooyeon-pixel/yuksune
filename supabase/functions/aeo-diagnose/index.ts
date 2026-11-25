// Supabase Edge Function: AI 노출 진단 (Gemini API + 구글 검색 연동)
//
// 업체명·지역·업종(·홈페이지)을 받아
//   1) Gemini 로 "이 업종·지역을 찾는 고객이 AI에게 물어볼 질문" 5개(기본)를 만들고
//   2) 질문마다 Gemini(google_search 연동)에 물어 답변과 출처를 받은 뒤
//   3) 답변에 업체명이 나왔는지(멘션), 출처에 자사 홈페이지가 있었는지(인용), 어떤 출처·경쟁 업체가 나왔는지 집계합니다.
//   결과는 diagnose.html 의 리포트 데이터 형식으로 돌려줍니다.
//
// 비밀값(Supabase > Edge Functions > Secrets): GEMINI_API_KEY (필수)
//   선택: GEMINI_MODEL(기본 gemini-3.8-flash), IP_HASH_SALT, DIAGNOSE_IP_LIMIT(기본 1), DIAGNOSE_DAILY_LIMIT(기본 100),
//   DIAGNOSE_QUESTIONS(기본 5, 최대 10), DIAGNOSE_CONCURRENCY(기본 2)
//   키는 x-goog-api-key 헤더로만 보내며, 브라우저·응답·로그로 나가지 않습니다.
//
// 측정의 한계 (리포트 화면에도 표시됩니다)
//  · Gemini API + 구글 검색 연동 결과이며, 실제 Gemini 앱·네이버·ChatGPT 등의 답변과 다를 수 있습니다.
//  · AI 답변은 질문·시점마다 달라지므로 1회 측정값은 참고용입니다.
//  · "멘션"은 답변 본문에 업체명 글자가 포함된 경우입니다. 업체명이 흔한 단어이면 실제와 다르게 잡힐 수 있습니다.
//
// 아직 실제 Gemini API 로는 실행해 보지 않았습니다(키 없음). 모의 응답으로 시험했습니다.
// 응답 필드(candidates[0].content.parts[].text, candidates[0].groundingMetadata.groundingChunks[].web.title)는
// 공식 문서 형식을 기준으로 가정했으니, 첫 실호출 때 확인이 필요합니다.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const QUESTION_COUNT = 5;   // 기본값: 무료 한도 보호용 "간이 진단". Secrets 의 DIAGNOSE_QUESTIONS 로 늘릴 수 있음(최대 10)
const CONCURRENCY = 2;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...CORS } });

// 오류 문구에 키가 섞이지 않게 가림
export function redact(s, secrets = []) {
  let out = String(s == null ? "" : s);
  for (const k of secrets) if (k) out = out.split(k).join("***");
  return out.replace(/[A-Za-z0-9_-]{24,}/g, "***").slice(0, 160);
}

// 오류 코드(message)에 더해 Gemini 상태 코드·사유(키는 가려짐)를 붙여, 응답으로 돌려주고 원인을 찾기 쉽게 함
export class UpErr extends Error {
  constructor(code, status, detail) { super(code); this.status = status || null; this.detail = detail ? String(detail).slice(0, 220) : null; }
}
function upDetail(t) {                       // Gemini 오류 본문에서 사람이 읽을 문구만 뽑음
  try { const j = JSON.parse(t); if (j && j.error && j.error.message) return redact(j.error.message); } catch (_) {}
  return redact(t);
}

// ---------- 입력 검사·정규화 ----------
const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export function parseInput(b) {
  const name = clean(b && b.name, 60), region = clean(b && b.region, 40), industry = clean(b && b.industry, 40), service = clean(b && b.service, 70);
  let url = clean(b && b.url, 200), host = "";
  if (url) {
    try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw 0; host = u.hostname.toLowerCase().replace(/^www\./, ""); } catch (_) { return { error: "bad_url" }; }
  }
  if (name.length < 2) return { error: "bad_name" };
  if (!region || !industry) return { error: "need_region_industry" };
  return { name, region, industry, service, url, host };
}
export const normalize = s => String(s == null ? "" : s).toLowerCase().replace(/[\s\-_.,·ㆍ()[\]{}'"“”‘’!?/\\|:;*]/g, "");
export const cacheKey = (name, region, industry) => [name, region, industry].map(normalize).join("|");

// ---------- 집계 ----------
export const mentions = (answer, name) => { const n = normalize(name); return n.length >= 2 && normalize(answer).includes(n); };
export const isOwn = (domain, host) => { const d = String(domain || "").toLowerCase().replace(/^www\./, ""); return !!host && !!d && (d === host || d.endsWith("." + host)); };

// Gemini 응답에서 답변 텍스트와 출처 도메인 목록 뽑기
export function parseAnswer(j) {
  const c = j && Array.isArray(j.candidates) ? j.candidates[0] : null;
  const parts = c && c.content && Array.isArray(c.content.parts) ? c.content.parts : [];
  const text = parts.map(p => (p && typeof p.text === "string" ? p.text : "")).join("").trim();
  const chunks = c && c.groundingMetadata && Array.isArray(c.groundingMetadata.groundingChunks) ? c.groundingMetadata.groundingChunks : [];
  const domains = [...new Set(chunks.map(k => k && k.web && String(k.web.title || "").trim().toLowerCase()).filter(Boolean))];
  return { text, domains };
}

export function aggregate(input, qa, rivals) {
  const ok = qa.filter(x => x.ok);
  const mention = ok.filter(x => x.mentioned).length, cite = ok.filter(x => x.cited).length;
  const count = new Map();
  for (const x of ok) for (const d of x.domains) count.set(d, (count.get(d) || 0) + 1);
  const sources = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, n]) => ({ d, n, ...(isOwn(d, input.host) ? { own: true } : {}) }));
  return {
    brand: input.name, url: input.url, region: input.region, industry: input.industry,
    measuredAt: new Date().toISOString(), questions: ok.length, live: true,
    citeAvailable: !!input.host,
    engines: [{ name: "Gemini", mention, cite, answers: ok.length }],
    sources, rivals,
    keywords: [],                                                   // 월 검색량·구글 순위는 별도 데이터 출처가 필요해 아직 포함하지 않음
    questionList: ok.map(x => ({ q: x.q, mentioned: x.mentioned, cited: x.cited })),
  };
}

// ---------- Gemini 호출 ----------
async function sleep(ms) { await new Promise(r => setTimeout(r, ms)); }
export async function callGemini(body, model, apiKey, fetchImpl = fetch, retries = 2, label = "") {
  const trace = [];                                                    // 시도 기록(상태@걸린 ms). 실패했을 때 원인 파악용으로 오류에 붙임
  const fail = (code, status, detail) => new UpErr(code, status, (label ? label + ": " : "") + (detail || "") + (trace.length ? " | 시도: " + trace.join(", ") : ""));
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now(), ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 45000);
    let r;
    try {
      r = await fetchImpl(GEMINI_BASE + encodeURIComponent(model) + ":generateContent", {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body), signal: ctl.signal,
      });
    } catch (e) {
      clearTimeout(to); const aborted = e && e.name === "AbortError";
      trace.push((aborted ? "시간초과@" : "연결실패@") + (Date.now() - t0));
      if (attempt < retries) { await sleep(1500 * (attempt + 1)); continue; }
      throw fail(aborted ? "timeout" : "network", null, aborted ? "Gemini 응답이 45초 안에 오지 않음" : "Gemini 에 연결하지 못함");
    }
    clearTimeout(to); trace.push(r.status + "@" + (Date.now() - t0));
    if (r.status === 401 || r.status === 403) throw fail("auth_failed", r.status, upDetail(await r.text().catch(() => "")));
    if (r.status === 400) {                                           // 잘못된 키는 400("API key not valid")으로 오는 것으로 알려져 있어 문구로 구분
      const t = await r.text().catch(() => "");
      throw fail(/api key|api_key/i.test(t) ? "auth_failed" : "api_error", 400, upDetail(t));
    }
    if ((r.status === 429 || r.status >= 500) && attempt < retries) { await sleep(2000 * (attempt + 1)); continue; }
    if (r.status === 429) throw fail("rate_limited", 429, upDetail(await r.text().catch(() => "")));
    if (!r.ok) throw fail("api_error", r.status, upDetail(await r.text().catch(() => "")));
    try { return await r.json(); } catch (_) { throw fail("api_error", r.status, "응답이 JSON 이 아님"); }
  }
}

// 모델을 쉼표로 여러 개 적으면(예: "a,b") 앞에서부터 시도해, 과부하(5xx)·시간초과·종료(404) 때 다음 모델로 넘어감
export const parseModels = v => String(v || "").split(",").map(x => x.trim()).filter(Boolean);
export async function callModels(body, ctx, label) {
  const models = Array.isArray(ctx.models) ? ctx.models : parseModels(ctx.model);
  const retries = models.length > 1 ? 1 : 2;                         // 대체 모델이 있으면 한 모델에서 오래 붙잡지 않음
  let last;
  for (const m of models) {
    try { return await callGemini(body, m, ctx.apiKey, ctx.fetch, retries, label + (models.length > 1 ? " [" + m + "]" : "")); }
    catch (e) {
      last = e;
      const code = e && e.message, st = e && e.status;
      const next = code === "timeout" || code === "network" || code === "rate_limited" || (code === "api_error" && (st === 404 || st >= 500));
      if (!next) throw e;                                             // 키 오류·잘못된 요청은 다른 모델로 가도 같으므로 즉시 중단
    }
  }
  throw last;
}

const jsonText = j => parseAnswer(j).text;
function parseJsonArray(text) {
  const t = String(text || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try { const v = JSON.parse(t); return Array.isArray(v) ? v : null; } catch (_) { return null; }
}

export async function makeQuestions(input, ctx) {
  const COUNT = Math.min(10, Math.max(3, (ctx && ctx.questions) || QUESTION_COUNT));
  const prompt = `당신은 한국의 일반 소비자입니다. "${input.region}" 지역에서 "${input.industry}" 업체를 찾는 사람이 AI 검색(챗봇)에 실제로 입력할 만한 질문을 ${COUNT}개 만드세요.${input.service ? `\n- 이 업체의 대표 서비스는 "${input.service}"입니다. 질문 일부는 이 서비스를 찾는 사람의 관점에서 쓰세요.` : ""}
- 특정 업체 이름을 넣지 마세요. (예: "강남에서 ~ 찾아줘" 같은 탐색 질문)
- 서로 다른 조건(가격대, 분위기, 규모, 접근성, 후기, 예약 등)을 섞고, 자연스러운 한국어 한 문장으로 쓰세요.
- 결과는 문자열 ${COUNT}개로 이뤄진 JSON 배열만 출력하세요.`;
  const j = await callModels({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } },
  }, ctx, "질문 생성");
  const arr = parseJsonArray(jsonText(j));
  const qs = (arr || []).map(q => clean(q, 120)).filter(q => q.length >= 6);
  const uniq = [...new Set(qs)].slice(0, COUNT);
  if (uniq.length < Math.min(3, COUNT)) throw new UpErr("api_error", 200, "질문 생성 결과를 해석하지 못함(" + uniq.length + "개)");
  return uniq;
}

async function askOne(q, input, ctx) {
  try {
    const j = await callModels({
      contents: [{ role: "user", parts: [{ text: q + "\n(한국어로 답변해 주세요.)" }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.3 },
    }, ctx, "답변");
    const { text, domains } = parseAnswer(j);
    if (!text) return { q, ok: false };
    return { q, ok: true, text, domains, mentioned: mentions(text, input.name), cited: domains.some(d => isOwn(d, input.host)) };
  } catch (e) {
    if (e && e.message === "auth_failed") throw e;                    // 키 문제는 전체 중단
    ctx.lastErr = (e && e.status ? e.status + " " : "") + (e && (e.detail || e.message) || "");
    return { q, ok: false };
  }
}

// 동시 호출 수를 제한해서 순서대로 실행 (무료 한도·속도 제한 보호)
export async function runPool(items, worker, size = CONCURRENCY) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await worker(items[k], k); }
  }));
  return out;
}

export async function findRivals(input, qa, ctx) {
  const ok = qa.filter(x => x.ok);
  const material = ok.map((x, i) => `[질문${i + 1}] ${x.q}\n[답변${i + 1}] ${x.text.slice(0, 700)}`).join("\n\n").slice(0, 14000);
  const prompt = `아래는 "${input.region}" "${input.industry}" 관련 질문과 AI 답변입니다. 답변에 실제로 등장한 업체(상호) 중, 업체 "${input.name}"를 제외하고 자주 또는 눈에 띄게 추천된 업체를 최대 6곳 뽑으세요.
- 답변에 없는 업체를 지어내지 마세요. 상호는 답변에 쓰인 그대로 쓰세요.
- 각 업체마다 어떤 질문에서 어떻게 소개됐는지 한 문장(60자 이내)으로 쓰세요.
- 결과는 {"name": 문자열, "why": 문자열} 객체의 JSON 배열만 출력하세요. 해당 업체가 없으면 빈 배열 [].

${material}`;
  try {
    const j = await callModels({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, why: { type: "STRING" } }, required: ["name", "why"] } } },
    }, ctx, "경쟁 업체 정리");
    const arr = parseJsonArray(jsonText(j)) || [];
    const bn = normalize(input.name);
    const answersNorm = normalize(ok.map(x => x.text).join(" "));
    return arr.map(r => ({ name: clean(r && r.name, 40), why: clean(r && r.why, 100) }))
      .filter(r => r.name && r.why && normalize(r.name) !== bn && answersNorm.includes(normalize(r.name)))   // 답변 원문에 없는 이름은 버림
      .slice(0, 6);
  } catch (e) { if (e && e.message === "auth_failed") throw e; return []; }
}

// ---------- 콘텐츠 발행 제안 (AI 제안) ----------
// 입력한 정보(업체명·지역·업종·대표 서비스)만으로 "어떤 주제의 안내 글을 발행하면 좋을지" 제안해요. 측정값이 아니라 AI 의견이에요.
// 이 제안은 사람의 검수 없이 방문자에게 바로 보이므로, 서버가 결과를 걸러서 내보내요(걸리는 항목은 빼고, 남은 주제가 3개 미만이면 제안 전체를 빼요).
//  · 면책 문구·의료 업종 여부·주의 문구는 AI 가 아니라 서버가 채워요.
//  · 병원·의료 업종은 정보형 주제(고를 때 확인할 기준, 방문 전 준비, 상담 절차)만 허용하고,
//    **업체의 대표 서비스(시술명 등)가 들어간 주제는 버려요.** 효과·후기·전후·가격·할인 같은 표현도 버려요.
// 아래 PLAN_BLOCK_TERMS 는 supabase/functions/aeo-draft 의 BLOCK_TERMS 와 같은 목록이에요(시험으로 일치를 확인하니, 한쪽을 고치면 다른 쪽도 고치세요).
export const PLAN_BLOCK_TERMS = ["완치", "100%", "백퍼센트", "부작용없", "부작용이없", "통증없", "무통", "최고", "최상", "최초", "최대", "유일", "독보적", "1위", "국내1", "업계1", "가장좋", "가장뛰어", "보장", "확실한효과", "효과적인", "치료효과", "성공률", "전후사진", "비포애프터", "비포&애프터", "후기", "체험담", "리뷰", "할인", "이벤트", "특가", "무료시술", "공짜", "추천드립니다", "강력추천", "믿고맡"];
const MEDICAL_RE = /병원|의원|한의|한방|치과|클리닉|피부과|성형|정형|내과|외과|산부인과|안과|이비인후과|비뇨|재활|의료|병의원/;
export const isMedical = input => MEDICAL_RE.test([input.industry, input.name, input.service].join(" "));
const normT = t => String(t == null ? "" : t).replace(/\s+/g, "").toLowerCase();
export const serviceTerms = service => String(service || "").split(/[,，·/|]/).map(x => x.trim()).filter(x => normT(x).length >= 2);
export const PLAN_DISCLAIMER = "AI가 입력한 정보만으로 만든 제안이에요. 노출이나 효과를 보장하지 않고, 실제로 발행하기 전에 업체 확인과 사실 점검이 필요해요.";
export const PLAN_MEDICAL_CAUTION = "병원·의료 업종은 의료광고 규정을 고려해, 시술명·효과·후기·가격을 쓰지 않는 정보형 주제만 제안해요. 실제 발행 전에 전문가 확인이 필요해요.";
const NUM_UNIT_T = /\d[\d,.]*\s?(?:원|만원|천원|%|퍼센트|배|명|건|년|개월|일|시간|분|회|개|곳|위|점)/g;

export function buildPlanPrompt(input, questions, medical) {
  const info = [["업체명", input.name], ["지역", input.region], ["업종", input.industry], ["대표 서비스", input.service]].filter(r => r[1]).map(r => `- ${r[0]}: ${r[1]}`).join("\n");
  return `당신은 한국어 콘텐츠 기획자입니다. 아래 [업체 정보]만 보고, 이 업체에 대해 고객이 AI 검색에서 답을 찾을 때 도움이 되는 "안내 글(블로그·웹문서)"의 발행 계획을 제안하세요. 발행 제안이므로 글 본문을 쓰지 마세요.

규칙 (반드시 지키세요):
1. [업체 정보]에 없는 사실(가격·할인·효과·성공률·수상·순위·후기·인원·경력·규모)을 지어내지 마세요. 주제는 고객이 스스로 확인할 기준·질문·준비 사항 중심의 "정보형"으로 쓰세요.
2. 최고·유일·1위·보장·100%·완치·전후·후기·체험담·할인·이벤트처럼 과장·보장·비교하는 표현을 쓰지 마세요. 숫자·링크·전화번호도 쓰지 마세요.
3. 특정 업체를 홍보하거나 상품을 권하지 말고, 중립적으로 쓰세요.${medical ? `
4. 이 업체는 병원·의료 업종입니다. 주제는 "병원을 고를 때 확인할 기준", "방문 전 준비할 것", "상담 절차와 확인할 질문", "진료 시간·예약 확인 방법"처럼 정보형으로만 제안하세요. 시술명·치료명·효과·결과·비교·가격·권유가 들어간 주제는 절대 제안하지 마세요. 대표 서비스에 적힌 시술명은 제목과 설명에 쓰지 마세요.` : ""}

[업체 정보]
${info}

[고객이 AI에게 물을 만한 질문 예시]
${(questions || []).slice(0, 6).map(q => "- " + q).join("\n")}

출력은 JSON 객체 하나만: {"summary": 한 문장 요약, "topics": [{"title": 제목(50자 안팎), "purpose": 이 글의 목적, "question": 이 글이 답하는 고객 질문, "facts": [글에 넣으려면 업체가 확인해 줘야 할 사실 2~3개]}] 5~8개, "formats": [{"name": 글 형식 이름, "desc": 언제 쓰는지}] 3개, "cadence": 발행 순서·빈도 제안 한 문장, "checklist": [발행 전에 준비할 자료] 4~6개}`;
}

// 모델이 돌려준 제안을 걸러서 안전한 것만 남김. 남는 주제가 3개 미만이면 null.
export function sanitizePlan(raw, input, medical) {
  let m; try { m = JSON.parse(String(raw).replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch (_) { return { plan: null, dropped: 0 }; }
  if (!m || typeof m !== "object") return { plan: null, dropped: 0 };
  const allowedN = normT([input.name, input.region, input.industry, input.service].join(" "));
  const svc = medical ? serviceTerms(input.service) : [];
  const arr = v => (Array.isArray(v) ? v : []);
  const bad = text => {                                              // true 면 버림
    const t = String(text || ""), n = normT(t);
    if (PLAN_BLOCK_TERMS.some(k => { const kk = normT(k); return n.includes(kk) && !allowedN.includes(kk); })) return true;
    if (/https?:\/\/|\d{2,4}-\d{3,4}-\d{4}/.test(t)) return true;
    if ((t.match(NUM_UNIT_T) || []).some(x => !allowedN.includes(normT(x)))) return true;
    if (svc.some(k => n.includes(normT(k)))) return true;           // 의료: 시술명 등 대표 서비스가 들어간 문구
    return false;
  };
  let dropped = 0;
  const topics = [];
  for (const t of arr(m.topics).slice(0, 12)) {
    const title = clean(t && t.title, 60), purpose = clean(t && t.purpose, 120), question = clean(t && t.question, 120);
    const facts = arr(t && t.facts).map(f => clean(f, 80)).filter(Boolean).slice(0, 4);
    if (title.length < 8 || !purpose || !question || bad([title, purpose, question, ...facts].join(" "))) { dropped++; continue; }
    topics.push({ title, purpose, question, facts });
    if (topics.length >= 8) break;
  }
  if (topics.length < 3) return { plan: null, dropped };
  const formats = arr(m.formats).map(f => ({ name: clean(f && f.name, 30), desc: clean(f && f.desc, 120) })).filter(f => f.name && f.desc && !bad(f.name + " " + f.desc)).slice(0, 4);
  const checklist = arr(m.checklist).map(x => clean(x, 80)).filter(x => x && !bad(x)).slice(0, 6);
  const cadence = clean(m.cadence, 140), summary = clean(m.summary, 160);
  return {
    plan: { summary: summary && !bad(summary) ? summary : "", topics, formats, cadence: cadence && !bad(cadence) ? cadence : "", checklist, medical, caution: medical ? PLAN_MEDICAL_CAUTION : "", disclaimer: PLAN_DISCLAIMER },
    dropped,
  };
}

export async function makePlan(input, questions, ctx) {
  try {
    const medical = isMedical(input);
    const j = await callModels({ contents: [{ role: "user", parts: [{ text: buildPlanPrompt(input, questions, medical) }] }], generationConfig: { temperature: 0.5, responseMimeType: "application/json" } }, ctx, "발행 제안");
    return sanitizePlan(jsonText(j), input, medical).plan;
  } catch (_) { return null; }                                       // 제안은 덤이라, 실패해도 진단은 계속
}

export async function diagnose(input, ctx) {
  const qs = await makeQuestions(input, ctx);
  const qa = await runPool(qs, q => askOne(q, input, ctx), (ctx && ctx.concurrency) || CONCURRENCY);
  { const n = qa.filter(x => x.ok).length; if (n < Math.min(3, qs.length)) throw new UpErr("too_few", 200, "답변을 받은 질문이 " + n + "개뿐" + (ctx.lastErr ? " · 마지막 오류: " + ctx.lastErr : "")); }
  const rivals = await findRivals(input, qa, ctx);
  const plan = await makePlan(input, qs, ctx);                       // 콘텐츠 발행 제안(없을 수 있음)
  return { ...aggregate(input, qa, rivals), plan };
}

// ---------- 요청 처리 (의존 대상을 바깥에서 받아 시험하기 쉽게 분리) ----------
export async function handle(req, deps) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const input = parseInput(body);
  if (input.error) return json({ error: input.error }, 400);
  const { apiKey, model } = deps.config();
  if (!apiKey) return json({ error: "not_configured" }, 503);          // 키가 없으면 외부 호출을 하지 않음

  const key = cacheKey(input.name, input.region, input.industry);
  const cached = await deps.cached(key);
  if (cached) return json({ result: cached, cached: true });

  const ipHash = await deps.ipHash(req);
  const rsv = await deps.reserve(ipHash, key, input);                    // 한도 확인 + 자리 예약 (Gemini 호출 전)
  if (!rsv || !rsv.ok) return json({ error: (rsv && rsv.reason) || "limit" }, 429);
  try {
    const result = await deps.run(input, { apiKey, model, fetch: deps.fetch, questions: deps.questions && deps.questions(), concurrency: deps.concurrency && deps.concurrency() });
    await deps.finish(rsv.id, "ok", result);
    return json({ result, cached: false });
  } catch (e) {
    await deps.finish(rsv.id, "failed", null).catch(() => {});
    const code = ["auth_failed", "rate_limited", "timeout", "network", "too_few"].includes(e && e.message) ? e.message : "api_error";
    return json({ error: code, upstream: (e && e.status) || null, detail: (e && e.detail) || null }, code === "rate_limited" ? 429 : 502);
  }
}

async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function realDeps() {
  const env = k => Deno.env.get(k);
  const URL_ = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  const rpc = async (fn, args) => {
    const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error("db_error");
    const t = await r.text(); return t ? JSON.parse(t) : null;
  };
  const num = (k, d) => { const n = parseInt(env(k) || "", 10); return n > 0 ? n : d; };
  return {
    config: () => ({ apiKey: env("GEMINI_API_KEY"), model: env("GEMINI_MODEL") || "gemini-3.8-flash" }),
    fetch,
    run: diagnose,
    questions: () => num("DIAGNOSE_QUESTIONS", QUESTION_COUNT),
    concurrency: () => num("DIAGNOSE_CONCURRENCY", CONCURRENCY),
    cached: key => rpc("get_cached_diagnose", { p_key: key }),
    async ipHash(req) {
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
      return sha256Hex(ip + "|" + (env("IP_HASH_SALT") || KEY));
    },
    reserve: (ip, key, i) => rpc("reserve_diagnose", { p_ip: ip, p_key: key, p_brand: i.name, p_region: i.region, p_industry: i.industry, p_ip_limit: num("DIAGNOSE_IP_LIMIT", 1), p_global_limit: num("DIAGNOSE_DAILY_LIMIT", 100) }),
    finish: (id, status, result) => rpc("finish_diagnose", { p_id: id, p_status: status, p_result: result }),
  };
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(async req => {
    try { return await handle(req, realDeps()); }
    catch (e) { return json({ error: "server_error", detail: redact(e && e.message) }, 500); }
  });
}
