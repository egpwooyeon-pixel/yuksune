// 주소 칸: "blog.naver.com/abc" 처럼 https:// 없이 써도 받아요. 주소처럼 보이면 https:// 를 붙이고, 아니면 입력한 그대로 둡니다. (거절하지 않음)
const fixUrl = v => { v = String(v || "").trim(); if (!v || /^https?:\/\//i.test(v)) return v; if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(v)) return v; return /\s/.test(v) || !/\./.test(v) ? v : "https://" + v.replace(/^\/\//, ""); };
// 체험단 등록 (로그인 + 운영자 승인된 광고주만). 서버(Supabase)에 저장.
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
  if (st === "approved") {                                   // 페널티로 등록이 정지 중인지 확인
    const { data: pen } = await sb.from("advertiser_events").select("suspended_until").eq("owner_id", user.id).eq("kind", "penalty").not("suspended_until", "is", null);
    const now = new Date(), act = (pen || []).map(x => x.suspended_until).filter(v => v === "infinity" || new Date(v) > now);
    if (act.length) {
      const perm = act.includes("infinity"), until = perm ? "" : new Date(Math.max(...act.map(v => +new Date(v)))).toLocaleDateString("ko-KR");
      lock(`페널티로 체험단 등록이 ${perm ? "<b>영구 정지</b>되었어요." : `<b>${until}</b>까지 정지되었어요.`} <a href="penalty.html"><b>내역 보기 →</b></a>`);
    }
    return;
  }
  const msg = { none: "체험단은 <b>광고주 인증을 마친 사장님</b>만 등록할 수 있어요. <a href=\"biz.html\"><b>광고주 인증하러 가기 →</b></a> (사업자등록번호·대표자 이름만 입력하면 바로 돼요)",
    pending: "이전에 낸 서류를 확인하는 중이에요. <a href=\"biz.html\"><b>사업자등록번호·대표자 이름을 입력하면 바로 인증돼요 →</b></a>",
    rejected: "광고주 인증이 제한된 계정이에요." + (p && p.business_note ? " 사유: " + esc(p.business_note) : "") + " 운영자에게 문의해 주세요. <a href=\"biz.html\">상태 보기</a>" };
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
      place_url: fixUrl(d.place) || null, description: d.desc || null, photo_url,
      mission: d.mission.trim() || null, visit_start: visit && d.visit_start ? d.visit_start : null,
      visit_end: visit && d.visit_end ? d.visit_end : null, max_party: visit ? +d.max_party || 4 : 4,
    };
    // 3단계(003) 추가 항목: 입력한 것만 보냄 (SQL 003 을 먼저 실행해야 저장됨)
    const wd = [...form.querySelectorAll('input[name="wd"]:checked')].map(x => x.value).join(",");
    const times = (d.visit_times || "").split(",").map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t)).join(",");
    const extra = {
      keywords: d.keywords, shipping_info: d.shipping_info, product_url: fixUrl(d.product_url), notice: d.notice,
      review_deadline: d.review_deadline, mission_photos: d.mission_photos, mission_chars: d.mission_chars,
      address: visit ? d.address : "", visit_notes: visit ? d.visit_notes : "", visit_weekdays: visit ? wd : "",
      visit_times: visit ? times : "", detail_photo_url,
    };
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && String(v).trim() !== "") row[k] = typeof v === "string" ? v.trim() : v;
    if (form.mission_link.checked) row.mission_link = true;
    if (form.mission_video.checked) row.mission_video = true;
    if (!form.mission_disclosure.checked) row.mission_disclosure = false;
    // 서버에 상세 항목 칸(003 SQL)이 아직 없으면, 그 항목만 빼고 다시 올림 (상세 항목은 선택 사항이라 등록은 되게 함)
    const LABEL = { keywords: "검색 키워드", shipping_info: "배송·방문 안내", product_url: "상품정보 주소", notice: "상단 안내", review_deadline: "후기 작성 마감일", mission_photos: "사진 수", mission_chars: "글자 수", mission_link: "링크 미션", mission_video: "영상 미션", mission_disclosure: "광고 표기", address: "방문 주소", visit_notes: "방문·예약 안내", visit_weekdays: "방문 가능 요일", visit_times: "방문 가능 시간대", detail_photo_url: "상세 이미지" };
    const dropped = []; let res;
    for (let i = 0; i < 20; i++) {
      res = await sb.from("campaigns").insert(row);
      const col = res.error && (/'([a-z_]+)' column/.exec(res.error.message || "") || [])[1];
      if (!col || !(col in LABEL) || !(col in row)) break;
      dropped.push(LABEL[col]); delete row[col];
    }
    if (res.error) throw res.error;
    if (dropped.length) alert("체험단을 올렸어요. 다만 서버가 아직 준비되지 않아 아래 항목은 저장되지 않았어요.\n- " + dropped.join("\n- ") + "\n(운영자가 준비를 마친 뒤 수정해서 다시 올려 주세요.)");
    location.href = "campaigns.html?type=" + encodeURIComponent(d.type);
  } catch (err) {
    const m = err.message || "";
    alert(m.includes("row-level security") ? "등록 권한이 없어요. 운영자 승인을 받은 광고주만 등록할 수 있어요."
      : m.includes("column") ? "서버가 아직 준비되지 않은 항목이 있어요. 운영자에게 문의해 주세요. (" + m + ")" : "등록하지 못했어요: " + m);
    btn.disabled = false;
  }
});
