// 글 초안 검수 (운영자 전용). 초안 만들기·수정 저장은 Edge Function aeo-draft 가, 승인/반려는 DB 함수 review_guide_draft 가 처리해요.
// 모든 값은 textContent/value 로만 화면에 넣어요 (글에 HTML 이 들어 있어도 실행되지 않음).
const $ = id => document.getElementById(id);
const cfg = window.WOORI || {};
const sb = cfg.SUPABASE_ANON_KEY && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
let cur = null, dirty = false;

const el = (tag, props, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) { if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.startsWith("on")) e[k] = v; else e.setAttribute(k, v); }
  e.append(...kids.filter(x => x != null)); return e;
};
const field = (label, input) => el("div", { class: "dr-f" }, el("label", { text: label }), input);
const MSG = {
  forbidden: "운영자만 쓸 수 있어요.", bad_name: "업체명을 2자 이상 입력해 주세요.", need_industry: "업종을 입력해 주세요.", need_facts: "사실을 2개 이상 입력해 주세요. (한 줄에 하나, 6자 이상) 사실이 없으면 AI가 지어낼 수 있어요.",
  bad_url: "홈페이지 주소는 http(s):// 로 시작해야 해요.", bad_source: "출처는 '이름 | https://주소' 형식으로 한 줄에 하나씩 써 주세요.", not_configured: "서버에 Gemini 키가 설정되지 않았어요.",
  auth_failed: "Gemini 키가 거부됐어요.", timeout: "AI 응답이 오래 걸려 중단됐어요. 잠시 후 다시 시도해 주세요.", network: "AI에 연결하지 못했어요.", api_error: "AI 호출에 실패했어요. (모델 과부하일 수 있어요)", bad_model_output: "AI가 쓴 글의 형식이 맞지 않아 저장하지 않았어요. 다시 시도해 주세요.",
  invalid_article: "글의 형식이 맞지 않아요. 제목(5자 이상)·설명(10자 이상)·소제목 1개 이상을 확인해 주세요.", not_draft: "이미 승인되거나 반려된 글은 바꿀 수 없어요.", not_found: "초안을 찾을 수 없어요.",
  note_required: "검수 메모를 5자 이상 적어 주세요. (무엇을 확인했는지)", blocking_issues: "차단 항목이 남아 있어 승인할 수 없어요. 문구를 고치고 저장해 주세요.",
};
const errText = (e, fallback) => MSG[e] || fallback || "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
async function fnError(error) { try { return (await error.context.json()).error; } catch (_) { return ""; } }
const fmt = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const STATUS = { draft: "초안", approved: "승인", rejected: "반려" };
const gate = (t, login) => { $("gate").hidden = false; $("app").hidden = true; $("gate").textContent = t; if (login) { const b = el("button", { text: "다른 계정으로 로그인", onclick: async () => { await sb.auth.signOut(); location.replace("admin-login.html"); } }); $("gate").append(el("br"), b); } };

// ---------- 목록 ----------
async function loadList(selectId) {
  const { data, error } = await sb.from("guide_drafts").select("id,status,blocking,business,created_at").order("created_at", { ascending: false }).limit(100);
  const box = $("list"); box.replaceChildren();
  if (error) { $("list-empty").hidden = false; $("list-empty").textContent = "초안을 불러오지 못했어요. (supabase/025_drafts.sql 을 실행했는지 확인해 주세요)"; return; }
  const st = $("st").value, rows = (data || []).filter(r => !st || r.status === st);
  $("list-empty").hidden = rows.length > 0; $("list-empty").textContent = "초안이 아직 없어요.";
  for (const r of rows) {
    const b = el("button", { type: "button", "data-id": String(r.id), class: "dr-item" + (cur && cur.id === r.id ? " on" : ""), onclick: () => openDraft(r.id) },
      el("b", { text: (r.business && r.business.name) || "(이름 없음)" }),
      el("span", { class: "chip " + r.status, text: STATUS[r.status] || r.status }), r.blocking > 0 && r.status === "draft" ? el("span", { class: "chip block", text: "차단 " + r.blocking }) : null,
      el("small", { text: " " + fmt(r.created_at) }));
    box.append(b);
  }
  if (selectId) openDraft(selectId);
}

// ---------- 새 초안 ----------
function newForm() {
  cur = null; dirty = false;
  const p = $("panel"); p.replaceChildren();
  const inp = (id, ph) => el("input", { id, placeholder: ph || "", maxlength: "120" });
  const facts = el("textarea", { id: "n-facts", rows: "6", placeholder: "한 줄에 사실 하나씩 (업체가 확인해 준 내용만)\n예: 야외 예식 공간이 있습니다\n예: 하객 100명 규모 상담이 가능합니다" });
  const srcs = el("textarea", { id: "n-src", rows: "3", placeholder: "한 줄에 하나: 이름 | https://주소\n예: 업체 공식 홈페이지 | https://example.com" });
  const msg = el("p", { class: "dr-msg", id: "n-msg", role: "status" });
  const go = el("button", { class: "btn", type: "button", id: "n-go", text: "초안 만들기", onclick: async () => {
    msg.className = "dr-msg"; const lines = s => s.split("\n").map(x => x.trim()).filter(Boolean);
    const sources = []; for (const l of lines(srcs.value)) { const [a, b] = l.split("|").map(x => x.trim()); if (b) sources.push({ label: a, url: b }); else sources.push({ label: l, url: l }); }
    const body = { business: { name: $("n-name").value, region: $("n-region").value, industry: $("n-ind").value, address: $("n-addr").value, hours: $("n-hours").value, url: $("n-url").value, summary: $("n-sum").value }, facts: lines(facts.value), sources, topic: $("n-topic").value };
    const q = new URLSearchParams(location.search).get("inquiry"); if (/^\d+$/.test(q || "")) body.inquiryId = Number(q);
    go.disabled = true; msg.textContent = "AI가 초안을 쓰는 중이에요. 최대 1분쯤 걸려요…";
    const { data, error } = await sb.functions.invoke("aeo-draft", { body });
    go.disabled = false;
    if (error) { msg.className = "dr-msg err"; msg.textContent = errText(await fnError(error)); return; }
    msg.className = "dr-msg ok"; msg.textContent = "초안을 만들었어요. 검수해 주세요."; await loadList(data && data.id);
  } });
  p.append(el("h2", { text: "새 초안 만들기" }), el("p", { class: "note", text: "입력한 사실과 업체 정보만으로 글을 쓰게 해요. 출처 링크는 여기에 적은 것만 글에 들어가요." }),
    field("업체명 *", inp("n-name")), field("업종 * (예: 웨딩홀)", inp("n-ind")), field("지역", inp("n-region")), field("주소", inp("n-addr")), field("운영시간", inp("n-hours")), field("홈페이지", inp("n-url", "https://")), field("한 줄 소개", inp("n-sum")),
    field("다룰 주제 (선택)", inp("n-topic", "예: 야외 예식 고를 때 확인할 점")), field("제공된 사실 * (2개 이상)", facts), field("출처", srcs), el("div", { class: "dr-act" }, go), msg);
}

// ---------- 검수 ----------
async function openDraft(id) {
  const { data: r, error } = await sb.from("guide_drafts").select("*").eq("id", id).maybeSingle();
  if (error || !r) { $("panel").replaceChildren(el("p", { class: "empty", text: "초안을 불러오지 못했어요." })); return; }
  cur = r; dirty = false; renderEditor(r);
  document.querySelectorAll(".dr-item").forEach(x => x.classList.toggle("on", x.dataset.id === String(id)));
}
const lintList = lint => el("ul", { class: "dr-lint" }, ...(lint || []).map(i => el("li", {}, el("span", { class: "chip " + (i.level === "block" ? "block" : "warn"), text: i.level === "block" ? "차단" : "확인" }), el("span", { text: i.msg }))));

function renderEditor(r) {
  const a = r.article || {}, editable = r.status === "draft", p = $("panel"); p.replaceChildren();
  const ro = !editable, mark = () => { dirty = true; refresh(); };
  const title = el("input", { id: "e-title", value: a.title || "", maxlength: "100" }), desc = el("textarea", { id: "e-desc", rows: "2", maxlength: "160" }), qs = el("textarea", { id: "e-q", rows: "3" });
  desc.value = a.description || ""; qs.value = (a.questions || []).join("\n");
  const secBox = el("div", { id: "e-secs" }), faqBox = el("div", { id: "e-faqs" });
  const addSec = (s = { heading: "", paragraphs: [""] }) => { const h = el("input", { class: "s-h", value: s.heading, maxlength: "80" }), t = el("textarea", { class: "s-p", rows: "5" }); t.value = (s.paragraphs || []).join("\n\n"); secBox.append(el("div", { class: "dr-sec" }, field("소제목", h), field("본문 (문단은 빈 줄로 구분)", t))); };
  const addFaq = (f = { q: "", a: "" }) => { const q = el("input", { class: "f-q", value: f.q, maxlength: "200" }), t = el("textarea", { class: "f-a", rows: "2" }); t.value = f.a; faqBox.append(el("div", { class: "dr-sec" }, field("질문", q), field("답변", t))); };
  (a.sections || []).forEach(addSec); (a.faq || []).forEach(addFaq);
  const msg = el("p", { class: "dr-msg", id: "e-msg", role: "status" });
  const read = () => ({
    title: title.value, description: desc.value, questions: qs.value.split("\n").map(x => x.trim()).filter(Boolean),
    sections: [...secBox.children].map(d => ({ heading: d.querySelector(".s-h").value, paragraphs: d.querySelector(".s-p").value.split(/\n{2,}/).map(x => x.trim()).filter(Boolean) })),
    faq: [...faqBox.children].map(d => ({ q: d.querySelector(".f-q").value, a: d.querySelector(".f-a").value })),
  });
  const note = el("textarea", { id: "e-note", rows: "2", placeholder: "검수 메모 (5자 이상): 무엇을 확인했는지 적어 주세요. 예: 업체 확인 사실과 대조, 과장 표현 없음", maxlength: "1000" });
  const save = el("button", { class: "btn", type: "button", id: "e-save", text: "수정 저장", onclick: async () => {
    msg.className = "dr-msg"; save.disabled = true; msg.textContent = "저장하는 중…";
    const { error } = await sb.functions.invoke("aeo-draft", { body: { action: "save", id: r.id, article: read() } });
    save.disabled = false;
    if (error) { msg.className = "dr-msg err"; msg.textContent = errText(await fnError(error)); return; }
    await openDraft(r.id); await loadList(); const m2 = $("e-msg"); if (m2) { m2.className = "dr-msg ok"; m2.textContent = "저장하고 자동 검사를 다시 했어요."; }
  } });
  const review = action => async () => {
    msg.className = "dr-msg"; const { error } = await sb.rpc("review_guide_draft", { p_id: r.id, p_action: action, p_note: note.value });
    if (error) { msg.className = "dr-msg err"; msg.textContent = errText(String(error.message || "").trim()); return; }
    await openDraft(r.id); await loadList(); const m2 = $("e-msg"); if (m2) { m2.className = "dr-msg ok"; m2.textContent = action === "approve" ? "승인했어요." : "반려했어요."; }
  };
  const approve = el("button", { class: "btn ok", type: "button", id: "e-approve", text: "승인", onclick: review("approve") }), reject = el("button", { class: "btn", type: "button", id: "e-reject", text: "반려", onclick: review("reject") });
  function refresh() {
    const blocked = r.blocking > 0, short = note.value.trim().length < 5;
    approve.disabled = !editable || blocked || dirty || short; reject.disabled = !editable || short;
    save.disabled = !editable || !dirty;
    approve.title = blocked ? "차단 항목이 남아 있어요" : dirty ? "수정 저장을 먼저 해 주세요" : short ? "검수 메모를 5자 이상 적어 주세요" : "";
  }
  [title, desc, qs].forEach(x => x.addEventListener("input", mark)); secBox.addEventListener("input", mark); faqBox.addEventListener("input", mark); note.addEventListener("input", refresh);
  if (ro) [title, desc, qs].forEach(x => x.disabled = true);
  p.append(
    el("div", { class: "box-h" }, el("div", {}, el("span", { class: "chip " + r.status, text: STATUS[r.status] || r.status }), el("b", { text: " " + ((r.business && r.business.name) || "") + " · 초안 #" + r.id }))),
    el("div", { class: "dr-ro" }, el("div", { text: "업종 " + (a.category || "") + " · 지역 " + ((r.business && r.business.region) || "—") + " · 모델 " + (r.model || "—") }), el("div", { text: "슬러그 " + (a.slug || "") + " · 발행일 " + (a.publishedAt || "") }),
      el("div", { text: "출처(입력값만): " + ((a.sources || []).map(s => s.label + " " + s.url).join(", ") || "없음") }), el("div", { text: "제공된 사실: " + ((r.facts || []).join(" / ") || "없음") })),
    el("h2", { text: "자동 검사" }), (r.lint || []).length ? lintList(r.lint) : el("p", { class: "note", text: "자동 검사에서 걸린 항목이 없어요. 그래도 사람이 사실을 꼭 확인하세요." }),
    field("제목", title), field("설명", desc), field("이 글에서 답하는 질문 (한 줄에 하나)", qs), el("h2", { text: "본문" }), secBox, el("h2", { text: "자주 묻는 질문" }), faqBox);
  if (editable) {
    p.append(el("div", { class: "dr-act" }, el("button", { class: "btn", type: "button", text: "+ 소제목", onclick: () => { addSec(); mark(); } }), el("button", { class: "btn", type: "button", text: "+ 질문", onclick: () => { addFaq(); mark(); } }), save),
      el("h2", { text: "검수" }), field("검수 메모", note), el("div", { class: "dr-act" }, approve, reject), msg);
  } else {
    p.append(el("div", { class: "dr-ro" }, el("div", { text: (STATUS[r.status] || r.status) + " · " + fmt(r.reviewed_at) }), el("div", { text: "검수 메모: " + (r.review_note || "—") })));
  }
  refresh();
}

async function init() {
  if (!sb) return gate("서버 연결 키가 설정되지 않았습니다.");
  const { data } = await sb.auth.getSession(), u = data.session && data.session.user;
  if (!u) return location.replace("admin-login.html");
  const { data: p } = await sb.from("profiles").select("nickname,role").eq("id", u.id).maybeSingle();
  if (!p || p.role !== "admin") return gate("관리자만 볼 수 있는 페이지예요.", true);
  $("gate").hidden = true; $("app").hidden = false;
  $("me-name").textContent = p.nickname || u.email.split("@")[0]; $("me-mail").textContent = u.email;
  $("new-btn").addEventListener("click", newForm); $("st").addEventListener("change", () => loadList());
  await loadList();
  if (/^\d+$/.test(new URLSearchParams(location.search).get("inquiry") || "")) newForm();
}
init();
