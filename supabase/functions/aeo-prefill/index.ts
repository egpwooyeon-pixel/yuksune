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
export async function fetchPage(rawUrl, { fetchImpl = fetch, resolve, accept = /html|xml/i, maxBytes = MAX_BYTES } = {}) {
  let u = checkUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (isNaverHost(u.hostname)) throw new PrefillErr("unsupported_naver");
    await assertResolvesPublic(u.hostname, resolve);
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(u.toString(), { redirect: "manual", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; EGPInfoPrefill/1.0)", accept: "text/html,application/xhtml+xml,text/plain,application/xml;q=0.9", "accept-language": "ko,en;q=0.8" } });
    } catch (e) { clearTimeout(to); throw new PrefillErr("fetch_failed"); }
    try {
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location"); if (!loc) throw new PrefillErr("fetch_failed");
        u = checkUrl(new URL(loc, u).toString());                     // 이동한 주소도 처음과 같은 검사를 다시 거침
        continue;
      }
      if (!res.ok) throw new PrefillErr("fetch_failed", res.status);
      const ct = res.headers.get("content-type") || "";
      if (!accept.test(ct)) throw new PrefillErr("not_html");
      const len = Number(res.headers.get("content-length") || 0); if (len > maxBytes) throw new PrefillErr("too_large");
      return { html: decodeBody(await readLimited(res, maxBytes), ct), finalUrl: u.toString() };
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

// 소개 문구에서 "대표 서비스" 한 줄을 고름. 키워드 나열이면 앞쪽 몇 개만, 문장이면 첫 문장(단어 중간에서 자르지 않음)
export function pickService(desc) {
  const d = String(desc || "").trim(); if (d.length < 6) return "";
  const items = d.split(/\s*[,，·|/]\s*/).map(x => x.trim()).filter(Boolean);
  if (items.length >= 4) {
    const out = []; let len = 0;
    for (const it of items) { if (out.length >= 4 || len + it.length > 50) break; out.push(it); len += it.length + 2; }
    if (out.length) return out.join(", ");
  }
  const first = d.split(/(?<=[.!?。])\s|\n/)[0].trim();
  if (first.length <= 70) return first;
  const cut = first.slice(0, 70), sp = cut.lastIndexOf(" ");
  return (sp > 30 ? cut.slice(0, sp) : cut).trim();
}

export function extractInfo(html) {
  const src = String(html || "");
  const meta = metaMap(src), titleTag = (src.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const biz = jsonLdNodes(src).find(n => BIZ_TYPE.test([].concat(n["@type"] || []).join(" ")) && (n.name || n.address));
  const name = tidy((biz && biz.name) || meta["og:site_name"] || "", 60) || cleanTitle(meta["og:title"] || "") || cleanTitle(titleTag);
  const text = visibleText(src);
  let address = tidy(addrText(biz && biz.address), 120);
  if (!ADDR_RE.test(address)) address = (text.match(ADDR_RE) || [address])[0] || "";
  const desc = tidy((biz && biz.description) || meta["og:description"] || meta["description"] || "", 300);
  const service = pickService(desc);
  const industry = guessIndustry([name, tidy(titleTag, 160), desc, meta["keywords"] || ""].join(" "));
  const region = regionOf(address);
  return { name, address: address.slice(0, 120), region, industry, service };
}

// ---------- 해외 검색 자동 점검 (body.mode === "overseas") ----------
// 홈페이지 주소 하나로 "서버가 직접 읽어서 확인할 수 있는 것"만 점검합니다. 외부 AI(Gemini)·유료 도구는 쓰지 않습니다.
//   · 점검하는 것: 언어별 페이지 연결(hreflang), 페이지별 title·description·H1·canonical, 구조화 데이터, robots.txt(AI 크롤러 포함), sitemap
//   · 점검하지 않는 것(외부 도구 필요): 월 검색량, 구글 순위, AI 답변 인용, 외부 참조 도메인 → 결과의 unmeasured 로 "미측정"을 돌려줍니다.
//   · 다른 언어 페이지는 같은 사이트(같은 호스트·같은 상위 도메인) 것만 읽고, 최대 3개입니다. 모든 접속은 위의 SSRF 검사를 거칩니다.
const AI_BOTS = ["GPTBot", "ChatGPT-User", "Google-Extended", "PerplexityBot", "ClaudeBot", "CCBot"];
const absUrl = (h, base) => { try { const u = new URL(h, base); return /^https?:$/.test(u.protocol) ? u.toString() : ""; } catch (_) { return ""; } };
const attrsOf = tag => { const a = {}; for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[m[1].toLowerCase()] = m[2] != null ? m[2] : m[3]; return a; };
export const textWidth = s => [...String(s || "")].reduce((n, c) => n + (/[ᄀ-ᇿ぀-ヿ㐀-鿿가-힯＀-￯]/.test(c) ? 2 : 1), 0);   // 한글·한자·가나는 2칸으로 셈

export function pageFacts(html, pageUrl) {
  const meta = metaMap(html);
  const title = tidy((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "", 200);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => tidy(m[1].replace(/<[^>]+>/g, " "), 200)).filter(Boolean);
  const lang = ((html.match(/<html[^>]*?\blang\s*=\s*["']([^"']+)["']/i) || [])[1] || "").trim();
  let canonical = ""; const alternates = [];
  for (const m of html.matchAll(/<link\s+([^>]*?)\/?>/gi)) {
    const a = attrsOf(m[1]), rel = (a.rel || "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical") && a.href && !canonical) canonical = absUrl(a.href, pageUrl);
    if (rel.includes("alternate") && a.hreflang && a.href) { const h = absUrl(a.href, pageUrl); if (h) alternates.push({ lang: a.hreflang.trim(), href: h }); }
  }
  const types = [...new Set(jsonLdNodes(html).flatMap(n => [].concat(n["@type"] || [])).map(String))].slice(0, 8);
  return { url: pageUrl, lang, title, description: tidy(meta.description || "", 400), h1: h1s[0] || "", h1Count: h1s.length, canonical, alternates: alternates.slice(0, 20), schemaTypes: types };
}

export function parseRobots(text) {
  const groups = []; let cur = null; const sitemaps = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "sitemap") { if (/^https?:\/\//i.test(v)) sitemaps.push(v); continue; }
    if (k === "user-agent") { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); continue; }
    if ((k === "disallow" || k === "allow") && cur) cur.rules.push([k, v]);
  }
  const blocks = agent => {                                           // 그 크롤러가 사이트 전체(/)를 막혀 있는가
    const g = groups.find(x => x.agents.includes(agent.toLowerCase())) || groups.find(x => x.agents.includes("*"));
    if (!g) return false;
    return g.rules.some(([k, v]) => k === "disallow" && v === "/") && !g.rules.some(([k, v]) => k === "allow" && v === "/");
  };
  return { blockAll: blocks("*"), blockedBots: AI_BOTS.filter(b => groups.some(x => x.agents.includes(b.toLowerCase())) && blocks(b)), sitemaps: sitemaps.slice(0, 3) };
}
export const parseSitemap = xml => ({ urls: (String(xml || "").match(/<loc>/gi) || []).length, isIndex: /<sitemapindex/i.test(xml || ""), hasAlternates: /xhtml:link|hreflang/i.test(xml || "") });

const labels = h => String(h || "").toLowerCase().replace(/\.$/, "").split(".");
export function registrable(h) {                                       // www.example.co.kr → example.co.kr, jp.example.com → example.com
  const l = labels(h); if (l.length <= 2) return l.join(".");
  const sld = /^(co|or|go|ne|ac|re|pe|com|net|org|gov|edu)$/.test(l[l.length - 2]) && l[l.length - 1].length === 2;
  return l.slice(sld ? -3 : -2).join(".");
}
export const sameSite = (a, b) => registrable(a) === registrable(b);

const FA = (area, status, found, todo) => ({ area, status, found, todo });
export function buildAudit({ home, alts = [], robots = null, sitemap = null }) {
  const pages = [home, ...alts.filter(Boolean)];
  const F = [];
  const homeLang = (home.lang || "").toLowerCase();
  // 1) 언어 페이지 연결
  const altLangs = [...new Set(home.alternates.map(a => a.lang))];
  if (!altLangs.length) F.push(FA("언어별 페이지 연결(hreflang)", "gap", "다른 언어 페이지와의 연결 표시가 없습니다.", "언어별 페이지가 있다면 서로 연결하는 hreflang 을 추가하세요. 없다면 현지 언어 페이지부터 만드세요."));
  else F.push(FA("언어별 페이지 연결(hreflang)", "ok", "연결된 언어: " + altLangs.join(", "), "새 언어 페이지를 만들 때마다 같이 추가하세요."));
  // 2) 서로 되돌아 연결(상호 참조) — 읽은 페이지 기준
  const recip = alts.filter(Boolean);
  if (recip.length) {
    const bad = recip.filter(p => !p.alternates.some(a => sameUrl(a.href, home.url))).length;
    F.push(bad ? FA("되돌아 연결", "warn", `읽은 ${recip.length}개 언어 페이지 중 ${bad}개가 처음 페이지로 되돌아가는 연결이 없습니다.`, "언어 페이지끼리 서로를 가리키도록 맞추세요.") : FA("되돌아 연결", "ok", `읽은 ${recip.length}개 언어 페이지가 모두 서로 연결돼 있습니다.`, "유지하세요."));
  }
  if (altLangs.length && !home.alternates.some(a => a.lang.toLowerCase() === "x-default")) F.push(FA("기본 언어(x-default)", "warn", "x-default 표시가 없습니다.", "어느 언어 사용자에게도 맞지 않을 때 보여 줄 기본 페이지를 x-default 로 지정하세요."));
  // 3) 페이지별 문구
  const titles = pages.map(p => p.title).filter(Boolean);
  const noTitle = pages.filter(p => !p.title).length;
  if (noTitle) F.push(FA("제목(title)", "gap", `${noTitle}개 페이지에 제목이 없습니다.`, "페이지마다 그 언어 검색어에 맞는 제목을 넣으세요."));
  else if (pages.some(p => textWidth(p.title) > 60 || textWidth(p.title) < 10)) F.push(FA("제목(title)", "warn", "일부 페이지 제목이 너무 길거나 짧습니다(검색 결과에서 잘리거나 정보가 부족).", "한글·한자 약 30자, 영문 약 60자 안쪽으로 핵심 검색어를 앞에 두세요."));
  else F.push(FA("제목(title)", "ok", "모든 페이지에 적당한 길이의 제목이 있습니다.", "현지 검색어와 맞는지 한 번 더 검수하세요."));
  if (pages.length > 1 && new Set(titles).size < titles.length) F.push(FA("언어별 제목 중복", "warn", "서로 다른 언어 페이지가 같은 제목을 쓰고 있습니다(번역하지 않은 것으로 보입니다).", "언어마다 그 나라 검색어에 맞는 제목으로 따로 쓰세요."));
  const noDesc = pages.filter(p => !p.description).length;
  if (noDesc) F.push(FA("설명(description)", "gap", `${noDesc}개 페이지에 설명이 없습니다.`, "검색 결과 아래에 보일 한두 문장의 설명을 넣으세요."));
  else if (pages.some(p => textWidth(p.description) > 170 || textWidth(p.description) < 40)) F.push(FA("설명(description)", "warn", "일부 설명이 너무 길거나 짧습니다.", "한글·한자 약 80자, 영문 약 160자 안쪽으로 정리하세요."));
  else F.push(FA("설명(description)", "ok", "모든 페이지에 적당한 길이의 설명이 있습니다.", "유지하세요."));
  const badH1 = pages.filter(p => p.h1Count !== 1).length;
  F.push(badH1 ? FA("대표 제목(H1)", "warn", `${badH1}개 페이지의 H1 이 없거나 2개 이상입니다.`, "페이지마다 H1 을 하나만 두고 그 언어의 핵심 주제를 쓰세요.") : FA("대표 제목(H1)", "ok", "읽은 페이지마다 H1 이 하나씩 있습니다.", "유지하세요."));
  const badCan = pages.filter(p => !p.canonical).length;
  F.push(badCan ? FA("대표 주소(canonical)", "warn", `${badCan}개 페이지에 canonical 이 없습니다.`, "같은 내용의 주소가 여러 개일 때 대표 주소를 알리세요.") : FA("대표 주소(canonical)", "ok", "읽은 페이지에 canonical 이 있습니다.", "유지하세요."));
  if (homeLang && altLangs.length && !altLangs.some(l => l.toLowerCase().split("-")[0] === homeLang.split("-")[0]) ) F.push(FA("페이지 언어 표시(lang)", "warn", `HTML lang="${home.lang}" 과 연결된 언어 목록이 맞지 않습니다.`, "각 페이지의 lang 속성을 실제 언어와 맞추세요."));
  if (!home.lang) F.push(FA("페이지 언어 표시(lang)", "warn", "HTML 에 lang 표시가 없습니다.", "<html lang=\"ko\">처럼 언어를 표시하세요."));
  F.push(home.schemaTypes.length ? FA("구조화 데이터", "ok", "확인된 종류: " + home.schemaTypes.join(", "), "병원·업체 정보가 정확한지 검수하세요.") : FA("구조화 데이터", "warn", "구조화 데이터(JSON-LD)를 찾지 못했습니다.", "업체·병원 기본 정보를 구조화 데이터로 넣으면 AI·검색이 이해하기 쉬워집니다."));
  // 4) robots / sitemap
  if (robots) {
    if (robots.blockAll) F.push(FA("검색 로봇 허용(robots.txt)", "gap", "모든 검색 로봇에게 사이트 전체를 막고 있습니다.", "공개할 페이지는 막지 않도록 robots.txt 를 고치세요."));
    else F.push(FA("검색 로봇 허용(robots.txt)", "ok", "사이트 전체를 막고 있지 않습니다.", "유지하세요."));
    F.push(robots.blockedBots.length ? FA("AI 크롤러 접근", "warn", "다음 AI 로봇이 막혀 있습니다: " + robots.blockedBots.join(", "), "AI 답변에 소개되길 원한다면 해당 로봇 차단을 풀지 검토하세요(정책 결정 필요).") : FA("AI 크롤러 접근", "ok", "확인한 AI 로봇(" + AI_BOTS.join(", ") + ")을 따로 막고 있지 않습니다.", "유지하세요."));
  } else F.push(FA("검색 로봇 허용(robots.txt)", "none", "robots.txt 를 읽지 못했습니다(없거나 접근 불가).", "robots.txt 를 만들고 sitemap 위치를 적어 두세요."));
  if (sitemap) F.push(sitemap.hasAlternates || !altLangs.length ? FA("사이트맵(sitemap)", "ok", `사이트맵을 찾았습니다(주소 ${sitemap.isIndex ? "목록형 · " : ""}${sitemap.urls}개 표시).`, "새 페이지를 만들면 사이트맵에 넣으세요.") : FA("사이트맵(sitemap)", "warn", "사이트맵은 있으나 언어별 연결 표시가 보이지 않습니다.", "사이트맵에도 언어별 주소를 연결하면 검색엔진이 이해하기 쉽습니다."));
  else F.push(FA("사이트맵(sitemap)", "none", "sitemap.xml 을 읽지 못했습니다.", "사이트맵을 만들어 검색엔진에 알리세요."));
  return {
    pages: pages.map(p => ({ url: p.url, lang: p.lang, title: p.title, titleWidth: textWidth(p.title), description: p.description, descWidth: textWidth(p.description), h1: p.h1, h1Count: p.h1Count, canonical: p.canonical, hreflang: p.alternates.map(a => a.lang) })),
    findings: F,
    robots: robots ? { blockAll: robots.blockAll, blockedBots: robots.blockedBots, sitemaps: robots.sitemaps.length } : null,
    sitemap: sitemap || null,
    unmeasured: ["월 검색량(국가별 검색어)", "구글 검색 순위", "AI 답변 인용 횟수", "외부 참조 도메인·매체 소개", "경쟁사 비교"],
  };
}
const sameUrl = (a, b) => { try { const x = new URL(a), y = new URL(b); return x.host.toLowerCase() === y.host.toLowerCase() && x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, ""); } catch (_) { return false; } };

export async function overseasAudit(rawUrl, deps) {
  const first = await deps.fetchPage(rawUrl);
  const home = pageFacts(first.html, first.finalUrl);
  const origin = new URL(first.finalUrl).origin, host = new URL(first.finalUrl).hostname;
  const optional = async (path, accept) => { try { return await deps.fetchPage(origin + path, { accept, maxBytes: 300 * 1024 }); } catch (_) { return null; } };
  const targets = [];
  for (const a of home.alternates) {
    if (targets.length >= 3 || /^x-default$/i.test(a.lang) || sameUrl(a.href, first.finalUrl) || targets.some(t => sameUrl(t.href, a.href))) continue;
    let h; try { h = new URL(a.href).hostname; } catch (_) { continue; }
    if (sameSite(h, host)) targets.push(a);
  }
  const [rb, alts] = await Promise.all([
    optional("/robots.txt", /text|plain|octet/i),
    Promise.all(targets.map(async t => { try { const r = await deps.fetchPage(t.href); const f = pageFacts(r.html, r.finalUrl); if (!f.lang) f.lang = t.lang; return f; } catch (_) { return null; } })),
  ]);
  const robots = rb ? parseRobots(rb.html) : null;
  let sm = null;
  const smUrl = robots && robots.sitemaps.length ? robots.sitemaps[0] : origin + "/sitemap.xml";
  try { const u = new URL(smUrl); if (sameSite(u.hostname, host)) { const r = await deps.fetchPage(u.toString(), { accept: /xml|text|octet/i, maxBytes: 600 * 1024 }); sm = parseSitemap(r.html); } } catch (_) {}
  return { site: { url: first.finalUrl, host }, measuredAt: new Date().toISOString().slice(0, 10), skipped: targets.length - alts.filter(Boolean).length, ...buildAudit({ home, alts, robots, sitemap: sm }) };
}

// ---------- 요청 처리 (의존 대상을 바깥에서 받아 시험하기 쉽게 분리) ----------
export async function handle(req, deps) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  let u;
  try { u = checkUrl(body && body.url); } catch (e) { return json({ error: e.message }, 400); }
  if (isNaverHost(u.hostname)) return json({ error: "unsupported_naver" }, 422);
  const overseas = body && body.mode === "overseas";
  if (!(await deps.reserve(await deps.ipHash(req), overseas ? "overseas" : "prefill"))) return json({ error: "rate_limited" }, 429);   // 접속 전에 한도 확인
  try {
    if (overseas) return json({ audit: await overseasAudit(u.toString(), deps) });
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
  const overseasLimit = parseInt(env("OVERSEAS_HOURLY_LIMIT") || "", 10) > 0 ? parseInt(env("OVERSEAS_HOURLY_LIMIT"), 10) : 5;   // 자동 점검은 한 번에 여러 곳을 읽어서 더 낮게
  return {
    ipHash: async req => sha256Hex(((req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown") + "|" + (env("IP_HASH_SALT") || KEY)),
    async reserve(ip, kind) {
      const r = await fetch(`${URL_}/rest/v1/rpc/reserve_prefill`, { method: "POST", headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" }, body: JSON.stringify({ p_ip: ip, p_limit: kind === "overseas" ? overseasLimit : limit }) });
      if (!r.ok) throw new Error("db_error");
      return (await r.json()) === true;
    },
    fetchPage: (url, opts) => fetchPage(url, { ...(opts || {}), resolve: typeof Deno !== "undefined" && Deno.resolveDns ? (h, t) => Deno.resolveDns(h, t) : undefined }),
  };
}
if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(async req => {
    try { return await handle(req, realDeps()); }
    catch (e) { return json({ error: "server_error" }, 500); }
  });
}
