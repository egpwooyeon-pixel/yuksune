// 간편 신청: 로그인한 회원이 캠페인 화면에서 바로 신청 (campaign.js 다음에 불러옴)
// · 신청 채널(블로그/인스타)에 맞는 SNS 프로필만 쓰고, 처음 한 번만 등록
// · 실제 검증(로그인·모집기간·채널·필수항목·동의·중복)은 서버 함수 apply_simple 이 다시 확인
(function () {
  if (!window.sbReady || !id) return;
  const NEXT = `campaign.html?id=${id}&apply=1`;
  const CH = { naver_blog: { name: "네이버 블로그", acct: "신청에 사용할 블로그", btn: "네이버 블로그로 신청하기", ph: "blog.naver.com/내아이디" },
               instagram: { name: "인스타그램", acct: "신청에 사용할 인스타그램", btn: "인스타 아이디로 신청하기", ph: "@아이디 또는 instagram.com/아이디" } };
  const ALLOWED = { 블로그: ["naver_blog"], 인스타: ["instagram"], 구매평: ["naver_blog", "instagram"] };
  const ERR = { login_required: "로그인이 필요해요.", not_found: "캠페인을 찾을 수 없어요.", closed: "모집이 마감된 캠페인이에요.", channel_not_allowed: "이 캠페인에서 받지 않는 채널이에요.",
    sns_required: "신청에 쓸 SNS를 먼저 등록해 주세요.", phone_required: "휴대폰번호를 010-0000-0000 형식으로 입력해 주세요.", consent_required: "필수 동의 항목에 모두 체크해 주세요.",
    mission_required: "캠페인 미션에 동의해야 신청할 수 있어요.", blog_answers_required: "네이버 인플루언서 여부와 클립 진행 가능 여부를 선택해 주세요.",
    followers_required: "팔로워 수를 입력해 주세요.", visit_required: "방문 희망 날짜와 시간을 선택해 주세요.", visit_out_of_range: "선택한 방문 날짜는 신청할 수 없어요. 방문 가능 기간을 확인해 주세요.",
    visit_time_invalid: "선택할 수 없는 방문 시간이에요.", party_invalid: "방문 인원을 확인해 주세요.", duplicate: "이미 신청한 캠페인이에요.", no_profile: "회원 정보를 찾을 수 없어요." };
  const ssel = s => document.querySelector(s);
  let user = null, phone = "", snsRows = {}, applied = false, busy = false, chan = null;

  // ---- 대화창 두 개를 한 번만 만들어 둠
  const choose = document.createElement("dialog"); choose.className = "apply-dialog"; choose.id = "sa-choose";
  const sd = document.createElement("dialog"); sd.className = "sa-dialog"; sd.id = "sa-dialog";
  document.body.append(choose, sd);
  [choose, sd].forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));

  const loginHref = (signup) => `login.html?${signup ? "mode=signup&" : ""}next=${encodeURIComponent(NEXT)}`;
  function openChoose() {
    choose.innerHTML = `<div class="ad-head"><h3>체험단 신청하기</h3><button type="button" id="sa-x1" aria-label="닫기">✕</button></div>
      <p class="muted small">로그인하면 SNS 프로필과 휴대폰번호를 한 번만 등록하고, 다음 캠페인부터는 바로 신청할 수 있어요.</p>
      <div class="sa-choose">
        <a class="p" href="${loginHref(false)}">로그인하고 간편 신청</a>
        <button type="button" class="n" id="sa-naver">네이버로 계속하기</button>
        <a href="${loginHref(true)}">회원가입하고 신청</a>
        <button type="button" id="sa-guest">회원가입 없이 신청</button>
      </div><p class="mp-msg" id="sa-cmsg" role="alert"></p>`;
    $("sa-x1").onclick = () => choose.close();
    $("sa-guest").onclick = () => { choose.close(); dlg.showModal(); };
    $("sa-naver").onclick = async e => { e.target.disabled = true; try { await naverStart("login", NEXT); } catch (err) { $("sa-cmsg").textContent = err.message; e.target.disabled = false; } };
    choose.showModal();
  }

  async function loadMe() {
    const { data: s } = await sb.auth.getSession(); user = s.session && s.session.user; if (!user) return;
    const [p, r, a] = await Promise.all([
      sb.from("profiles").select("phone").eq("id", user.id).maybeSingle(),
      sb.from("member_sns").select("platform,url,followers,verified").eq("user_id", user.id),
      sb.from("applications").select("id").eq("campaign_id", id).eq("applicant_id", user.id).maybeSingle()]);
    phone = (p.data && p.data.phone) || ""; snsRows = {}; (r.data || []).forEach(x => snsRows[x.platform] = x); applied = !!(a.data && a.data.id);
  }
  const fmt = d => d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
  function markApplied() {
    const b = $("apply-open"); b.disabled = true; b.textContent = "신청 완료";
    const st = $("d-state"); st.hidden = false; st.classList.add("done"); st.innerHTML = `신청이 접수됐어요. <a href="mypage.html">마이페이지 신청 내역 보기 →</a> <small class="muted">(선정 여부는 광고주 확인 후 안내돼요)</small>`;
  }

  // ---- 간편 신청 대화창
  function renderSimple(keepVals) {
    const allowed = ALLOWED[camp.type] || [];
    if (!chan || !allowed.includes(chan)) chan = allowed.find(c => snsRows[c]) || allowed[0];
    const row = snsRows[chan], ch = CH[chan], visit = camp.mode === "방문형";
    const times = (camp.times || "").split(",").map(t => t.trim()).filter(Boolean), maxP = camp.maxParty || 4, months = camp.reuseMonths ?? 6;
    const kept = keepVals || {};
    const cond = [["제공 내역", esc(camp.reward || "")], ["모집 인원", `${camp.slots}명`], ["신청 마감", esc(camp.deadline || "")], ["진행 방식", esc(camp.mode + " · " + camp.type)]];
    if (visit) cond.push(["방문 기간", camp.vstart && camp.vend ? `${esc(camp.vstart)} ~ ${esc(camp.vend)}` : "캠페인 안내 참고"]);
    if (camp.mission) cond.push(["미션", esc(camp.mission)]);
    cond.push(["2차 활용", months > 0 ? `후기 게시일로부터 ${months}개월` : "없음"]);
    sd.innerHTML = `<div class="ad-head"><h3>${esc(camp.title)}</h3><button type="button" id="sa-x2" aria-label="닫기">✕</button></div>
    <form class="reg" id="sa-form" novalidate><div class="sa-cols">
      <div class="sa-col"><h4>조건 확인</h4><ul class="sa-cond">${cond.map(c => `<li><b>${c[0]}</b><span>${c[1]}</span></li>`).join("")}</ul></div>
      <div class="sa-col"><h4>신청 정보</h4>
        ${allowed.length > 1 ? `<div class="sa-chan">${allowed.map(c => `<label><input type="radio" name="chan" value="${c}"${c === chan ? " checked" : ""}> ${CH[c].name}</label>`).join("")}</div>` : ""}
        <div class="sa-acct" id="sa-acct">${row ? `<div class="sa-line"><span>${ch.acct}</span><a class="chg" href="#" id="sa-chg">변경</a></div>
            <div class="u">${esc(row.url)}</div><p class="sa-opt" style="margin:4px 0 0">등록된 주소예요. 소유 인증은 하지 않아요.</p>
            <div id="sa-edit" hidden style="margin-top:8px"><input id="sa-new" maxlength="200" placeholder="${ch.ph}"><button type="button" class="btn-line" id="sa-save" style="margin-top:6px;padding:8px 14px;font-size:12px">저장</button></div>`
          : `<div class="sa-line"><span><b>${ch.name}</b>를 등록해 주세요 <small class="sa-opt">(처음 한 번만)</small></span></div>
            <div style="margin-top:8px"><input id="sa-new" maxlength="200" placeholder="${ch.ph}"><button type="button" class="btn-line" id="sa-save" style="margin-top:6px;padding:8px 14px;font-size:12px">등록하고 계속</button></div>`}
          <p class="mp-msg" id="sa-amsg" role="alert"></p></div>
        <label>휴대폰번호 <small>(선정 안내용 · 수정할 수 있어요)</small><input name="phone" inputmode="tel" maxlength="13" autocomplete="tel" placeholder="010-0000-0000" value="${esc(kept.phone != null ? kept.phone : fmt(phone))}"></label>
        ${chan === "naver_blog" && camp.type === "블로그" ? `<fieldset class="ox"><legend>네이버 인플루언서 여부</legend><label><input type="radio" name="influencer" value="true"> O</label><label><input type="radio" name="influencer" value="false"> X</label></fieldset>
          <fieldset class="ox"><legend>클립 진행 가능 여부</legend><label><input type="radio" name="clip" value="true"> O</label><label><input type="radio" name="clip" value="false"> X</label></fieldset>` : ""}
        ${chan === "instagram" ? `<label>팔로워 수 <small>(숫자만${row && row.followers != null ? " · 등록된 값이에요" : ""})</small><input name="followers" type="number" min="0" max="1000000000" inputmode="numeric" value="${row && row.followers != null ? row.followers : ""}"></label>` : ""}
        ${visit ? `<label>방문 희망 날짜 <small>${camp.vstart && camp.vend ? `(${esc(camp.vstart)} ~ ${esc(camp.vend)})` : ""}</small><input name="vdate" type="date"></label>
          <label>방문 희망 시간 ${times.length ? `<select name="vtime"><option value="">선택</option>${times.map(t => `<option>${esc(t)}</option>`).join("")}</select>` : `<input name="vtime" type="time">`}</label>
          <label>방문 인원 <small>(최대 ${maxP}명)</small><select name="party">${Array.from({ length: maxP }, (_, i) => `<option value="${i + 1}">${i + 1}명</option>`).join("")}</select></label>` : ""}
        <div class="sa-sec"><b style="font-size:13px">필수 동의</b>
          <label class="check"><input type="checkbox" name="consent"><span><b>개인정보 수집·이용에 동의합니다.</b> <a href="privacy.html" target="_blank" rel="noopener">자세히 보기</a><br><small>수집 항목: 이름(닉네임), 휴대폰번호, SNS 주소 · 선정 안내와 체험단 운영 목적으로 사용해요.</small></span></label>
          <label class="check"><input type="checkbox" name="reuse"><span><b>${months > 0 ? `후기를 광고주가 ${months}개월까지 2차 활용하는 것에 동의합니다.` : "후기 2차 활용은 없다는 점을 확인했습니다."}</b></span></label>
          ${camp.mission ? `<label class="check"><input type="checkbox" name="mission"><span><b>캠페인 미션에 동의합니다.</b><br><small>${esc(camp.mission)}</small></span></label>` : ""}
        </div>
        <div class="sa-sec"><label>하고 싶은 말 <span class="sa-opt">(선택)</span><textarea name="message" rows="2" maxlength="500">${esc(kept.message || "")}</textarea></label></div>
        <p class="msg" id="sa-msg" role="alert"></p>
      </div></div>
      <div class="sa-submit"><button class="btn-primary" id="sa-go" type="submit">${ch.btn}</button></div></form>
    <div class="sent" id="sa-done" hidden><div class="sent-ico">🎉</div><h2>신청 완료</h2>
      <p>신청이 접수됐어요. <b>선정 여부는 광고주가 확인한 뒤</b> 안내드려요.</p>
      <a class="btn-primary submit" href="mypage.html" style="display:block">마이페이지에서 신청 내역 보기</a></div>`;
    wire(visit, times);
  }
  const vals = () => { const f = $("sa-form"); return f ? { phone: f.phone.value, message: f.message.value } : {}; };
  function wire(visit, times) {
    const f = $("sa-form");
    $("sa-x2").onclick = () => sd.close();
    f.querySelectorAll('input[name="chan"]').forEach(r => r.onchange = () => { chan = r.value; renderSimple(vals()); });
    if ($("sa-chg")) $("sa-chg").onclick = e => { e.preventDefault(); $("sa-edit").hidden = !$("sa-edit").hidden; };
    $("sa-save").onclick = async e => {
      const b = e.target, m = $("sa-amsg"); m.textContent = ""; m.classList.remove("ok"); if (!$("sa-new").value.trim()) { m.textContent = "주소를 입력해 주세요."; return; }
      b.disabled = true;
      const { data, error } = await sb.rpc("save_sns", { p_platform: chan, p_value: $("sa-new").value, p_followers: null });
      if (error || !data || data.error) { b.disabled = false; m.textContent = { bad_blog: "네이버 블로그 주소를 확인해 주세요. 예) blog.naver.com/내아이디", bad_instagram: "인스타그램 아이디(@아이디) 또는 프로필 주소를 확인해 주세요." }[data && data.error] || "저장하지 못했어요. 잠시 후 다시 시도해 주세요."; return; }
      const { data: r } = await sb.from("member_sns").select("platform,url,followers,verified").eq("user_id", user.id); snsRows = {}; (r || []).forEach(x => snsRows[x.platform] = x);
      renderSimple(vals());
    };
    if (visit) {
      const today = new Date().toISOString().slice(0, 10);
      f.vdate.min = camp.vstart && camp.vstart > today ? camp.vstart : today; if (camp.vend) f.vdate.max = camp.vend;
      const wd = (camp.weekdays || "").split(",").map(s => s.trim()).filter(s => /^[0-6]$/.test(s)).map(Number), WD = ["일", "월", "화", "수", "목", "금", "토"];
      if (wd.length) f.vdate.addEventListener("change", () => { const ok = !f.vdate.value || wd.includes(new Date(f.vdate.value + "T00:00:00").getDay()); f.vdate.setCustomValidity(ok ? "" : `방문 가능한 요일이 아니에요 (${wd.map(n => WD[n]).join("·")})`); f.vdate.reportValidity(); });
    }
    f.onsubmit = submit;
  }
  async function submit(e) {
    e.preventDefault(); if (busy) return;                          // 두 번 눌러도 한 번만 보냄
    const f = e.target, m = $("sa-msg"), b = $("sa-go"); m.textContent = "";
    const fail = t => { m.textContent = t; };
    if (!snsRows[chan]) return fail(ERR.sns_required);
    const d = f.phone.value.replace(/\D/g, ""); if (!/^01[016789]\d{7,8}$/.test(d)) return fail(ERR.phone_required);
    const a = { consent: String(f.consent.checked), reuse: String(f.reuse.checked), message: f.message.value.trim() };
    if (!f.consent.checked || !f.reuse.checked) return fail(ERR.consent_required);
    if (camp.mission) { if (!f.mission.checked) return fail(ERR.mission_required); a.mission = "true"; }
    if (f.influencer) { if (!f.influencer.value || !f.clip.value) return fail(ERR.blog_answers_required); a.influencer = f.influencer.value; a.clip = f.clip.value; }
    if (f.followers) { if (f.followers.value === "") return fail(ERR.followers_required); a.followers = f.followers.value; }
    if (f.vdate) { if (!f.vdate.value || !f.vtime.value) return fail(ERR.visit_required); if (!f.vdate.checkValidity()) return fail(f.vdate.validationMessage); a.visit_date = f.vdate.value; a.visit_time = f.vtime.value; a.party = f.party.value; }
    busy = true; b.disabled = true; b.textContent = "접수 중…";
    const { data, error } = await sb.rpc("apply_simple", { p_campaign: id, p_channel: chan, p_phone: d, p_answers: a });
    busy = false;
    if (error || !data || (!data.ok && !data.error)) { b.disabled = false; b.textContent = CH[chan].btn; return fail("신청하지 못했어요. 잠시 후 다시 시도해 주세요."); }
    if (data.error === "duplicate") { applied = true; markApplied(); f.hidden = true; $("sa-done").hidden = false; $("sa-done").querySelector("h2").textContent = "이미 신청한 캠페인이에요"; return; }
    if (data.error) { b.disabled = false; b.textContent = CH[chan].btn; return fail(ERR[data.error] || "신청하지 못했어요."); }
    applied = true; markApplied(); f.hidden = true; $("sa-done").hidden = false;
  }

  async function openApply() {
    if (!camp || !canApply) return;
    if (camp.type === "유튜브") { dlg.showModal(); return; }        // 유튜브는 간편 신청 미지원 → 기존 신청서
    await loadMe();
    if (!user) return openChoose();
    if (applied) { markApplied(); return; }
    renderSimple(); sd.showModal();
  }
  $("apply-open").onclick = openApply;

  // 로그인 후 돌아오면(apply=1) 신청 화면을 바로 열고, 이미 신청했으면 '신청 완료'로 표시
  (async () => {
    for (let i = 0; i < 100 && !camp; i++) await new Promise(r => setTimeout(r, 100));
    if (!camp) return;
    await loadMe(); if (!user) return;
    if (applied) { markApplied(); return; }
    if (new URLSearchParams(location.search).get("apply") === "1" && canApply && camp.type !== "유튜브") { history.replaceState(null, "", `campaign.html?id=${encodeURIComponent(id)}`); renderSimple(); sd.showModal(); }
  })();
})();
