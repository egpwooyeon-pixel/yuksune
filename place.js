// 플레이스 진단: 사용자가 입력한 숫자로 점수를 계산하고 해야 할 일을 정리합니다.
// 주의: 우리들 체험단이 정한 기준(네이버 공식 점수 아님). 순위·경쟁 매장은 사용자가 입력한 값만 사용하며, 서버로 전송/저장하지 않습니다.
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const logScore = (n, max) => clamp(100 * Math.log10(1 + n) / Math.log10(1 + max));

const CHECKS = [
  ["영업시간", "영업시간을 등록하면 방문 전 확인하는 손님이 늘어요."],
  ["전화번호", "전화번호를 등록해 예약·문의를 받으세요."],
  ["매장 소개글", "소개글에 대표 메뉴·특징·지역 키워드를 자연스럽게 넣어 보세요."],
  ["메뉴·가격", "메뉴와 가격을 등록하면 이탈이 줄어요."],
  ["사진 10장 이상", "대표 사진 포함 10장 이상이면 체류 시간이 늘어나요."],
  ["대표 키워드 설정", "대표 키워드를 등록해 검색 연관성을 높이세요."],
  ["편의시설", "편의시설(와이파이, 단체석 등) 정보를 채워 주세요."],
  ["주차 정보", "주차 가능 여부와 위치를 적어 주세요."],
  ["예약·톡톡", "네이버 예약 또는 톡톡을 연결하면 문의 전환이 쉬워져요."],
  ["홈페이지·SNS", "인스타그램·블로그를 연결하면 매장 신뢰도가 올라가요."],
];
$("pd-checks").innerHTML = CHECKS.map(([n], i) => `<label><input type="checkbox" name="chk" value="${i}"> ${esc(n)}</label>`).join("");

// ---- 상단 입력창: 주소/ID/업체명 확인 후 입력 폼을 펼침
$("ph-form").onsubmit = e => {
  e.preventDefault();
  const v = $("ph-q").value.trim(), msg = $("ph-msg"); msg.hidden = true;
  const fail = t => { msg.textContent = t; msg.hidden = false; };
  if (!v) return fail("플레이스 주소, ID 또는 업체명을 입력해 주세요.");
  if (/naver\.me\//i.test(v)) return fail("단축 주소(naver.me)로는 매장을 확인할 수 없어요. 주소창에 보이는 전체 주소(m.place.naver.com/place/숫자)를 넣어 주세요.");
  const m = v.match(/place\/(\d{5,})/i) || v.match(/^(\d{5,})$/);
  let name = "";
  if (m) {
    const id = m[1], f = $("pd-id-hint");
    f.innerHTML = `플레이스 ID <b>${esc(id)}</b> · <a href="https://m.place.naver.com/place/${esc(id)}" target="_blank" rel="noopener noreferrer">플레이스에서 열어 숫자 확인하기 ↗</a><br>아래 칸에는 플레이스 화면에 보이는 숫자를 직접 입력해 주세요. (자동으로 가져오는 기능은 준비 중이에요)`;
  } else if (/^https?:\/\//i.test(v) || /naver\.com/i.test(v)) return fail("주소에서 플레이스 ID를 찾지 못했어요. m.place.naver.com/place/숫자 형태의 주소인지 확인해 주세요.");
  else if (v.length < 2) return fail("업체명을 두 글자 이상 입력해 주세요.");
  else { name = v.slice(0, 40); $("pd-id-hint").textContent = "플레이스에 보이는 숫자를 직접 입력해 주세요. (자동으로 가져오는 기능은 준비 중이에요)"; }
  $("pd-wrap").hidden = false; $("pd-result").hidden = true; $("pd-form").hidden = false;
  if (name) $("pd-form").name.value = name;
  $("pd-form").scrollIntoView({ behavior: "smooth" });
};

// ---- 점수 계산
const reviewScore = (v, b, median) => Math.round(0.6 * (median > 0 ? clamp(v / median * 60) : logScore(v, 3000)) + 0.4 * logScore(b, 1500));
function activityScore(days, c30) {
  const rec = days == null ? 0 : days <= 3 ? 100 : days <= 7 ? 90 : days <= 14 ? 75 : days <= 30 ? 55 : days <= 60 ? 30 : 10;
  const cnt = c30 <= 0 ? 0 : c30 === 1 ? 40 : c30 <= 2 ? 55 : c30 <= 4 ? 70 : c30 <= 9 ? 85 : 100;
  return Math.round(0.5 * rec + 0.5 * cnt);
}
const rankScore = r => r <= 3 ? 100 : r <= 5 ? 90 : r <= 10 ? 75 : r <= 20 ? 55 : r <= 50 ? 30 : 5;
const label = s => s >= 70 ? ["양호", "ok"] : s >= 40 ? ["보통", "mid"] : ["보완", "bad"];
const grade = s => s >= 85 ? ["S", "매우 좋음"] : s >= 70 ? ["A", "좋음"] : s >= 55 ? ["B", "무난함"] : s >= 40 ? ["C", "개선 필요"] : ["D", "시급"];

// 붙여 넣은 네이버 플레이스 화면에서 "방문자 리뷰 N", "블로그 리뷰 N", "영수증 리뷰 N"만 찾아요. (서버로 보내지 않음)
// 라벨 없이 "리뷰 N"만 있으면 어떤 리뷰인지 알 수 없어서 채우지 않고 숫자만 알려 줘요.
function parsePasted(raw) {
  const t = String(raw == null ? "" : raw).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const pick = re => { const m = t.match(re); if (!m) return null; const n = parseInt(m[1].replace(/,/g, ""), 10); return Number.isFinite(n) && n >= 0 && n <= 999999 ? n : null; };
  const out = { visitor: pick(/방문자\s*리뷰\s*([\d,]+)/), blog: pick(/블로그\s*리뷰\s*([\d,]+)/), receipt: pick(/영수증\s*리뷰\s*([\d,]+)/), others: [] };
  if (out.visitor == null || out.blog == null) {
    const seen = new Set(); for (const m of t.matchAll(/(?:^|[^가-힣])리뷰\s*([\d,]+)/g)) { const n = parseInt(m[1].replace(/,/g, ""), 10); if (n <= 999999) seen.add(n); }
    out.others = [...seen].slice(0, 6);
  }
  return out;
}
$("pd-paste-go").onclick = () => {
  const m = $("pd-paste-msg"), r = parsePasted($("pd-paste").value), got = [];
  const set = (name, v, text) => { if (v != null) { document.querySelector(`#pd-form [name="${name}"]`).value = v; got.push(`${text} ${v.toLocaleString()}개`); } };
  set("visitor", r.visitor, "방문자 리뷰"); set("blog", r.blog, "블로그 리뷰");
  let t = got.length ? `${got.join(", ")}를 입력칸에 채웠어요. 맞는지 확인해 주세요.` : "방문자 리뷰·블로그 리뷰 숫자를 찾지 못했어요.";
  if (r.receipt != null) t += ` (영수증 리뷰 ${r.receipt.toLocaleString()}개도 보여요. 이 진단에는 쓰지 않아요.)`;
  if (r.others.length && got.length < 2) t += ` "리뷰" 옆에서 ${r.others.map(x => x.toLocaleString()).join(", ")} 같은 숫자를 봤지만 어떤 리뷰인지 구분할 수 없어 채우지 않았어요. 직접 입력해 주세요.`;
  m.hidden = false; m.textContent = t;
};

$("pd-form").onsubmit = e => {
  e.preventDefault();
  const f = e.target, msg = $("pd-msg"); msg.hidden = true;
  const num = n => Number(f[n].value) || 0;
  const checked = [...f.querySelectorAll('input[name="chk"]:checked')].map(x => +x.value);
  const visitor = num("visitor"), blog = num("blog"), r30 = num("r30"), median = num("median");
  const rank = f.rank.value ? num("rank") : null, kw = f.kw.value.trim();
  const last = f.last.value ? new Date(f.last.value + "T00:00:00") : null;
  if (last && last > new Date()) { msg.textContent = "마지막 리뷰 작성일이 미래로 입력됐어요."; msg.hidden = false; return; }
  const days = last ? Math.max(0, Math.floor((Date.now() - last) / 864e5)) : null;

  const items = [];
  if (rank != null) items.push({ key: "search", name: "검색 노출력", w: 25, s: rankScore(rank), d: `${kw ? `'${esc(kw)}' ` : "대표 키워드 "}순위 <b>${rank}위</b>`, tip: "지역+업종 조합 키워드를 정리하고, 방문 후기와 유입 캠페인을 함께 진행해 순위를 끌어올리세요.", todo: "검색 노출 키워드를 넓히세요" });
  items.push({ key: "review", name: "리뷰 자산", w: 30, s: reviewScore(visitor, blog, median), d: `방문자 리뷰 <b>${visitor}개</b>${median ? ` (경쟁 중간값 ${median}개)` : ""} · 블로그 리뷰 <b>${blog}개</b>`, tip: "방문자·블로그 리뷰를 꾸준히 늘리세요. 체험단을 모집하면 방문 후기가 쌓여요.", todo: "리뷰 수를 늘리세요", cta: true });
  items.push({ key: "act", name: "최근 활동성", w: 20, s: activityScore(days, r30), d: `마지막 리뷰 <b>${days == null ? "없음" : days + "일 전"}</b> · 최근 30일 리뷰 <b>${r30}개</b>`, tip: "최근 30일 안에 새 리뷰가 꾸준히 올라오게 하면 매장이 '살아 있다'는 신호가 돼요.", todo: "최근 리뷰를 꾸준히 쌓으세요", cta: true });
  const missing = CHECKS.filter((_, i) => !checked.includes(i));
  items.push({ key: "info", name: "정보 완성도", w: 25, s: Math.round(checked.length * 10), d: `채워진 항목 <b>${checked.length}개</b> / 10개`, tip: missing.length ? `비어 있는 항목: ${missing.slice(0, 4).map(m => m[0]).join(", ")}${missing.length > 4 ? " 외" : ""}` : "", todo: "비어 있는 매장 정보를 채우세요" });

  const W = items.reduce((a, i) => a + i.w, 0);
  const total = Math.round(items.reduce((a, i) => a + i.s * i.w, 0) / W);
  const [g, gl] = grade(total);

  // 잘하고 있어요 / 눈여겨볼 점 / 지금 할 일
  const good = items.filter(i => i.s >= 70).map(i => `${i.name}이(가) 양호해요 (${i.s}점).`);
  if (median > 0 && visitor >= median) good.push(`방문자 리뷰가 경쟁 매장 중간값보다 많아요.`);
  const watch = items.filter(i => i.s < 55).map(i => `${i.name}이(가) 낮아요 (${i.s}점).`);
  if (median > 0 && visitor < median) watch.push(`방문자 리뷰가 경쟁 매장 중간값보다 ${median - visitor}개 적어요.`);
  if (days != null && days > 30) watch.push(`마지막 리뷰가 ${days}일 전이라 최근 활동이 적어 보여요.`);
  if (rank == null) watch.push("검색 순위를 입력하지 않아 '검색 노출력'은 점수에 넣지 않았어요.");
  const todo = [...items].sort((a, b) => b.w * (100 - b.s) - a.w * (100 - a.s)).filter(i => i.s < 85).slice(0, 3);

  const today = new Date(), ds = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
  const bandIdx = total >= 85 ? 4 : total >= 70 ? 3 : total >= 55 ? 2 : total >= 40 ? 1 : 0;
  const bands = [["D", "0-39"], ["C", "40-54"], ["B", "55-69"], ["A", "70-84"], ["S", "85-100"]];

  $("pd-result").innerHTML = `
    <div class="pr-head"><div><h2>${esc(f.name.value.trim())} <small>${esc(f.cat.value)}${f.region.value.trim() ? " · " + esc(f.region.value.trim()) : ""}</small></h2></div>
      <div class="pr-date">${ds} 입력 기준<br><span>입력하신 숫자로 계산한 결과예요</span></div></div>
    <div class="pr-score">
      <div class="pr-big"><small>우리들 플레이스 점수</small><div class="num">${total}<i>${g}</i></div><p>${gl}</p>
        <div class="pr-bands">${bands.map((b, i) => `<span class="${i === bandIdx ? "on" : ""}"><b></b>${b[0]} ${b[1]}</span>`).join("")}</div></div>
      <div class="pr-items"><h3>항목별 점수 <small>입력한 항목만 비중을 나눠 점수를 계산해요</small></h3>
        ${items.map(i => { const [t, c] = label(i.s); return `<div class="pr-item"><div class="pi-top"><b>${i.name}</b><em>비중 ${Math.round(i.w / W * 100)}</em><div class="bar"><i class="${c}" style="width:${Math.max(2, i.s)}%"></i></div><span class="sc">${i.s}</span><span class="tag ${c}">${t}</span></div><p>${i.d}</p></div>`; }).join("")}
      </div></div>
    ${median > 0 ? `<div class="pr-card"><h3>경쟁 매장과의 거리</h3><p class="muted small">입력하신 경쟁 매장 방문자 리뷰 중간값과 비교했어요.</p>
      <div class="cmp"><span>내 매장 ${visitor}개</span><div class="bar"><i class="blue" style="width:${clamp(visitor / Math.max(visitor, median) * 100)}%"></i></div></div>
      <div class="cmp"><span>중간값 ${median}개</span><div class="bar"><i class="gray" style="width:${clamp(median / Math.max(visitor, median) * 100)}%"></i></div></div>
      <p class="small">내 매장은 중간값의 <b>${(visitor / median).toFixed(1)}배</b>예요.</p></div>` : ""}
    <div class="pr-card"><h3>진단 요약</h3><div class="pr-sum">
      <div><h4>잘하고 있어요</h4><ul class="ok">${(good.length ? good : ["아직 눈에 띄게 높은 항목은 없어요. 아래 '지금 할 일'부터 시작해 보세요."]).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
        <h4>눈여겨볼 점</h4><ul class="warn">${(watch.length ? watch : ["큰 약점은 보이지 않아요."]).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="pr-todo"><h4>지금 할 일 — 효과 큰 순서</h4>
        ${todo.length ? todo.map((t, i) => `<div class="td"><span>${i + 1}</span><div><b>${t.todo}</b><p>${esc(t.tip)}</p>${t.cta ? '<a href="register.html">체험단 등록하기 →</a>' : ""}</div></div>`).join("") : "<p>모든 항목이 좋은 상태예요. 지금처럼 꾸준히 관리해 주세요.</p>"}
      </div></div></div>
    <div class="pr-card"><h3>매장 정보 완성도</h3>
      <table class="pr-table"><thead><tr><th>항목</th><th>현재</th><th>상태</th><th>개선 팁</th></tr></thead><tbody>
      ${CHECKS.map(([n, tip], i) => { const ok = checked.includes(i); return `<tr><td><b>${esc(n)}</b></td><td>${ok ? "등록됨" : "없음"}</td><td><span class="tag ${ok ? "ok" : "bad"}">${ok ? "완료" : "필요"}</span></td><td>${ok ? "—" : esc(tip)}</td></tr>`; }).join("")}
      </tbody></table></div>
    <p class="muted small pr-note">이 점수는 우리들 체험단이 정한 기준으로 입력값을 계산한 것이며, 네이버가 제공하는 공식 점수가 아니에요. 순위는 검색하는 위치·시간에 따라 달라질 수 있어요.</p>
    <div class="pr-actions"><button type="button" id="pd-again" class="btn-line">다시 입력하기</button><a class="btn-primary" href="register.html">체험단 등록하기</a></div>`;
  $("pd-form").hidden = true; $("pd-result").hidden = false;
  $("pd-again").onclick = () => { $("pd-result").hidden = true; $("pd-form").hidden = false; $("pd-form").scrollIntoView({ behavior: "smooth" }); };
  $("pd-result").scrollIntoView({ behavior: "smooth" });
};
