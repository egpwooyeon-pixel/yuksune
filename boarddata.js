// 게시판 공통 값/도구 (board.js, post.js, write.js 에서 같이 씀)
const BOARDS = {
  notice: { title: "공지사항", cat: "공지", adminOnly: true, desc: "우리들 체험단의 이용 안내와 소식을 알려드려요. (운영자만 글을 쓸 수 있어요)" },
  place:  { title: "플레이스 사장님 커뮤니티", cat: "플레이스", desc: "네이버 플레이스를 운영하는 사장님들의 노하우와 질문을 나누는 공간이에요." },
  ecom:   { title: "E-커머스 사장님 커뮤니티", cat: "E-커머스", desc: "스마트스토어·쿠팡 등 온라인 판매 사장님들이 정보를 나누는 공간이에요." },
  influencer: { title: "인플루언서 커뮤니티", cat: "인플루언서", desc: "블로그·인스타그램·유튜브 인플루언서들이 체험단 정보와 콘텐츠 노하우를 나누는 공간이에요." },
  agency: { title: "대행사 커뮤니티", cat: "대행사", desc: "마케팅 대행사 분들이 운영 노하우와 협업 정보를 나누는 공간이에요." },
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
