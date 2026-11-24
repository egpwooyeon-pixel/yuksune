// Supabase Edge Function: 홈페이지 주소로 업체 정보 자동 채우기
//
// 방문자가 입력한 홈페이지 주소를 서버가 한 번 읽어(HTML만), 아래 항목을 추려 돌려줍니다.
//   업체명 · 주소/지역 · 업종(추정) · 대표 서비스(소개 문구)
// 읽는 곳: JSON-LD(schema.org) > og/meta 태그 > <title> > 본문 속 한국 주소 형태. 페이지 내용 자체는 돌려주지 않습니다.
//
// 지켜야 할 것
//  · 서버가 "남이 입력한 주소"로 접속하는 기능이라 내부망·메타데이터 주소로의 접근을 막습니다(SSRF 방어).
//      - http/https, 기본 포트만 / 주소에 IP·localhost·내부 도메인이면 거절 / 사용자 정보(user:pass@) 거절
//      - 리다이렉트는 직접 따라가며(최대 3번) 매번 같은 검사를 다시 함
//      - DNS 를 조회할 수 있으면 사설·루프백·링크로컬 IP 로 풀리는 주소도 거절 (조회 후 접속 사이의 DNS 변조까지는 막지 못함)
//  · 응답 크기 600KB·시간 8초 제한, text/html 만 읽음. 외부 AI(Gemini)는 쓰지 않아 키가 필요 없음.
//  · IP(해시값)당 시간당 횟수 제한(기본 20). 한도는 DB(023_prefill.sql)에서 셈.
//  · 네이버 플레이스·지도 주소(naver.com, naver.me)는 지원하지 않음 (동적 화면·이용 약관 문제).
//
// 아직 실제 홈페이지로는 실행해 보지 않았습니다(이 개발 환경에서 외부 접속 불가). 시험용 HTML·모의 응답으로 시험했습니다.
// 홈페이지마다 구조가 달라 못 읽는 경우가 있습니다. 읽지 못한 항목은 비워 두고, 사용자가 직접 입력합니다.

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...CORS } });
const MAX_BYTES = 600 * 1024, TIMEOUT_MS = 8000, MAX_REDIRECTS = 3;

export class PrefillErr extends Error { constructor(code, status) { super(code); this.status = status || null; } }

// ---------- SSRF 방어 ----------
export function isPrivateIp(ip) {
  const s = String(ip || "").toLowerCase();
  if (s.includes(":")) {                                              // IPv6
    if (s === "::" || s === "::1") return true;
    if (/^f[cd]/.test(s) || /^fe[89ab]/.test(s)) return true;         // 고유 로컬(fc00::/7), 링크 로컬(fe80::/10)
    const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);                // IPv4 매핑
    return m ? isPrivateIp(m[1]) : false;
  }
  const p = s.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;   // 이상한 형태는 거절
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
const BAD_SUFFIX = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".private", ".test", ".invalid", ".example"];
export function checkUrl(raw) {                                         // 통과하면 URL 객체, 아니면 PrefillErr
  let u;
  try { u = new URL(String(raw || "").trim()); } catch (_) { throw new PrefillErr("bad_url"); }
  if (!/^https?:$/.test(u.protocol)) throw new PrefillErr("bad_url");
  if (u.username || u.password) throw new PrefillErr("blocked_url");
  if (u.port && u.port !== "80" && u.port !== "443") throw new PrefillErr("blocked_url");
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!h || h.includes(":") || h === "localhost" || !h.includes(".")) throw new PrefillErr("blocked_url");   // IPv6 주소·내부 이름
  const tld = h.split(".").pop();
  if (/^\d+$/.test(tld) || /^0x/i.test(tld)) throw new PrefillErr("blocked_url");                           // IPv4 주소(여러 표기 포함)
  if (BAD_SUFFIX.some(x => h.endsWith(x))) throw new PrefillErr("blocked_url");
  if (!/^[a-z0-9.\-¡-￿]+$/i.test(h)) throw new PrefillErr("blocked_url");
  return u;
}
export const isNaverHost = h => /(^|\.)naver\.(com|me)$/i.test(String(h || ""));

async function assertResolvesPublic(host, resolve) {
  if (!resolve) return;                                               // DNS 조회를 쓸 수 없는 환경이면 건너뜀
  const ips = [];
  for (const t of ["A", "AAAA"]) { try { ips.push(...await resolve(host, t)); } catch (_) {} }
  if (!ips.length) throw new PrefillErr("fetch_failed");
  if (ips.some(isPrivateIp)) throw new PrefillErr("blocked_url");
}

// ---------- 페이지 읽기 ----------
async function readLimited(res, max) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) { const b = new Uint8Array(await res.arrayBuffer()); if (b.length > max) throw new PrefillErr("too_large"); return b; }
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.length; if (total > max) { try { await reader.cancel(); } catch (_) {} throw new PrefillErr("too_large"); }
    chunks.push(value);
  }
  const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out;
}
function decodeBody(bytes, contentType) {
  let cs = (String(contentType || "").match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!cs) { const head = new TextDecoder("latin1").decode(bytes.slice(0, 2048)); cs = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1]; }
  try { return new TextDecoder((cs || "utf-8").toLowerCase()).decode(bytes); } catch (_) { return new TextDecoder("utf-8").decode(bytes); }
}
export async function fetchPage(rawUrl, { fetchImpl = fetch, resolve } = {}) {
  let u = checkUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (isNaverHost(u.hostname)) throw new PrefillErr("unsupported_naver");
    await assertResolvesPublic(u.hostname, resolve);
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(u.toString(), { redirect: "manual", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; EGPInfoPrefill/1.0)", accept: "text/html,application/xhtml+xml", "accept-language": "ko,en;q=0.8" } });
    } catch (e) { clearTimeout(to); throw new PrefillErr("fetch_failed"); }
    try {
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location"); if (!loc) throw new PrefillErr("fetch_failed");
        u = checkUrl(new URL(loc, u).toString());                     // 이동한 주소도 처음과 같은 검사를 다시 거침
        continue;
      }
      if (!res.ok) throw new PrefillErr("fetch_failed", res.status);
      const ct = res.headers.get("content-type") || "";
      if (!/html|xml/i.test(ct)) throw new PrefillErr("not_html");
      const len = Number(res.headers.get("content-length") || 0); if (len > MAX_BYTES) throw new PrefillErr("too_large");
      return { html: decodeBody(await readLimited(res, MAX_BYTES), ct), finalUrl: u.toString() };
    } finally { clearTimeout(to); }
  }
  throw new PrefillErr("fetch_failed");                               // 이동이 너무 많음
}

// ---------- 정보 추리기 (순수 함수) ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeEntities = s => String(s == null ? "" : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (_) { return " "; } }
  return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
});
const tidy = (s, max) => decodeEntities(s).replace(/\s+/g, " ").trim().slice(0, max);

function metaMap(html) {
  const map = {};
  for (const m of html.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
    const attrs = {}; for (const a of m[1].matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = a[2] != null ? a[2] : a[3];
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content != null && map[key] == null) map[key] = attrs.content;
  }
  return map;
}
function jsonLdNodes(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { out.push(v); if (v["@graph"]) walk(v["@graph"]); } };
      walk(JSON.parse(m[1].trim()));
    } catch (_) {}
  }
  return out;
}
const BIZ_TYPE = /(LocalBusiness|MedicalBusiness|MedicalClinic|Hospital|Physician|Dentist|Restaurant|CafeOrCoffeeShop|FoodEstablishment|Store|HealthAndBeautyBusiness|BeautySalon|Organization|Corporation)/i;
const addrText = a => {
  if (!a) return "";
  if (typeof a === "string") return a;
  if (Array.isArray(a)) return addrText(a[0]);
  return [a.addressRegion, a.addressLocality, a.streetAddress].filter(Boolean).join(" ");
};

const SIDO = "(?:서울특별시|서울시|서울|부산광역시|부산|대구광역시|대구|인천광역시|인천|광주광역시|광주|대전광역시|대전|울산광역시|울산|세종특별자치시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)";
const ADDR_RE = new RegExp(SIDO + "\\s*[가-힣]{1,6}(?:시|군|구)(?:\\s*[가-힣]{1,6}구)?\\s*[가-힣0-9]{1,15}(?:대로|로|길)\\s*\\d{1,4}(?:-\\d{1,4})?");
const SIDO_SHORT = { 서울특별시: "서울", 서울시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천", 광주광역시: "광주", 대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종", 경기도: "경기", 강원특별자치도: "강원", 강원도: "강원", 충청북도: "충북", 충청남도: "충남", 전북특별자치도: "전북", 전라북도: "전북", 전라남도: "전남", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주", 제주도: "제주" };
export function regionOf(address) {                                    // "서울특별시 강남구 테헤란로 115" → "서울 강남구"
  const t = String(address || "").trim().split(/\s+/); if (!t.length) return "";
  const out = []; let i = 0;
  if (new RegExp("^" + SIDO + "$").test(t[0])) { out.push(SIDO_SHORT[t[0]] || t[0]); i = 1; }
  while (i < t.length && /[가-힣]{1,6}(시|군|구)$/.test(t[i]) && out.length < 3) { out.push(t[i]); i++; }
  return out.join(" ");
}

const INDUSTRY = [
  ["병의원", ["병원", "의원", "한의원", "한방", "성형외과", "피부과", "치과", "정형외과", "내과", "외과", "클리닉", "산부인과", "안과", "이비인후과", "비뇨", "재활", "의료", "진료"]],
  ["웨딩홀", ["웨딩", "예식", "결혼식", "웨딩홀"]],
  ["음식점", ["맛집", "레스토랑", "식당", "카페", "커피", "베이커리", "이자카야", "술집", "고기", "한식", "양식", "중식", "일식", "오마카세", "브런치", "다이닝"]],
  ["쇼핑몰", ["쇼핑몰", "스토어", "공식몰", "장바구니", "무료배송", "상품", "스마트스토어"]],
];
export function guessIndustry(text) {
  const t = String(text || ""); let best = "", bestN = 0;
  for (const [name, words] of INDUSTRY) { const n = words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0); if (n > bestN) { best = name; bestN = n; } }
  return best;
}
const GENERIC = /^(home|main|index|welcome|홈|메인|홈페이지|공식|공식홈페이지|공식 홈페이지)$/i;
export function cleanTitle(t) {
  const parts = tidy(t, 160).split(/\s+[|\-–—·•]\s+|\s*[|•]\s*/).map(x => x.trim()).filter(Boolean);
  const pick = parts.find(x => !GENERIC.test(x) && x.length >= 2 && x.length <= 40);
  return pick || "";
}
const visibleText = html => decodeEntities(html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").slice(0, 200000);

export function extractInfo(html) {
  const src = String(html || "");
  const meta = metaMap(src), titleTag = (src.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const biz = jsonLdNodes(src).find(n => BIZ_TYPE.test([].concat(n["@type"] || []).join(" ")) && (n.name || n.address));
  const name = tidy((biz && biz.name) || meta["og:site_name"] || "", 60) || cleanTitle(meta["og:title"] || "") || cleanTitle(titleTag);
  const text = visibleText(src);
  let address = tidy(addrText(biz && biz.address), 120);
  if (!ADDR_RE.test(address)) address = (text.match(ADDR_RE) || [address])[0] || "";
  const desc = tidy((biz && biz.description) || meta["og:description"] || meta["description"] || "", 300);
  const service = desc.length >= 6 ? desc.split(/(?<=[.!?。])\s|\n/)[0].slice(0, 70) : "";
  const industry = guessIndustry([name, tidy(titleTag, 160), desc, meta["keywords"] || ""].join(" "));
  const region = regionOf(address);
  return { name, address: address.slice(0, 120), region, industry, service };
}

// ---------- 요청 처리 (의존 대상을 바깥에서 받아 시험하기 쉽게 분리) ----------
export async function handle(req, deps) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  let u;
  try { u = checkUrl(body && body.url); } catch (e) { return json({ error: e.message }, 400); }
  if (isNaverHost(u.hostname)) return json({ error: "unsupported_naver" }, 422);
  if (!(await deps.reserve(await deps.ipHash(req)))) return json({ error: "rate_limited" }, 429);   // 접속 전에 한도 확인
  try {
    const { html } = await deps.fetchPage(u.toString());
    const data = extractInfo(html);
    if (!data.name && !data.address) return json({ error: "nothing_found" }, 422);
    return json({ data });
  } catch (e) {
    const code = e instanceof PrefillErr ? e.message : "fetch_failed";
    return json({ error: code, upstream: e && e.status || null }, ["blocked_url", "unsupported_naver", "not_html", "too_large"].includes(code) ? 422 : 502);
  }
}

async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function realDeps() {
  const env = k => Deno.env.get(k);
  const URL_ = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  const limit = parseInt(env("PREFILL_HOURLY_LIMIT") || "", 10) > 0 ? parseInt(env("PREFILL_HOURLY_LIMIT"), 10) : 20;
  return {
    ipHash: async req => sha256Hex(((req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown") + "|" + (env("IP_HASH_SALT") || KEY)),
    async reserve(ip) {
      const r = await fetch(`${URL_}/rest/v1/rpc/reserve_prefill`, { method: "POST", headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" }, body: JSON.stringify({ p_ip: ip, p_limit: limit }) });
      if (!r.ok) throw new Error("db_error");
      return (await r.json()) === true;
    },
    fetchPage: url => fetchPage(url, { resolve: typeof Deno !== "undefined" && Deno.resolveDns ? (h, t) => Deno.resolveDns(h, t) : undefined }),
  };
}
if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(async req => {
    try { return await handle(req, realDeps()); }
    catch (e) { return json({ error: "server_error" }, 500); }
  });
}
