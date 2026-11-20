// 게시판 공통 값/도구 (board.js, post.js, write.js 에서 같이 씀)
const BOARDS = {
  place: { title: "플레이스 사장님 커뮤니티", cat: "플레이스" },
  ecom:  { title: "E-커머스 사장님 커뮤니티", cat: "E-커머스" },
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
