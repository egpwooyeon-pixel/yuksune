// Supabase Edge Function: 선정된 신청자에게 안내 이메일 발송 (Resend 이용)
// 필요한 비밀값(Edge Functions > Secrets): RESEND_API_KEY, MAIL_FROM  (예: 우리들 체험단 <no-reply@내도메인.com>)
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 함수에 자동으로 넣어 줍니다.
// 아직 실제 Supabase/Resend 에서 실행해 검증하지 않은 초안입니다 (로직은 모의 서버로 시험함).

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } });
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function buildMail(app) {
  const c = app.campaigns || {};
  const when = app.visit_date ? `${app.visit_date}${app.visit_time ? " " + app.visit_time : ""}` : "";
  const lines = [
    `안녕하세요, ${app.applicant_name || "신청자"}님.`,
    `신청하신 체험단에 선정되었어요!`,
    ``,
    `· 체험단: ${c.title || ""}`,
    `· 업체: ${c.biz || ""}`,
    ...(when ? [`· 방문 희망 일시: ${when}`] : []),
    ``,
    `광고주가 신청하실 때 입력하신 핸드폰번호 또는 카카오톡으로 곧 연락드려요. 연락이 오지 않으면 신청한 체험단 페이지에서 확인해 주세요.`,
    ``,
    `이 메일은 신청 시 동의하신 개인정보 수집·이용(선정 안내) 범위에서 발송된 발신 전용 메일입니다.`,
  ];
  return {
    subject: `[우리들 체험단] '${c.title || "체험단"}' 체험단에 선정되었어요`,
    text: lines.join("\n"),
    html: `<div style="font-family:sans-serif;line-height:1.7;font-size:14px">${lines.map(l => (l ? `<p style="margin:0">${esc(l)}</p>` : "<br>")).join("")}</div>`,
  };
}

// 핵심 로직: 의존 대상(deps)을 바깥에서 받아서 시험하기 쉽게 분리
export async function handle(req, deps) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const user = await deps.getUser(req.headers.get("authorization") || "");
    if (!user) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const id = String(body.application_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad_request" }, 400);

    const app = await deps.getApplication(id);
    if (!app || !app.campaigns || app.campaigns.owner_id !== user.id) return json({ error: "forbidden" }, 403);   // 본인 체험단의 신청만
    if (app.status !== "selected") return json({ error: "not_selected" }, 409);                                   // 선정된 신청자만
    if (!app.email) return json({ error: "no_email" }, 422);
    if (app.notified_at && Date.now() - new Date(app.notified_at).getTime() < 10 * 60 * 1000) return json({ error: "too_soon" }, 429);  // 10분 안에 재발송 방지

    await deps.sendMail({ to: app.email, ...buildMail(app) });
    await deps.markNotified(id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: "send_failed" }, 502);
  }
}

// 실제 서버용 연결 (Deno 환경에서만 실행)
function realDeps() {
  const env = k => Deno.env.get(k);
  const URL_ = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  return {
    async getUser(authHeader) {
      const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: authHeader } });
      return r.ok ? await r.json() : null;
    },
    async getApplication(id) {
      const r = await fetch(`${URL_}/rest/v1/applications?id=eq.${id}&select=id,status,email,applicant_name,visit_date,visit_time,notified_at,campaigns(owner_id,title,biz)`, { headers: H });
      const rows = r.ok ? await r.json() : [];
      return rows[0] || null;
    },
    async sendMail({ to, subject, html, text }) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { authorization: `Bearer ${env("RESEND_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({ from: env("MAIL_FROM"), to: [to], subject, html, text }),
      });
      if (!r.ok) throw new Error("mail_failed");
    },
    async markNotified(id) {
      await fetch(`${URL_}/rest/v1/applications?id=eq.${id}`, { method: "PATCH", headers: H, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
    },
  };
}
if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(req => handle(req, realDeps()));
