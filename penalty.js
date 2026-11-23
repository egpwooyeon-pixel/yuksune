// 광고주 미선정횟수 · 페널티 내역 (본인 것만 보임)
const $ = id => document.getElementById(id);
let events = [], tab = "all";
const dt = iso => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
const inf = v => v === "infinity" || v === "Infinity" || (v && new Date(v).getFullYear() > 9000);
const msg = t => { $("pn-msg").hidden = !t; $("pn-msg").textContent = t || ""; };

function summarize(ev) {
  const now = new Date();
  const missed = ev.filter(e => e.kind === "missed" && !e.converted_at && new Date(e.expires_at) > now).length;
  const pen = ev.filter(e => e.kind === "penalty").length;
  let susp = null;
  ev.filter(e => e.kind === "penalty" && e.suspended_until).forEach(e => { if (inf(e.suspended_until)) susp = "영구"; else if (new Date(e.suspended_until) > now && susp !== "영구") { if (!susp || new Date(e.suspended_until) > new Date(susp)) susp = e.suspended_until; } });
  return { missed, pen, susp };
}
function draw() {
  const { missed, pen, susp } = summarize(events);
  $("pn-missed").textContent = missed; $("pn-pen").textContent = pen;
  const flag = $("pn-flag");
  flag.hidden = !susp;
  if (susp) flag.textContent = susp === "영구" ? `⚠ 페널티 ${pen}회 영구 정지` : `⚠ 체험단 등록 정지 중 (${dt(susp)}까지)`;
  const now = new Date();
  const list = events.filter(e => tab === "all" || e.kind === tab);
  $("pn-empty").hidden = list.length > 0;
  $("pn-list").innerHTML = list.map(e => {
    const pen = e.kind === "penalty";
    let sub;
    if (pen) sub = `<small>이용 정지</small>${dt(e.created_at)} ~ ${inf(e.suspended_until) ? "영구정지" : dt(e.suspended_until)}`;
    else if (e.converted_at) sub = `<small>상태</small>페널티로 전환됨`;
    else if (new Date(e.expires_at) <= now) sub = `<small>상태</small>소멸됨 (${dt(e.expires_at)})`;
    else sub = `<small>소멸 예정</small>${dt(e.expires_at)}`;
    const dead = !pen && (e.converted_at || new Date(e.expires_at) <= now);
    return `<li class="${dead ? "dead" : ""}"><div class="pn-date">${dt(e.created_at)}</div><div class="pn-row"><span class="pn-badge ${pen ? "pen" : "mis"}">${pen ? "페널티" : "미선정"}</span>
      <div class="pn-info"><p><small>사유</small>${esc(e.reason)}</p><p>${sub}</p></div><b class="pn-plus ${pen ? "pen" : "mis"}">${pen ? "페널티" : "미선정"} +1</b></div></li>`;
  }).join("");
}
$("pn-tabs").onclick = e => { const t = e.target.dataset.t; if (!t) return; tab = t; document.querySelectorAll("#pn-tabs button").forEach(b => b.classList.toggle("on", b === e.target)); draw(); };

(async () => {
  if (!sbReady) return msg("서버 연결 키가 설정되지 않았습니다.");
  const { data } = await sb.auth.getSession();
  const me = data.session && data.session.user;
  if (!me) return location.replace("login.html?next=penalty.html");
  await sb.rpc("process_expired_campaigns");           // 마감된 체험단 검사 (여러 번 불러도 안전)
  const { data: ev, error } = await sb.from("advertiser_events").select("*").eq("owner_id", me.id).order("created_at", { ascending: false });
  if (error) return msg("내역을 불러오지 못했어요. (012 SQL 실행 여부를 확인해 주세요)");
  events = ev || []; $("pn-wrap").hidden = false; draw();
})();
