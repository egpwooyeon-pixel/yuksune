// Supabase Edge Function: 리뷰 기반 AI 블로그 원고 만들기 + 수정 저장
//
// [업체 정보] + [실제 리뷰 텍스트] + [리뷰 사진 URL]을 바탕으로 Gemini 가 블로그 원고(JSON)를 쓰고
// review_drafts 에 저장합니다. 리뷰·사진은 크롬 확장프로그램(네이버/구글 리뷰 수집 도구)으로 모은 뒤
// CSV 에서 옮겨 붙이는 것을 전제로 합니다 — 이 함수는 리뷰를 직접 수집하지 않습니다.
//
// 누가 쓸 수 있나 (rank.html "내 플레이스 순위확인하기" 와 같은 등급 구조)
//  · 운영자(profiles.role = 'admin'): 전부 가능. 일일 한도 없음. 수정 저장(action:"save")도 운영자만.
//  · 사업자 인증 승인 회원(profiles.business_status = 'approved'): 원고 생성(action 없음/"generate")만 가능,
//    하루 REVIEW_DRAFT_DAILY_LIMIT(기본 5)건까지. 수정 저장은 못 함 — 생성된 원고를 그대로 복사해서 쓰는
//    용도예요.
//  · 그 외(비로그인·미인증 회원): 403.
//  · 조회(review_drafts 읽기)는 이 함수가 아니라 DB RLS(028_review_drafts_member.sql)가 처리해요 —
//    운영자는 전체, 회원은 자기가 만든 것만.
//
// 지켜야 할 것
//  · 호출자의 로그인(JWT)을 확인하고 profiles 에서 role·business_status 를 읽어요. 아니면 403.
//  · 리뷰에 없는 내용(가격·효능·순위 등)은 지어내지 말라고 AI 에게 지시해요. guide_drafts(EGP) 와 달리
//    과장·금지어 자동 차단은 하지 않아요 — 손님 후기 기반 홍보 원고는 의료광고 같은 규제 대상이 아니라서,
//    최종 문구 확인은 사람 눈으로 합니다(회원이 직접 쓰는 경우엔 본인이, 운영자 화면에서는 운영자가).
//  · 비밀값: GEMINI_API_KEY (aeo-draft 와 같은 키를 씁니다). 선택: GEMINI_MODEL(쉼표로 여러 개 가능, 기본
//    gemini-3.8-flash), REVIEW_DRAFT_DAILY_LIMIT(회원 1인당 하루 생성 한도, 기본 5 — 공유 Gemini 무료
//    티어 한도를 회원 여러 명이 동시에 쓰면 금방 소진되는 걸 막기 위함)
//  · "승인"(운영자 화면의 검수 완료)은 발행이 아니라 검수 기록이에요 — 이 서비스는 발행 파이프라인이 없고,
//    원고를 복사해서 네이버 블로그 등에 직접 올리는 걸 전제로 합니다.
//
// 아직 실제 Gemini·실제 Supabase 로는 실행해 보지 않았습니다. 모의 응답으로 시험했습니다.

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...CORS } });
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max);
export const safeUrl = u => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.toString() : ""; } catch (_) { return ""; } };

const MAX_REVIEWS = 60;
const MAX_PHOTOS = 15;

// ---------- 입력 ----------
export function parseInput(b) {
  const bi = (b && b.business) || {};
  const business = { name: clean(bi.name, 60), area: clean(bi.area, 40), category: clean(bi.category, 40), signatureMenu: clean(bi.signatureMenu, 120) };
  if (business.name.length < 2) return { error: "bad_name" };
  const reviews = (Array.isArray(b && b.reviews) ? b.reviews : []).map(x => clean(x, 500)).filter(Boolean).slice(0, MAX_REVIEWS);
  if (reviews.length < 1) return { error: "need_reviews" };          // 리뷰가 없으면 AI 가 지어내므로 최소 1개 필요(권장은 여러 건)
  const photoUrls = [];
  for (const u of (Array.isArray(b && b.photoUrls) ? b.photoUrls : []).slice(0, MAX_PHOTOS)) {
    const url = safeUrl(u);
    if (u && !url) return { error: "bad_photo_url" };
    if (url) photoUrls.push(url);
  }
  const customInstructions = clean(b && b.customInstructions, 500);
  return { business, reviews, photoUrls, customInstructions };
}

// ---------- 프롬프트 ----------
// background.js(크롬 확장프로그램) 의 buildBlogDraftParts 와 같은 설계(요청 JSON 스키마, 사진을 실제
// 이미지로 함께 보내 캡션이 사진 내용과 맞도록) — 이 세션에서 이미 검증한 프롬프트를 그대로 옮겼어요.
export function buildParts(input) {
  const b = input.business;
  const hasPhotos = input.photoUrls.length > 0;
  const reviewBlock = input.reviews.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const parts = [{
    text: `당신은 실제 방문 경험을 바탕으로 자연스러운 블로그 후기를 쓰는 한국어 블로거입니다. 아래는 "${b.name}"(${b.area}, ${b.category})에 실제로 달린 리뷰 ${input.reviews.length}건입니다. 이 리뷰들에 공통적으로 나타나는 표현과 평가만 근거로 사용하세요 — 리뷰에 없는 내용(가격, 효능, 순위 등)을 지어내지 마세요.

[리뷰 목록]
${reviewBlock}
${b.signatureMenu ? `\n[참고: 알려준 시그니처 메뉴] ${b.signatureMenu}\n` : ""}${input.customInstructions ? `\n[운영자의 추가 요청사항 — 반드시 반영할 것] ${input.customInstructions}\n` : ""}`,
  }];
  return { parts, hasPhotos };
}

export function finishParts(parts, hasPhotos, photoDatas, photoCount) {
  if (hasPhotos) {
    parts.push({ text: `\n아래에 사진 ${photoCount}장이 번호 순서(1~${photoCount})대로 첨부되어 있습니다. 설명 문구는 반드시 그 사진에 실제로 보이는 내용을 바탕으로 작성하세요.\n` });
    photoDatas.forEach((d, i) => {
      parts.push({ text: `사진 ${i + 1}:` });
      parts.push(d ? { inlineData: d } : { text: "(이 사진은 불러오지 못했습니다 — 리뷰 내용만 참고해 무난하게 작성)" });
    });
  }
  parts.push({
    text: `
다음 작업을 수행하고, 다른 설명 없이 아래 JSON 형식으로만 답하세요(마크다운 코드블록 없이 순수 JSON 하나만):

{
  "requiredKeywords": ["지역+업종 조합 등 블로그 제목/본문에 꼭 들어가야 하는 키워드 2~4개"],
  "goodKeywords": ["리뷰에서 반복적으로 나타나는 긍정 표현 3~6개"],
  "signatureMenu": ["리뷰에 자주 언급된 구체적 메뉴/상품 이름 1~5개"],
  "titles": ["검색에 잘 걸릴 만한 블로그 제목 후보 3개. 각 25~40자 내외, 서로 다른 조합/느낌으로"],
  "hashtags": ["해시태그 10~15개, 전부 '#단어' 형태(띄어쓰기 없이 붙여쓰기), 중복 없이"],
  "draft": "실제 1인칭 방문 후기 톤의 블로그 본문 전체 텍스트.${
    hasPhotos
      ? ` 문단을 충분히 나누고 각 문단 사이에 [사진 삽입: N] 마커를 한 줄로 넣어 총 ${photoCount}개(1부터 ${photoCount}까지 모두, 중복·누락 없이)를 사진 순서와 맞춰 배치. 1500~2500자 내외.`
      : " 800~1200자 내외."
  } 과장 광고 문구 없이 자연스럽게 위 키워드들을 녹여서 작성."${
    hasPhotos ? `,\n  "photoCaptions": ["사진 1부터 ${photoCount}까지 순서대로, 각 사진에 실제로 보이는 내용을 바탕으로 한 짧은 설명 문구(5~15자 내외) ${photoCount}개"]` : ""
  }
}`,
  });
  return parts;
}

// ---------- Gemini 호출 (aeo-draft 와 같은 재시도 방식: 모델 목록을 순서대로, 503/시간초과는 재시도) ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function callGemini(body, models, apiKey, fetchImpl = fetch) {
  let last;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 90000);
      try {
        const r = await fetchImpl(GEMINI_BASE + encodeURIComponent(model) + ":generateContent", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body), signal: ctl.signal });
        clearTimeout(to);
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error("auth_failed"), { fatal: true });
        if (r.status === 400) { const t = await r.text().catch(() => ""); throw Object.assign(new Error(/api key/i.test(t) ? "auth_failed" : "api_error"), { fatal: true }); }
        if (r.status === 429) throw Object.assign(new Error("rate_limited"), { fatal: true });
        if (r.status === 503 || r.status >= 500) { last = new Error("api_error"); await sleep(1500 * (attempt + 1)); continue; }
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

// 이미지를 Gemini inline_data 형식으로. 청크 단위 base64 인코딩(큰 이미지가 호출 인자 수 제한에
// 걸리지 않도록) — 크롬 확장프로그램의 fetchImageInlineData 와 같은 방식.
export async function fetchPhoto(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  return { mimeType, data: btoa(binary) };
}

// ---------- 모델 출력 → 원고 JSON ----------
export function assemble(model, input) {
  let m; try { m = JSON.parse(String(model).replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch (_) { return null; }
  if (!m || typeof m !== "object" || typeof m.draft !== "string" || !m.draft.trim()) return null;
  const arr = v => (Array.isArray(v) ? v : []);
  const photoCount = input.photoUrls.length;
  let photoCaptions = arr(m.photoCaptions).slice(0, photoCount).map(c => clean(c, 60));
  while (photoCaptions.length < photoCount) photoCaptions.push("");
  return {
    requiredKeywords: arr(m.requiredKeywords).slice(0, 6).map(x => clean(x, 40)).filter(Boolean),
    goodKeywords: arr(m.goodKeywords).slice(0, 10).map(x => clean(x, 40)).filter(Boolean),
    signatureMenu: arr(m.signatureMenu).slice(0, 8).map(x => clean(x, 40)).filter(Boolean),
    titles: arr(m.titles).slice(0, 5).map(x => clean(x, 80)).filter(Boolean),
    hashtags: arr(m.hashtags).map(x => clean(x, 30)).filter(Boolean).map(x => (x.startsWith("#") ? x : "#" + x)).slice(0, 20),
    draft: clean(m.draft, 4000),
    photoCaptions,
  };
}

// ---------- 요청 처리 (aeo-draft 와 같은 의존성 주입 방식 — tests/node 에서 그대로 시험) ----------
export async function handle(req, deps) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const actor = await deps.actor(req.headers.get("authorization") || "");
  if (!actor || !(actor.isAdmin || actor.approved)) return json({ error: actor ? "not_approved" : "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  if (body && body.action === "save") {
    if (!actor.isAdmin) return json({ error: "forbidden" }, 403);        // 수정 저장은 운영자만
    return save(body, deps);
  }
  return generate(body, actor, deps);
}

async function generate(body, actor, deps) {
  const input = parseInput(body);
  if (input.error) return json({ error: input.error }, 400);
  const { apiKey, models, dailyLimit } = deps.config();
  if (!apiKey) return json({ error: "not_configured" }, 503);
  if (!actor.isAdmin) {
    const used = await deps.countToday(actor.id);
    if (used >= dailyLimit) return json({ error: "daily_limit", limit: dailyLimit }, 429);
  }

  const photoDatas = await Promise.all(input.photoUrls.map(u => deps.fetchPhoto(u).catch(() => null)));
  const { parts, hasPhotos } = buildParts(input);
  finishParts(parts, hasPhotos, photoDatas, input.photoUrls.length);

  let text;
  try { text = await deps.gemini({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.6 } }, models, apiKey); }
  catch (e) { const c = e && e.message; return json({ error: ["auth_failed", "timeout", "network", "rate_limited"].includes(c) ? c : "api_error" }, 502); }

  const draft = assemble(text, input);
  if (!draft) return json({ error: "bad_model_output" }, 502);
  const row = await deps.insert({ kind: "blog", business: input.business, reviews: input.reviews, photo_urls: input.photoUrls, draft, model: models[0] || null, created_by: actor.id });
  return json({ id: row.id, draft });
}

// 운영자가 고친 원고 저장: 초안 상태일 때만. 업체 정보·리뷰·사진 URL 은 저장된 값을 유지(화면에서 바꾸지 못함).
async function save(body, deps) {
  const id = Number.isInteger(body.id) && body.id > 0 ? body.id : null;
  if (!id) return json({ error: "bad_id" }, 400);
  const row = await deps.get(id);
  if (!row) return json({ error: "not_found" }, 404);
  if (row.status !== "draft") return json({ error: "not_draft" }, 409);
  const e = body.draft || {}, arr = v => (Array.isArray(v) ? v : []);
  const photoCount = (row.photo_urls || []).length;
  let photoCaptions = arr(e.photoCaptions).slice(0, photoCount).map(c => clean(c, 60));
  while (photoCaptions.length < photoCount) photoCaptions.push("");
  const draft = clean(e.draft, 4000);
  if (!draft) return json({ error: "need_draft_text" }, 422);
  const d = {
    requiredKeywords: arr(e.requiredKeywords).slice(0, 6).map(x => clean(x, 40)).filter(Boolean),
    goodKeywords: arr(e.goodKeywords).slice(0, 10).map(x => clean(x, 40)).filter(Boolean),
    signatureMenu: arr(e.signatureMenu).slice(0, 8).map(x => clean(x, 40)).filter(Boolean),
    titles: arr(e.titles).slice(0, 5).map(x => clean(x, 80)).filter(Boolean),
    hashtags: arr(e.hashtags).map(x => clean(x, 30)).filter(Boolean).map(x => (x.startsWith("#") ? x : "#" + x)).slice(0, 20),
    draft, photoCaptions,
  };
  await deps.update(id, { draft: d, updated_at: new Date().toISOString() });
  return json({ id, draft: d });
}

function realDeps() {
  const env = k => Deno.env.get(k), URL_ = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  const h = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  return {
    config: () => ({
      apiKey: env("GEMINI_API_KEY"),
      models: String(env("GEMINI_MODEL") || "gemini-3.8-flash").split(",").map(x => x.trim()).filter(Boolean),
      dailyLimit: Math.max(1, parseInt(env("REVIEW_DRAFT_DAILY_LIMIT"), 10) || 5),
    }),
    gemini: (body, models, key) => callGemini(body, models, key),
    fetchPhoto: url => fetchPhoto(url),
    async actor(authHeader) {                                          // 로그인한 사람의 role·사업자 인증 상태 확인 (읽기만 함)
      if (!authHeader) { console.error("review-draft actor: no authorization header on request"); return null; }
      const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: authHeader } });
      if (!u.ok) { console.error("review-draft actor: /auth/v1/user rejected the token", u.status, await u.text().catch(() => "")); return null; }
      const { id } = await u.json();
      const p = await fetch(`${URL_}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=role,business_status`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
      const rows = p.ok ? await p.json() : [];
      const row = rows[0];
      if (!row) { console.error("review-draft actor: no profiles row for authenticated user", id, "rest status", p.status); return null; }
      return { id, isAdmin: row.role === "admin", approved: row.business_status === "approved" };
    },
    async countToday(ownerId) {                                        // 오늘(UTC 자정 기준) 그 회원이 만든 원고 수
      const since = new Date(); since.setUTCHours(0, 0, 0, 0);
      const r = await fetch(`${URL_}/rest/v1/review_drafts?select=id&created_by=eq.${encodeURIComponent(ownerId)}&created_at=gte.${since.toISOString()}`, { headers: { ...h, prefer: "count=exact", range: "0-0" } });
      const range = r.headers.get("content-range") || "";             // 형식: "0-0/7"
      const m = /\/(\d+)$/.exec(range);
      return m ? parseInt(m[1], 10) : 0;
    },
    async insert(row) {
      const r = await fetch(`${URL_}/rest/v1/review_drafts`, { method: "POST", headers: { ...h, prefer: "return=representation" }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error("db_error");
      return (await r.json())[0];
    },
    async get(id) { const r = await fetch(`${URL_}/rest/v1/review_drafts?id=eq.${id}&select=*`, { headers: h }); const rows = r.ok ? await r.json() : []; return rows[0] || null; },
    async update(id, patch) { const r = await fetch(`${URL_}/rest/v1/review_drafts?id=eq.${id}&status=eq.draft`, { method: "PATCH", headers: h, body: JSON.stringify(patch) }); if (!r.ok) throw new Error("db_error"); },
  };
}
if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(async req => { try { return await handle(req, realDeps()); } catch (_) { return json({ error: "server_error" }, 500); } });
}
