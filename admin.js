// 관리자 페이지: 운영자(profiles.role = 'admin')만 사용. 모든 집계는 DB의 운영자 전용 함수(008 SQL)가 처리합니다.
const $ = id => document.getElementById(id);
const cfg = window.WOORI || {};
const sbReady = !!(cfg.SUPABASE_ANON_KEY && window.supabase);
const sb = sbReady ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
let me = null, period = "month", mPage = 0, mQuery = "", mStatus = "";
const gate = (t, withLogin) => { $("gate").hidden = false; $("app").hidden = true; $("gate").innerHTML = ""; const p = document.createElement("div"); p.textContent = t; $("gate").append(p);
  if (withLogin) { const b = document.createElement("button"); b.textContent = "다른 계정으로 로그인"; b.onclick = async () => { await sb.auth.signOut(); location.href = "admin-login.html"; }; p.after(b); } };
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const short = iso => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
const full = iso => { const d = new Date(iso); return `${d.getFullYear()}.${short(iso)}`; };
const num = x => Number(x || 0).toLocaleString("ko-KR");

function range() {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  if (period === "last") return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0), title: `${new Date(y, m - 1, 1).getFullYear()}년 ${new Date(y, m - 1, 1).getMonth() + 1}월` };
  if (period === "year") return { from: new Date(y, 0, 1), to: new Date(y, 11, 31), title: `${y}년` };
  return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0), title: `${y}년 ${m + 1}월` };
}

async function init() {
  if (!sbReady) return gate("서버 연결 키가 설정되지 않았습니다.");
  const { data } = await sb.auth.getSession();
  const u = data.session && data.session.user;
  if (!u) return location.replace("admin-login.html");
  const { data: p } = await sb.from("profiles").select("nickname,role").eq("id", u.id).maybeSingle();
  if (!p || p.role !== "admin") return gate("관리자만 볼 수 있는 페이지예요.", true);
  me = u;
  $("gate").hidden = true; $("app").hidden = false;
  const nick = p.nickname || u.email.split("@")[0];
  $("me-av").textContent = nick.slice(0, 1).toUpperCase(); $("me-name").textContent = nick; $("me-mail").textContent = u.email;
  window.addEventListener("hashchange", route); route();
}

const loaded = {};
function route() {
  const s = (location.hash || "#dashboard").slice(1);
  const name = ["dashboard", "members", "campaigns", "apps", "posts"].includes(s) ? s : "dashboard";
  document.querySelectorAll("main section").forEach(x => x.hidden = x.id !== "s-" + name);
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.s === name));
  ({ dashboard: loadDash, members: () => loadMembers(true), campaigns: loadCamps, apps: loadApps, posts: loadPosts })[name]();
}

/* ---------- 대시보드 ---------- */
$("seg").onclick = e => { const r = e.target.dataset.r; if (!r) return; period = r; document.querySelectorAll("#seg button").forEach(b => b.classList.toggle("on", b === e.target)); loadDash(); };
async function loadDash() {
  const r = range(); $("period-title").textContent = r.title;
  const [from, to] = [ymd(r.from), ymd(r.to)];
  const [ov, dl, rc] = await Promise.all([sb.rpc("admin_overview", { p_from: from, p_to: to }), sb.rpc("admin_daily", { p_from: from, p_to: to }), sb.rpc("admin_recent_applications", { lim: 5 })]);
  if (ov.error) { $("cards").innerHTML = `<p class="empty">집계를 불러오지 못했어요. (008 SQL을 실행했는지 확인해 주세요)</p>`; return; }
  const o = ov.data;
  $("pend").hidden = !o.biz_pending; $("pend").textContent = o.biz_pending;
  $("cards").innerHTML = [
    ["신규 회원", `${num(o.members_new)}<span>명</span>`, `전체 ${num(o.members_total)}명`, ""],
    ["신규 체험단", `${num(o.campaigns_new)}<span>건</span>`, `전체 ${num(o.campaigns_total)}건 · 모집 중 ${num(o.campaigns_open)}건`, ""],
    ["신규 신청", `${num(o.apps_new)}<span>건</span>`, `선정 ${num(o.apps_selected_new)}건 · 전체 ${num(o.apps_total)}건`, ""],
    ["광고주 승인", `${num(o.biz_approved)}<span>명</span>`, o.biz_pending ? `승인 대기 ${num(o.biz_pending)}명` : "승인 대기 없음", o.biz_pending ? "w" : ""],
  ].map(([t, n, s, c]) => `<div class="card"><small>${t}</small><div class="n">${n}</div><div class="s ${c}">${s}</div></div>`).join("");
  drawChart(dl.data || []);
  const bt = o.by_type || {}, mx = Math.max(1, ...Object.values(bt));
  $("bytype").innerHTML = ["블로그", "구매평", "인스타"].map(k => `<div class="bt-row"><span>${k}</span><div class="bar"><i style="width:${(bt[k] || 0) / mx * 100}%"></i></div><b>${bt[k] || 0}</b></div>`).join("")
    + (Object.keys(bt).length ? "" : '<p class="muted">이 기간에 등록된 체험단이 없어요.</p>');
  drawRecent(rc.data || [], $("recent"), true);
  $("recent-sum").textContent = rc.data && rc.data.length ? `최근 ${rc.data.length}건` : "";
}
function drawChart(rows) {
  const year = period === "year";
  let g = rows.map(d => ({ l: d.day.slice(5).replace("-", "."), a: d.apps, m: d.members }));
  if (year) { const by = {}; rows.forEach(d => { const k = d.day.slice(5, 7); (by[k] = by[k] || { l: Number(k) + "월", a: 0, m: 0 }); by[k].a += d.apps; by[k].m += d.members; }); g = Object.keys(by).sort().map(k => by[k]); }
  const mx = Math.max(1, ...g.map(x => Math.max(x.a, x.m)));
  $("chart").innerHTML = g.map(x => `<div class="g" title="${x.l} · 신청 ${x.a} · 가입 ${x.m}"><i class="${x.a ? "a" : "z"}" style="height:${x.a ? x.a / mx * 100 : 2}%"></i><i class="${x.m ? "m" : "z"}" style="height:${x.m ? x.m / mx * 100 : 2}%"></i></div>`).join("");
  $("chart").insertAdjacentHTML("afterend", "");
  let ax = $("chart").nextElementSibling; if (!ax || !ax.classList.contains("axis")) { ax = document.createElement("div"); ax.className = "axis"; $("chart").after(ax); }
  ax.innerHTML = g.length ? `<span>${g[0].l}</span><span>${g[Math.floor(g.length / 2)].l}</span><span>${g[g.length - 1].l}</span>` : "";
}
const ST = { applied: ["대기", "mid"], selected: ["선정", "ok"], rejected: ["탈락", "bad"] };
function drawRecent(rows, el, short5) {
  el.innerHTML = `<thead><tr><th>신청일</th><th>이름</th><th>체험단</th><th>업체</th><th>종류</th><th>상태</th></tr></thead><tbody>${rows.map(a => {
    const [t, k] = ST[a.status] || ST.applied;
    return `<tr><td>${short5 ? short(a.created_at) : full(a.created_at)}</td><td><b>${esc(a.applicant_name || "-")}</b></td><td class="t"><a href="campaign.html?id=${encodeURIComponent(a.campaign_id)}">${esc(a.campaign_title)}</a></td><td>${esc(a.biz)}</td><td><span class="tag">${esc(a.campaign_type)}</span></td><td><span class="tag ${k}">${t}</span></td></tr>`;
  }).join("")}</tbody>`;
  if (!rows.length) el.innerHTML = "";
}

/* ---------- 회원 · 광고주 승인 ---------- */
let mTimer; $("m-q").oninput = e => { clearTimeout(mTimer); mTimer = setTimeout(() => { mQuery = e.target.value.trim(); loadMembers(true); }, 300); };
$("m-more").onclick = () => loadMembers(false);
$("m-st").onchange = e => { mStatus = e.target.value; loadMembers(true); };
$("pend").onclick = e => { e.preventDefault(); mStatus = "pending"; $("m-st").value = "pending"; location.hash = "#members"; if (location.hash === "#members") loadMembers(true); };
const BS = { none: ["미신청", ""], pending: ["승인 대기", "mid"], approved: ["승인됨", "ok"], rejected: ["반려", "bad"] };
async function loadMembers(reset) {
  if (reset) { mPage = 0; $("members").innerHTML = ""; }
  const { data, error } = await sb.rpc("admin_members", { p_search: mQuery || null, p_lim: 50, p_off: mPage * 50, p_status: mStatus || null });
  if (error) { $("m-empty").hidden = false; $("m-empty").textContent = "회원을 불러오지 못했어요. (008, 010 SQL 실행 여부를 확인해 주세요)"; return; }
  const rows = data || [];
  if (reset) $("members").innerHTML = `<thead><tr><th>가입일</th><th>닉네임</th><th>이메일</th><th>권한</th><th>광고주 상태</th><th>처리</th></tr></thead><tbody></tbody>`;
  $("members").querySelector("tbody").insertAdjacentHTML("beforeend", rows.map(m => {
    const [t, k] = BS[m.business_status] || BS.none, admin = m.role === "admin";
    const doc = m.business_doc_path ? `<button class="btn" data-bs="doc" data-path="${esc(m.business_doc_path)}">서류 보기</button>` : "";
    return `<tr data-id="${m.id}"><td>${full(m.created_at)}</td><td><b>${esc(m.nickname)}</b></td><td>${esc(m.email)}</td><td>${admin ? '<span class="tag blue">관리자</span>' : "회원"}</td>
      <td><span class="tag ${k}">${t}</span>${m.business_note ? `<br><small class="muted">${esc(m.business_note)}</small>` : ""}</td>
      <td>${admin ? "" : `${doc}<button class="btn ok" data-bs="approved" ${m.business_status === "approved" ? "disabled" : ""}>승인</button><button class="btn bad" data-bs="rejected" ${m.business_status === "rejected" ? "disabled" : ""}>반려</button><button class="btn" data-bs="none" ${m.business_status === "none" ? "disabled" : ""}>해제</button>${m.business_doc_path ? '<button class="btn bad" data-bs="deldoc">서류 삭제</button>' : ""}`}</td></tr>`;
  }).join(""));
  $("m-empty").hidden = reset ? rows.length > 0 : true; $("m-empty").textContent = "회원이 없어요.";
  $("m-more").hidden = rows.length < 50; mPage++;
}
$("members").onclick = async e => {
  const st = e.target.dataset.bs; if (!st) return;
  const tr = e.target.closest("tr"), name = tr.children[1].textContent, id = tr.dataset.id;
  if (st === "doc") {                       // 사업자등록증: 60초짜리 임시 주소로 열기 (운영자만 가능)
    const { data, error } = await sb.storage.from("business-docs").createSignedUrl(e.target.dataset.path, 60);
    if (error || !data) return alert("서류를 열지 못했어요.");
    window.open(data.signedUrl, "_blank", "noopener"); return;
  }
  if (st === "deldoc") {
    const path = tr.querySelector("[data-path]") && tr.querySelector("[data-path]").dataset.path;
    if (!path || !confirm(`${name} 님의 사업자등록증 파일을 삭제할까요?\n삭제하면 되돌릴 수 없어요. (승인 상태는 그대로예요)`)) return;
    const rm = await sb.storage.from("business-docs").remove([path]);
    if (rm.error) return alert("서류를 삭제하지 못했어요.");
    await sb.from("profiles").update({ business_doc_path: null }).eq("id", id);
    return loadMembers(true);
  }
  const patch = { business_status: st };
  if (st === "rejected") {
    const why = prompt(`${name} 님의 반려 사유를 적어 주세요. (신청자에게 보여요)`);
    if (why === null) return; if (!why.trim()) return alert("반려 사유를 입력해 주세요.");
    patch.business_note = why.trim().slice(0, 200);
  } else {
    if (!confirm(`${name} 님의 광고주 상태를 '${BS[st][0]}'(으)로 바꿀까요?`)) return;
    patch.business_note = null;
  }
  e.target.disabled = true;
  const { error } = await sb.from("profiles").update(patch).eq("id", id);
  if (error) { alert("변경하지 못했어요."); e.target.disabled = false; return; }
  loadMembers(true); if (location.hash === "#dashboard" || !location.hash) loadDash();
};

/* ---------- 체험단 ---------- */
async function loadCamps() {
  const { data, error } = await sb.from("campaigns").select("id,title,biz,type,mode,status,deadline,slots,created_at,profiles(nickname)").order("created_at", { ascending: false }).limit(200);
  if (error) { $("c-empty").hidden = false; $("c-empty").textContent = "체험단을 불러오지 못했어요."; return; }
  const { data: cnt } = await sb.rpc("campaign_counts");
  const n = Object.fromEntries((cnt || []).map(r => [r.campaign_id, Number(r.applied)]));
  const today = ymd(new Date());
  $("c-empty").hidden = (data || []).length > 0;
  $("campaigns").innerHTML = (data || []).length ? `<thead><tr><th>등록일</th><th>체험단</th><th>업체</th><th>종류</th><th>등록자</th><th>신청/모집</th><th>마감일</th><th>상태</th><th>처리</th></tr></thead><tbody>${data.map(c => {
    const open = c.status === "open" && c.deadline >= today;
    return `<tr data-id="${c.id}"><td>${full(c.created_at)}</td><td class="t"><a href="campaign.html?id=${encodeURIComponent(c.id)}"><b>${esc(c.title)}</b></a></td><td>${esc(c.biz)}</td><td><span class="tag">${esc(c.type)} · ${esc(c.mode)}</span></td><td>${esc(nickOf(c))}</td><td>${n[c.id] || 0} / ${c.slots}</td><td>${esc(c.deadline)}</td>
      <td><span class="tag ${open ? "ok" : "mid"}">${open ? "모집 중" : "마감"}</span></td><td>${open ? '<button class="btn" data-ca="close">모집 마감</button>' : ""}<button class="btn bad" data-ca="del">삭제</button></td></tr>`;
  }).join("")}</tbody>` : "";
}
$("campaigns").onclick = async e => {
  const act = e.target.dataset.ca; if (!act) return;
  const tr = e.target.closest("tr"), id = tr.dataset.id, title = tr.children[1].textContent;
  if (act === "close") { if (!confirm(`'${title}' 모집을 마감할까요?`)) return; const { error } = await sb.from("campaigns").update({ status: "closed" }).eq("id", id); if (error) return alert("마감하지 못했어요."); }
  if (act === "del") { if (!confirm(`'${title}' 체험단을 삭제할까요?\n신청자 정보도 함께 삭제되며 되돌릴 수 없어요.`)) return; const { error } = await sb.from("campaigns").delete().eq("id", id); if (error) return alert("삭제하지 못했어요."); }
  loadCamps();
};

/* ---------- 신청 ---------- */
async function loadApps() {
  const { data, error } = await sb.rpc("admin_recent_applications", { lim: 100 });
  if (error) { $("a-empty").hidden = false; $("a-empty").textContent = "신청을 불러오지 못했어요. (008 SQL 실행 여부를 확인해 주세요)"; return; }
  $("a-empty").hidden = (data || []).length > 0; drawRecent(data || [], $("apps"), false);
}

/* ---------- 게시판 ---------- */
async function loadPosts() {
  const { data, error } = await sb.from("posts").select("id,board,title,created_at,views,is_notice,profiles(nickname),comments(count)").order("created_at", { ascending: false }).limit(100);
  if (error) { $("p-empty").hidden = false; $("p-empty").textContent = "글을 불러오지 못했어요."; return; }
  $("p-empty").hidden = (data || []).length > 0;
  $("posts").innerHTML = (data || []).length ? `<thead><tr><th>작성일</th><th>게시판</th><th>제목</th><th>작성자</th><th>댓글</th><th>조회</th><th>처리</th></tr></thead><tbody>${data.map(p => `<tr data-id="${p.id}"><td>${full(p.created_at)}</td><td><span class="tag">${esc((BOARDS[p.board] || { cat: p.board }).cat)}</span></td>
    <td class="t">${p.is_notice ? '<span class="tag blue">공지</span> ' : ""}<a href="post.html?b=${esc(p.board)}&id=${p.id}"><b>${esc(p.title)}</b></a></td><td>${esc(nickOf(p))}</td><td>${cntOf(p)}</td><td>${p.views}</td><td><button class="btn bad" data-pd="1">삭제</button></td></tr>`).join("")}</tbody>` : "";
}
$("posts").onclick = async e => {
  if (!e.target.dataset.pd) return;
  const tr = e.target.closest("tr");
  if (!confirm(`'${tr.children[2].textContent.trim()}' 글을 삭제할까요? 댓글도 함께 삭제돼요.`)) return;
  const { error } = await sb.from("posts").delete().eq("id", tr.dataset.id);
  if (error) return alert("삭제하지 못했어요."); loadPosts();
};
$("logout").onclick = async () => { await sb.auth.signOut(); location.href = "admin-login.html"; };
init();
