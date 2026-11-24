// Supabase Edge Function: AI 노출 진단 (Gemini API + 구글 검색 연동)
//
// 업체명·지역·업종(·홈페이지)을 받아
//   1) Gemini 로 "이 업종·지역을 찾는 고객이 AI에게 물어볼 질문" 10개를 만들고
//   2) 질문마다 Gemini(google_search 연동)에 물어 답변과 출처를 받은 뒤
//   3) 답변에 업체명이 나왔는지(멘션), 출처에 자사 홈페이지가 있었는지(인용), 어떤 출처·경쟁 업체가 나왔는지 집계합니다.
//   결과는 diagnose.html 의 리포트 데이터 형식으로 돌려줍니다.
//
// 비밀값(Supabase > Edge Functions > Secrets): GEMINI_API_KEY (필수)
//   선택: GEMINI_MODEL(기본 gemini-2.5-flash), IP_HASH_SALT, DIAGNOSE_IP_LIMIT(기본 3), DIAGNOSE_DAILY_LIMIT(기본 100)
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
const QUESTION_COUNT = 10;
const CONCURRENCY = 3;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...CORS } });

// 오류 문구에 키가 섞이지 않게 가림
export function redact(s, secrets = []) {
  let out = String(s == null ? "" : s);
  for (const k of secrets) if (k) out = out.split(k).join("***");
  return out.replace(/[A-Za-z0-9_-]{24,}/g, "***").slice(0, 160);
}

// ---------- 입력 검사·정규화 ----------
const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export function parseInput(b) {
  const name = clean(b && b.name, 60), region = clean(b && b.region, 40), industry = clean(b && b.industry, 40);
  let url = clean(b && b.url, 200), host = "";
  if (url) {
    try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw 0; host = u.hostname.toLowerCase().replace(/^www\./, ""); } catch (_) { return { error: "bad_url" }; }
  }
  if (name.length < 2) return { error: "bad_name" };
  if (!region || !industry) return { error: "need_region_industry" };
  return { name, region, industry, url, host };
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
export async function callGemini(body, model, apiKey, fetchImpl = fetch, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 45000);
    let r;
    try {
      r = await fetchImpl(GEMINI_BASE + encodeURIComponent(model) + ":generateContent", {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body), signal: ctl.signal,
      });
    } catch (e) { clearTimeout(to); if (attempt < retries) { await sleep(1500 * (attempt + 1)); continue; } throw new Error(e && e.name === "AbortError" ? "timeout" : "network"); }
    clearTimeout(to);
    if (r.status === 401 || r.status === 403) throw new Error("auth_failed");
    if (r.status === 400) {                                           // 잘못된 키는 400("API key not valid")으로 오는 것으로 알려져 있어 문구로 구분
      const t = await r.text().catch(() => "");
      throw new Error(/api key|api_key/i.test(t) ? "auth_failed" : "api_error");
    }
    if ((r.status === 429 || r.status >= 500) && attempt < retries) { await sleep(2000 * (attempt + 1)); continue; }
    if (r.status === 429) throw new Error("rate_limited");
    if (!r.ok) throw new Error("api_error");
    try { return await r.json(); } catch (_) { throw new Error("api_error"); }
  }
}

const jsonText = j => parseAnswer(j).text;
function parseJsonArray(text) {
  const t = String(text || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try { const v = JSON.parse(t); return Array.isArray(v) ? v : null; } catch (_) { return null; }
}

export async function makeQuestions(input, ctx) {
  const prompt = `당신은 한국의 일반 소비자입니다. "${input.region}" 지역에서 "${input.industry}" 업체를 찾는 사람이 AI 검색(챗봇)에 실제로 입력할 만한 질문을 ${QUESTION_COUNT}개 만드세요.
- 특정 업체 이름을 넣지 마세요. (예: "강남에서 ~ 찾아줘" 같은 탐색 질문)
- 서로 다른 조건(가격대, 분위기, 규모, 접근성, 후기, 예약 등)을 섞고, 자연스러운 한국어 한 문장으로 쓰세요.
- 결과는 문자열 ${QUESTION_COUNT}개로 이뤄진 JSON 배열만 출력하세요.`;
  const j = await callGemini({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } },
  }, ctx.model, ctx.apiKey, ctx.fetch);
  const arr = parseJsonArray(jsonText(j));
  const qs = (arr || []).map(q => clean(q, 120)).filter(q => q.length >= 6);
  const uniq = [...new Set(qs)].slice(0, QUESTION_COUNT);
  if (uniq.length < 5) throw new Error("api_error");
  return uniq;
}

async function askOne(q, input, ctx) {
  try {
    const j = await callGemini({
      contents: [{ role: "user", parts: [{ text: q + "\n(한국어로 답변해 주세요.)" }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.3 },
    }, ctx.model, ctx.apiKey, ctx.fetch);
    const { text, domains } = parseAnswer(j);
    if (!text) return { q, ok: false };
    return { q, ok: true, text, domains, mentioned: mentions(text, input.name), cited: domains.some(d => isOwn(d, input.host)) };
  } catch (e) {
    if (e && e.message === "auth_failed") throw e;                    // 키 문제는 전체 중단
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
    const j = await callGemini({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, why: { type: "STRING" } }, required: ["name", "why"] } } },
    }, ctx.model, ctx.apiKey, ctx.fetch);
    const arr = parseJsonArray(jsonText(j)) || [];
    const bn = normalize(input.name);
    const answersNorm = normalize(ok.map(x => x.text).join(" "));
    return arr.map(r => ({ name: clean(r && r.name, 40), why: clean(r && r.why, 100) }))
      .filter(r => r.name && r.why && normalize(r.name) !== bn && answersNorm.includes(normalize(r.name)))   // 답변 원문에 없는 이름은 버림
      .slice(0, 6);
  } catch (e) { if (e && e.message === "auth_failed") throw e; return []; }
}

export async function diagnose(input, ctx) {
  const qs = await makeQuestions(input, ctx);
  const qa = await runPool(qs, q => askOne(q, input, ctx));
  if (qa.filter(x => x.ok).length < 5) throw new Error("too_few");
  const rivals = await findRivals(input, qa, ctx);
  return aggregate(input, qa, rivals);
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
    const result = await deps.run(input, { apiKey, model, fetch: deps.fetch });
    await deps.finish(rsv.id, "ok", result);
    return json({ result, cached: false });
  } catch (e) {
    await deps.finish(rsv.id, "failed", null).catch(() => {});
    const code = ["auth_failed", "rate_limited", "timeout", "network", "too_few"].includes(e && e.message) ? e.message : "api_error";
    return json({ error: code }, code === "rate_limited" ? 429 : 502);
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
    config: () => ({ apiKey: env("GEMINI_API_KEY"), model: env("GEMINI_MODEL") || "gemini-2.5-flash" }),
    fetch,
    run: diagnose,
    cached: key => rpc("get_cached_diagnose", { p_key: key }),
    async ipHash(req) {
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
      return sha256Hex(ip + "|" + (env("IP_HASH_SALT") || KEY));
    },
    reserve: (ip, key, i) => rpc("reserve_diagnose", { p_ip: ip, p_key: key, p_brand: i.name, p_region: i.region, p_industry: i.industry, p_ip_limit: num("DIAGNOSE_IP_LIMIT", 3), p_global_limit: num("DIAGNOSE_DAILY_LIMIT", 100) }),
    finish: (id, status, result) => rpc("finish_diagnose", { p_id: id, p_status: status, p_result: result }),
  };
}

if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(async req => {
    try { return await handle(req, realDeps()); }
    catch (e) { return json({ error: "server_error", detail: redact(e && e.message) }, 500); }
  });
}
