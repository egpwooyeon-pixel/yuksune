// AI 리뷰 원고 (인플루언서용): 운영자가 승인한 인플루언서 회원이 '사진 + 상호명'만으로 블로그 원고를 만듭니다 (본인 것만 보임).
// 운영자는 기존 방식(리뷰 붙여넣기)도 쓸 수 있어요. window.sb/sbReady 는
// auth.js 가 만들어둔 걸 그대로 씁니다. 원고 생성·일일 한도는 Edge Function review-draft 가 처리해요.
const $ = id => document.getElementById(id);
const msg = t => { $("rv-msg").hidden = !t; $("rv-msg").textContent = t || ""; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const formMsg = (t, ok) => { const el = $("rv-form-msg"); el.hidden = !t; el.textContent = t || ""; el.style.color = ok ? "#0c8f66" : ""; };
const fmt = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`; };

const ERR = {
  forbidden: "로그인이 필요해요.", not_approved: "인플루언서 승인을 받은 회원만 쓸 수 있어요.", need_photos: "사진을 1장 이상 올려 주세요.",
  bad_name: "상호명을 2자 이상 입력해 주세요.", need_reviews: "리뷰를 1건 이상 입력해 주세요. (한 줄에 하나씩)",
  bad_photo_url: "사진을 다시 올려 주세요. (올린 사진만 사용할 수 있어요)", not_configured: "지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  daily_limit: "오늘 만들 수 있는 원고(하루 1건)를 다 썼어요. 내일 다시 시도해 주세요.",
  auth_failed: "AI 연결에 실패했어요.", rate_limited: "지금 요청이 몰려 있어요. 잠시 후 다시 시도해 주세요.",
  timeout: "AI 응답이 오래 걸려 중단됐어요. 잠시 후 다시 시도해 주세요.", network: "AI에 연결하지 못했어요.",
  api_error: "AI 호출에 실패했어요. (모델 과부하일 수 있어요)", bad_model_output: "AI가 쓴 원고의 형식이 맞지 않아요. 다시 시도해 주세요.",
};
async function fnError(error) { try { return (await error.context.json()).error; } catch (_) { return ""; } }
const errText = e => ERR[e] || "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";

// 사진 직접 업로드: 공개 버킷 review-draft-photos 의 "<내 uid>/<랜덤>.<확장자>" 에만 올릴 수 있어요(029 SQL).
// 파일 이름·확장자는 믿지 않고 파일 앞부분으로 실제 형식을 확인해요(진단 화면의 업체 사진 카드와 같은 방식).
const BUCKET = "review-draft-photos", MAX_PHOTOS = 15, MAX_BYTES = 8 * 1024 * 1024;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const uuid4 = () => { const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; const h = [...b].map(x => x.toString(16).padStart(2, "0")).join(""); return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20); };
const sniffImage = async f => {
  const b = new Uint8Array(await f.slice(0, 12).arrayBuffer()), asc = (i, n) => String.fromCharCode(...b.slice(i, i + n));
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "image/jpeg";
  if (b[0] === 0x89 && asc(1, 3) === "PNG") return "image/png";
  if (asc(0, 4) === "RIFF" && asc(8, 4) === "WEBP") return "image/webp";
  return null;
};
let picked = [], photoMode = false;
function drawPhotos() {
  const ul = $("rv-photo-list"); ul.replaceChildren();
  picked.forEach((x, i) => {
    const li = document.createElement("li"), img = document.createElement("img"), rm = document.createElement("button");
    img.src = x.url; img.alt = "";
    rm.type = "button"; rm.textContent = "×"; rm.setAttribute("aria-label", x.file.name + " 빼기");
    rm.addEventListener("click", () => { URL.revokeObjectURL(x.url); picked.splice(i, 1); drawPhotos(); });
    li.append(img, rm); ul.append(li);
  });
}
$("rv-photo-file").addEventListener("change", async e => {
  const notes = [];
  for (const f of [...e.target.files]) {
    if (picked.length >= MAX_PHOTOS) { notes.push("사진은 최대 " + MAX_PHOTOS + "장까지예요."); break; }
    if (f.size > MAX_BYTES) { notes.push(f.name + ": 8MB를 넘어요."); continue; }
    const type = await sniffImage(f);
    if (!type) { notes.push(f.name + ": JPG·PNG·WebP 사진이 아니에요."); continue; }
    picked.push({ file: f, type, url: URL.createObjectURL(f) });
  }
  e.target.value = ""; drawPhotos();
  if (notes.length) formMsg(notes.join(" "));
});
async function uploadPhotos(ownerId) {
  const urls = [];
  for (const x of picked) {
    const path = `${ownerId}/${uuid4()}.${EXT[x.type]}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, x.file, { contentType: x.type });
    if (error) throw new Error("photo_upload_failed");
    urls.push(sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

function renderDraft(r) {
  const a = r.draft || {};
  const photos = (r.photo_urls || []).map(u => `<img src="${esc(u)}" alt="">`).join("");
  const titles = (a.titles || []).map(t => `<li>${esc(t)}</li>`).join("");
  const hashtags = (a.hashtags || []).join(" ");
  const full = (a.draft || "") + (hashtags ? "\n\n" + hashtags : "");
  const el = document.createElement("div");
  el.className = "rvp-card";
  el.innerHTML = `<h3>${esc((r.business && r.business.name) || "")}</h3>
    <div class="muted">${fmt(r.created_at)}${(r.reviews || []).length ? ` · 리뷰 ${r.reviews.length}건` : ""} · 사진 ${(r.photo_urls || []).length}장</div>
    ${titles ? `<ul class="rvp-titles">${titles}</ul>` : ""}
    <div class="rvp-body">${esc(a.draft || "")}</div>
    ${hashtags ? `<div class="rvp-tags">${esc(hashtags)}</div>` : ""}
    ${photos ? `<div class="rvp-photos">${photos}</div>` : ""}
    <button type="button" class="btn-line">원고 복사</button> <span class="muted small copy-msg"></span>`;
  el.querySelector("button").addEventListener("click", async () => {
    const out = el.querySelector(".copy-msg");
    try { await navigator.clipboard.writeText(full); out.textContent = "복사했어요."; }
    catch (_) { out.textContent = "복사에 실패했어요. 직접 선택해서 복사해 주세요."; }
  });
  return el;
}

async function loadList(me) {
  const { data, error } = await sb.from("review_drafts").select("*").eq("created_by", me.id).order("created_at", { ascending: false }).limit(50);
  const box = $("rv-list"); box.replaceChildren();
  if (error) { $("rv-list-empty").hidden = false; $("rv-list-empty").textContent = "원고를 불러오지 못했어요. (supabase/027·028 SQL을 실행했는지 확인해 주세요)"; return; }
  const rows = data || [];
  $("rv-list-empty").hidden = rows.length > 0;
  const now = new Date();
  const kstDay = t => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(0, 10), madeToday = rows.filter(r => kstDay(r.created_at) === kstDay(now)).length;   // 한국 시간 기준 오늘
  rows.forEach(r => box.append(renderDraft(r)));
  $("rv-quota").textContent = photoMode ? (madeToday >= 1 ? "오늘 만들 수 있는 1건을 다 썼어요. 내일(한국 시간 0시 이후) 다시 만들 수 있어요." : "오늘 1건 만들 수 있어요.") : `오늘 ${madeToday}개 만들었어요.`;
}

$("rv-form").addEventListener("submit", async e => {
  e.preventDefault();
  if ($("rv-go").disabled) return;
  formMsg("");
  const lines = s => s.split("\n").map(x => x.trim()).filter(Boolean);
  const name = $("rv-name").value.trim();
  if (name.length < 2) return formMsg("상호명을 2자 이상 입력해 주세요.");
  const reviews = photoMode ? [] : lines($("rv-reviews").value);
  if (!photoMode && !reviews.length) return formMsg("리뷰를 1건 이상 입력해 주세요. (한 줄에 하나씩)");
  if (photoMode && !picked.length) return formMsg("사진을 1장 이상 올려 주세요.");
  const me = (await sb.auth.getSession()).data.session.user;
  $("rv-go").disabled = true;
  let photoUrls = [];
  if (picked.length) {
    formMsg("사진을 올리는 중이에요…");
    try { photoUrls = await uploadPhotos(me.id); }
    catch (_) { $("rv-go").disabled = false; return formMsg("사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요."); }
  }
  const body = { business: { mode: photoMode ? "photo" : undefined, name, area: $("rv-area").value.trim(), category: $("rv-cat").value.trim(), signatureMenu: $("rv-sig").value.trim() }, reviews, photoUrls, customInstructions: $("rv-instr").value.trim() };
  formMsg(photoUrls.length ? "AI가 원고를 쓰는 중이에요. 사진이 있어서 1~2분쯤 걸려요…" : "AI가 원고를 쓰는 중이에요…");
  const { data, error } = await sb.functions.invoke("review-draft", { body });
  $("rv-go").disabled = false;
  if (error) return formMsg(errText(await fnError(error)));
  formMsg("원고를 만들었어요! 아래 목록에서 확인하세요.", true);
  $("rv-reviews").value = ""; picked.forEach(x => URL.revokeObjectURL(x.url)); picked = []; drawPhotos();
  await loadList(me);
});

(async () => {
  if (!sbReady) return msg("서버 연결 키가 설정되지 않았습니다.");
  const { data } = await sb.auth.getSession();
  const me = data.session && data.session.user;
  if (!me) return location.replace("login.html?next=review-draft.html");
  const { data: p } = await sb.from("profiles").select("role,community").eq("id", me.id).maybeSingle();
  const admin = !!p && p.role === "admin", influencer = !!p && p.community === "influencer";
  if (!admin && !influencer) {
    msg("인플루언서 승인을 받은 회원만 AI 리뷰 원고를 쓸 수 있어요. 인플루언서 커뮤니티 가입을 신청하면 운영자가 확인해 열어 드려요.");
    const a = document.createElement("a"); a.href = "board.html?b=influencer"; a.className = "btn-primary"; a.textContent = "인플루언서 커뮤니티 가입 신청하기";
    $("rv-msg").append(" ", a);
    return;
  }
  photoMode = !admin;                       // 인플루언서는 '사진만' 방식, 운영자는 기존 방식(리뷰 붙여넣기)도 가능
  $("rv-reviews-row").hidden = photoMode;
  $("rv-form-box").hidden = false; $("rv-list-box").hidden = false;
  await loadList(me);
})();
