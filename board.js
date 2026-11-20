// 커뮤니티 게시판 (자유게시판 / 꿀팁·교류 / 수익 인증·체험후기) — 지금은 샘플 글. 글쓰기·저장은 다음 단계에서 서버(DB)와 연결.
const key = boardKey();
const B = BOARDS[key];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const $ = id => document.getElementById(id);

$("b-title").textContent = B.title;
document.title = B.title + " - 우리들 체험단";

const posts = makePosts(B);

// 인기글
const popData = { m: [...posts].sort((a, b) => b.c - a.c).slice(0, 10), w: [...posts].sort((a, b) => b.views - a.views).slice(0, 10) };
function drawPop(t) {
  $("pop").innerHTML = popData[t].map(p => `<li><span class="pc">${esc(B.cat)}</span><a href="post.html?b=${key}&n=${p.no}">${esc(p.title)}</a><i>(${p.c})</i></li>`).join("");
}
document.querySelector(".pop-tabs").onclick = e => {
  const t = e.target.dataset.t; if (!t) return;
  document.querySelectorAll(".pop-tabs button").forEach(b => b.classList.toggle("on", b === e.target)); drawPop(t);
};
drawPop("m");

// 글 목록
function drawList(q = "", field = "title") {
  const list = posts.filter(p => !q || String(p[field]).includes(q));
  $("b-empty").hidden = list.length > 0;
  const notices = q ? "" : NOTICES.map((t, i) => `<tr class="notice"><td class="num"><span class="badge notice">공지</span></td>
    <td class="title"><a href="post.html?b=${key}&n=n${i + 1}"><b>${esc(t)}</b></a> <span class="cmt">${NOTICE_META[i].c}</span></td><td>우리들 체험단</td><td class="date">${NOTICE_META[i].date}</td><td class="views">${NOTICE_META[i].views}</td></tr>`).join("");
  $("post-list").innerHTML = notices + list.map(p => `<tr><td class="num">${p.no}</td>
    <td class="title">${p.isNew ? '<span class="newic">N</span>' : ""}<a href="post.html?b=${key}&n=${p.no}">${esc(p.title)}</a>${p.c ? ` <span class="cmt">${p.c}</span>` : ""}</td>
    <td>${esc(p.author)}</td><td class="date ${/시간/.test(p.time) ? "hot" : ""}">${p.time}</td><td class="views">${p.views}</td></tr>`).join("");
}
drawList();
$("b-search").onsubmit = e => { e.preventDefault(); drawList($("b-q").value.trim(), $("b-field").value); };

$("pager").innerHTML = Array.from({ length: 10 }, (_, i) => `<button class="${i === 0 ? "on" : ""}">${i + 1}</button>`).join("");
$("write").onclick = () => alert("글쓰기는 곧 열릴 예정이에요. (게시판 저장 기능을 연결하는 중입니다)");
