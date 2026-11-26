// AI 리뷰 원고(블로그) 관리 (운영자 전용). 원고 만들기·수정 저장은 Edge Function review-draft 가, 검수 완료/반려는 DB 함수 review_review_draft 가 처리해요.
// 리뷰·사진은 크롬 확장프로그램(네이버/구글 리뷰 수집 도구)으로 모은 CSV에서 옮겨 붙이는 걸 전제로 해요 — 이 화면은 수집하지 않아요.
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
let uid = 0;
const field = (label, input) => { if (!input.id) input.id = "fld" + (++uid); return el("div", { class: "rv-f" }, el("label", { for: input.id, text: label }), input); };   // 라벨과 입력칸을 연결(접근성)
const MSG = {
  forbidden: "운영자만 쓸 수 있어요.", bad_name: "상호명을 2자 이상 입력해 주세요.", need_reviews: "리뷰를 1건 이상 입력해 주세요. (한 줄에 하나) 리뷰가 없으면 AI가 지어낼 수 있어요.",
  bad_photo_url: "사진 URL은 http(s):// 로 시작해야 해요. (크롬 확장프로그램 CSV의 '사진URL' 칸을 그대로 붙여넣으세요)", not_configured: "서버에 Gemini 키가 설정되지 않았어요. (supabase/REVIEW_DRAFT_SETUP.md 참고)",
  auth_failed: "Gemini 키가 거부됐어요.", rate_limited: "무료 티어 호출 한도를 넘었어요. 잠시 후 다시 시도해 주세요.", timeout: "AI 응답이 오래 걸려 중단됐어요. 잠시 후 다시 시도해 주세요.", network: "AI에 연결하지 못했어요.", api_error: "AI 호출에 실패했어요. (모델 과부하일 수 있어요)", bad_model_output: "AI가 쓴 원고의 형식이 맞지 않아 저장하지 않았어요. 다시 시도해 주세요.",
  need_draft_text: "원고 본문을 비울 수 없어요.", not_draft: "이미 검수 완료되거나 반려된 원고는 바꿀 수 없어요.", not_found: "원고를 찾을 수 없어요.",
  note_required: "검수 메모를 5자 이상 적어 주세요. (무엇을 확인했는지)",
};
const errText = (e, fallback) => MSG[e] || fallback || "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
async function fnError(error) { try { return (await error.context.json()).error; } catch (_) { return ""; } }
const fmt = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const STATUS = { draft: "초안", approved: "검수완료", rejected: "반려" };
const gate = (t, login) => { $("gate").hidden = false; $("app").hidden = true; $("gate").textContent = t; if (login) { const b = el("button", { text: "다른 계정으로 로그인", onclick: async () => { await sb.auth.signOut(); location.replace("admin-login.html"); } }); $("gate").append(el("br"), b); } };

// ---------- 목록 ----------
async function loadList(selectId) {
  const { data, error } = await sb.from("review_drafts").select("id,status,business,created_at").order("created_at", { ascending: false }).limit(100);
  const box = $("list"); box.replaceChildren();
  if (error) { $("list-empty").hidden = false; $("list-empty").textContent = "원고를 불러오지 못했어요. (supabase/027_review_drafts.sql 을 실행했는지 확인해 주세요)"; return; }
  const st = $("st").value, rows = (data || []).filter(r => !st || r.status === st);
  $("list-empty").hidden = rows.length > 0; $("list-empty").textContent = "원고가 아직 없어요.";
  for (const r of rows) {
    const b = el("button", { type: "button", "data-id": String(r.id), class: "rv-item" + (cur && cur.id === r.id ? " on" : ""), onclick: () => openDraft(r.id) },
      el("b", { text: (r.business && r.business.name) || "(이름 없음)" }),
      el("span", { class: "chip " + r.status, text: STATUS[r.status] || r.status }),
      el("small", { text: " " + fmt(r.created_at) }));
    box.append(b);
  }
  if (selectId) openDraft(selectId);
}

// ---------- 새 원고 ----------
function newForm() {
  cur = null; dirty = false;
  const p = $("panel"); p.replaceChildren();
  const inp = (id, ph) => el("input", { id, placeholder: ph || "", maxlength: "120" });
  const reviews = el("textarea", { id: "n-reviews", rows: "8", placeholder: "한 줄에 리뷰 하나씩(10~30개 권장)\n예: 분위기도 좋고 친절하시고 메뉴 설명도 잘해주셨어요\n예: 갈비탕이 진하고 양도 많아서 만족했습니다" });
  const photos = el("textarea", { id: "n-photos", rows: "4", placeholder: "사진 URL 한 줄에 하나씩 (선택, 최대 15장)\n크롬 확장프로그램 CSV의 '사진URL' 칸(' | '로 구분된 값)을 줄바꿈으로 바꿔 붙여넣으세요" });
  const instr = el("textarea", { id: "n-instr", rows: "2", placeholder: "원고 요청사항 (선택) 예: 흰색 제품 사진만 강조해줘 / 가격 얘기는 빼줘" });
  const msg = el("p", { class: "rv-msg", id: "n-msg", role: "status" });
  const go = el("button", { class: "btn", type: "button", id: "n-go", text: "원고 만들기", onclick: async () => {
    msg.className = "rv-msg"; const lines = s => s.split("\n").map(x => x.trim()).filter(Boolean);
    const body = { business: { name: $("n-name").value, area: $("n-area").value, category: $("n-cat").value, signatureMenu: $("n-sig").value }, reviews: lines(reviews.value), photoUrls: lines(photos.value), customInstructions: instr.value };
    go.disabled = true; msg.textContent = "AI가 원고를 쓰는 중이에요. 사진이 있으면 최대 1~2분쯤 걸려요…";
    const { data, error } = await sb.functions.invoke("review-draft", { body });
    go.disabled = false;
    if (error) { msg.className = "rv-msg err"; msg.textContent = errText(await fnError(error)); return; }
    msg.className = "rv-msg ok"; msg.textContent = "원고를 만들었어요. 검수해 주세요."; await loadList(data && data.id);
  } });
  p.append(el("h2", { text: "새 원고 만들기" }), el("p", { class: "note", text: "입력한 리뷰와 업체 정보만으로 원고를 쓰게 해요. 리뷰에 없는 내용(가격·순위 등)은 지어내지 않도록 지시했지만, 완벽히 보장되진 않으니 꼭 검수하세요." }),
    field("상호명 *", inp("n-name")), field("지역/동네", inp("n-area")), field("업종/카테고리", inp("n-cat")), field("시그니처 메뉴 (쉼표로 구분)", inp("n-sig")),
    field("원고 요청사항", instr), field("리뷰 * (1건 이상, 여러 건 권장)", reviews), field("사진 URL", photos), el("div", { class: "rv-act" }, go), msg);
}

// ---------- 검수 ----------
async function openDraft(id) {
  const { data: r, error } = await sb.from("review_drafts").select("*").eq("id", id).maybeSingle();
  if (error || !r) { $("panel").replaceChildren(el("p", { class: "empty", text: "원고를 불러오지 못했어요." })); return; }
  cur = r; dirty = false; renderEditor(r);
  document.querySelectorAll(".rv-item").forEach(x => x.classList.toggle("on", x.dataset.id === String(id)));
}

function renderEditor(r) {
  const a = r.draft || {}, editable = r.status === "draft", p = $("panel"); p.replaceChildren();
  const ro = !editable, mark = () => { dirty = true; refresh(); };
  const titles = el("textarea", { id: "e-titles", rows: "3" }), hashtags = el("input", { id: "e-hash" }), text = el("textarea", { id: "e-text", rows: "12" });
  titles.value = (a.titles || []).join("\n"); hashtags.value = (a.hashtags || []).join(" "); text.value = a.draft || "";
  const photoUrls = r.photo_urls || [];
  const capBox = el("div", { id: "e-caps" });
  const addCap = (url, cap, i) => capBox.append(el("div", { class: "rv-sec" }, el("img", { src: url, alt: "", loading: "lazy" }), field("사진 " + (i + 1) + " 설명", el("input", { class: "cap-i", value: cap || "", maxlength: "60" }))));
  photoUrls.forEach((u, i) => addCap(u, (a.photoCaptions || [])[i], i));
  const msg = el("p", { class: "rv-msg", id: "e-msg", role: "status" });
  const copyBtn = el("button", { class: "btn", type: "button", text: "원고 복사", onclick: async () => {
    const hashLine = (hashtags.value || "").trim();
    const full = text.value + (hashLine ? "\n\n" + hashLine : "");
    try { await navigator.clipboard.writeText(full); msg.className = "rv-msg ok"; msg.textContent = "클립보드에 복사했어요."; } catch (_) { msg.className = "rv-msg err"; msg.textContent = "복사에 실패했어요. 직접 선택해서 복사해 주세요."; }
  } });
  const read = () => ({
    titles: titles.value.split("\n").map(x => x.trim()).filter(Boolean),
    hashtags: hashtags.value.split(/\s+/).map(x => x.trim()).filter(Boolean),
    requiredKeywords: a.requiredKeywords || [], goodKeywords: a.goodKeywords || [], signatureMenu: a.signatureMenu || [],
    draft: text.value,
    photoCaptions: [...capBox.children].map(d => d.querySelector(".cap-i").value),
  });
  const note = el("textarea", { id: "e-note", rows: "2", placeholder: "검수 메모 (5자 이상): 무엇을 확인했는지 적어 주세요. 예: 리뷰 내용과 대조, 지어낸 내용 없음", maxlength: "1000" });
  const save = el("button", { class: "btn", type: "button", id: "e-save", text: "수정 저장", onclick: async () => {
    msg.className = "rv-msg"; save.disabled = true; msg.textContent = "저장하는 중…";
    const { error } = await sb.functions.invoke("review-draft", { body: { action: "save", id: r.id, draft: read() } });
    save.disabled = false;
    if (error) { msg.className = "rv-msg err"; msg.textContent = errText(await fnError(error)); return; }
    await openDraft(r.id); await loadList(); const m2 = $("e-msg"); if (m2) { m2.className = "rv-msg ok"; m2.textContent = "저장했어요."; }
  } });
  const review = action => async () => {
    msg.className = "rv-msg"; const { error } = await sb.rpc("review_review_draft", { p_id: r.id, p_action: action, p_note: note.value });
    if (error) { msg.className = "rv-msg err"; msg.textContent = errText(String(error.message || "").trim()); return; }
    await openDraft(r.id); await loadList(); const m2 = $("e-msg"); if (m2) { m2.className = "rv-msg ok"; m2.textContent = action === "approve" ? "검수완료로 표시했어요." : "반려했어요."; }
  };
  const approve = el("button", { class: "btn ok", type: "button", id: "e-approve", text: "검수완료", onclick: review("approve") }), reject = el("button", { class: "btn", type: "button", id: "e-reject", text: "반려", onclick: review("reject") });
  function refresh() {
    const short = note.value.trim().length < 5;
    approve.disabled = !editable || dirty || short; reject.disabled = !editable || short;
    save.disabled = !editable || !dirty;
    approve.title = dirty ? "수정 저장을 먼저 해 주세요" : short ? "검수 메모를 5자 이상 적어 주세요" : "";
  }
  [titles, hashtags, text].forEach(x => x.addEventListener("input", mark)); capBox.addEventListener("input", mark); note.addEventListener("input", refresh);
  if (ro) [titles, hashtags, text].forEach(x => x.disabled = true);
  p.append(
    el("div", { class: "box-h" }, el("div", {}, el("span", { class: "chip " + r.status, text: STATUS[r.status] || r.status }), el("b", { text: " " + ((r.business && r.business.name) || "") + " · 원고 #" + r.id }))),
    el("div", { class: "rv-ro" }, el("div", { text: "지역 " + ((r.business && r.business.area) || "—") + " · 업종 " + ((r.business && r.business.category) || "—") + " · 모델 " + (r.model || "—") }),
      el("div", { text: "참고한 리뷰 " + (r.reviews || []).length + "건 · 사진 " + photoUrls.length + "장" })),
    el("h2", { text: "제목 후보 (한 줄에 하나)" }), field("", titles), el("h2", { text: "해시태그 (공백으로 구분)" }), field("", hashtags),
    el("h2", { text: "원고 본문" }), field("", text),
    photoUrls.length ? el("div", {}, el("h2", { text: "사진 설명" }), capBox) : null);
  if (editable) {
    p.append(el("div", { class: "rv-act" }, copyBtn, save), el("h2", { text: "검수" }), field("검수 메모", note), el("div", { class: "rv-act" }, approve, reject), msg);
  } else {
    p.append(el("div", { class: "rv-act" }, copyBtn),
      el("div", { class: "rv-ro" }, el("div", { text: (STATUS[r.status] || r.status) + " · " + fmt(r.reviewed_at) }), el("div", { text: "검수 메모: " + (r.review_note || "—") })), msg);
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
}
init();
