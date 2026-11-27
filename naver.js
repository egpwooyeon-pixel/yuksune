// 네이버 로그인 도우미 (login.html / mypage.html / campaign.html 에서 공통 사용)
// 비밀값(Client Secret)은 여기에 없어요. 모든 검증은 Edge Function 'naver-auth' 가 서버에서 합니다.
// 네이버 로그인은 '로그인 수단'일 뿐, 블로그 소유 인증이 아닙니다.
(function () {
  const cfg = window.WOORI || {};
  const FN = (cfg.SUPABASE_URL || "") + "/functions/v1/naver-auth";
  const hdr = { "content-type": "application/json", apikey: cfg.SUPABASE_ANON_KEY || "" };
  const sha256 = async s => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join("");
  const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  const ERR = {
    cancelled: "네이버 로그인을 취소했어요. 다른 방법으로 로그인하거나 다시 시도해 주세요.",
    denied: "네이버에서 로그인이 거절됐어요. 잠시 후 다시 시도해 주세요.",
    bad_state: "로그인 요청이 만료됐어요. 처음부터 다시 시도해 주세요.",
    token_failed: "네이버 로그인을 마치지 못했어요. 잠시 후 다시 시도해 주세요.",
    profile_failed: "네이버 계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
    naver_conflict: "이 네이버 계정은 이미 다른 우리들 체험단 회원에 연결돼 있어요.",
    user_has_other_naver: "이 회원은 이미 다른 네이버 계정과 연결돼 있어요. 먼저 연결을 해제해 주세요.",
    not_configured: "네이버 로그인은 아직 준비 중이에요. 이메일로 로그인해 주세요.",
    unauthorized: "로그인이 필요해요.",
    server_error: "잠시 후 다시 시도해 주세요.",
  };
  window.naverErr = c => ERR[c] || "네이버 로그인을 마치지 못했어요. 잠시 후 다시 시도해 주세요.";

  // 네이버 동의 화면으로 이동. 실패하면 한글 안내 문구를 던짐
  window.naverStart = async function (purpose, next) {
    const nonce = rand();
    try { sessionStorage.setItem("naver_nonce", nonce); } catch (e) { /* 저장 불가면 아래에서 막힘 */ }
    const h = { ...hdr };
    if (purpose === "link" && window.sb) { const { data } = await sb.auth.getSession(); if (data.session) h.authorization = "Bearer " + data.session.access_token; }
    let r;
    try { r = await fetch(FN + "?action=start", { method: "POST", headers: h, body: JSON.stringify({ purpose, next: next || "", nonce_hash: await sha256(nonce) }) }); }
    catch (e) { throw new Error(ERR.not_configured); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error(ERR[j.error] || ERR.not_configured);
    location.href = j.url;
  };

  // 로그인 화면으로 돌아왔을 때: 1회용 토큰을 받아 로그인 완료 → 가야 할 주소를 돌려줌 (없으면 null)
  window.naverFinish = async function () {
    const q = new URLSearchParams(location.search), state = q.get("naver_state");
    if (!state) return null;
    history.replaceState(null, "", location.pathname);       // 주소창에서 state 제거
    let nonce = ""; try { nonce = sessionStorage.getItem("naver_nonce") || ""; sessionStorage.removeItem("naver_nonce"); } catch (e) { }
    const r = await fetch(FN + "?action=redeem", { method: "POST", headers: hdr, body: JSON.stringify({ state, nonce }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token_hash) throw new Error(window.naverErr(j.error));
    const { error } = await sb.auth.verifyOtp({ token_hash: j.token_hash, type: "magiclink" });
    if (error) throw new Error(window.naverErr("token_failed"));
    return /^[a-z]+\.html(\?[\w=&%.-]*)?$/.test(j.next || "") ? j.next : "index.html";
  };
})();
