// 체험단 등록 (로그인 + 운영자 승인된 광고주만). 서버(Supabase)에 저장.
const $ = id => document.getElementById(id), form = $("reg-form"), gate = $("gate");
let photoBlob = null;

const dl = form.deadline, today = new Date();
dl.min = today.toISOString().slice(0, 10);
dl.value = new Date(today.getTime() + 14 * 864e5).toISOString().slice(0, 10);

const syncVisit = () => { $("visit-box").hidden = form.mode.value !== "방문형"; };
form.mode.addEventListener("change", syncVisit); syncVisit();

// 사진: 가로 800px 이하로 줄여서 업로드
$("photo").addEventListener("change", e => {
  const f = e.target.files[0], box = $("preview");
  if (!f) { photoBlob = null; box.hidden = true; return; }
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 800 / img.width), c = document.createElement("canvas");
    c.width = img.width * s; c.height = img.height * s;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => { photoBlob = b; box.style.backgroundImage = `url(${URL.createObjectURL(b)})`; box.hidden = false; }, "image/jpeg", 0.82);
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => { alert("이미지를 읽을 수 없어요."); e.target.value = ""; };
  img.src = URL.createObjectURL(f);
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
    let photo_url = null;
    if (photoBlob) {
      const path = `${user.id}/${Date.now()}.jpg`;
      const up = await sb.storage.from("campaign-photos").upload(path, photoBlob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      photo_url = sb.storage.from("campaign-photos").getPublicUrl(path).data.publicUrl;
    }
    const visit = d.mode === "방문형";
    const { error } = await sb.from("campaigns").insert({
      owner_id: user.id, type: d.type, mode: d.mode, region: d.region, cat: d.cat,
      biz: d.biz.trim(), title: d.title.trim(), reward: d.reward.trim(), slots: +d.slots, deadline: d.deadline,
      place_url: d.place || null, description: d.desc || null, photo_url,
      mission: d.mission.trim() || null, visit_start: visit && d.visit_start ? d.visit_start : null,
      visit_end: visit && d.visit_end ? d.visit_end : null, max_party: visit ? +d.max_party || 4 : 4,
    });
    if (error) throw error;
    location.href = "campaigns.html?type=" + encodeURIComponent(d.type);
  } catch (err) {
    const m = err.message || "";
    alert(m.includes("row-level security") ? "등록 권한이 없어요. 운영자 승인을 받은 광고주만 등록할 수 있어요."
      : "등록하지 못했어요: " + m);
    btn.disabled = false;
  }
});
