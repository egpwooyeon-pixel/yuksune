// 커뮤니티 게시판: 서버(Supabase)의 글을 불러와 보여줍니다.
const $ = id => document.getElementById(id);
const key = boardKey(), B = BOARDS[key], PER = 20;
const st = { page: 1, q: "", field: "title" };
$("b-title").textContent = B.title;
document.title = B.title + " - 우리들 체험단";
$("write").href = "write.html?b=" + key;
$("b-desc").textContent = B.desc || "";
if (B.adminOnly) {                                  // 공지사항: 인기글 박스는 숨기고, 글쓰기는 운영자에게만 보임
  document.querySelector(".pop").hidden = true; $("write").hidden = true;
  if (window.sbReady) sb.auth.getSession().then(async ({ data }) => {
    const u = data.session && data.session.user; if (!u) return;
    const { data: p } = await sb.from("profiles").select("role").eq("id", u.id).maybeSingle();
    if (p && p.role === "admin") $("write").hidden = false;
  });
}

const link = id => `post.html?b=${key}&id=${id}`;
const rowHtml = (p, num) => `<tr><td class="num">${num}</td>
  <td class="title"><a href="${link(p.id)}">${esc(p.title)}</a>${cntOf(p) ? ` <span class="cmt">${cntOf(p)}</span>` : ""}</td>
  <td>${esc(nickOf(p))}</td><td class="date ${/분|시간|방금/.test(timeAgo(p.created_at)) ? "hot" : ""}">${timeAgo(p.created_at)}</td><td class="views">${p.views}</td></tr>`;
const SEL = "id,title,views,created_at,profiles(nickname),comments(count)";

async function drawPop(range) {
  const since = new Date(Date.now() - (range === "w" ? 7 : 30) * 864e5).toISOString();
  const { data } = await sb.from("posts").select(SEL).eq("board", key).eq("is_notice", false)
    .gte("created_at", since).order("views", { ascending: false }).limit(10);
  $("pop").innerHTML = (data || []).map(p => `<li><span class="pc">${esc(B.cat)}</span><a href="${link(p.id)}">${esc(p.title)}</a><i>(${cntOf(p)})</i></li>`).join("")
    || '<li class="muted">아직 인기글이 없어요.</li>';
}
document.querySelector(".pop-tabs").onclick = e => {
  const t = e.target.dataset.t; if (!t) return;
  document.querySelectorAll(".pop-tabs button").forEach(b => b.classList.toggle("on", b === e.target)); drawPop(t);
};

async function drawList() {
  let notices = [];
  if (st.page === 1 && !st.q) {
    const r = await sb.from("posts").select(SEL).eq("board", key).eq("is_notice", true).order("created_at", { ascending: false });
    notices = r.data || [];
  }
  const sel = st.q && st.field === "author" ? SEL.replace("profiles(", "profiles!inner(") : SEL;
  let qb = sb.from("posts").select(sel, { count: "exact" }).eq("board", key).eq("is_notice", false);
  if (st.q) qb = st.field === "author" ? qb.ilike("profiles.nickname", `%${st.q}%`) : qb.ilike("title", `%${st.q}%`);
  const from = (st.page - 1) * PER;
  const { data, count, error } = await qb.order("created_at", { ascending: false }).range(from, from + PER - 1);
  if (error) { $("post-list").innerHTML = ""; $("b-empty").hidden = false; $("b-empty").textContent = "글을 불러오지 못했어요."; return; }
  const list = data || [], total = count || 0;
  $("b-empty").textContent = st.q ? "검색 결과가 없어요." : "아직 글이 없어요. 첫 글을 남겨 보세요!";
  $("b-empty").hidden = list.length + notices.length > 0;
  $("post-list").innerHTML = notices.map(p => `<tr class="notice"><td class="num"><span class="badge notice">공지</span></td>
    <td class="title"><a href="${link(p.id)}"><b>${esc(p.title)}</b></a>${cntOf(p) ? ` <span class="cmt">${cntOf(p)}</span>` : ""}</td>
    <td>${esc(nickOf(p))}</td><td class="date">${timeAgo(p.created_at)}</td><td class="views">${p.views}</td></tr>`).join("")
    + list.map((p, i) => rowHtml(p, total - from - i)).join("");
  drawPager(Math.max(1, Math.ceil(total / PER)));
}

function drawPager(pages) {
  const start = Math.max(1, Math.min(st.page - 4, pages - 9)), end = Math.min(pages, start + 9);
  $("pager").innerHTML = Array.from({ length: end - start + 1 }, (_, i) => start + i)
    .map(n => `<button data-p="${n}" class="${n === st.page ? "on" : ""}">${n}</button>`).join("");
}
$("pager").onclick = e => { const n = +e.target.dataset.p; if (!n) return; st.page = n; drawList(); scrollTo({ top: 0 }); };
$("b-search").onsubmit = e => { e.preventDefault(); st.q = $("b-q").value.trim(); st.field = $("b-field").value; st.page = 1; drawList(); };

if (!window.sbReady) { $("b-empty").hidden = false; $("b-empty").textContent = "서버 연결 키가 설정되지 않았습니다."; $("pop").innerHTML = ""; }
else { if (!B.adminOnly) drawPop("m"); drawList(); }
