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

// ---- 신청 내역: 신청 접수 → 선정 결과 → 체험 일정/배송 → 리뷰 제출
// 데이터가 있는 것만 보여줘요. (선정 발표일·방문 확정일·배송 상태는 아직 저장하는 곳이 없어 표시하지 않음)
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const RV = { submitted: "리뷰 제출됨 · 광고주 확인 대기", confirmed: "리뷰 확인 완료", revision: "광고주가 수정을 요청했어요" };

// 상태값 매핑 (applications.status + 후기 제출 + 캠페인 정보 → 화면용)
function progress(a, rv, c) {
  const visit = c.mode === "방문형", mid = visit ? "체험 일정" : "배송";
  const steps = ["신청 접수", "선정 결과", mid, "리뷰 제출"];
  const base = { steps, mid, group: "active" };
  if (a.status === "rejected") return { ...base, done: 2, stop: true, group: "ended", badge: ["선정되지 않았어요", ""], next: "이번 체험단은 선정되지 않았어요. 다른 체험단에 도전해 보세요." };
  if (a.status !== "selected") return { ...base, done: 1, badge: ["신청 접수", "reg"], next: "선정 결과를 기다리는 중이에요" };
  if (rv) {
    if (rv.review_status === "confirmed") return { ...base, done: 4, group: "ended", badge: ["리뷰 확인 완료", "ok"], next: "리뷰를 제출했고 광고주가 확인했어요" };
    if (rv.review_status === "revision") return { ...base, done: 3, badge: ["수정 요청", "bad"], next: "광고주의 수정 요청을 확인하고 리뷰를 다시 제출해 주세요", note: rv.revision_note, review: true };
    return { ...base, done: 4, badge: ["리뷰 제출 완료", "ok"], next: "리뷰를 제출했어요", review: true, again: true };
  }
  const late = c.review_deadline && c.review_deadline < kstToday();
  return { ...base, done: 2, badge: ["선정됨", "ok"], review: true,
    next: visit ? "방문 일정을 확인해 주세요" : "배송 안내를 확인해 주세요", after: late ? "리뷰 마감일이 지났어요. 필요하면 광고주에게 문의해 주세요." : (c.review_deadline ? "체험 후 리뷰 마감일까지 링크를 제출해 주세요" : "체험 후 리뷰 링크를 제출해 주세요") };
}
function card(a, rv, c) {
  const p = progress(a, rv, c), ch = a.applied_channel ? (a.applied_channel === "instagram" ? "인스타그램" : "네이버 블로그") : "";
  const extra = [];
  if (c.review_deadline && a.status === "selected") extra.push(`리뷰 마감일 ${esc(c.review_deadline)}`);
  if (a.status === "applied" || a.status === "selected") if (a.visit_date && c.mode === "방문형") extra.push(`방문 희망일 ${esc(a.visit_date)}`);   // 신청자가 직접 적은 희망일 (확정일 아님)
  return `<li class="ap-card${p.stop ? " stop" : ""}">
    <div class="ap-top"><a class="ap-title" href="campaign.html?id=${encodeURIComponent(a.campaign_id)}">${esc(c.title || "체험단")}</a><span class="pill ${p.badge[1]}">${p.badge[0]}</span></div>
    <p class="muted small">${esc(c.biz || "")} · ${esc(c.type || "")} · ${esc(c.mode || "")}${ch ? " · " + ch : ""} · 신청일 ${esc(String(a.created_at).slice(0, 10))}</p>
    <ol class="ap-steps">${p.steps.map((t, i) => `<li class="${i < p.done ? "done" : i === p.done && !p.stop ? "cur" : ""}${p.stop && i === 2 ? " off" : ""}"><i>${i < p.done ? "✓" : i + 1}</i><span>${t}</span></li>`).join("")}</ol>
    <p class="ap-next"><b>다음 할 일</b> ${esc(p.next)}</p>
    ${p.after ? `<p class="muted small">${esc(p.after)}</p>` : ""}
    ${p.note ? `<p class="rv-note"><b>광고주 수정 요청:</b> ${esc(p.note)}</p>` : ""}
    ${extra.length ? `<p class="muted small">${extra.join(" · ")}</p>` : ""}
    ${p.review ? `<a class="btn-line ap-act" href="review.html?c=${encodeURIComponent(a.campaign_id)}">${p.again ? "리뷰 확인·다시 제출" : "리뷰 링크 제출하기"}</a>` : ""}
  </li>`;
}
async function loadApps() {
  const box = $("apps");
  const { data, error } = await sb.from("applications").select("id,status,created_at,applied_channel,visit_date,campaign_id,campaigns(title,biz,type,mode,review_deadline)")
    .eq("applicant_id", uid).order("created_at", { ascending: false });
  if (error) { box.innerHTML = `<p class="muted">신청 내역을 불러오지 못했어요. <button type="button" class="btn-line" id="apps-retry" style="padding:6px 12px;font-size:12px">다시 시도</button></p>`; $("apps-retry").onclick = loadApps; return; }
  if (!data.length) { box.innerHTML = `<p class="muted">아직 신청한 체험단이 없어요. <a href="campaigns.html">체험단 둘러보기 →</a></p>`; return; }
  let rvMap = {}, rvOk = true;      // 후기 제출 현황 (39 SQL). 못 불러오면 '리뷰 제출 여부'는 확인 불가로 안내
  const { data: rv, error: rerr } = await sb.rpc("my_reviews");
  if (rerr || !Array.isArray(rv)) rvOk = false; else rv.forEach(r => rvMap[r.application_id] = r);
  const items = data.map(a => ({ a, c: a.campaigns || {}, p: progress(a, rvMap[a.id], a.campaigns || {}) }));
  const act = items.filter(x => x.p.group === "active"), end = items.filter(x => x.p.group === "ended");
  const html = (arr) => `<ul class="ap-list">${arr.map(x => card(x.a, rvMap[x.a.id], x.c)).join("")}</ul>`;
  box.innerHTML = (rvOk ? "" : `<p class="notice-box">리뷰 제출 현황을 불러오지 못했어요. 선정된 건은 리뷰를 이미 냈더라도 "제출 전"으로 보일 수 있어요. <a href="review.html">내 제출 확인하기</a></p>`)
    + `<h3 class="ap-h">진행 중 <small>${act.length}건</small></h3>${act.length ? html(act) : `<p class="muted small">진행 중인 신청이 없어요.</p>`}`
    + (end.length ? `<h3 class="ap-h">지난 신청 <small>${end.length}건 · 미선정·완료</small></h3>${html(end)}` : "");
}
