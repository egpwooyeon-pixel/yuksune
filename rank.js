// 내 플레이스 순위확인하기: 승인된 사업자가 내 플레이스(아이디당 1곳)와 키워드(최대 3개)를 신청하고, 운영자가 시작한 추적의 순위 기록을 봅니다 (본인 것만 보임)
const $ = id => document.getElementById(id);
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const msg = t => { $("rk-msg").hidden = !t; $("rk-msg").textContent = t || ""; };
let logs = {};   // 날짜 → 기록 (지금 보고 있는 키워드)
let trackers = [];

const rankText = l => !l ? null : l.status === "out" || l.out_of_rank ? (l.source === "provider" ? "미노출" : "순위 밖") : l.status === "failed" ? null : l.rank != null ? l.rank : null;
function delta(day, i, days) {            // 전날과 비교: 숫자가 작아지면 순위 상승(▲)
  const prev = logs[days[i + 1]];
  const c = logs[day];
  if (!c || !prev || c.rank == null || prev.rank == null || c.status === "failed" || prev.status === "failed" || c.rank === prev.rank || (c.keyword && prev.keyword && c.keyword !== prev.keyword)) return "";
  const n = Math.abs(prev.rank - c.rank), up = c.rank < prev.rank;
  return `<span class="rk-d ${up ? "up" : "down"}">${up ? "▲" : "▼"}${n}</span>`;
}
function drawDays() {
  const today = new Date(), days = Array.from({ length: 8 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - i); return key(d); });
  $("rk-grid").innerHTML = days.slice(0, 7).map((day, i) => {
    const d = new Date(day + "T00:00:00"), l = logs[day], r = rankText(l), wd = d.getDay();
    const num = r == null ? `<span class="rk-none">${i === 0 ? "확인 전" : "—"}</span>` : typeof r === "number" ? `<span class="rk-n">${r}</span><span class="rk-u">위</span>${delta(day, i, days)}` : `<span class="rk-out">${r}</span>`;
    const rv = l ? `<div class="rk-rv"><p><span>블로그</span><b>${l.blog_reviews ?? "-"}</b></p><p><span>방문자</span><b>${l.visitor_reviews ?? "-"}</b></p><p><span>경쟁업체</span><b>${l.competitors ?? "-"}</b></p></div>` : '<div class="rk-rv"></div>';
    return `<div class="rk-card ${i === 0 ? "today" : ""}"><div class="rk-ch"><b class="${wd === 0 ? "sun" : wd === 6 ? "sat" : ""}">${day.slice(5)}</b><span>${WD[wd]}</span>${i === 0 ? '<em>오늘</em>' : ""}</div><div class="rk-rank">${num}</div>${rv}</div>`;
  }).join("");
}
function drawStats() {
  const ranked = Object.values(logs).filter(l => l.rank != null && l.status !== "out").sort((a, b) => a.day < b.day ? 1 : -1);
  const latest = Object.values(logs).sort((a, b) => a.day < b.day ? 1 : -1)[0];
  const best = ranked.length ? Math.min(...ranked.map(l => l.rank)) : null;
  const curTxt = latest ? (latest.status === "out" || latest.out_of_rank ? "순위 밖" : latest.rank != null ? latest.rank + "위" : "—") : "—";
  const wk = new Date(); wk.setDate(wk.getDate() - 7);
  const old = ranked.find(l => new Date(l.day + "T00:00:00") <= wk), nowR = ranked[0];
  let chg = "—";
  if (old && nowR && old.rank !== nowR.rank) chg = (nowR.rank < old.rank ? "▲ " : "▼ ") + Math.abs(old.rank - nowR.rank);
  else if (old && nowR) chg = "변동 없음";
  $("rk-stats").innerHTML = `<div><small>현재</small><b>${curTxt}</b></div><div><small>최고</small><b>${best != null ? best + "위" : "—"}</b></div><div><small>7일 변화</small><b>${chg}</b></div>`;
}
function drawChart() {
  const pts = Object.values(logs).filter(l => l.rank != null && new Date(l.day + "T00:00:00") >= new Date(Date.now() - 30 * 864e5)).sort((a, b) => a.day < b.day ? -1 : 1);
  if (pts.length < 2) { $("rk-svg").innerHTML = '<p class="muted small">기록이 2일 이상 쌓이면 그래프가 보여요.</p>'; return; }
  const W = 640, H = 180, P = 28, mn = Math.min(...pts.map(p => p.rank)), mx = Math.max(...pts.map(p => p.rank)), span = Math.max(1, mx - mn);
  const t0 = new Date(pts[0].day).getTime(), t1 = new Date(pts[pts.length - 1].day).getTime() || t0 + 1;
  const X = p => P + (new Date(p.day).getTime() - t0) / Math.max(1, t1 - t0) * (W - 2 * P), Y = p => P + (p.rank - mn) / span * (H - 2 * P);
  $("rk-svg").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="순위 추이 그래프"><polyline fill="none" stroke="#1f4dff" stroke-width="2" points="${pts.map(p => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join(" ")}"/>${pts.map(p => `<circle cx="${X(p).toFixed(1)}" cy="${Y(p).toFixed(1)}" r="3.5" fill="#1f4dff"><title>${p.day} ${p.rank}위</title></circle>`).join("")}
    <text x="4" y="${P + 4}" font-size="11" fill="#888">${mn}위</text><text x="4" y="${H - P + 4}" font-size="11" fill="#888">${mx}위</text>
    <text x="${P}" y="${H - 6}" font-size="11" fill="#888">${pts[0].day.slice(5)}</text><text x="${W - P}" y="${H - 6}" font-size="11" fill="#888" text-anchor="end">${pts[pts.length - 1].day.slice(5)}</text></svg>`;
}
$("rk-toggle").onclick = e => { const on = $("rk-grid").classList.toggle("show-rv"); e.target.textContent = on ? "리뷰 수치 숨기기" : "리뷰 수치 보기"; };

async function showTracker(t) {
  const { data: ls } = await sb.from("rank_logs").select("*").eq("tracker_id", t.id).order("day", { ascending: false }).limit(60);
  logs = {}; (ls || []).forEach(l => { logs[l.day] = l; });
  $("rk-kw").textContent = t.keyword;
  const pl = []; if (t.place_name) pl.push(esc(t.place_name));
  if (t.place_url && /^https?:\/\//.test(t.place_url)) pl.push(`<a href="${esc(t.place_url)}" target="_blank" rel="noopener noreferrer">플레이스 열기 ↗</a>`);
  $("rk-place").innerHTML = pl.join(" · ");
  $("rk-tabs").innerHTML = trackers.length > 1 ? trackers.map(x => `<button type="button" data-id="${x.id}" class="${x.id === t.id ? "on" : ""}">${esc(x.keyword)}</button>`).join("") : "";
  drawStats(); drawDays(); drawChart();
}
$("rk-tabs").onclick = e => { const id = e.target.dataset.id; if (!id) return; const t = trackers.find(x => x.id === id); if (t) showTracker(t); };

// ---- 내 플레이스 등록 (승인된 사업자만 · 아이디당 플레이스 1곳 · 키워드 최대 3개) ----
const MAX_KW = 3;
function parsePlaceId(v) {
  v = (v || "").trim(); if (!v) return { err: "플레이스 주소 또는 ID를 입력해 주세요." };
  if (/^\d{5,15}$/.test(v)) return { id: v };
  if (/naver\.me\//i.test(v)) return { err: "단축 주소(naver.me)로는 플레이스 ID를 알 수 없어요. 네이버 지도에서 가게를 열었을 때의 전체 주소나 ID 숫자를 넣어 주세요." };
  if (/\/search\//.test(v) && !/\/place\/\d/.test(v)) return { err: "검색 결과 목록 주소예요. 가게를 눌러 상세 화면을 연 뒤 주소를 복사해 주세요." };
  const m = v.match(/\/(\d{5,15})(?:[\/?#]|$)/); return m ? { id: m[1] } : { err: "주소에서 플레이스 ID를 찾지 못했어요. 주소 전체나 ID 숫자를 확인해 주세요." };
}
const regMsg = (t, ok) => { const el = $("rg-msg"); el.hidden = !t; el.textContent = t || ""; el.style.color = ok ? "#0c8f66" : ""; };
const ERR = { one_place_only: "아이디 하나당 플레이스는 1곳만 등록할 수 있어요.", keyword_limit_per_owner: "키워드는 최대 3개까지 등록할 수 있어요." };
async function loadAll(me, approved) {
  const { data: all, error } = await sb.from("rank_trackers").select("*").eq("owner_id", me.id).order("created_at");
  if (error) return msg("불러오지 못했어요. (025 SQL 실행 여부를 확인해 주세요)");
  const rows = all || [], active = rows.filter(t => t.active), pending = rows.filter(t => !t.active && t.self_registered);
  const placeRow = rows.find(t => t.place_id), left = MAX_KW - rows.length;
  $("rk-req").hidden = !pending.length;
  $("rk-req-list").innerHTML = pending.map(t => `<li><b>${esc(t.keyword)}</b> <span class="muted">· ${esc(t.place_name || "")} · 운영자 확인 대기</span> <button type="button" class="btn-line" data-cancel="${esc(t.id)}">신청 취소</button></li>`).join("");
  $("rk-reg").hidden = !approved || left <= 0;
  if (placeRow) { $("rg-place").value = placeRow.place_id; $("rg-place").readOnly = true; $("rg-name").value = placeRow.place_name || ""; $("rg-name").readOnly = true; $("rg-go").textContent = "키워드 추가하기"; }
  trackers = active; $("rk").hidden = !active.length; if (active.length) await showTracker(active[0]);
  if (!rows.length) msg(approved ? "" : "");
  else if (!active.length && pending.length) msg("신청이 접수됐어요. 운영자가 확인한 뒤 순위 확인을 시작해요.");
  else msg("");
}
$("rk-req-list").onclick = async e => {
  const id = e.target.dataset.cancel; if (!id || !confirm("이 신청을 취소할까요?")) return;
  const { error } = await sb.from("rank_trackers").delete().eq("id", id);
  if (error) return alert("취소하지 못했어요. 이미 운영자가 시작한 항목은 취소할 수 없어요.");
  location.reload();
};
$("rk-form").onsubmit = async e => {
  e.preventDefault(); if ($("rg-go").disabled) return; regMsg("");
  const pid = parsePlaceId($("rg-place").value); if (pid.err) return regMsg(pid.err);
  const name = $("rg-name").value.trim(); if (!name) return regMsg("매장명을 입력해 주세요.");
  const kws = [...new Set($("rg-kw").value.split(/[\n,]/).map(x => x.trim()).filter(Boolean))];
  if (!kws.length) return regMsg("키워드를 1개 이상 입력해 주세요."); if (kws.some(k => k.length > 40)) return regMsg("키워드는 40자 이내로 입력해 주세요.");
  const used = (window.__rkCount || 0); if (kws.length + used > MAX_KW) return regMsg(`키워드는 최대 ${MAX_KW}개까지예요. (지금 ${used}개 등록됨)`);
  const me = (await sb.auth.getSession()).data.session.user, url = /^https?:\/\//i.test($("rg-place").value.trim()) && $("rg-place").value.trim().length <= 300 ? $("rg-place").value.trim() : null;
  $("rg-go").disabled = true; $("rg-go").textContent = "등록 중…";
  const { error } = await sb.from("rank_trackers").insert(kws.map(k => ({ owner_id: me.id, keyword: k, place_name: name.slice(0, 60), place_id: pid.id, place_url: url, active: false, self_registered: true, auto_collect: false })));
  $("rg-go").disabled = false; $("rg-go").textContent = "등록하기";
  if (error) { const m = (error.message || ""); return regMsg(ERR[Object.keys(ERR).find(k => m.includes(k))] || (/duplicate|unique/i.test(m) ? "이미 등록한 키워드예요." : "등록하지 못했어요. (025 SQL 실행 여부와 사업자 승인 여부를 확인해 주세요)")); }
  regMsg("등록했어요. 운영자가 확인하면 순위 확인이 시작돼요.", true); $("rg-kw").value = ""; setTimeout(() => location.reload(), 800);
};

(async () => {
  if (!sbReady) return msg("서버 연결 키가 설정되지 않았습니다.");
  const { data } = await sb.auth.getSession();
  const me = data.session && data.session.user;
  if (!me) return location.replace("login.html?next=rank.html");
  const { data: p } = await sb.from("profiles").select("role,business_status").eq("id", me.id).maybeSingle();
  const approved = !!p && p.business_status === "approved";
  if (!approved && !(p && p.role === "admin")) { msg("사업자 인증을 마친 회원만 내 플레이스 순위를 확인할 수 있어요. 광고주 인증(사업자등록번호·대표자 이름 입력) 후 이용해 주세요."); const a = document.createElement("a"); a.href = "biz.html"; a.className = "btn-primary"; a.textContent = "광고주 인증하러 가기"; $("rk-msg").append(" ", a); return; }
  await loadAll(me, approved);
  window.__rkCount = (await sb.from("rank_trackers").select("id", { count: "exact", head: true }).eq("owner_id", me.id)).count || 0;
})();
