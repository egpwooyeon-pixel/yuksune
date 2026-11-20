// 게시판 공통 값/도구 (board.js, post.js, write.js 에서 같이 씀)
const BOARDS = {
  free:   { title: "자유게시판", cat: "자유게시판" },
  tips:   { title: "꿀팁·교류", cat: "꿀팁·교류" },
  profit: { title: "수익 인증·체험후기", cat: "수익인증" },
};
function boardKey(k) {
  k = k || new URLSearchParams(location.search).get("b");
  return BOARDS[k] ? k : "free";
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
