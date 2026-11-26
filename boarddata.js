// 게시판 공통 값/도구 (board.js, post.js, write.js 에서 같이 씀)
const BOARDS = {
  notice: { title: "공지사항", cat: "공지", adminOnly: true, desc: "우리들 체험단의 이용 안내와 소식을 알려드려요. (운영자만 글을 쓸 수 있어요)" },
  place:  { title: "플레이스 사장님 커뮤니티", cat: "플레이스", desc: "네이버 플레이스를 운영하는 사장님들의 노하우와 질문을 나누는 공간이에요." },
  ecom:   { title: "E-커머스 사장님 커뮤니티", cat: "E-커머스", desc: "스마트스토어·쿠팡 등 온라인 판매 사장님들이 정보를 나누는 공간이에요." },
  influencer: { title: "인플루언서 커뮤니티", cat: "인플루언서", only: "influencer", desc: "블로그·인스타그램·유튜브 인플루언서들이 체험단 정보와 콘텐츠 노하우를 나누는 공간이에요." },
  agency: { title: "대행사 커뮤니티", cat: "대행사", only: "agency", desc: "마케팅 대행사 분들이 운영 노하우와 협업 정보를 나누는 공간이에요." },
  review: { title: "체험단 후기·노하우", cat: "후기·노하우", desc: "체험단에 참여한 후기와 선정·작성 노하우를 나누는 공간이에요." },
};
function boardKey(k) {
  k = k || new URLSearchParams(location.search).get("b");
  return BOARDS[k] ? k : "place";
}
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// 방금 / N분 전 / N시간 전 / N일 전 / 날짜
function timeAgo(iso) {
  const t = new Date(iso), s = (Date.now() - t) / 1000;
  if (s < 60) return "방금 전";
  if (s < 3600) return Math.floor(s / 60) + "분 전";
  if (s < 86400) return Math.floor(s / 3600) + "시간 전";
  if (s < 86400 * 7) return Math.floor(s / 86400) + "일 전";
  return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`;
}
const nickOf = r => (r && r.profiles && r.profiles.nickname) || "회원";
const cntOf = r => (r && r.comments && r.comments[0] && r.comments[0].count) || 0;

// ---- 회원 유형 전용 게시판 (인플루언서 · 대행사): 승인된 회원만. 실제 차단은 DB 규칙(028 SQL)이 하고, 화면은 안내만 해요 ----
const KIND = { influencer: "인플루언서", agency: "대행사" };
async function communityState() {
  if (!window.sbReady) return { logged: false };
  const { data } = await sb.auth.getSession(); const u = data.session && data.session.user; if (!u) return { logged: false };
  let { data: p, error } = await sb.from("profiles").select("role,community,community_req").eq("id", u.id).maybeSingle();
  if (error) ({ data: p } = await sb.from("profiles").select("role").eq("id", u.id).maybeSingle());   // 028 SQL 이 아직 없으면 운영자 여부만 확인
  return { logged: true, id: u.id, role: p && p.role, community: p && p.community, req: p && p.community_req };
}
const canEnter = (B, st) => !B.only || st.role === "admin" || st.community === B.only;
// 들어갈 수 없을 때 보여 줄 안내 상자 (신청 버튼 포함). host 앞에 끼워 넣어요.
function lockBox(B, st, host) {
  const kind = KIND[B.only], box = document.createElement("div"); box.className = "panel lock-box";
  const h = document.createElement("b"); h.textContent = `${kind} 회원만 이용할 수 있는 공간이에요.`; box.append(h);
  const p = document.createElement("p"); p.className = "muted"; box.append(p);
  if (!st.logged) { p.textContent = "로그인한 뒤 가입을 신청해 주세요."; const a = document.createElement("a"); a.className = "btn-primary"; a.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search); a.textContent = "로그인"; box.append(a); }
  else if (st.req === B.only) p.textContent = `${kind} 가입 신청이 접수됐어요. 운영자가 확인하면 이용할 수 있어요.`;
  else {
    p.textContent = `${kind} 커뮤니티는 운영자 승인이 필요해요. 신청하면 운영자가 확인한 뒤 열어 드려요.` + (st.req ? ` (지금은 '${KIND[st.req]}' 신청이 접수되어 있어요. 새로 신청하면 바뀌어요.)` : "");
    const b = document.createElement("button"); b.type = "button"; b.className = "btn-primary"; b.textContent = `${kind} 가입 신청하기`;
    b.onclick = async () => { b.disabled = true; const { error } = await sb.from("profiles").update({ community_req: B.only }).eq("id", st.id); if (error) { b.disabled = false; return alert("신청하지 못했어요. (028 SQL 실행 여부를 확인해 주세요)"); } p.textContent = `${kind} 가입 신청이 접수됐어요. 운영자가 확인하면 이용할 수 있어요.`; b.remove(); };
    box.append(b);
  }
  host.before(box); return box;
}
