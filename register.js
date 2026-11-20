// 체험단 등록 (로그인 + 운영자 승인된 광고주만). 서버(Supabase)에 저장.
const $ = id => document.getElementById(id), form = $("reg-form"), gate = $("gate");
let photoBlob = null;

const dl = form.deadline, today = new Date();
dl.min = today.toISOString().slice(0, 10);
dl.value = new Date(today.getTime() + 14 * 864e5).toISOString().slice(0, 10);

const syncVisit = () => { $("visit-box").hidden = form.mode.value !== "방문형"; };
form.mode.addEventListener("change", syncVisit); syncVisit();

// 사진: 가로 800px 이하 JPEG 로 줄이기
function resize(file) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 800 / img.width), c = document.createElement("canvas");
      c.width = img.width * s; c.height = img.height * s;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); c.toBlob(b => b ? ok(b) : fail(new Error("이미지 변환 실패")), "image/jpeg", 0.82);
    };
    img.onerror = () => fail(new Error("이미지를 읽을 수 없어요."));
    img.src = URL.createObjectURL(file);
  });
}
let detailBlob = null;
$("photo").addEventListener("change", async e => {
  const f = e.target.files[0], box = $("preview");
  if (!f) { photoBlob = null; box.hidden = true; return; }
  try { photoBlob = await resize(f); box.style.backgroundImage = `url(${URL.createObjectURL(photoBlob)})`; box.hidden = false; }
  catch (err) { alert(err.message); e.target.value = ""; }
});
$("detail-photo").addEventListener("change", async e => {
  const f = e.target.files[0]; detailBlob = null; if (!f) return;
  try { detailBlob = await resize(f); } catch (err) { alert(err.message); e.target.value = ""; }
});

function lock(text) { gate.hidden = false; gate.innerHTML = text; [...form.elements].forEach(el => el.disabled = true); }

let user = null;
(async () => {
  if (!window.sbReady) return lock("서버 연결 키가 설정되지 않았습니다.");
  const { data } = await sb.auth.getSession();
  user = data.session && data.session.user;
  if (!user) return location.replace("login.html?next=register.html");
  const { data: p } = await sb.from("profiles").select("business_status,business_note").eq("id", user.id).maybeSingle();
  const st = p ? p.business_status : "none";
  if (st === "approved") return;
  const msg = { none: "체험단은 <b>운영자가 승인한 광고주</b>만 등록할 수 있어요. 사업자등록증 제출 화면은 준비 중입니다. 급하시면 운영자에게 문의해 주세요.",
    pending: "광고주 심사가 진행 중이에요. 승인되면 등록할 수 있어요.",
    rejected: "광고주 심사가 반려되었어요." + (p && p.business_note ? " 사유: " + p.business_note : "") };
  lock(msg[st] || msg.none);
})();

form.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = form.querySelector(".submit"); btn.disabled = true;
  const d = Object.fromEntries(new FormData(form));
  try {
    const upload = async blob => {
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const up = await sb.storage.from("campaign-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      return sb.storage.from("campaign-photos").getPublicUrl(path).data.publicUrl;
    };
    const photo_url = photoBlob ? await upload(photoBlob) : null;
    const detail_photo_url = detailBlob ? await upload(detailBlob) : null;
    const visit = d.mode === "방문형";
    const row = {
      owner_id: user.id, type: d.type, mode: d.mode, region: d.region, cat: d.cat,
      biz: d.biz.trim(), title: d.title.trim(), reward: d.reward.trim(), slots: +d.slots, deadline: d.deadline,
      place_url: d.place || null, description: d.desc || null, photo_url,
      mission: d.mission.trim() || null, visit_start: visit && d.visit_start ? d.visit_start : null,
      visit_end: visit && d.visit_end ? d.visit_end : null, max_party: visit ? +d.max_party || 4 : 4,
    };
    // 3단계(003) 추가 항목: 입력한 것만 보냄 (SQL 003 을 먼저 실행해야 저장됨)
    const wd = [...form.querySelectorAll('input[name="wd"]:checked')].map(x => x.value).join(",");
    const times = (d.visit_times || "").split(",").map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t)).join(",");
    const extra = {
      keywords: d.keywords, shipping_info: d.shipping_info, product_url: d.product_url, notice: d.notice,
      review_deadline: d.review_deadline, mission_photos: d.mission_photos, mission_chars: d.mission_chars,
      address: visit ? d.address : "", visit_notes: visit ? d.visit_notes : "", visit_weekdays: visit ? wd : "",
      visit_times: visit ? times : "", detail_photo_url,
    };
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && String(v).trim() !== "") row[k] = typeof v === "string" ? v.trim() : v;
    if (form.mission_link.checked) row.mission_link = true;
    if (form.mission_video.checked) row.mission_video = true;
    if (!form.mission_disclosure.checked) row.mission_disclosure = false;
    const { error } = await sb.from("campaigns").insert(row);
    if (error) throw error;
    location.href = "campaigns.html?type=" + encodeURIComponent(d.type);
  } catch (err) {
    const m = err.message || "";
    alert(m.includes("row-level security") ? "등록 권한이 없어요. 운영자 승인을 받은 광고주만 등록할 수 있어요."
      : m.includes("column") ? "서버에 상세 항목이 아직 준비되지 않았어요. 운영자에게 문의해 주세요. (" + m + ")" : "등록하지 못했어요: " + m);
    btn.disabled = false;
  }
});
