// Supabase Edge Function: 업플로우 웹훅 수신 (rank.changed · refresh.completed · refresh.failed)
//
// 업플로우 개발자 페이지에서 웹훅 주소를 이 함수 주소로 직접 등록하세요: https://<프로젝트>.supabase.co/functions/v1/upflow-webhook
// 필요한 비밀값 (Supabase > Edge Functions > Secrets): UPFLOW_WEBHOOK_SECRET
// ⚠ 외부(업플로우)가 부르는 주소라서, 배포 후 Settings 의 "Verify JWT" 를 OFF 로 두어야 합니다. (대신 아래 서명 검증이 요청을 확인해요)
//
// 하는 일: ① 원본 본문 + UPFLOW_WEBHOOK_SECRET 으로 HMAC-SHA256 을 계산해 X-UpFlow-Signature 와 비교 (다르면 아무것도 처리하지 않고 401)
//          ② X-UpFlow-Delivery 로 같은 전달의 중복 처리를 막음 ③ 이벤트를 upflow_events 표에 한 줄 기록하고 바로 응답 (5초 안)
// 웹훅은 '해당 키워드의 이력을 다시 읽으라는 신호'일 뿐이에요. 이력을 새로 읽는 일은 관리자 화면이 기존 읽기 방식으로 해요.
// 실패한 전달은 재전송되지 않으니, 웹훅을 놓쳐도 관리자 화면의 '목록 다시 읽기'로 따라잡을 수 있어요. 이 함수가 없어도 화면은 동작해요.
//
// 아직 업플로우 실제 서명 형식으로 확인하지 못했습니다(문서 확인 불가). 'sha256=<hex>' 와 '<hex>' 두 모양을 모두 받아들입니다.

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const EVENTS = new Set(["rank.changed", "refresh.completed", "refresh.failed"]);
const MAX_BODY = 64 * 1024;

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
export async function hmacHex(raw, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
}
function safeEqual(a, b) {                                            // 길이가 같을 때 끝까지 비교 (시간 차이로 알아내지 못하게)
  if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
export async function verifySignature(raw, header, secret) {
  if (!secret || !header) return false;
  const given = String(header).trim().toLowerCase().replace(/^sha256=/, "");
  return safeEqual(await hmacHex(raw, secret), given);
}

export async function handle(req, deps) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = deps.secret();
  if (!secret) return json({ error: "not_configured" }, 503);
  const raw = await req.text();                                       // 서명은 '원본 본문' 그대로 계산해야 해요
  if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413);
  if (!(await verifySignature(raw, req.headers.get("x-upflow-signature"), secret))) return json({ error: "bad_signature" }, 401);   // 처리하지 않음
  const delivery = req.headers.get("x-upflow-delivery") || "";
  if (!delivery || delivery.length > 100) return json({ error: "bad_delivery" }, 400);
  let body; try { body = JSON.parse(raw); } catch (_) { return json({ error: "bad_json" }, 400); }
  const event = String(body && (body.event || body.type) || "");
  if (!EVENTS.has(event)) return json({ ok: true, ignored: true });       // 모르는 이벤트는 받았다고만 답함
  const d = body && typeof body.data === "object" && body.data ? body.data : body;
  const kid = d.keyword_id ?? d.tracking_keyword_id ?? d.id ?? body.keyword_id ?? null;
  const keywordId = kid != null && ID_RE.test(String(kid)) ? String(kid) : null;
  const state = await Promise.race([deps.record({ delivery_id: delivery, event, keyword_id: keywordId }), new Promise(r => setTimeout(() => r("timeout"), 4000))]);
  if (state === "timeout" || state === "error") return json({ error: "try_later" }, 503);
  return json({ ok: true, duplicate: state === "duplicate" });
}

function realDeps() {
  const env = k => Deno.env.get(k);
  const URL_ = env("SUPABASE_URL");
  let KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  try { const k = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}"); const v = k.default || Object.values(k)[0]; if (typeof v === "string" && v) KEY = v; } catch (_) { /* 무시 */ }
  const H = KEY && KEY.startsWith("sb_") ? { apikey: KEY } : { apikey: KEY, authorization: `Bearer ${KEY}` };
  return {
    secret: () => env("UPFLOW_WEBHOOK_SECRET"),
    async record(row) {                                                // 같은 delivery_id 가 이미 있으면 무시 → 'duplicate'
      try {
        const r = await fetch(`${URL_}/rest/v1/upflow_events?on_conflict=delivery_id`, { method: "POST", headers: { ...H, "content-type": "application/json", prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(row) });
        if (!r.ok) return "error";
        const rows = await r.json(); return Array.isArray(rows) && rows.length ? "new" : "duplicate";
      } catch (_) { return "error"; }
    },
  };
}
if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(req => handle(req, realDeps()));
