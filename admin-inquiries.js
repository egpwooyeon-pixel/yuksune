// 상담 접수 목록 (읽기 전용). 운영자(profiles.role = 'admin')만 볼 수 있고, 표는 021 SQL 의 RLS 로도 운영자만 조회돼요.
// 모든 값은 textContent 로만 화면에 넣어요 (접수 내용에 HTML 이 들어 있어도 실행되지 않음).
const $ = id => document.getElementById(id);
const cfg = window.WOORI || {};
const sb = cfg.SUPABASE_ANON_KEY && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
let rows = [];

const gate = (t, login) => {
  $("gate").hidden = false; $("app").hidden = true; $("gate").textContent = t;
  if (login) { const b = document.createElement("button"); b.textContent = "다른 계정으로 로그인"; b.onclick = async () => { await sb.auth.signOut(); location.replace("admin-login.html"); }; $("gate").append(document.createElement("br"), b); }
};
const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const maskPhone = p => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(0, 3) + "-****-" + d.slice(-4) : "***"; };
const safeHref = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.toString() : ""; } catch (_) { return ""; } };
const orderText = o => !o || typeof o !== "object" ? "" : `${o.product || ""} · 하루 ${o.perDay}건 × ${o.days}일 (총 ${o.total}건)` + (typeof o.price === "number" ? ` · ${Number(o.price * o.total).toLocaleString("ko-KR")}원` : "");
const td = (...kids) => { const e = document.createElement("td"); e.append(...kids); return e; };

// 사진: 운영자만 볼 수 있는 비공개 보관함. 2분짜리 임시 주소로 새 창에서 열어요.
async function showPhotos(batch, box, btn) {
  btn.disabled = true; btn.textContent = "불러오는 중…";
  const { data, error } = await sb.from("business_photos").select("path").eq("batch_id", batch).order("id");
  if (error || !data || !data.length) { btn.disabled = false; btn.textContent = "사진 없음 (다시 시도)"; return; }
  box.replaceChildren();
  for (let i = 0; i < data.length; i++) {
    const { data: s } = await sb.storage.from("business-photos").createSignedUrl(data[i].path, 120);
    const href = s && safeHref(s.signedUrl);
    const a = document.createElement(href ? "a" : "span"); a.textContent = "사진 " + (i + 1) + (href ? "" : " (불러오기 실패)");
    if (href) { a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; } box.append(a, document.createElement("br"));
  }
}

function render() {
  const q = $("q").value.trim().toLowerCase(), st = $("st").value;
  const list = rows.filter(r => (!st || r.status === st) && (!q || [r.company, r.name, r.message, r.topic].some(x => String(x || "").toLowerCase().includes(q))));
  const t = $("tb"); t.replaceChildren();
  const head = document.createElement("tr"); ["접수일", "업체", "담당자·연락처", "신청 조건", "문의 내용", "사진", "상태"].forEach(h => { const th = document.createElement("th"); th.textContent = h; head.append(th); });
  t.append(head);
  for (const r of list) {
    const tr = document.createElement("tr");
    const co = document.createElement("div"); const b = document.createElement("b"); b.textContent = r.company; co.append(b);
    const sub = document.createElement("div"); sub.className = "muted"; sub.textContent = [r.topic, r.email].filter(Boolean).join(" · "); co.append(sub);
    const href = safeHref(r.website); if (href) { const a = document.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener nofollow"; a.textContent = r.website; co.append(a); }
    const who = document.createElement("div"); who.textContent = r.name + " "; const ph = document.createElement("button"); ph.type = "button"; ph.className = "iq-ph"; ph.textContent = maskPhone(r.phone); ph.title = "눌러서 번호 보기";
    ph.onclick = () => { ph.textContent = ph.textContent === r.phone ? maskPhone(r.phone) : r.phone; }; who.append(ph);
    const ord = document.createElement("span"); ord.className = "iq-ord"; ord.textContent = orderText(r.order_info) || "—";
    const msg = document.createElement("div"); msg.className = "iq-msg";
    const text = String(r.message || "");
    if (text.length > 120) { const d = document.createElement("details"); const s = document.createElement("summary"); s.textContent = text.slice(0, 120) + "…"; const full = document.createElement("div"); full.textContent = text; d.append(s, full); msg.append(d); } else msg.textContent = text || "—";
    const stat = document.createElement("span"); if (r.status === "new") { stat.className = "iq-new"; stat.textContent = "새 신청"; } else stat.textContent = "처리 완료";
    const pic = document.createElement("div");
    if (r.photo_batch) { const bt = document.createElement("button"); bt.type = "button"; bt.className = "iq-ph"; bt.textContent = "사진 보기"; bt.onclick = () => showPhotos(r.photo_batch, pic, bt); pic.append(bt); } else pic.textContent = "—";
    tr.append(td(fmtDate(r.created_at)), td(co), td(who), td(ord), td(msg), td(pic), td(stat)); t.append(tr);
  }
  $("sum").textContent = `${list.length}건 / 전체 ${rows.length}건 · 새 신청 ${rows.filter(r => r.status === "new").length}건`;
  const empty = $("empty"); empty.hidden = list.length > 0; empty.textContent = rows.length ? "조건에 맞는 접수가 없어요." : "아직 접수된 상담이 없어요.";
}

async function init() {
  if (!sb) return gate("서버 연결 키가 설정되지 않았습니다.");
  const { data } = await sb.auth.getSession(), u = data.session && data.session.user;
  if (!u) return location.replace("admin-login.html");
  const { data: p } = await sb.from("profiles").select("nickname,role").eq("id", u.id).maybeSingle();
  if (!p || p.role !== "admin") return gate("관리자만 볼 수 있는 페이지예요.", true);
  $("gate").hidden = true; $("app").hidden = false;
  $("me-name").textContent = p.nickname || u.email.split("@")[0]; $("me-mail").textContent = u.email;
  const { data: list, error } = await sb.from("inquiries").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) { $("empty").hidden = false; $("empty").textContent = "상담 접수를 불러오지 못했어요. (supabase/021_inquiries.sql 을 실행했는지 확인해 주세요)"; return; }
  rows = list || []; render();
  $("q").addEventListener("input", render); $("st").addEventListener("change", render);
}
init();
