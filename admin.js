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
  const [s, qs] = (location.hash || "#dashboard").slice(1).split("?");
  if (s === "rank") rk.camp = new URLSearchParams(qs || "").get("c") || null;
  const name = ["dashboard", "members", "campaigns", "apps", "rank", "posts"].includes(s) ? s : "dashboard";
  document.querySelectorAll("main section").forEach(x => x.hidden = x.id !== "s-" + name);
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.s === name));
  ({ dashboard: loadDash, members: () => loadMembers(true), campaigns: loadCamps, apps: loadApps, rank: loadRank, posts: loadPosts })[name]();
}

/* ---------- 대시보드 ---------- */
$("seg").onclick = e => { const r = e.target.dataset.r; if (!r) return; period = r; document.querySelectorAll("#seg button").forEach(b => b.classList.toggle("on", b === e.target)); loadDash(); };
async function loadDash() {
  await sb.rpc("process_expired_campaigns");     // 마감된 체험단 검사 (미선정 부과)
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

/* ---------- 페널티 ---------- */
const inf = v => v === "infinity" || v === "Infinity" || (v && new Date(v).getFullYear() > 9000);
function summarize(ev) {
  const now = new Date();
  const missed = ev.filter(e => e.kind === "missed" && !e.converted_at && new Date(e.expires_at) > now).length;
  const pen = ev.filter(e => e.kind === "penalty").length;
  let susp = null;
  ev.filter(e => e.kind === "penalty" && e.suspended_until).forEach(e => { if (inf(e.suspended_until)) susp = "영구"; else if (new Date(e.suspended_until) > now && susp !== "영구" && (!susp || new Date(e.suspended_until) > new Date(susp))) susp = e.suspended_until; });
  return { missed, pen, susp };
}
let penMap = {};
async function loadPenMap() {
  const { data } = await sb.from("advertiser_events").select("owner_id,kind,created_at,expires_at,converted_at,suspended_until").limit(5000);
  penMap = {}; (data || []).forEach(e => (penMap[e.owner_id] = penMap[e.owner_id] || []).push(e));
}
const penBadge = id => { const s = summarize(penMap[id] || []); return (s.missed || s.pen) ? `<span class="tag ${s.susp ? "bad" : "mid"}">미선정 ${s.missed} · 페널티 ${s.pen}${s.susp ? " · 정지" : ""}</span>` : '<span class="muted">-</span>'; };
let penOwner = null;
async function openPen(id, name) {
  penOwner = id; $("pn-name").textContent = name + " ";
  const { data } = await sb.from("advertiser_events").select("*").eq("owner_id", id).order("created_at", { ascending: false });
  const ev = data || [], s = summarize(ev), now = new Date();
  $("pn-sum").textContent = ` · 미선정 ${s.missed} · 페널티 ${s.pen}${s.susp ? ` · ${s.susp === "영구" ? "영구 정지" : full(s.susp) + "까지 정지"}` : ""}`;
  $("pn-ev").innerHTML = ev.map(e => {
    const pen = e.kind === "penalty";
    const st = pen ? (inf(e.suspended_until) ? "영구 정지" : `정지 ~ ${full(e.suspended_until)}`) : e.converted_at ? "페널티로 전환됨" : new Date(e.expires_at) <= now ? "소멸됨" : `소멸 예정 ${full(e.expires_at)}`;
    return `<li><span class="tag ${pen ? "bad" : "mid"}">${pen ? "페널티" : "미선정"}</span> <span>${esc(e.reason)}</span><small class="muted">${full(e.created_at)} · ${st}</small><button class="btn bad" data-ed="${e.id}">취소</button></li>`;
  }).join("") || '<li class="muted">내역이 없어요.</li>';
  if (!$("pn-dlg").open) $("pn-dlg").showModal();
}
$("pn-close").onclick = () => $("pn-dlg").close();
$("pn-ev").onclick = async e => {
  const id = e.target.dataset.ed; if (!id || !confirm("이 내역을 취소할까요? 취소하면 횟수와 정지가 함께 풀려요.")) return;
  const { error } = await sb.rpc("admin_delete_event", { p_id: Number(id) });
  if (error) return alert("취소하지 못했어요."); await openPen(penOwner, $("pn-name").textContent.trim()); await loadPenMap(); loadMembers(true);
};
$("pn-add").onsubmit = async e => {
  e.preventDefault();
  const reason = $("pn-reason").value.trim(); if (!reason) return;
  if (!confirm(`${$("pn-kind").selectedOptions[0].textContent} 를 부과할까요?`)) return;
  const { error } = await sb.rpc("admin_add_event", { p_owner: penOwner, p_kind: $("pn-kind").value, p_reason: reason });
  if (error) return alert("부과하지 못했어요. (012 SQL 실행 여부를 확인해 주세요)");
  $("pn-reason").value = ""; await openPen(penOwner, $("pn-name").textContent.trim()); await loadPenMap(); loadMembers(true);
};

/* ---------- 회원 · 광고주 승인 ---------- */
let mTimer; $("m-q").oninput = e => { clearTimeout(mTimer); mTimer = setTimeout(() => { mQuery = e.target.value.trim(); loadMembers(true); }, 300); };
$("m-more").onclick = () => loadMembers(false);
$("m-st").onchange = e => { mStatus = e.target.value; loadMembers(true); };
$("pend").onclick = e => { e.preventDefault(); mStatus = "pending"; $("m-st").value = "pending"; location.hash = "#members"; if (location.hash === "#members") loadMembers(true); };
const BS = { none: ["미신청", ""], pending: ["승인 대기", "mid"], approved: ["승인됨", "ok"], rejected: ["반려", "bad"] };
async function loadMembers(reset) {
  if (reset) { mPage = 0; $("members").innerHTML = ""; await sb.rpc("process_expired_campaigns"); await loadPenMap(); }
  const { data, error } = await sb.rpc("admin_members", { p_search: mQuery || null, p_lim: 50, p_off: mPage * 50, p_status: mStatus || null });
  if (error) { $("m-empty").hidden = false; $("m-empty").textContent = "회원을 불러오지 못했어요. (008, 010 SQL 실행 여부를 확인해 주세요)"; return; }
  const rows = data || [];
  if (reset) $("members").innerHTML = `<thead><tr><th>가입일</th><th>닉네임</th><th>이메일</th><th>권한</th><th>광고주 상태</th><th>페널티</th><th>처리</th></tr></thead><tbody></tbody>`;
  $("members").querySelector("tbody").insertAdjacentHTML("beforeend", rows.map(m => {
    const [t, k] = BS[m.business_status] || BS.none, admin = m.role === "admin";
    const doc = m.business_doc_path ? `<button class="btn" data-bs="doc" data-path="${esc(m.business_doc_path)}">서류 보기</button>` : "";
    return `<tr data-id="${m.id}"><td>${full(m.created_at)}</td><td><b>${esc(m.nickname)}</b></td><td>${esc(m.email)}</td><td>${admin ? '<span class="tag blue">관리자</span>' : "회원"}</td>
      <td><span class="tag ${k}">${t}</span>${m.business_note ? `<br><small class="muted">${esc(m.business_note)}</small>` : ""}</td>
      <td>${admin ? "" : penBadge(m.id)}</td>
      <td>${admin ? "" : `${doc}<button class="btn ok" data-bs="approved" ${m.business_status === "approved" ? "disabled" : ""}>승인</button><button class="btn bad" data-bs="rejected" ${m.business_status === "rejected" ? "disabled" : ""}>반려</button><button class="btn" data-bs="none" ${m.business_status === "none" ? "disabled" : ""}>해제</button><button class="btn" data-bs="pen">페널티</button>${m.business_doc_path ? '<button class="btn bad" data-bs="deldoc">서류 삭제</button>' : ""}`}</td></tr>`;
  }).join(""));
  $("m-empty").hidden = reset ? rows.length > 0 : true; $("m-empty").textContent = "회원이 없어요.";
  $("m-more").hidden = rows.length < 50; mPage++;
}
$("members").onclick = async e => {
  const st = e.target.dataset.bs; if (!st) return;
  const tr = e.target.closest("tr"), name = tr.children[1].textContent, id = tr.dataset.id;
  if (st === "pen") return openPen(id, name);
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
      <td><span class="tag ${open ? "ok" : "mid"}">${open ? "모집 중" : "마감"}</span></td><td>${open ? '<button class="btn" data-ca="close">모집 마감</button>' : ""}<button class="btn" data-ca="rank">순위 추적</button><button class="btn bad" data-ca="del">삭제</button></td></tr>`;
  }).join("")}</tbody>` : "";
}
$("campaigns").onclick = async e => {
  const act = e.target.dataset.ca; if (!act) return;
  const tr = e.target.closest("tr"), id = tr.dataset.id, title = tr.children[1].textContent;
  if (act === "rank") { location.hash = "#rank?c=" + id; return; }
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

/* ---------- 순위 추적 ---------- */
const KW_LIMIT_MSG = "활성 검색 키워드는 최대 5개까지예요. 쓰지 않는 키워드는 '추적 중지'한 뒤 등록해 주세요.";
const rkErr = (error, fallback) => /keyword_limit/.test(error.message || "") ? KW_LIMIT_MSG : /duplicate|unique/i.test(error.message || "") ? "같은 매장에 이미 있는 키워드예요." : fallback;
function toast(t, kind) { const el = $("rk-toast"); el.hidden = !t; el.textContent = t || ""; el.className = "rk-toast " + (kind || ""); }
async function loadUsage() {                      // 오늘/이번 달 남은 조회 횟수, 활성 키워드 수, 자동 수집 스위치
  const [u, s] = await Promise.all([sb.rpc("serp_usage"), sb.from("app_settings").select("value").eq("key", "rank_auto").maybeSingle()]);
  if (u.error || !u.data) { $("ru-day").textContent = $("ru-month").textContent = $("ru-kw").textContent = "-"; toast("조회 한도 정보를 불러오지 못했어요. (020 SQL 실행 여부를 확인해 주세요)", "warn"); return; }
  const d = u.data; rk.usage = d;
  $("ru-day").textContent = `${Math.max(0, d.daily_limit - d.daily_used)} / ${d.daily_limit}회`;
  $("ru-month").textContent = `${Math.max(0, d.monthly_limit - d.monthly_used)} / ${d.monthly_limit}회`;
  $("ru-kw").textContent = `${d.active_keywords} / ${d.keyword_limit}개`;
  $("ru-auto").checked = !!(s.data && s.data.value === true);
}
$("ru-auto").onchange = async e => {
  const on = e.target.checked;
  if (on && !confirm("자동 수집을 켤까요?\n예약 작업이 하루 한 번, 활성 키워드를 조회해요. (조회 한도는 수동 조회와 함께 계산돼요)")) { e.target.checked = false; return; }
  const { error } = await sb.from("app_settings").upsert({ key: "rank_auto", value: on, updated_at: new Date().toISOString() });
  if (error) { e.target.checked = !on; return alert("설정을 바꾸지 못했어요. (020 SQL 실행 여부를 확인해 주세요)"); }
  toast(on ? "자동 수집을 켰어요. 예약 작업이 설정되어 있어야 실제로 조회돼요." : "자동 수집을 껐어요.", "ok");
};
const rkBusy = new Set();
async function lookupNow(id, btn) {                // '지금 조회': 서버가 한도·중복을 먼저 확인한 뒤에만 SerpApi 를 부름
  if (rkBusy.has(id)) return;                     // 같은 매장을 연속으로 눌러도 한 번만 보냄
  rkBusy.add(id); btn.disabled = true; const old = btn.textContent; btn.textContent = "조회 중…"; toast("조회하는 중이에요…");
  let msg = "", kind = "";
  try {
    const { data, error } = await sb.functions.invoke("collect-ranks", { body: { tracker_id: id } });
    let r = data;
    if (error && !r) { try { r = await error.context.json(); } catch (_) { r = null; } }
    if (!r) { msg = "조회 서비스에 연결하지 못했어요. (collect-ranks 함수가 배포되어 있는지 확인해 주세요)"; kind = "warn"; }
    else if (r.error === "provider_not_configured") { msg = "SerpApi 키가 서버에 설정되지 않았어요. Supabase > Edge Functions > Secrets 에 SERPAPI_API_KEY 를 등록해 주세요. (조회 횟수는 사용되지 않았어요)"; kind = "warn"; }
    else if (r.error === "unauthorized") { msg = "권한이 없어요. 운영자 계정으로 로그인했는지 확인해 주세요."; kind = "warn"; }
    else if (r.error === "inactive") { msg = "추적이 중지된 키워드예요. 먼저 '추적 재개'를 눌러 주세요."; kind = "warn"; }
    else if (r.error) { msg = "조회하지 못했어요. (" + r.error + ")"; kind = "warn"; }
    else if (r.denied === "daily_limit") { msg = "오늘 조회 한도(5회)에 도달해서 SerpApi를 호출하지 않았어요. 내일 다시 조회해 주세요."; kind = "warn"; }
    else if (r.denied === "monthly_limit") { msg = "이번 달 조회 한도(200회)에 도달해서 SerpApi를 호출하지 않았어요."; kind = "warn"; }
    else if (r.denied === "in_progress") { msg = "같은 키워드를 조회하는 중이에요. 잠시 후 새로고침해 주세요."; kind = "warn"; }
    else if (r.cached) { msg = "오늘 이미 조회한 결과예요. 저장된 결과를 보여 드려요. (조회 횟수는 사용되지 않았어요)"; kind = "ok"; }
    else if (r.failed) { msg = r.error === "no_place_id" ? "이 매장에는 플레이스 ID가 없어서 조회할 수 없어요. 플레이스 주소나 ID를 등록해 주세요." : "조회에 실패했어요. 실패한 호출도 한도에 포함돼요. (" + (r.error || "") + ")"; kind = "warn"; }
    else if (r.called) {
      const mine = (r.results || []).find(x => x.id === id);
      msg = mine ? (mine.found ? `조회했어요: 네이버 통합검색 플레이스 ${mine.position}번째로 노출돼요.` : "조회했어요: 이번 조회 결과에 미노출이에요.") : "조회했어요.";
      if ((r.results || []).length > 1) msg += ` (같은 키워드의 매장 ${(r.results || []).length}곳을 한 번에 확인했어요)`; kind = "ok";
    }
  } catch (e) { msg = "조회 서비스에 연결하지 못했어요."; kind = "warn"; }
  finally { rkBusy.delete(id); btn.disabled = false; btn.textContent = old; }
  toast(msg, kind);
  await loadRank(); loadUsage();
}
// 데이터 구조: rank_trackers(매장·키워드 한 줄) + rank_logs(날짜별 기록: status ok/out/failed, source manual/provider)
const kstDay = d => new Date(new Date(d).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const dayMinus = (day, n) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const hm = iso => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
// 플레이스 주소 또는 ID 에서 ID 숫자 뽑기
function parsePlaceId(v) {
  v = (v || "").trim(); if (!v) return { id: null };
  if (/^\d{5,15}$/.test(v)) return { id: v };
  if (/naver\.me\//i.test(v)) return { err: "단축 주소(naver.me)로는 플레이스 ID를 알 수 없어요. 전체 주소나 ID 숫자를 넣어 주세요." };
  const m = v.match(/\/(\d{5,15})(?:[\/?#]|$)/); return m ? { id: m[1] } : { err: "주소에서 플레이스 ID를 찾지 못했어요. 주소 전체나 ID 숫자를 확인해 주세요." };
}
const rkText = l => !l ? "미수집" : l.status === "out" ? (l.source === "provider" ? "이번 조회 결과에 미노출" : "조회 범위 밖") : l.status === "failed" ? "조회 실패" : l.rank + "번째";
let rk = { trackers: [], logs: {}, camps: [], open: new Set(), camp: null, stopped: false, usage: null };

$("rk-prov").innerHTML = "조회 조건: <b>네이버 통합검색 · 모바일 · 등록한 키워드 그대로</b> (SerpApi). 한도(한국 시간): 하루 5회 · 월 200회 · 실패한 호출 포함. 같은 키워드의 여러 매장은 한 번의 조회로 확인해요. 조회하지 않은 날은 직접 확인한 값을 '수동 확인'으로 기록할 수도 있어요.";
document.querySelectorAll('input[name="rkmode"]').forEach(r => r.onchange = () => { const camp = document.querySelector('input[name="rkmode"]:checked').value === "camp"; $("rk-camp").hidden = !camp; $("rk-ownerbox").hidden = camp; });
$("rk-showstop").onchange = e => { rk.stopped = e.target.checked; drawRank(); };

// 매장 찾기: 서버(search-place)가 NAVER API HUB 지역 검색을 대신 호출. 결과는 화면에만 표시 (저장 안 함, 순위와 무관)
let psBusy = false;
function psShow(msg, kind) { const el = $("ps-msg"); el.hidden = !msg; el.textContent = msg || ""; el.className = "ps-msg " + (kind || ""); }
function psDraw(items) {
  const ul = $("ps-list"); ul.replaceChildren(); ul.hidden = !items.length;
  for (const it of items) {                          // textContent 만 사용 (매장명에 섞인 문자가 화면 코드로 실행되지 않게)
    const li = document.createElement("li"), t = document.createElement("div"); t.className = "ps-t";
    const b = document.createElement("b"); b.textContent = it.name;
    const a = document.createElement("span"); a.textContent = it.roadAddress || it.address || "주소 정보 없음";
    const c = document.createElement("span"); c.textContent = it.category || "업종 정보 없음";
    t.append(b, a, c);
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn"; btn.textContent = "선택";
    btn.onclick = () => { $("rk-pname").value = it.name.slice(0, 60); $("rk-purl").focus(); psShow("매장명만 채웠어요. 플레이스 주소/ID는 직접 붙여 넣어 주세요.", "ok"); };   // 플레이스 URL/ID 는 건드리지 않음
    li.append(t, btn); ul.append(li);
  }
}
async function psSearch() {
  if (psBusy) return;
  const q = $("ps-q").value.trim(); if (q.length < 2) return psShow("매장명을 2글자 이상 입력해 주세요.");
  psBusy = true; $("ps-go").disabled = true; $("ps-go").textContent = "검색 중…"; psShow("검색하는 중이에요…"); psDraw([]);
  try {
    const { data, error } = await sb.functions.invoke("search-place", { body: { query: q } });
    let r = data; if (error && !r) { try { r = await error.context.json(); } catch (_) { r = null; } }
    const err = r && r.error;
    if (!r) psShow("검색 서비스에 연결하지 못했어요. (search-place 함수가 배포되어 있는지 확인해 주세요) 아래에 직접 입력해서 등록할 수 있어요.", "warn");
    else if (err === "not_configured") psShow("네이버 API 키가 서버에 설정되지 않았어요. Supabase > Edge Functions > Secrets 에 NAVER_APIHUB_CLIENT_ID, NAVER_APIHUB_CLIENT_SECRET 를 등록해 주세요. 지금은 아래에 직접 입력해서 등록할 수 있어요.", "warn");
    else if (err === "auth_failed") psShow("네이버 API 키가 올바르지 않거나 사용 권한이 없어요. 키를 다시 확인해 주세요. 직접 입력해서 등록할 수도 있어요.", "warn");
    else if (err === "rate_limited") psShow("검색 요청이 많아 잠시 막혔어요. 잠시 후 다시 시도해 주세요.", "warn");
    else if (err === "unauthorized") psShow("권한이 없어요. 운영자 계정으로 로그인했는지 확인해 주세요.", "warn");
    else if (err === "bad_query") psShow("검색어는 2~40글자로 입력해 주세요.", "warn");
    else if (err) psShow("검색하지 못했어요. 직접 입력해서 등록할 수 있어요. (" + err + ")", "warn");
    else if (!(r.items || []).length) psShow("검색 결과가 없어요. 이름을 바꿔 다시 검색하거나, 아래에 매장명과 플레이스 주소/ID를 직접 입력해 등록할 수 있어요.");
    else { psShow(`후보 ${r.items.length}곳 — 주소를 보고 맞는 지점을 골라 주세요. (순서는 순위가 아니에요)`, "ok"); psDraw(r.items); }
  } catch (_) { psShow("검색 서비스에 연결하지 못했어요. 직접 입력해서 등록할 수 있어요.", "warn"); }
  finally { psBusy = false; $("ps-go").disabled = false; $("ps-go").textContent = "검색"; }
}
$("ps-go").onclick = psSearch;
$("ps-q").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); psSearch(); } };

$("rk-example").onclick = async () => {            // 첫 검증용: 갓구운빵공장 명동점 / 명동 빵집 (내 계정으로 등록해서 시험)
  document.querySelector('input[name="rkmode"][value="owner"]').checked = true; $("rk-camp").hidden = true; $("rk-ownerbox").hidden = false;
  $("rk-owner").innerHTML = `<option value="${me.id}">테스트용: 내 운영자 계정</option>`;
  $("rk-pname").value = "갓구운빵공장 명동점"; $("rk-keywords").value = "명동 빵집"; $("rk-purl").value = "";
  $("rk-purl").focus(); toast("매장명과 키워드를 채웠어요. 네이버 플레이스 주소(또는 ID)를 붙여 넣고 '키워드 등록'을 누른 뒤, 목록에서 '지금 조회'를 눌러 보세요.", "ok");
};
$("rk-camp").onchange = () => {                     // 캠페인을 고르면 매장명·플레이스 주소를 가져옴 (다시 입력하지 않음)
  const c = rk.camps.find(x => x.id === $("rk-camp").value);
  $("rk-pname").value = c ? c.biz : ""; $("rk-purl").value = c && c.place_url ? c.place_url : "";
};
$("rk-find").onclick = async () => {
  const q = $("rk-q").value.trim();
  const { data, error } = await sb.rpc("admin_members", { p_search: q || null, p_lim: 30, p_off: 0, p_status: "approved" });
  if (error) return alert("광고주를 찾지 못했어요. (010 SQL 실행 여부를 확인해 주세요)");
  const rows = (data || []).filter(m => m.role !== "admin");
  $("rk-owner").innerHTML = rows.length ? rows.map(m => `<option value="${m.id}">${esc(m.nickname)} · ${esc(m.email)}</option>`).join("") : '<option value="">승인된 광고주가 없어요</option>';
};
$("rk-add").onsubmit = async e => {
  e.preventDefault();
  const byCamp = document.querySelector('input[name="rkmode"]:checked').value === "camp";
  const camp = byCamp ? rk.camps.find(x => x.id === $("rk-camp").value) : null;
  const owner = byCamp ? (camp && camp.owner_id) : $("rk-owner").value;
  if (!owner) return alert(byCamp ? "캠페인을 선택해 주세요." : "광고주를 선택해 주세요.");
  const name = $("rk-pname").value.trim(); if (!name) return alert("매장명을 입력해 주세요.");
  const pid = parsePlaceId($("rk-purl").value); if (pid.err) return alert(pid.err);
  const kws = [...new Set($("rk-keywords").value.split(/[\n,]/).map(s => s.trim()).filter(Boolean))];
  if (!kws.length) return alert("키워드를 하나 이상 입력해 주세요.");
  if (kws.some(k => k.length > 40)) return alert("키워드는 40자 이하로 입력해 주세요.");
  const url = $("rk-purl").value.trim();
  const have = new Set(rk.trackers.filter(t => t.owner_id === owner && (t.campaign_id || null) === (camp ? camp.id : null)).map(t => t.keyword.toLowerCase()));
  const fresh = kws.filter(k => !have.has(k.toLowerCase()));
  if (!fresh.length) return alert("입력한 키워드가 모두 이미 등록되어 있어요.");
  if (fresh.length < kws.length) alert(`이미 등록된 키워드 ${kws.length - fresh.length}개는 건너뛰고 ${fresh.length}개만 등록할게요.`);
  const rows = fresh.map(k => ({ owner_id: owner, campaign_id: camp ? camp.id : null, keyword: k, place_name: name, place_id: pid.id, place_url: /^https?:\/\//.test(url) && url.length <= 300 ? url : null }));
  const { error } = await sb.from("rank_trackers").insert(rows);
  if (error) {
    const m = error.message || "";
    return alert(/keyword_limit/.test(m) ? KW_LIMIT_MSG : /duplicate|unique/i.test(m) ? "이미 같은 매장에 등록된 키워드가 있어요. 키워드를 확인해 주세요."
      : /column|schema cache/i.test(m) ? "순위 추적용 DB 칸이 아직 없어요. Supabase에서 017 SQL을 실행해 주세요.\n(" + m + ")"
      : /row-level security|permission/i.test(m) ? "등록 권한이 없어요. 운영자(admin) 계정으로 로그인했는지 확인해 주세요.\n(" + m + ")"
      : "등록하지 못했어요.\n(" + m + ")");
  }
  $("rk-keywords").value = ""; loadRank();
};

async function loadRank() {
  if (!rk.usage) loadUsage();
  const [cp, tr] = await Promise.all([
    sb.from("campaigns").select("id,title,biz,owner_id,place_url,created_at").order("created_at", { ascending: false }).limit(300),
    sb.from("rank_trackers").select("*, campaigns(title,biz,created_at), profiles(nickname)").order("created_at", { ascending: false }),
  ]);
  if (tr.error) { $("rk-empty").hidden = false; $("rk-empty").textContent = "불러오지 못했어요. (017 SQL 실행 여부를 확인해 주세요)"; $("rank").innerHTML = ""; return; }
  rk.camps = cp.data || []; rk.trackers = tr.data || [];
  const cur = $("rk-camp").value;
  $("rk-camp").innerHTML = '<option value="">캠페인을 선택하세요</option>' + rk.camps.map(c => `<option value="${c.id}">${esc(c.biz)} · ${esc(c.title)}</option>`).join("");
  if (rk.camps.some(c => c.id === cur)) $("rk-camp").value = cur;
  rk.logs = {};
  const ids = rk.trackers.map(t => t.id);
  if (ids.length) { const { data } = await sb.from("rank_logs").select("*").in("tracker_id", ids).order("day", { ascending: false }).limit(5000); (data || []).forEach(l => (rk.logs[l.tracker_id] = rk.logs[l.tracker_id] || []).push(l)); }
  drawRank();
}
function spark(logs) {                                  // 최근 7일 추이 (정상 순위만 점으로)
  const today = kstDay(Date.now()), days = Array.from({ length: 7 }, (_, i) => dayMinus(today, 6 - i));
  const by = Object.fromEntries(logs.map(l => [l.day, l])), pts = days.map((d, i) => by[d] && by[d].status === "ok" ? { i, r: by[d].rank } : null).filter(Boolean);
  if (pts.length < 1) return '<span class="muted">—</span>';
  const mn = Math.min(...pts.map(p => p.r)), mx = Math.max(...pts.map(p => p.r)), sp = Math.max(1, mx - mn), X = p => 4 + p.i * 14, Y = p => 4 + (p.r - mn) / sp * 20;
  return `<svg class="spark" viewBox="0 0 92 28" role="img" aria-label="최근 7일 기록"><polyline fill="none" stroke="#1f4dff" stroke-width="1.6" points="${pts.map(p => `${X(p)},${Y(p)}`).join(" ")}"/>${pts.map(p => `<circle cx="${X(p)}" cy="${Y(p)}" r="2.2" fill="#1f4dff"><title>${days[p.i].slice(5)} ${p.r}위</title></circle>`).join("")}</svg>`;
}
function stats(t) {
  const logs = (rk.logs[t.id] || []).slice(), start = kstDay(t.campaigns ? t.campaigns.created_at : t.created_at);
  const startLog = logs.find(l => l.day === start && l.status === "ok");
  const first = [...logs].reverse().find(l => l.status === "ok");                // 가장 오래된 정상 기록 = 첫 확인
  const latest = logs[0];
  let delta = "—";                                                               // 같은 키워드로 어제·오늘 둘 다 정상 순위일 때만
  if (latest && latest.status === "ok") {
    const prev = logs.find(l => l.day === dayMinus(latest.day, 1));
    if (prev && prev.status === "ok" && (prev.keyword || t.keyword) === (latest.keyword || t.keyword)) { const d = prev.rank - latest.rank; delta = d === 0 ? "변동 없음" : (d > 0 ? `<span class="rk-d up">▲${d}</span>` : `<span class="rk-d down">▼${-d}</span>`); }
  }
  return { logs, start, startLog, first, latest, delta };
}
function drawRank() {
  const list = rk.trackers.filter(t => (rk.stopped || t.active) && (!rk.camp || t.campaign_id === rk.camp));
  const f = $("rk-filter"), c = rk.camp && rk.camps.find(x => x.id === rk.camp);
  f.hidden = !rk.camp; f.innerHTML = rk.camp ? `캠페인 필터: <b>${esc(c ? c.biz + " · " + c.title : "선택한 캠페인")}</b> <button class="btn" id="rk-unfilter">필터 해제</button>` : "";
  $("rk-empty").hidden = list.length > 0; $("rk-empty").textContent = rk.camp ? "이 캠페인에 등록된 키워드가 없어요." : "등록된 추적이 아직 없어요.";
  if (!list.length) { $("rank").innerHTML = ""; return; }
  $("rank").innerHTML = `<thead><tr><th>매장</th><th>키워드</th><th>시작일 노출 순서</th><th>오늘 노출 순서</th><th>전일 대비</th><th>최근 7일 기록</th><th>마지막 조회</th><th>처리</th></tr></thead><tbody>${list.map(t => {
    const s = stats(t), open = rk.open.has(t.id);
    const startTxt = s.startLog ? s.startLog.rank + "번째" : "미수집" + (s.first ? `<small class="muted">첫 확인 ${s.first.rank}번째 (${s.first.day.slice(5)})</small>` : "");
    const today = s.logs.find(l => l.day === kstDay(Date.now()));
    const last = s.latest ? hm(s.latest.checked_at || s.latest.created_at) + `<small class="muted">${s.latest.source === "provider" ? "자동" : "수동 확인"}</small>` : "—";
    return `<tr class="rk-row ${t.active ? "" : "stopped"} ${open ? "open" : ""}" data-id="${t.id}"><td data-l="매장"><b>${esc(t.place_name || (t.campaigns && t.campaigns.biz) || "-")}</b><small class="muted">${esc(nickOf(t))}${t.active ? "" : " · 중지됨"}</small></td>
      <td data-l="키워드">${esc(t.keyword)}</td><td data-l="시작일 순위">${startTxt}</td>
      <td data-l="오늘 노출 순서">${today ? `<b>${rkText(today)}</b>` : `<b class="muted">오늘 미수집</b>${s.latest ? `<small class="muted">최근 ${s.latest.day.slice(5)}: ${rkText(s.latest)}</small>` : ""}`}</td>
      <td data-l="전일 대비">${s.delta}</td><td data-l="최근 7일 기록">${spark(s.logs)}</td><td data-l="마지막 조회">${last}</td>
      <td class="rk-act"><button class="btn ok" data-rk="now">지금 조회</button><button class="btn" data-rk="edit">키워드 수정</button><button class="btn ${t.active ? "bad" : ""}" data-rk="toggle">${t.active ? "추적 중지" : "추적 재개"}</button></td></tr>
      ${open ? detailRow(t, s) : ""}`;
  }).join("")}</tbody>`;
}
function detailRow(t, s) {
  const rows = s.logs.slice(0, 60).map(l => `<tr><td>${l.day}</td><td><b>${rkText(l)}</b></td><td>${l.source === "provider" ? "자동 조회" : "수동 확인"}</td><td>${l.checked_at ? hm(l.checked_at) : "-"}</td><td><button class="btn bad" data-ld="${l.id}">삭제</button></td></tr>`).join("");
  const info = s.first ? `첫 확인 노출 순서 <b>${s.first.rank}번째</b> (${s.first.day.slice(5)})` : "아직 정상 기록이 없어요";
  return `<tr class="rk-detail" data-for="${t.id}"><td colspan="8"><div class="rk-dwrap">
    <div class="rk-dleft"><div class="rk-dh"><b>날짜별 기록</b><span class="muted">${info} · 캠페인 시작일 ${s.start.slice(5)}</span></div>
      ${rows ? `<table class="rk-dtb"><thead><tr><th>날짜</th><th>결과</th><th>출처</th><th>조회 시각</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">기록이 아직 없어요. 오른쪽에서 직접 확인한 순위를 기록해 주세요.</p>'}</div>
    <form class="rk-rec2" data-t="${t.id}"><b>수동 확인 기록</b><small class="muted">같은 날짜를 다시 저장하면 덮어써요. 출처는 '수동 확인'으로 표시돼요. (조회 한도에는 포함되지 않아요)</small>
      <input type="date" name="day" value="${kstDay(Date.now())}" required>
      <select name="status"><option value="ok">노출 순서 있음</option><option value="out">조회 범위 밖 / 미노출</option><option value="failed">조회 실패</option></select>
      <input type="number" name="rank" min="1" max="300" placeholder="노출 순서 (몇 번째)">
      <button class="btn ok" type="submit">기록 저장</button></form></div></td></tr>`;
}
$("rank").onclick = async e => {
  if (e.target.id === "rk-unfilter") return;
  const tr = e.target.closest("tr"); if (!tr) return;
  const act = e.target.dataset.rk, ld = e.target.dataset.ld;
  if (ld) { if (!confirm("이 기록을 삭제할까요?")) return; const { error } = await sb.from("rank_logs").delete().eq("id", Number(ld)); if (error) return alert("삭제하지 못했어요."); return loadRank(); }
  if (!tr.classList.contains("rk-row")) return;
  const id = tr.dataset.id, t = rk.trackers.find(x => x.id === id);
  if (!act) { if (e.target.closest("button,a,input,select")) return; rk.open.has(id) ? rk.open.delete(id) : rk.open.add(id); return drawRank(); }   // 행 누르면 펼치기
  if (act === "now") return lookupNow(id, e.target);
  if (act === "edit") {
    const nk = prompt("새 키워드를 입력하세요.\n(키워드를 바꾸면 이전 기록과는 전일 대비를 계산하지 않아요)", t.keyword);
    if (nk === null) return; const k = nk.trim(); if (!k || k.length > 40) return alert("키워드는 1~40자로 입력해 주세요."); if (k === t.keyword) return;
    const { error } = await sb.from("rank_trackers").update({ keyword: k, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return alert(rkErr(error, "수정하지 못했어요.")); return loadRank();
  }
  if (act === "toggle") {
    if (t.active && !confirm(`'${t.keyword}' 추적을 중지할까요? 기록은 그대로 남고 광고주 화면에서는 보이지 않아요.`)) return;
    const { error } = await sb.from("rank_trackers").update({ active: !t.active, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return alert(rkErr(error, "변경하지 못했어요.")); return loadRank();
  }
};
$("rank").addEventListener("submit", async e => {
  const f = e.target.closest(".rk-rec2"); if (!f) return; e.preventDefault();
  const t = rk.trackers.find(x => x.id === f.dataset.t), status = f.status.value, rank = f.rank.value === "" ? null : Number(f.rank.value);
  if (status === "ok" && rank == null) return alert("노출 순서(몇 번째)를 입력해 주세요.");
  const { error } = await sb.from("rank_logs").upsert({ tracker_id: t.id, day: f.day.value, status, rank: status === "ok" ? rank : null, out_of_rank: status === "out", source: "manual", keyword: t.keyword, checked_at: new Date().toISOString() }, { onConflict: "tracker_id,day" });
  if (error) return alert("저장하지 못했어요. 값을 확인해 주세요. (017 SQL 실행 여부)"); loadRank();
});
document.addEventListener("click", e => { if (e.target.id === "rk-unfilter") { rk.camp = null; history.replaceState(null, "", "#rank"); drawRank(); } });

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
