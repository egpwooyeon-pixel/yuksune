// 내 순위 추적: 운영자가 설정한 키워드 1개의 순위 기록을 보여줍니다 (본인 것만 보임)
const $ = id => document.getElementById(id);
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const msg = t => { $("rk-msg").hidden = !t; $("rk-msg").textContent = t || ""; };
let logs = {};   // 날짜 → 기록

const rankText = l => !l ? null : l.out_of_rank ? "순위 밖" : l.rank != null ? l.rank : null;
function delta(day, i, days) {            // 전날과 비교: 숫자가 작아지면 순위 상승(▲)
  const cur = logs[day], prev = logs[days[i + 1]];
  if (!cur || !prev || cur.rank == null || prev.rank == null || cur.rank === prev.rank) return "";
  const n = Math.abs(prev.rank - cur.rank), up = cur.rank < prev.rank;
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
  const ranked = Object.values(logs).filter(l => l.rank != null).sort((a, b) => a.day < b.day ? 1 : -1);
  const latest = Object.values(logs).sort((a, b) => a.day < b.day ? 1 : -1)[0];
  const best = ranked.length ? Math.min(...ranked.map(l => l.rank)) : null;
  const cur = latest ? (latest.out_of_rank ? "순위 밖" : latest.rank != null ? latest.rank + "위" : "—") : "—";
  const wk = new Date(); wk.setDate(wk.getDate() - 7);
  const old = ranked.find(l => new Date(l.day + "T00:00:00") <= wk), nowR = ranked[0];
  let chg = "—";
  if (old && nowR && old.rank !== nowR.rank) chg = (nowR.rank < old.rank ? "▲ " : "▼ ") + Math.abs(old.rank - nowR.rank);
  else if (old && nowR) chg = "변동 없음";
  $("rk-stats").innerHTML = `<div><small>현재</small><b>${cur}</b></div><div><small>최고</small><b>${best != null ? best + "위" : "—"}</b></div><div><small>7일 변화</small><b>${chg}</b></div>`;
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

(async () => {
  if (!sbReady) return msg("서버 연결 키가 설정되지 않았습니다.");
  const { data } = await sb.auth.getSession();
  const me = data.session && data.session.user;
  if (!me) return location.replace("login.html?next=rank.html");
  const { data: t, error } = await sb.from("rank_trackers").select("*").eq("owner_id", me.id).maybeSingle();
  if (error) return msg("불러오지 못했어요. (014 SQL 실행 여부를 확인해 주세요)");
  if (!t) return msg("아직 설정된 순위 추적이 없어요. 광고주 한 분당 키워드 1개를 운영자가 설정해 드려요. 공지사항을 확인해 주세요.");
  const { data: ls } = await sb.from("rank_logs").select("*").eq("tracker_id", t.id).order("day", { ascending: false }).limit(60);
  (ls || []).forEach(l => { logs[l.day] = l; });
  $("rk").hidden = false; $("rk-kw").textContent = t.keyword;
  const pl = []; if (t.place_name) pl.push(esc(t.place_name));
  if (t.place_url && /^https?:\/\//.test(t.place_url)) pl.push(`<a href="${esc(t.place_url)}" target="_blank" rel="noopener noreferrer">플레이스 열기 ↗</a>`);
  $("rk-place").innerHTML = pl.join(" · ");
  drawStats(); drawDays(); drawChart();
})();
