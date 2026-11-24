// Supabase Edge Function: 업체 사진 업로드용 "일회용 업로드 주소" 발급
//
// 방문자가 올리려는 사진의 형식·장수를 보내면, 한도를 확인한 뒤 서버가 정한 경로로 업로드 토큰을 돌려줍니다.
// 방문자는 이 토큰으로 비공개 버킷 `business-photos` 에만 올릴 수 있고, 파일 이름·위치는 서버가 정해요.
// 형식(JPG/PNG/WebP)·용량(장당 4MB) 제한은 버킷 설정(024_photos.sql)이 저장소 쪽에서 강제합니다.
//
// 비밀값: 별도 키 없음 (Supabase 가 넣어 주는 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 만 사용)
//   선택: IP_HASH_SALT, PHOTO_IP_DAILY(기본 9장), PHOTO_DAILY_LIMIT(기본 200장)
//
// 아직 실제 Supabase Storage 로는 실행해 보지 않았습니다. 서명 업로드 주소 발급 요청 형식
// (POST /storage/v1/object/upload/sign/<bucket>/<path> → { url: ".../...?token=..." })은 공식 문서 형식을 기준으로 가정했으니,
// 첫 실호출 때 확인이 필요합니다.

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...CORS } });
const BUCKET = "business-photos", TYPES = ["image/jpeg", "image/png", "image/webp"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseInput(b) {
  const batch = String((b && b.batch) || "").toLowerCase();
  if (!UUID.test(batch)) return { error: "bad_batch" };
  const types = b && b.types;
  if (!Array.isArray(types) || types.length < 1 || types.length > 3) return { error: "bad_count" };
  if (types.some(t => !TYPES.includes(t))) return { error: "bad_type" };
  return { batch, types };
}

// 서명 업로드 주소 응답에서 토큰만 꺼냄
export function tokenFrom(res) {
  try { const u = new URL(String(res && res.url), "https://x.invalid"); return u.searchParams.get("token") || null; } catch (_) { return null; }
}

export async function handle(req, deps) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const input = parseInput(await req.json().catch(() => ({})));
  if (input.error) return json({ error: input.error }, 400);
  const rsv = await deps.reserve(await deps.ipHash(req), input.batch, input.types);     // 한도 확인 + 경로 예약
  if (!rsv || !rsv.ok) return json({ error: (rsv && rsv.reason) || "limit" }, rsv && ["batch_limit", "ip_limit", "global_limit"].includes(rsv.reason) ? 429 : 400);
  try {
    const files = [];
    for (const path of rsv.paths) { const token = await deps.sign(path); if (!token) throw new Error("sign_failed"); files.push({ path, token }); }
    return json({ bucket: BUCKET, files });
  } catch (_) { return json({ error: "sign_failed" }, 502); }
}

async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function realDeps() {
  const env = k => Deno.env.get(k), URL_ = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  const num = (k, d) => { const n = parseInt(env(k) || "", 10); return n > 0 ? n : d; };
  const h = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  return {
    ipHash: async req => sha256Hex(((req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown") + "|" + (env("IP_HASH_SALT") || KEY)),
    async reserve(ip, batch, types) {
      const r = await fetch(`${URL_}/rest/v1/rpc/reserve_photos`, { method: "POST", headers: h, body: JSON.stringify({ p_ip: ip, p_batch: batch, p_mimes: types, p_ip_daily: num("PHOTO_IP_DAILY", 9), p_global_daily: num("PHOTO_DAILY_LIMIT", 200) }) });
      if (!r.ok) throw new Error("db_error");
      return await r.json();
    },
    async sign(path) {
      const r = await fetch(`${URL_}/storage/v1/object/upload/sign/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: h, body: "{}" });
      return r.ok ? tokenFrom(await r.json()) : null;
    },
  };
}
if (typeof Deno !== "undefined" && Deno.serve) {
  Deno.serve(async req => {
    try { return await handle(req, realDeps()); } catch (_) { return json({ error: "server_error" }, 500); }
  });
}
