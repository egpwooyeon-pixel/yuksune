// 게시글 보기: 서버(Supabase)에서 글·댓글을 불러옴. 댓글은 로그인 회원만.
const $ = id => document.getElementById(id);
const id = Number(new URLSearchParams(location.search).get("id"));
let me = null, isAdmin = false, post = null, key = boardKey();

const showEmpty = t => { $("p-empty").hidden = false; if (t) $("p-empty").textContent = t; };

async function init() {
  if (!window.sbReady || !id) return showEmpty(window.sbReady ? "글을 찾을 수 없어요." : "서버 연결 키가 설정되지 않았습니다.");
  const { data: s } = await sb.auth.getSession();
  me = s.session && s.session.user;
  if (me) { const { data: pr } = await sb.from("profiles").select("role").eq("id", me.id).maybeSingle(); isAdmin = !!pr && pr.role === "admin"; }

  const { data: p, error } = await sb.from("posts").select("*, profiles(nickname)").eq("id", id).maybeSingle();
  if (error || !p) return showEmpty("글을 찾을 수 없어요.");
  post = p; key = boardKey(p.board);
  const B = BOARDS[key];
  $("p-board").textContent = B.title; $("p-board").href = "board.html?b=" + key; $("p-list").href = "board.html?b=" + key;
  document.title = p.title + " - 우리들 체험단";
  $("post").hidden = false;
  $("p-title").textContent = (p.is_notice ? "[공지] " : "") + p.title;
  $("p-author").textContent = nickOf(p); $("p-time").textContent = timeAgo(p.created_at);
  $("p-body").innerHTML = String(p.body).split("\n").map(l => l ? `<p>${esc(l)}</p>` : "<br>").join("");

  // 조회수: 같은 탭에서 한 번만 올림
  let views = p.views;
  if (!sessionStorage.getItem("v" + id)) { sessionStorage.setItem("v" + id, "1"); sb.rpc("increment_post_views", { pid: id }); views += 1; }
  $("p-v").textContent = views;

  if (me && (me.id === p.author_id || isAdmin)) $("p-del").hidden = false;
  setupCommentForm();
  await loadComments();
  loadNeighbors();
}

function setupCommentForm() {
  const ta = $("c-text"), btn = $("c-btn");
  if (!me) { $("c-hint").innerHTML = '댓글은 <a href="login.html?next=' + encodeURIComponent("post.html?b=" + key + "&id=" + id) + '">로그인</a> 후 쓸 수 있어요.'; return; }
  ta.disabled = false; btn.disabled = false; $("c-hint").textContent = "";
  $("cform").onsubmit = async e => {
    e.preventDefault();
    const body = ta.value.trim(); if (!body) return;
    btn.disabled = true;
    const { error } = await sb.from("comments").insert({ post_id: id, author_id: me.id, body });
    btn.disabled = false;
    if (error) { $("c-hint").textContent = /too_fast/.test(error.message) ? "잠시 후 다시 등록해 주세요." : "댓글을 등록하지 못했어요."; return; }
    ta.value = ""; $("c-hint").textContent = ""; loadComments();
  };
}

async function loadComments() {
  const { data } = await sb.from("comments").select("id,body,created_at,author_id,profiles(nickname)").eq("post_id", id).order("created_at");
  const list = data || [];
  $("p-c").textContent = $("p-c2").textContent = $("p-c3").textContent = list.length;
  $("clist").innerHTML = list.map(c => `<li data-id="${c.id}"><div class="cm-h"><b>${esc(nickOf(c))}</b><span>${timeAgo(c.created_at)}</span></div>
    <p>${esc(c.body)}</p><div class="cm-f"><button type="button" class="rp">🚩 신고</button>${me && (me.id === c.author_id || isAdmin) ? '<button type="button" class="del">삭제</button>' : ""}</div></li>`).join("")
    || '<li class="muted">첫 댓글을 남겨 주세요.</li>';
}

async function loadNeighbors() {
  const base = () => sb.from("posts").select("id").eq("board", post.board).eq("is_notice", false);
  if (post.is_notice) return;
  const [n, o] = await Promise.all([
    base().gt("id", id).order("id", { ascending: true }).limit(1),
    base().lt("id", id).order("id", { ascending: false }).limit(1),
  ]);
  if (n.data && n.data[0]) { const a = $("p-prev"); a.hidden = false; a.href = `post.html?b=${key}&id=${n.data[0].id}`; }
  if (o.data && o.data[0]) { const a = $("p-next"); a.hidden = false; a.href = `post.html?b=${key}&id=${o.data[0].id}`; }
}

$("p-share").onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); alert("주소를 복사했어요."); }
  catch (e) { prompt("아래 주소를 복사하세요", location.href); }
};
const soon = () => alert("신고는 곧 열릴 예정이에요. (운영자 확인 기능을 연결하는 중입니다)");
$("p-report").onclick = soon;
document.addEventListener("click", async e => {
  if (e.target.classList.contains("rp")) return soon();
  if (e.target.classList.contains("del")) {
    if (!confirm("댓글을 삭제할까요?")) return;
    const { error } = await sb.from("comments").delete().eq("id", e.target.closest("li").dataset.id);
    if (error) return alert("삭제하지 못했어요."); loadComments();
  }
});
$("p-del").onclick = async () => {
  if (!confirm("이 글을 삭제할까요? 댓글도 함께 삭제됩니다.")) return;
  const { error } = await sb.from("posts").delete().eq("id", id);
  if (error) return alert("삭제하지 못했어요.");
  location.href = "board.html?b=" + key;
};
init();
