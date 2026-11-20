// 게시글 보기 (지금은 샘플 글/댓글. 실제 글은 DB 연결 후 불러옴)
const $ = id => document.getElementById(id);
const key = boardKey(), B = BOARDS[key], q = new URLSearchParams(location.search).get("n") || "";
const posts = makePosts(B);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

$("p-board").textContent = B.title; $("p-board").href = "board.html?b=" + key; $("p-list").href = "board.html?b=" + key;

let p = null, idx = -1;
if (/^n[1-3]$/.test(q)) {
  const i = +q[1] - 1, m = NOTICE_META[i];
  p = { no: q, title: NOTICES[i], c: m.c, author: "우리들 체험단", time: m.date, views: m.views, notice: true };
} else {
  idx = posts.findIndex(x => String(x.no) === q); p = posts[idx];
}
if (!p) { $("p-empty").hidden = false; }
else {
  document.title = p.title + " - 우리들 체험단";
  $("post").hidden = false;
  $("p-title").textContent = p.title;
  $("p-author").textContent = p.author; $("p-time").textContent = p.time;
  $("p-c").textContent = $("p-c2").textContent = $("p-c3").textContent = p.c;
  $("p-v").textContent = p.views;
  $("p-body").innerHTML = (p.notice
    ? ["안녕하세요, 우리들 체험단입니다.", "건강한 커뮤니티를 위해 아래 내용을 꼭 지켜 주세요.", "", "· 포인트나 혜택을 노린 의미 없는 글·댓글", "· 같은 내용을 반복해서 올리는 도배", "· 불법·비방·광고성 게시물", "", "위반 시 사전 안내 없이 글이 삭제되고 이용이 제한될 수 있습니다."]
    : [p.title, "", "샘플 게시글입니다.", "실제 글쓰기 기능이 열리면 회원이 쓴 글이 이곳에 표시돼요."]).map(l => l ? `<p>${esc(l)}</p>` : "<br>").join("");

  // 샘플 댓글 (댓글 수만큼, 최대 8개)
  const CT = ["안정 못하네요 ;;", "그러게요.. 대체 뭐가 문제일까요", "어떻게 그런일이 ;;", "저도 비슷한 경험 있어요", "공유 감사합니다!", "좋은 정보네요 ㅎㅎ", "오늘도 힘내세요~", "와 대박이네요"];
  const n = Math.min(p.c, 8);
  $("clist").innerHTML = Array.from({ length: n }, (_, i) => `<li><div class="cm-h"><b>${esc(AUTHORS[(i * 3 + 1) % AUTHORS.length])}</b><span>${["6시간 전", "5시간 전", "5시간 전", "4시간 전"][i % 4]}</span></div>
    <p>${esc(CT[i % CT.length])}</p><div class="cm-f"><button type="button" class="rp">🚩 신고</button></div></li>`).join("")
    || '<li class="muted">첫 댓글을 남겨 주세요.</li>';

  // 이전/다음글
  if (idx > 0) { const a = $("p-prev"); a.hidden = false; a.href = `post.html?b=${key}&n=${posts[idx - 1].no}`; }
  if (idx >= 0 && idx < posts.length - 1) { const a = $("p-next"); a.hidden = false; a.href = `post.html?b=${key}&n=${posts[idx + 1].no}`; }
}

$("p-share").onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); alert("주소를 복사했어요."); }
  catch (e) { prompt("아래 주소를 복사하세요", location.href); }
};
const rp = () => alert("신고는 곧 열릴 예정이에요. (운영자 확인 기능을 연결하는 중입니다)");
$("p-report").onclick = rp; document.addEventListener("click", e => { if (e.target.classList.contains("rp")) rp(); });
$("cform").onsubmit = e => e.preventDefault();
