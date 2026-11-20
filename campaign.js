const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id") || "";
const EMOJI = {맛집:"🍜", 뷰티:"💄", 숙박:"🛏️", 카페:"☕", 놀이:"🎮", 생활:"🏠"};
const COLOR = {맛집:"#ffe9d6", 뷰티:"#ffe0ea", 숙박:"#dff4f7", 카페:"#f1e6da", 놀이:"#e6e0ff", 생활:"#e3f3e6"};
const D = s => new Date(s + "T00:00:00");
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysLeft = d => Math.ceil((new Date(d + "T23:59:59") - Date.now()) / 864e5);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let canApply = false, camp = null;

async function load() {
  if (id.startsWith("s")) {                       // 샘플: 일부 값은 보기 좋게 채움
    const s = window.SAMPLES.find(x => x.id === id);
    if (!s) return null;
    const t = new Date();
    return { ...s, sampleOnly: true, created: ymd(t), deadline: ymd(new Date(t.getTime() + s.days * 864e5)),
      photos: 10, chars: 500, disclosure: true, keywords: "", ship: "", notice: "" };
  }
  if (!window.sbReady) return null;
  const { data, error } = await sb.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const { data: cnt } = await sb.rpc("campaign_counts");
  const mine = (cnt || []).find(r => r.campaign_id === id);
  return { id: data.id, type: data.type, cat: data.cat, region: data.region, mode: data.mode, title: data.title,
    reward: data.reward, slots: data.slots, biz: data.biz, photo: data.photo_url, desc: data.description,
    place: data.place_url, deadline: data.deadline, created: ymd(new Date(data.created_at)),
    mission: data.mission, vstart: data.visit_start, vend: data.visit_end, maxParty: data.max_party,
    reuseMonths: data.reuse_months, days: daysLeft(data.deadline),
    keywords: data.keywords, ship: data.shipping_info, url: data.product_url, notice: data.notice,
    reviewDeadline: data.review_deadline, photos: data.mission_photos, chars: data.mission_chars,
    link: data.mission_link, video: data.mission_video, disclosure: data.mission_disclosure !== false,
    addr: data.address, weekdays: data.visit_weekdays, times: data.visit_times, vnotes: data.visit_notes, detailImg: data.detail_photo_url,
    applied: mine ? Number(mine.applied) : 0, open: data.status === "open" && daysLeft(data.deadline) >= 0 };
}

// ---- 일정 달력: 모집 기간(회색) / 체험·리뷰 기간(파랑) / 오늘
let calMonth = new Date(); calMonth.setDate(1);
function drawCal() {
  const c = camp, y = calMonth.getFullYear(), m = calMonth.getMonth();
  $("cal-title").textContent = `${y}년 ${m + 1}월`;
  const r1 = [D(c.created), D(c.deadline)];
  const end2 = c.reviewDeadline || c.vend;
  const r2 = end2 ? [new Date(D(c.deadline).getTime() + 864e5), D(end2)] : null;
  const today = D(ymd(new Date())), inR = (d, r) => r && d >= r[0] && d <= r[1];
  let h = "<tr>" + "일월화수목금토".split("").map(w => `<th>${w}</th>`).join("") + "</tr>";
  const first = new Date(y, m, 1).getDay(), last = new Date(y, m + 1, 0).getDate();
  for (let cell = 0; cell < Math.ceil((first + last) / 7) * 7; cell++) {
    if (cell % 7 === 0) h += "<tr>";
    const day = cell - first + 1;
    if (day < 1 || day > last) h += "<td class='o'></td>";
    else {
      const d = new Date(y, m, day), cls = [inR(d, r1) ? "r1" : "", inR(d, r2) ? "r2" : "", +d === +today ? "td" : ""].join(" ");
      h += `<td class="${cls}">${day}</td>`;
    }
    if (cell % 7 === 6) h += "</tr>";
  }
  $("cal").innerHTML = h;
}
$("cal-prev").onclick = () => { calMonth.setMonth(calMonth.getMonth() - 1); drawCal(); };
$("cal-next").onclick = () => { calMonth.setMonth(calMonth.getMonth() + 1); drawCal(); };

(async () => {
  const c = await load();
  if (!c) { $("d-empty").hidden = false; return; }
  camp = c;
  const visit = c.mode === "방문형", months = c.reuseMonths ?? 6, maxP = c.maxParty || 4;
  document.title = c.title + " - 우리들 체험단";
  $("detail").hidden = false;

  // 제목·태그
  $("d-title").textContent = c.title;
  $("d-tags").innerHTML = [c.type, c.mode, c.cat].map(esc).join(" <i>|</i> ") + (c.type === "구매평" ? ' <span class="pt0">0P</span>' : "");
  if (c.notice) { $("d-notice-box").hidden = false; $("d-notice").textContent = c.notice; $("d-notice-title").textContent = "📌 광고주 안내"; }

  // 정보 행
  $("d-biz").textContent = c.biz;
  $("d-reward").textContent = c.reward;
  $("d-ship-label").textContent = visit ? "방문 안내" : "배송 및 구매 안내";
  $("d-ship").textContent = c.ship || (visit
    ? `방문 희망 날짜·시간은 신청할 때 입력해 주세요.${c.vstart && c.vend ? ` 방문 가능 기간: ${c.vstart} ~ ${c.vend}` : ""}`
    : "선정 후 안내드리는 연락처로 배송지를 알려주세요.");
  const WD = ["일","월","화","수","목","금","토"];
  const wdList = (c.weekdays || "").split(",").filter(x => x !== "").map(Number);
  const timeList = (c.times || "").split(",").map(t => t.trim()).filter(Boolean);
  if (visit) {
    if (c.addr) {
      $("r-addr").hidden = false; $("d-addr").textContent = c.addr;
      $("d-map").src = "https://maps.google.com/maps?q=" + encodeURIComponent(c.addr) + "&output=embed&hl=ko";
      $("d-map-link").href = "https://map.naver.com/p/search/" + encodeURIComponent(c.addr);
    }
    const when = [];
    if (c.vstart && c.vend) when.push(`기간: ${c.vstart} ~ ${c.vend}`);
    if (wdList.length) when.push(`가능 요일: ${wdList.map(n => WD[n]).join("·")}`);
    if (timeList.length) when.push(`가능 시간: ${timeList.join(" / ")}`);
    if (when.length) { $("r-when").hidden = false; $("d-when").textContent = when.join("\n"); }
    if (c.vnotes) { $("r-vnotes").hidden = false; $("d-vnotes").textContent = c.vnotes; }
    if (c.addr || c.vnotes) $("r-ship").hidden = true;
  }
  if (c.detailImg) { const im = $("d-detail-img"); im.src = c.detailImg; im.hidden = false; }
  if (c.keywords) { $("r-keywords").hidden = false;
    $("d-keywords").innerHTML = c.keywords.split(",").map(k => k.trim()).filter(Boolean).map(k => `<span class="kw-chip">${esc(k)}</span>`).join(""); }
  const url = c.url || c.place;
  if (url && /^https?:\/\//.test(url)) { $("r-url").hidden = false; const a = $("d-url"); a.href = url; a.textContent = "상품정보 링크 바로가기"; }
  $("d-slots").textContent = `${c.slots}명 (현재 신청 ${c.applied}명) · 마감 ${c.deadline} (${Math.max(0, c.days)}일 남음)`;
  $("d-reuse").textContent = months > 0 ? `후기 게시일로부터 ${months}개월까지 광고주가 홍보에 활용할 수 있어요.` : "2차 활용 없음";

  // 미션 아이콘
  $("d-mtype").textContent = c.type;
  const icons = [];
  if (c.keywords) icons.push(["🔍", "키워드"]);
  if (c.photos) icons.push(["🖼️", `${c.photos}장 이상`]);
  if (c.chars) icons.push(["✍️", `${c.chars}자`]);
  if (c.link) icons.push(["🔗", "링크 첨부"]);
  if (c.video) icons.push(["🎞️", "동영상 or GIF"]);
  if (c.disclosure) icons.push(["⚠️", "공정위 표기"]);
  $("d-micons").innerHTML = icons.map(([i, t]) => `<li><span>${i}</span>${esc(t)}</li>`).join("");
  $("d-mextra").textContent = c.mission ? "추가 미션: " + c.mission : "";
  $("d-desc").textContent = c.desc || "";

  // 사진·달력
  const ph = $("d-photo");
  ph.style.background = c.photo ? `#eee url(${encodeURI(c.photo)}) center/cover` : COLOR[c.cat];
  ph.textContent = c.photo ? "" : EMOJI[c.cat] || "";
  drawCal();

  // 신청 폼(대화창) 준비
  $("visit-fields").hidden = !visit; $("blog-fields").hidden = c.type !== "블로그";
  if (visit) {
    const f = $("apply-form"), today = new Date().toISOString().slice(0, 10);
    f.vdate.min = c.vstart && c.vstart > today ? c.vstart : today; if (c.vend) f.vdate.max = c.vend;
    f.vdate.required = true;
    if (timeList.length) {   // 정해진 시간대가 있으면 선택식으로
      $("vtime-label").innerHTML = `방문 희망 시간 <select name="vtime" required>${timeList.map(t => `<option>${esc(t)}</option>`).join("")}</select>`;
    } else f.vtime.required = true;
    if (wdList.length) f.vdate.addEventListener("change", () => {
      const ok = !f.vdate.value || wdList.includes(D(f.vdate.value).getDay());
      f.vdate.setCustomValidity(ok ? "" : `방문 가능한 요일이 아니에요 (${wdList.map(n => WD[n]).join("·")})`);
      f.vdate.reportValidity();
    });
    $("visit-range").textContent = c.vstart && c.vend ? `(${c.vstart} ~ ${c.vend})` : "";
    $("party-hint").textContent = `(최대 ${maxP}명)`;
    f.party.innerHTML = Array.from({length: maxP}, (_, i) => `<option value="${i + 1}">${i + 1}명</option>`).join("");
  }
  if (c.type === "블로그") document.querySelectorAll('#blog-fields input').forEach(i => i.required = true);
  if (c.mission) { $("mission-row").hidden = false; $("mission-text").textContent = "미션: " + c.mission; $("apply-form").mission.required = true; }
  $("reuse-text").textContent = months > 0
    ? `작성한 후기를 광고주가 후기 게시일로부터 ${months}개월까지 2차 활용(자사 블로그·SNS·홈페이지 등 홍보 게시)하는 것에 동의합니다.`
    : "작성한 후기의 2차 활용은 없습니다. (확인했습니다)";

  canApply = !c.sampleOnly && window.sbReady && c.open;
  const btn = $("apply-open");
  if (!canApply) {
    btn.disabled = true;
    btn.textContent = c.sampleOnly ? "샘플 캠페인입니다" : "마감되었어요";
    $("d-state").hidden = false;
    $("d-state").textContent = c.sampleOnly ? "화면 확인용 샘플이라 신청할 수 없어요." : "마감되었거나 신청을 받지 않는 캠페인이에요.";
  }
})();

// 신청 대화창 열기/닫기
const dlg = $("apply-dialog");
$("apply-open").onclick = () => { if (canApply) dlg.showModal(); };
$("apply-close").onclick = () => dlg.close();
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

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
