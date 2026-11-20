// 글쓰기: 로그인한 회원만. 로그인 안 했으면 로그인 화면으로 보냄.
const $ = id => document.getElementById(id);
const key = boardKey();
$("w-board").value = key; $("w-cancel").href = "board.html?b=" + key;
const count = () => { $("t-count").textContent = $("w-title").value.length + "/100"; $("b-count").textContent = $("w-body").value.length + "/5000"; };
$("w-title").oninput = $("w-body").oninput = count;

let me = null, isAdmin = false;
(async () => {
  if (!window.sbReady) { $("w-gate").hidden = false; $("w-gate").textContent = "서버 연결 키가 설정되지 않았습니다."; $("w-btn").disabled = true; return; }
  const { data } = await sb.auth.getSession();
  me = data.session && data.session.user;
  if (!me) return location.replace("login.html?next=" + encodeURIComponent("write.html?b=" + key));
  const { data: pr } = await sb.from("profiles").select("role").eq("id", me.id).maybeSingle();
  isAdmin = !!pr && pr.role === "admin";
  $("w-notice-row").hidden = !isAdmin;
})();

$("wform").onsubmit = async e => {
  e.preventDefault();
  if (!me) return;
  const title = $("w-title").value.trim(), body = $("w-body").value.trim(), msg = $("w-msg"), btn = $("w-btn");
  if (!title || !body) { msg.textContent = "제목과 내용을 입력해 주세요."; return; }
  btn.disabled = true; msg.textContent = "";
  const board = $("w-board").value;
  const { data, error } = await sb.from("posts").insert({ board, author_id: me.id, title, body, is_notice: isAdmin && $("w-notice").checked }).select("id").single();
  if (error) {
    msg.textContent = /too_fast/.test(error.message) ? "글을 너무 빨리 올렸어요. 잠시 후 다시 시도해 주세요."
      : /posts_board_check|violates check/.test(error.message) ? "이 게시판은 아직 준비 중이에요. 운영자에게 문의해 주세요."
      : /row-level security/.test(error.message) ? "글을 쓸 권한이 없어요." : "등록하지 못했어요: " + error.message;
    btn.disabled = false; return;
  }
  location.href = `post.html?b=${board}&id=${data.id}`;
};
