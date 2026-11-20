const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id") || "";
const EMOJI = {맛집:"🍜", 뷰티:"💄", 숙박:"🛏️", 카페:"☕", 놀이:"🎮", 생활:"🏠"};
const COLOR = {맛집:"#ffe9d6", 뷰티:"#ffe0ea", 숙박:"#dff4f7", 카페:"#f1e6da", 놀이:"#e6e0ff", 생활:"#e3f3e6"};
const daysLeft = d => Math.ceil((new Date(d + "T23:59:59") - Date.now()) / 864e5);
let canApply = false, camp = null;

async function load() {
  if (id.startsWith("s")) {                       // 샘플
    const s = window.SAMPLES.find(x => x.id === id);
    return s && { ...s, sampleOnly: true };
  }
  if (!window.sbReady) return null;
  const { data, error } = await sb.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const { data: cnt } = await sb.rpc("campaign_counts");
  const mine = (cnt || []).find(r => r.campaign_id === id);
  return { id: data.id, type: data.type, cat: data.cat, region: data.region, mode: data.mode, title: data.title,
    reward: data.reward, slots: data.slots, biz: data.biz, photo: data.photo_url, desc: data.description,
    place: data.place_url, deadline: data.deadline, mission: data.mission, vstart: data.visit_start, vend: data.visit_end, maxParty: data.max_party, reuseMonths: data.reuse_months, days: daysLeft(data.deadline),
    applied: mine ? Number(mine.applied) : 0, open: data.status === "open" && daysLeft(data.deadline) >= 0 };
}

(async () => {
  const c = await load();
  if (!c) { $("d-empty").hidden = false; return; }
  camp = c;
  const visit = c.mode === "방문형", months = c.reuseMonths ?? 6, maxP = c.maxParty || 4;
  $("visit-fields").hidden = !visit; $("blog-fields").hidden = c.type !== "블로그";
  if (visit) {
    const f = $("apply-form"), today = new Date().toISOString().slice(0, 10);
    f.vdate.min = c.vstart && c.vstart > today ? c.vstart : today; if (c.vend) f.vdate.max = c.vend;
    f.vdate.required = f.vtime.required = true;
    $("visit-range").textContent = c.vstart && c.vend ? `(${c.vstart} ~ ${c.vend})` : "";
    $("party-hint").textContent = `(최대 ${maxP}명)`;
    f.party.innerHTML = Array.from({length: maxP}, (_, i) => `<option value="${i + 1}">${i + 1}명</option>`).join("");
  }
  if (c.type === "블로그") document.querySelectorAll('#blog-fields input').forEach(i => i.required = true);
  if (c.mission) { $("mission-row").hidden = false; $("mission-text").textContent = "미션: " + c.mission; $("apply-form").mission.required = true; }
  $("reuse-text").textContent = months > 0
    ? `작성한 후기를 광고주가 후기 게시일로부터 ${months}개월까지 2차 활용(자사 블로그·SNS·홈페이지 등 홍보 게시)하는 것에 동의합니다.`
    : "작성한 후기의 2차 활용은 없습니다. (확인했습니다)";
  document.title = c.title + " - 우리들 체험단";
  $("detail").hidden = false;
  $("d-photo").style.background = c.photo ? `#eee url(${encodeURI(c.photo)}) center/cover` : COLOR[c.cat];
  $("d-photo").textContent = c.photo ? "" : EMOJI[c.cat] || "";
  $("d-mode").textContent = c.mode; $("d-type").textContent = c.type + " 체험단";
  $("d-title").textContent = c.title; $("d-biz").textContent = "등록업체 · " + c.biz;
  $("d-reward").textContent = c.reward;
  $("d-slots").textContent = `${c.slots}명 (신청 ${c.applied}명)`;
  $("d-deadline").textContent = c.deadline ? `${c.deadline} (${Math.max(0, c.days)}일 남음)` : `${c.days}일 남음`;
  $("d-region").textContent = c.mode === "배송형" ? "전국 (택배)" : c.region;
  $("d-desc").textContent = c.desc || "";
  if (c.place && /^https?:\/\//.test(c.place)) { const a = $("d-place"); a.href = c.place; a.hidden = false; }

  canApply = !c.sampleOnly && window.sbReady && c.open;
  $("d-sample").hidden = !c.sampleOnly;
  $("d-closed").hidden = c.sampleOnly || c.open !== false;
  if (!canApply) { [...$("apply-form").elements].forEach(el => el.disabled = true); }
})();

const KO = [
  ["applications_guest_uniq", "이미 이 연락처로 신청하셨어요."],
  ["duplicate key", "이미 신청하셨어요."],
  ["row-level security", "마감되었거나 신청할 수 없는 캠페인이에요."],
  ["rate limit", "요청이 너무 많아요. 잠시 후 다시 시도해 주세요."],
];
$("apply-form").onsubmit = async e => {
  e.preventDefault();
  const f = e.target, msg = $("apply-msg"), btn = $("apply-btn");
  if (!canApply) return;
  msg.textContent = "";
  if (f.website.value) { $("apply-form").hidden = true; $("apply-done").hidden = false; return; }  // 스팸 방지용 숨은 칸: 사람은 비워 둠
  const d = f.phone.value.replace(/\D/g, "");
  if (!/^01[016789]\d{7,8}$/.test(d)) { msg.textContent = "핸드폰번호를 010-0000-0000 형식으로 입력해 주세요."; return; }
  const contact = d.length === 11 ? `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}` : `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  const visit = camp.mode === "방문형", blog = camp.type === "블로그";
  btn.disabled = true;
  const { error } = await sb.from("applications").insert({
    campaign_id: id, applicant_name: f.name.value.trim(), contact, kakao_id: f.kakao.value.trim(),
    channel_url: f.channel.value.trim(), message: f.message.value.trim() || null,
    visit_date: visit ? f.vdate.value : null, visit_time: visit ? f.vtime.value : null,
    party_size: visit ? +f.party.value : null,
    is_naver_influencer: blog ? f.influencer.value === "O" : null, clip_ok: blog ? f.clip.value === "O" : null,
    mission_agreed: camp.mission ? f.mission.checked : null,
    consent_at: new Date().toISOString(), reuse_consent_at: new Date().toISOString(),
  });
  if (error) {
    const m = (error.message || "") + (error.details || "");
    msg.textContent = (KO.find(([k]) => m.includes(k)) || [0, "신청하지 못했어요. 잠시 후 다시 시도해 주세요."])[1];
    btn.disabled = false; return;
  }
  f.hidden = true; $("apply-done").hidden = false;
};
