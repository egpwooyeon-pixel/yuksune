// 내 체험단 관리: 내가 올린 체험단 목록, 신청자 보기, 선정/탈락, 모집 마감, 삭제, CSV 내려받기
const $ = id => document.getElementById(id);
const EMAIL_ON = !!(window.WOORI && window.WOORI.EMAIL_NOTIFY);   // 선정 안내 메일 기능 스위치 (config.js)
const todayStr = () => new Date().toISOString().slice(0, 10);
let me = null, camps = [], counts = {}, openId = null, apps = [];

const ST = { applied: ["신청", "mid"], selected: ["선정", "ok"], rejected: ["탈락", "bad"] };
const fmt = iso => { const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
const isOpen = c => c.status === "open" && c.deadline >= todayStr();
const msg = t => { $("my-msg").hidden = !t; $("my-msg").textContent = t || ""; };

async function init() {
  if (!window.sbReady) return msg("서버 연결 키가 설정되지 않았습니다.");
  const { data } = await sb.auth.getSession();
  me = data.session && data.session.user;
  if (!me) return location.replace("login.html?next=my.html");
  await loadCampaigns();
}

async function loadCampaigns() {
  await sb.rpc("process_expired_campaigns");    // 마감된 체험단 검사 (미선정 부과, 여러 번 불러도 안전)
  const { data, error } = await sb.from("campaigns").select("*").eq("owner_id", me.id).order("created_at", { ascending: false });
  if (error) return msg("체험단을 불러오지 못했어요.");
  camps = data || [];
  counts = {};
  if (camps.length) {
    const { data: a } = await sb.from("applications").select("campaign_id,status").in("campaign_id", camps.map(c => c.id));
    (a || []).forEach(r => { const o = counts[r.campaign_id] || (counts[r.campaign_id] = { all: 0, selected: 0 }); o.all++; if (r.status === "selected") o.selected++; });
  }
  msg(camps.length ? "" : "등록한 체험단이 아직 없어요. 오른쪽 위 '체험단 등록하기'로 올려 보세요.");
  $("my-list-wrap").hidden = !camps.length;
  $("my-list").innerHTML = camps.map(c => {
    const k = counts[c.id] || { all: 0, selected: 0 }, open = isOpen(c);
    return `<li class="my-item" data-id="${c.id}">
      <div class="mi-main"><span class="tag ${open ? "ok" : "mid"}">${open ? "모집 중" : "마감"}</span>
        <b class="mi-title">${esc(c.title)}</b>
        <p class="muted small">${esc(c.type)} · ${esc(c.mode)} · 마감 ${esc(c.deadline)} · 신청 <b>${k.all}</b>명 · 선정 <b>${k.selected}</b>/${c.slots}명</p></div>
      <div class="mi-btns">
        <button type="button" class="btn-line" data-act="apps">신청자 보기</button>
        <a class="btn-line" href="campaign.html?id=${encodeURIComponent(c.id)}">상세</a>
        <a class="btn-line" href="register.html?edit=${encodeURIComponent(c.id)}">수정</a>
        ${open ? '<button type="button" class="btn-line" data-act="close">모집 마감</button>' : ""}
        <button type="button" class="btn-line danger" data-act="del">삭제</button>
      </div></li>`;
  }).join("");
  if (openId && camps.some(c => c.id === openId)) showApps(openId); else closeApps();
}

$("my-list").onclick = async e => {
  const act = e.target.dataset.act; if (!act) return;
  const id = e.target.closest("li").dataset.id, c = camps.find(x => x.id === id);
  if (act === "apps") return showApps(id);
  if (act === "close") {
    if (!confirm("모집을 마감할까요? 마감하면 더 이상 신청을 받지 않아요.")) return;
    const { error } = await sb.from("campaigns").update({ status: "closed" }).eq("id", id);
    if (error) return alert("마감하지 못했어요."); return loadCampaigns();
  }
  if (act === "del") {
    if (!confirm(`'${c.title}' 체험단을 삭제할까요?\n신청자 정보도 함께 삭제되며 되돌릴 수 없어요.`)) return;
    const { error } = await sb.from("campaigns").delete().eq("id", id);
    if (error) return alert("삭제하지 못했어요. 신청자가 있는 체험단은 삭제할 수 없어요. (모집 마감을 이용해 주세요)"); if (openId === id) openId = null; return loadCampaigns();
  }
};

async function showApps(id) {
  openId = id;
  const c = camps.find(x => x.id === id);
  const { data, error } = await sb.rpc("owner_applications", { cid: id });   // 연락처는 선정된 신청자만 채워져 옴
  if (error) return alert("신청자를 불러오지 못했어요.");
  apps = data || [];
  const visit = c.mode === "방문형", blog = c.type === "블로그";
  $("apps-wrap").hidden = false;
  $("apps-title").textContent = c.title;
  const sel = apps.filter(a => a.status === "selected").length;
  $("apps-sum").textContent = `신청 ${apps.length}명 · 선정 ${sel}/${c.slots}명`;
  $("apps-empty").hidden = apps.length > 0;
  const oxs = v => v == null ? "-" : v ? "O" : "X";
  const sns = c.type === "인스타" || c.type === "유튜브", folLabel = c.type === "유튜브" ? "구독자" : "팔로워";
  const head = ["신청일", "이름", "핸드폰", "카카오톡", ...(EMAIL_ON ? ["이메일"] : []), "채널", ...(sns ? [folLabel] : []), ...(visit ? ["방문 희망"] : []), ...(blog ? ["인플루언서", "클립"] : []), ...(c.mission ? ["미션"] : []), "하고 싶은 말", "상태", "처리"];
  $("apps").innerHTML = apps.length ? `<thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>` + apps.map(a => {
    const [t, k] = ST[a.status] || ST.applied, url = /^https?:\/\//.test(a.channel_url || "") ? a.channel_url : "";
    return `<tr data-id="${a.id}"><td>${fmt(a.created_at)}</td><td><b>${esc(a.applicant_name || "-")}</b></td><td>${a.contact ? esc(a.contact) : '<span class="muted">선정 후 공개</span>'}</td><td>${a.kakao_id ? esc(a.kakao_id) : '<span class="muted">선정 후 공개</span>'}</td>${EMAIL_ON ? `<td>${a.email ? esc(a.email) : '<span class="muted">선정 후 공개</span>'}</td>` : ""}
      <td>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">열기 ↗</a>` : "-"}</td>
      ${sns ? `<td>${a.followers != null ? Number(a.followers).toLocaleString("ko-KR") : "-"}</td>` : ""}
      ${visit ? `<td>${esc(a.visit_date || "-")} ${esc(a.visit_time || "")}<br>${a.party_size ? a.party_size + "명" : ""}</td>` : ""}
      ${blog ? `<td>${oxs(a.is_naver_influencer)}</td><td>${oxs(a.clip_ok)}</td>` : ""}
      ${c.mission ? `<td>${oxs(a.mission_agreed)}</td>` : ""}
      <td class="ap-msg">${esc(a.message || "")}</td><td><span class="tag ${k}">${t}</span>${EMAIL_ON && a.status === "selected" ? `<br><small class="muted">${a.notified_at ? "메일 발송됨" : "메일 미발송"}</small>` : ""}</td>
      <td class="ap-btns"><button type="button" data-st="selected" ${a.status === "selected" ? "disabled" : ""}>선정</button><button type="button" data-st="rejected" ${a.status === "rejected" ? "disabled" : ""}>탈락</button>${EMAIL_ON && a.status === "selected" ? '<button type="button" data-mail="1">메일 보내기</button>' : ""}</td></tr>`;
  }).join("") + "</tbody>" : "";
  loadReviews(id);
  $("apps-wrap").scrollIntoView({ behavior: "smooth" });
}
// ---- 후기 제출 현황 (선정된 참여자가 로그인 없이 낸 후기 링크) ----
const RV = { submitted: ["제출됨", "mid"], confirmed: ["확인 완료", "ok"], revision: ["수정 요청", "bad"] };
async function loadReviews(cid) {
  const w = $("rv-wrap"); w.hidden = false; $("rv-link").textContent = location.origin.replace(/^file:.*/, "") + "/review.html?c=" + cid;
  const { data, error } = await sb.rpc("owner_reviews", { cid });
  if (error) { w.hidden = true; return; }                                  // 032 SQL 이 없으면 숨김
  const rows = data || [], done = rows.filter(r => r.url).length, ok = rows.filter(r => r.review_status === "confirmed").length;
  $("rv-empty").hidden = rows.length > 0;
  $("rv-sum").textContent = rows.length ? `선정 ${rows.length}명 · 제출 ${done}명 · 확인 완료 ${ok}명${rows[0].deadline ? " · 후기 작성 마감 " + rows[0].deadline : ""}` : "";
  const late = rows[0] && rows[0].deadline && rows[0].deadline < todayStr();
  $("rv-table").innerHTML = rows.length ? `<thead><tr><th>이름</th><th>상태</th><th>후기 링크</th><th>제출·수정</th><th>처리</th></tr></thead><tbody>` + rows.map(r => {
    const [t, k] = r.url ? RV[r.review_status] || RV.submitted : [late ? "마감 지남 · 미제출" : "미제출", late ? "bad" : "mid"];
    const link = /^https?:\/\//.test(r.url || "") ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">열기 ↗</a>` : "-";
    return `<tr data-app="${esc(r.application_id)}"><td><b>${esc(r.applicant_name || "-")}</b></td><td><span class="tag ${k}">${t}</span>${r.review_status === "revision" && r.revision_note ? `<br><small class="muted">사유: ${esc(r.revision_note)}</small>` : ""}</td><td>${link}</td><td>${r.updated_at ? fmt(r.updated_at) : "-"}</td>
      <td class="ap-btns">${r.url ? `<button type="button" data-rv="confirmed" ${r.review_status === "confirmed" ? "disabled" : ""}>확인 완료</button><button type="button" data-rv="revision" ${r.review_status === "confirmed" ? "disabled" : ""}>수정 요청</button>` : '<span class="muted small">제출 전</span>'}</td></tr>`;
  }).join("") + "</tbody>" : "";
}
$("rv-table").onclick = async e => {
  const st = e.target.dataset.rv; if (!st) return; const tr = e.target.closest("tr"), app = tr.dataset.app;
  let note = null;
  if (st === "revision") { note = prompt("수정 요청 사유를 적어 주세요. (참여자에게 보여요, 200자 이내)"); if (note == null) return; note = note.trim(); if (!note) return alert("사유를 입력해 주세요."); if (note.length > 200) return alert("사유는 200자 이내로 적어 주세요."); }
  else if (!confirm("이 후기를 확인 완료로 표시할까요? 확인 완료하면 참여자가 주소를 바꿀 수 없어요.")) return;
  e.target.disabled = true; const { data, error } = await sb.rpc("review_mark", { p_app: app, p_status: st, p_note: note });
  if (error || !data || data.error) { e.target.disabled = false; return alert(data && data.error === "no_submission" ? "아직 제출한 후기가 없어요." : "처리하지 못했어요."); }
  loadReviews(openId);
};
function closeApps() { openId = null; $("apps-wrap").hidden = true; $("rv-wrap").hidden = true; }
$("apps-close").onclick = closeApps;

const MAILERR = { no_email: "이 신청자는 이메일이 없어서 보낼 수 없어요.", too_soon: "방금 보낸 메일이 있어요. 잠시 후 다시 시도해 주세요.", not_selected: "선정된 신청자에게만 보낼 수 있어요.", forbidden: "권한이 없어요.", send_failed: "메일 서비스에 연결하지 못했어요. (메일 발송이 아직 설정되지 않았을 수 있어요)" };
async function notify(id) {
  const note = $("apps-note"); note.hidden = false; note.textContent = "선정 안내 메일을 보내는 중…";
  const { data, error } = await sb.functions.invoke("notify-selected", { body: { application_id: id } });
  let code = data && data.error;
  if (error && !code) { try { code = (await error.context.json()).error; } catch (e) { code = "send_failed"; } }
  note.textContent = code ? "메일을 보내지 못했어요: " + (MAILERR[code] || "알 수 없는 오류") : "선정 안내 메일을 보냈어요.";
  return !code;
}
$("apps").onclick = async e => {
  const id = e.target.closest("tr") && e.target.closest("tr").dataset.id;
  if (e.target.dataset.mail) { e.target.disabled = true; await notify(id); await showApps(openId); return; }
  const st = e.target.dataset.st; if (!st) return;
  e.target.disabled = true;
  const { error } = await sb.from("applications").update({ status: st }).eq("id", id);
  if (error) { alert("처리하지 못했어요."); e.target.disabled = false; return; }
  await loadCampaigns();                    // 선정되면 연락처·이메일이 채워져 옴
  if (EMAIL_ON && st === "selected") { await notify(id); await showApps(openId); }
};

// CSV: 엑셀에서 한글이 깨지지 않게 BOM 추가, 수식으로 해석될 수 있는 값은 앞에 ' 를 붙여 무력화
const cell = v => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
$("csv").onclick = () => {
  const c = camps.find(x => x.id === openId); if (!c) return;
  const cols = [["신청일", a => fmt(a.created_at)], ["이름", a => a.applicant_name], ["핸드폰", a => a.contact], ["카카오톡", a => a.kakao_id], ...(EMAIL_ON ? [["이메일", a => a.email]] : []), ["채널 주소", a => a.channel_url], ["팔로워/구독자", a => a.followers],
    ["방문 희망일", a => a.visit_date], ["방문 희망 시간", a => a.visit_time], ["방문 인원", a => a.party_size],
    ["네이버 인플루언서", a => a.is_naver_influencer == null ? "" : a.is_naver_influencer ? "O" : "X"], ["클립 가능", a => a.clip_ok == null ? "" : a.clip_ok ? "O" : "X"],
    ["미션 동의", a => a.mission_agreed == null ? "" : a.mission_agreed ? "O" : "X"], ["하고 싶은 말", a => a.message], ["상태", a => (ST[a.status] || ST.applied)[0]], ...(EMAIL_ON ? [["안내 메일", a => a.status === "selected" ? (a.notified_at ? "발송됨" : "미발송") : ""]] : [])];
  const csv = "﻿" + [cols.map(x => cell(x[0])).join(","), ...apps.map(a => cols.map(x => cell(x[1](a))).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `신청자_${c.title.slice(0, 20).replace(/[\\/:*?"<>|]/g, "")}_${todayStr()}.csv`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
init();
