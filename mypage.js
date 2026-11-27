// 마이페이지: 휴대폰번호 · SNS 계정 연동 · 신청 내역
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KO = { login_required: "로그인이 필요해요.", bad_phone: "휴대폰번호를 010-0000-0000 형식으로 입력해 주세요.", bad_blog: "네이버 블로그 주소를 확인해 주세요. 예) blog.naver.com/내아이디",
  bad_instagram: "인스타그램 아이디(@아이디) 또는 프로필 주소를 확인해 주세요.", bad_followers: "팔로워 수는 0 이상의 숫자로 입력해 주세요.", only_login_method: "네이버로만 만든 계정은 연결을 해제할 수 없어요. 먼저 이메일·비밀번호 로그인을 만든 뒤 해제해 주세요." };
const fmtPhone = d => d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
const say = (id, text, ok) => { const e = $(id); e.textContent = text || ""; e.classList.toggle("ok", !!ok); };
let uid = null, sns = {};

(async function init() {
  const q = new URLSearchParams(location.search);
  if (!window.sbReady) { $("mp-login").hidden = false; $("mp-login").textContent = "서버 연결 키가 설정되지 않았어요."; return; }
  const { data } = await sb.auth.getSession(); const u = data.session && data.session.user;
  if (!u) { $("mp-login").hidden = false; return; }
  uid = u.id; $("mp-body").hidden = false;
  if (q.get("naver") === "linked") flash("네이버 로그인이 연결됐어요. (블로그 소유 인증은 아니에요)");
  if (q.get("naver_error")) flash(naverErr(q.get("naver_error")));
  if (q.get("naver") || q.get("naver_error")) history.replaceState(null, "", location.pathname);
  await Promise.all([loadPhone(), loadSns(), loadNaver(), loadApps()]);
})();
function flash(t) { const e = $("mp-flash"); e.hidden = false; e.textContent = t; }

async function loadPhone() {
  const { data } = await sb.from("profiles").select("phone").eq("id", uid).maybeSingle();
  if (data && data.phone) $("phone").value = fmtPhone(data.phone);
}
$("phone-form").onsubmit = async e => {
  e.preventDefault(); const b = e.submitter; b.disabled = true; say("phone-msg", "");
  const { data, error } = await sb.rpc("save_phone", { p_phone: $("phone").value });
  b.disabled = false;
  if (error || !data || data.error) return say("phone-msg", KO[data && data.error] || "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  $("phone").value = fmtPhone(data.phone); say("phone-msg", "저장했어요.", true);
};

// ---- SNS (블로그 · 인스타그램). 소유 인증은 하지 않으므로 '등록'으로만 표시
async function loadSns() {
  const { data } = await sb.from("member_sns").select("platform,url,handle,followers,verified").eq("user_id", uid);
  sns = {}; (data || []).forEach(r => sns[r.platform] = r);
  paint("naver_blog", "blog", "등록된 블로그"); paint("instagram", "insta", "프로필 등록 완료");
}
function paint(platform, k, doneLabel) {
  const r = sns[platform];
  const pill = $("st-" + k), val = $("val-" + k);
  // '계정 연동 완료'는 실제로 인증된(verified) 계정에만. 지금은 인증 수단이 없어 항상 '프로필 등록 완료'/'등록된 블로그'
  pill.textContent = !r ? "미등록" : r.verified ? "계정 연동 완료" : doneLabel;
  pill.className = "pill" + (r ? (r.verified ? " ok" : " reg") : "");
  val.innerHTML = r ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a>${r.followers != null ? ` · 팔로워 ${Number(r.followers).toLocaleString()}명` : ""}` : "";
  $(k + "-rm").hidden = !r;
  $(k + "-form").querySelector("button[type=submit]").textContent = r ? "변경" : "등록";
  $(k + "-in").placeholder = r ? "새 주소로 바꾸려면 입력하세요" : $(k + "-in").placeholder;
}
function bind(platform, k) {
  $(k + "-form").onsubmit = async e => {
    e.preventDefault(); const b = e.submitter; b.disabled = true; say(k + "-msg", "");
    const fol = k === "insta" && $("insta-fol").value !== "" ? Number($("insta-fol").value) : null;
    const { data, error } = await sb.rpc("save_sns", { p_platform: platform, p_value: $(k + "-in").value, p_followers: fol });
    b.disabled = false;
    if (error || !data || data.error) return say(k + "-msg", KO[data && data.error] || "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    $(k + "-in").value = ""; if (k === "insta") $("insta-fol").value = "";
    await loadSns(); say(k + "-msg", "등록했어요.", true);
  };
  $(k + "-rm").onclick = async () => {
    if (!confirm("등록한 주소를 삭제할까요? 이미 낸 신청에는 영향이 없어요.")) return;
    const { data } = await sb.rpc("remove_sns", { p_platform: platform });
    if (data && data.ok) { await loadSns(); say(k + "-msg", "삭제했어요.", true); }
  };
}
bind("naver_blog", "blog"); bind("instagram", "insta");

// ---- 네이버 로그인 연결 (로그인 수단. 블로그 인증과 별개)
async function loadNaver() {
  const { data } = await sb.rpc("naver_link_status");
  const pill = $("st-naver"), ac = $("ac-naver");
  if (!data || data.error) { pill.textContent = "확인 불가"; ac.innerHTML = ""; return; }
  pill.textContent = data.linked ? "연결됨" : "미연결"; pill.className = "pill" + (data.linked ? " reg" : "");
  ac.innerHTML = data.linked ? `<button class="btn-line danger" type="button" id="nv-off">연결 해제</button>` : `<button class="btn-line" type="button" id="nv-on">네이버 로그인 연결하기</button>`;
  if ($("nv-on")) $("nv-on").onclick = async e => { e.target.disabled = true; try { await naverStart("link", "mypage.html"); } catch (err) { flash(err.message); e.target.disabled = false; } };
  if ($("nv-off")) $("nv-off").onclick = async () => {
    if (!confirm("네이버 로그인 연결을 해제할까요? 이메일 로그인은 그대로 쓸 수 있어요.")) return;
    const { data: r } = await sb.rpc("naver_unlink");
    if (r && r.error) return flash(KO[r.error] || "해제하지 못했어요.");
    flash("연결을 해제했어요."); loadNaver();
  };
}

// ---- 신청 내역: 신청 완료 ≠ 선정 완료
const ST = { applied: ["신청 완료", "reg"], selected: ["선정 완료", "ok"], rejected: ["선정되지 않았어요", ""] };
async function loadApps() {
  const { data, error } = await sb.from("applications").select("id,status,created_at,applied_channel,channel_url,campaign_id,campaigns(title,biz,type)")
    .eq("applicant_id", uid).order("created_at", { ascending: false });
  const box = $("apps");
  if (error) { box.innerHTML = `<p class="muted">신청 내역을 불러오지 못했어요.</p>`; return; }
  if (!data.length) { box.innerHTML = `<p class="muted">아직 신청한 체험단이 없어요. <a href="campaigns.html">체험단 둘러보기 →</a></p>`; return; }
  box.innerHTML = `<ul class="apps-list">${data.map(a => { const s = ST[a.status] || ST.applied, c = a.campaigns || {};
    return `<li><a href="campaign.html?id=${encodeURIComponent(a.campaign_id)}"><b>${esc(c.title || "체험단")}</b></a>
      <span class="muted small">${esc(c.biz || "")} · ${esc(c.type || "")}${a.applied_channel ? " · " + (a.applied_channel === "instagram" ? "인스타그램" : "네이버 블로그") : ""} · ${esc(String(a.created_at).slice(0, 10))}</span>
      <span class="pill ${s[1]}">${s[0]}</span></li>`; }).join("")}</ul>`;
}
