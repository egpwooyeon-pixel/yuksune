// Supabase Edge Function: 네이버 로그인 (공식 OAuth 2.0 · 서버에서 code/state 검증)
// 동작
//   POST ?action=start   {purpose:'login'|'link', next, nonce_hash}  → {url}  (네이버 동의 화면 주소)
//   GET  ?code=&state=   네이버가 돌아오는 주소(콜백). state 1회용·10분·서버 검증 → 토큰 교환 → 프로필 id 조회 → SITE_URL 로 되돌려 보냄
//   POST ?action=redeem  {state, nonce}                                → {token_hash} (로그인 1회용 토큰, 요청한 브라우저만 받음)
// 규칙
//   · 계정은 네이버 앱 전용 고유 ID(response.id)로만 식별. 같은 이메일이라도 자동으로 합치지 않음.
//   · 기존 회원과의 연결은 '로그인한 본인이 마이페이지에서 직접 연결(link)'할 때만.
//   · Client Secret·액세스 토큰은 서버에서만 쓰고 화면/로그/주소에 내보내지 않음.
//   · 네이버 로그인은 블로그 소유 인증이 아님 (블로그 주소는 별도 등록, 항상 '등록된 블로그'로만 표시).
// 필요한 비밀값(Edge Functions > Secrets): NAVER_LOGIN_CLIENT_ID, NAVER_LOGIN_CLIENT_SECRET, SITE_URL (예: https://woori-chehumdan.netlify.app)
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동으로 넣어 줍니다. 'Verify JWT' 는 끄세요(콜백은 로그인 없이 호출됨).
// 아직 실제 네이버·Supabase 에서 실행해 검증하지 않은 초안입니다 (로직은 모의 서버로 시험함).

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } });
const NEXT_RE = /^[a-z]+\.html(\?[\w=&%.-]*)?$/;
const PLACEHOLDER_DOMAIN = "naver.login.invalid";   // 실제로 메일이 갈 수 없는 주소 (이메일로 기존 회원과 합쳐지지 않게)
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b as ArrayBuffer), x => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

export async function handle(req: Request, deps: any) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const env = deps.env;
  const site = String(env("SITE_URL") || "").replace(/\/+$/, "");
  const back = (path: string) => new Response(null, { status: 302, headers: { location: site + "/" + path, "cache-control": "no-store" } });

  try {
    // ---- 콜백: 네이버 → 우리 서버
    if (req.method === "GET") {
      const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "";
      if (!/^[0-9a-f]{64}$/.test(state)) return back("login.html?naver_error=bad_state");
      const row = await deps.consumeState(state);                        // 1회용: 처음 쓸 때만 행이 돌아옴 (만료·재사용이면 null)
      if (!row) return back("login.html?naver_error=bad_state");
      const dest = row.purpose === "link" ? "mypage.html" : "login.html";
      const fail = async (e: string) => { await deps.finishState(state, { result: e }); return back(`${dest}?naver_error=${e}`); };
      if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "cancelled" : "denied");
      if (!code) return fail("no_code");

      // 코드 → 토큰 (Client Secret 은 여기서만 사용)
      const tr = await deps.fetch("https://nid.naver.com/oauth2.0/token?" + new URLSearchParams({
        grant_type: "authorization_code", client_id: env("NAVER_LOGIN_CLIENT_ID") || "", client_secret: env("NAVER_LOGIN_CLIENT_SECRET") || "", code, state }));
      const tj = tr.ok ? await tr.json().catch(() => null) : null;
      if (!tj || !tj.access_token) return fail("token_failed");
      const pr = await deps.fetch("https://openapi.naver.com/v1/nid/me", { headers: { authorization: "Bearer " + tj.access_token } });
      const pj = pr.ok ? await pr.json().catch(() => null) : null;
      const naverId = pj && pj.response && pj.response.id ? String(pj.response.id) : "";
      if (!naverId || naverId.length > 100) return fail("profile_failed");   // 이메일·이름 등은 쓰지 않음 (고유 id 만)

      if (row.purpose === "link") {
        if (!row.user_id) return fail("bad_state");
        const owner = await deps.findIdentity(naverId);
        if (owner && owner.user_id !== row.user_id) return fail("naver_conflict");     // 이미 다른 회원에 연결된 네이버 계정
        const mine = await deps.findIdentityByUser(row.user_id);
        if (mine && mine.naver_id !== naverId) return fail("user_has_other_naver");    // 이 회원은 이미 다른 네이버 계정과 연결됨
        if (!owner) await deps.createIdentity(naverId, row.user_id);
        await deps.finishState(state, { result: "linked" });
        return back("mypage.html?naver=linked");
      }

      // 로그인: 연결된 회원이 있으면 그 회원, 없으면 새 회원 (이메일로 기존 회원과 합치지 않음)
      let ident = await deps.findIdentity(naverId), userId = ident && ident.user_id, email = "";
      if (!userId) {
        const made = await deps.createUser(`n${naverId.replace(/[^A-Za-z0-9]/g, "").slice(0, 24).toLowerCase()}${hex(crypto.getRandomValues(new Uint8Array(4)))}@${PLACEHOLDER_DOMAIN}`);
        if (!made) return fail("signup_failed");
        userId = made.id; email = made.email;
        await deps.createIdentity(naverId, userId);
      } else {
        email = await deps.getEmail(userId);
        await deps.touchIdentity(naverId);
      }
      const tok = email ? await deps.mintToken(email) : null;
      if (!tok) return fail("session_failed");
      await deps.finishState(state, { result: "login_ok", token_hash: tok });
      return back("login.html?naver_state=" + state);                      // 토큰은 주소에 싣지 않음 → 브라우저가 nonce 로 받아감
    }

    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const action = url.searchParams.get("action");
    const body = await req.json().catch(() => ({}));

    // ---- 시작: 네이버 동의 화면 주소를 만들어 돌려줌
    if (action === "start") {
      const purpose = body.purpose === "link" ? "link" : "login";
      const nonceHash = String(body.nonce_hash || "");
      if (!/^[0-9a-f]{64}$/.test(nonceHash)) return json({ error: "bad_request" }, 400);
      const next = NEXT_RE.test(String(body.next || "")) ? String(body.next) : null;
      let userId: string | null = null;
      if (purpose === "link") {
        const u = await deps.getUser(req.headers.get("authorization") || "");
        if (!u) return json({ error: "unauthorized" }, 401);
        userId = u.id;
      }
      if (!env("NAVER_LOGIN_CLIENT_ID") || !env("NAVER_LOGIN_CLIENT_SECRET") || !site) return json({ error: "not_configured" }, 503);
      const state = hex(crypto.getRandomValues(new Uint8Array(32)));
      await deps.insertState({ state, purpose, user_id: userId, next, nonce_hash: nonceHash, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      const callback = String(env("SUPABASE_URL")).replace(/\/+$/, "") + "/functions/v1/naver-auth";
      return json({ url: "https://nid.naver.com/oauth2.0/authorize?" + new URLSearchParams({
        response_type: "code", client_id: env("NAVER_LOGIN_CLIENT_ID"), redirect_uri: callback, state }) });
    }

    // ---- 받아가기: 로그인 1회용 토큰 (처음 요청한 브라우저만, 한 번만)
    if (action === "redeem") {
      const state = String(body.state || ""), nonce = String(body.nonce || "");
      if (!/^[0-9a-f]{64}$/.test(state) || !nonce) return json({ error: "bad_request" }, 400);
      const r = await deps.redeemState(state, await sha256(nonce));
      if (!r) return json({ error: "invalid" }, 400);
      if (r.result !== "login_ok" || !r.token_hash) return json({ error: r.result || "failed" }, 400);
      return json({ token_hash: r.token_hash, next: r.next || null });
    }
    return json({ error: "bad_request" }, 400);
  } catch (_e) {
    // 비밀값·토큰이 섞일 수 있어 오류 내용은 기록/반환하지 않음
    return req.method === "GET" ? back("login.html?naver_error=server_error") : json({ error: "server_error" }, 500);
  }
}

// 실제 서버용 연결 (Deno 환경에서만 실행)
function realDeps() {
  const env = (k: string) => (globalThis as any).Deno.env.get(k);
  const URL_ = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  const rest = (path: string, init: RequestInit = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const nowIso = () => new Date().toISOString();
  return {
    env, fetch,
    async getUser(authHeader: string) {
      const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: authHeader } });
      return r.ok ? await r.json() : null;
    },
    async insertState(row: any) {
      await rest(`oauth_states?expires_at=lt.${encodeURIComponent(nowIso())}`, { method: "DELETE" });   // 만료된 것 정리
      const r = await rest("oauth_states", { method: "POST", body: JSON.stringify(row) });
      if (!r.ok) throw new Error("state_failed");
    },
    async consumeState(state: string) {
      const r = await rest(`oauth_states?state=eq.${state}&used=eq.false&expires_at=gt.${encodeURIComponent(nowIso())}`, {
        method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ used: true }) });
      const rows = r.ok ? await r.json() : [];
      return rows[0] || null;
    },
    async finishState(state: string, patch: any) {
      await rest(`oauth_states?state=eq.${state}`, { method: "PATCH", body: JSON.stringify(patch) });
    },
    async redeemState(state: string, nonceHash: string) {
      // 한 번만: 토큰을 읽은 뒤 비움(비우기에 성공한 요청만 토큰을 받음). nonce 가 다르면 아무것도 못 받음
      const q = `oauth_states?state=eq.${state}&nonce_hash=eq.${nonceHash}&expires_at=gt.${encodeURIComponent(nowIso())}`;
      const g = await rest(q + "&select=token_hash,result,next");
      const row = g.ok ? (await g.json())[0] : null;
      if (!row || !row.token_hash) return row ? { result: row.result, token_hash: null, next: row.next } : null;
      const c = await rest(q + `&token_hash=eq.${encodeURIComponent(row.token_hash)}`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ token_hash: null }) });
      const won = c.ok ? await c.json() : [];
      return won[0] ? { result: row.result, token_hash: row.token_hash, next: row.next } : null;
    },
    async findIdentity(naverId: string) {
      const r = await rest(`naver_identities?naver_id=eq.${encodeURIComponent(naverId)}&select=naver_id,user_id`);
      const rows = r.ok ? await r.json() : []; return rows[0] || null;
    },
    async findIdentityByUser(userId: string) {
      const r = await rest(`naver_identities?user_id=eq.${userId}&select=naver_id,user_id`);
      const rows = r.ok ? await r.json() : []; return rows[0] || null;
    },
    async createIdentity(naverId: string, userId: string) {
      const r = await rest("naver_identities", { method: "POST", body: JSON.stringify({ naver_id: naverId, user_id: userId, last_login_at: nowIso() }) });
      if (!r.ok) throw new Error("identity_failed");
    },
    async touchIdentity(naverId: string) {
      await rest(`naver_identities?naver_id=eq.${encodeURIComponent(naverId)}`, { method: "PATCH", body: JSON.stringify({ last_login_at: nowIso() }) });
    },
    async createUser(email: string) {
      const r = await fetch(`${URL_}/auth/v1/admin/users`, { method: "POST", headers: H,
        body: JSON.stringify({ email, email_confirm: true, user_metadata: { nickname: "네이버회원" + email.slice(1, 5), via: "naver" } }) });
      const u = r.ok ? await r.json() : null;
      return u && u.id ? { id: u.id, email } : null;
    },
    async getEmail(userId: string) {
      const r = await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { headers: H });
      const u = r.ok ? await r.json() : null; return u && u.email ? String(u.email) : "";
    },
    async mintToken(email: string) {
      const r = await fetch(`${URL_}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email }) });
      const j = r.ok ? await r.json() : null;
      return j ? (j.hashed_token || (j.properties && j.properties.hashed_token) || null) : null;
    },
  };
}
if (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno.serve) (globalThis as any).Deno.serve((req: Request) => handle(req, realDeps()));
