// 해외 검색·AI 노출 진단 보고서 화면. 데이터는 overseas-report-data.js (window.REPORT) 에서만 읽어요.
(function () {
  "use strict";
  var R = window.REPORT;
  var root = document.getElementById("report");
  if (!R || !root) return;

  // ---------- 도우미 ----------
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (n) { return typeof n === "number" ? n.toLocaleString("ko-KR") : esc(n); };
  var ST = { ok: ["정상", "ok"], warn: ["개선 필요", "warn"], gap: ["격차 큼", "gap"], none: ["없음", "none"], mid: ["보통", "warn"], bad: ["미흡", "gap"] };
  var badge = function (k, label) { var s = ST[k] || ST.none; return '<span class="bd ' + s[1] + '">' + esc(label || s[0]) + "</span>"; };
  var mark = { ok: ["✓", "ok", "충족"], warn: ["!", "warn", "부분 충족"], no: ["✕", "gap", "미충족"] };
  var markHtml = function (k) { var m = mark[k] || mark.no; return '<span class="mk ' + m[1] + '" role="img" aria-label="' + m[2] + '">' + m[0] + "</span>"; };
  var cell = function (c) {            // 순위 칸: 숫자 / 범위 내 미노출 / 확인 불가 / 미측정을 구분
    if (!c) return '<span class="rk nm">미측정</span>';
    if (c.k === "rank") return '<span class="rk rank">' + esc(c.v) + "위</span>";
    if (c.k === "out") return '<span class="rk out">범위 내 미노출</span>';
    if (c.k === "na") return '<span class="rk na">확인 불가</span>';
    return '<span class="rk nm">미측정</span>';
  };
  var cnt = function (n) { return n == null ? "미측정" : fmt(n) + "건"; };
  var sec = function (id, toc, title, kick, body, cls) {
    return '<section class="rs ' + (cls || "") + '" id="' + id + '" data-toc="' + toc + '" aria-labelledby="' + id + '-h">' +
      '<header class="rs-h">' + (kick ? '<small class="kick">' + esc(kick) + "</small>" : "") + '<h2 id="' + id + '-h">' + esc(title) + "</h2></header>" + body + "</section>";
  };
  var why = function (t) { return '<div class="why"><b>왜 보는가</b><p>' + esc(t) + "</p></div>"; };
  var result = function (r) { return '<div class="res ' + (ST[r.status] || ST.none)[1] + '"><b>진단 결과</b> ' + badge(r.status) + "<p>" + esc(r.text) + "</p></div>"; };
  var tn = 0;
  var table = function (cols, rows, cls) {
    return '<div class="tw" tabindex="0" role="region" aria-label="표 ' + (++tn) + ' (좌우로 스크롤)"><table class="' + (cls || "") + '"><thead><tr>' + cols.map(function (c) { return "<th scope=\"col\">" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return i === 0 ? '<th scope="row">' + c + "</th>" : "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  };
  var sample = R.isSample ? '<p class="sample-note" role="note"><b>예시 데이터</b> 이 화면의 병원·경쟁사·수치는 구조를 보여 주기 위한 가상의 값이며, 실제 측정 결과가 아닙니다.</p>' : "";

  // ---------- 표지 ----------
  var M = R.meta;
  var cover = '<section class="cover" id="cover" aria-label="표지"><div class="cover-in">' +
    '<img class="cover-logo" src="assets/logo.png" alt="EGP" width="72" height="25">' +
    '<p class="cover-kick">해외 검색 · AI 노출 진단 보고서</p><h1>' + esc(M.client) + "<br>해외 검색 진단</h1>" +
    '<dl class="cover-meta"><div><dt>발행</dt><dd>' + esc(M.issuer) + "</dd></div><div><dt>측정일</dt><dd>" + esc(M.measuredAt) + "</dd></div>" +
    "<div><dt>대상 사이트·지점</dt><dd>" + esc(M.sites) + "</dd></div><div><dt>대상 언어</dt><dd>" + esc(M.langs) + "</dd></div>" +
    "<div><dt>비교 대상</dt><dd>" + esc(M.rivals) + "</dd></div></dl>" + sample + "</div><i class=\"o1\"></i><i class=\"o2\"></i><i class=\"o3\"></i></section>";


  // ---------- 홈페이지 주소로 자동 점검 ----------
  var L = window.LANDING || {}, W = window.WOORI || {};
  var LIVE = L.OVERSEAS_LIVE === true;
  var sb = LIVE && W.SUPABASE_ANON_KEY && window.supabase ? window.supabase.createClient(W.SUPABASE_URL, W.SUPABASE_ANON_KEY) : null;
  var A_MSG = {
    bad_url: "https:// 로 시작하는 홈페이지 주소를 입력해 주세요.", blocked_url: "이 주소는 읽을 수 없어요. 일반 홈페이지 주소를 입력해 주세요.",
    unsupported_naver: "네이버 플레이스·지도 주소는 읽지 못해요. 병원 홈페이지 주소를 입력해 주세요.", not_html: "웹페이지가 아니에요. 홈페이지 주소를 입력해 주세요.",
    too_large: "페이지가 너무 커서 읽지 못했어요.", fetch_failed: "홈페이지를 열지 못했어요. 주소를 확인해 주세요.",
    rate_limited: "잠시 후 다시 시도해 주세요. (시간당 이용 횟수를 넘었어요)", not_configured: "자동 점검을 아직 연결하지 못했어요. 관리자에게 문의해 주세요."
  };
  var autoSec = sec("auto", "auto", "홈페이지 주소로 자동 점검", "AUTO CHECK",
    '<p class="lead">홈페이지 주소를 넣으면 서버가 사이트를 직접 읽어, <b>언어별 페이지 연결·제목·설명·검색 로봇 설정</b>을 점검합니다.</p>' +
    '<form class="auto-form card" id="auto-form" novalidate><label for="auto-url">홈페이지 주소</label><div class="auto-row"><input id="auto-url" type="url" inputmode="url" autocomplete="url" placeholder="https://" aria-describedby="auto-msg"><button type="submit" class="btn" id="auto-go">해외 진단하기</button></div>' +
    '<p class="auto-msg" id="auto-msg" role="status" aria-live="polite">' + (LIVE ? "" : "지금은 시험 단계라 주소를 읽지 않고 <b>예시 결과</b>를 보여 드려요.") + "</p></form>" +
    '<div id="auto-out"></div>' +
    '<p class="foot">월 검색량·순위·AI 인용·경쟁사 비교는 외부 도구가 필요해 이 자동 점검에 포함되지 않습니다. 아래 보고서의 해당 부분은 <b>가상 예시 데이터</b>입니다.</p>');
  function renderAudit(a, demo) {
    var cnt = { ok: 0, warn: 0, gap: 0, none: 0 }; a.findings.forEach(function (f) { cnt[f.status] = (cnt[f.status] || 0) + 1; });
    return '<div class="auto-res"><p class="' + (demo ? "warn-box" : "ok-box") + '" role="note">' +
      (demo ? "<b>예시 결과</b> — 입력한 주소를 읽지 않았고, 아래는 가상의 값입니다." : "<b>측정 결과</b> — " + esc(a.site.host) + " · 측정일 " + esc(a.measuredAt) + (a.skipped ? " · 읽지 못한 언어 페이지 " + a.skipped + "개" : "")) + "</p>" +
      '<p class="tally"><span class="bd ok">정상 ' + cnt.ok + '</span> <span class="bd warn">개선 필요 ' + cnt.warn + '</span> <span class="bd gap">격차 큼 ' + cnt.gap + '</span> <span class="bd none">확인 불가 ' + cnt.none + "</span></p>" +
      '<h3 class="sub-h">점검 결과</h3>' + table(["영역", "상태", "관측 근거", "먼저 할 일"], a.findings.map(function (f) { return [esc(f.area), badge(f.status), esc(f.found), esc(f.todo)]; })) +
      '<h3 class="sub-h">읽은 페이지</h3>' + table(["언어", "제목 (길이)", "설명 (길이)", "H1", "연결된 언어"], a.pages.map(function (p) {
        return [esc(p.lang || "-"), esc(p.title || "없음") + " <small>(" + p.titleWidth + ")</small>", esc(p.description || "없음") + " <small>(" + p.descWidth + ")</small>", esc(p.h1 || "없음") + (p.h1Count > 1 ? " <small>(" + p.h1Count + "개)</small>" : ""), esc((p.hreflang || []).join(", ") || "-")];
      })) +
      '<div class="card"><h3>미측정 항목</h3><ul class="bl">' + a.unmeasured.map(function (u) { return "<li>" + esc(u) + ' <span class="rk nm">미측정</span></li>'; }).join("") + "</ul></div></div>";
  }
  var autoBusy = false;
  function wireAuto() {
    var form = document.getElementById("auto-form"), out = document.getElementById("auto-out"), msg = document.getElementById("auto-msg"), btn = document.getElementById("auto-go"), inp = document.getElementById("auto-url");
    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (autoBusy) return;
      var url = inp.value.trim();
      try { if (!/^https?:$/.test(new URL(url).protocol)) throw 0; } catch (_) { msg.textContent = A_MSG.bad_url; inp.setAttribute("aria-invalid", "true"); return inp.focus(); }
      inp.removeAttribute("aria-invalid");
      try { if (/(^|\.)naver\.(com|me)$/i.test(new URL(url).hostname)) { msg.textContent = A_MSG.unsupported_naver; return; } } catch (_) {}
      if (!LIVE) { out.innerHTML = renderAudit(R.autoDemo, true); msg.textContent = "예시 결과를 보여 드렸어요. (실제 점검은 아직 켜지지 않았어요)"; return; }
      if (!sb) { msg.textContent = A_MSG.not_configured; return; }
      autoBusy = true; btn.disabled = true; msg.textContent = "홈페이지를 읽는 중이에요… (최대 30초)"; out.innerHTML = "";
      sb.functions.invoke("aeo-prefill", { body: { url: url, mode: "overseas" } }).then(function (r) {
        if (r.error) { return Promise.resolve(r.error.context && r.error.context.json ? r.error.context.json() : {}).catch(function () { return {}; }).then(function (b) { msg.textContent = A_MSG[b && b.error] || A_MSG.fetch_failed; }); }
        var a = r.data && r.data.audit; if (!a || !a.findings) { msg.textContent = A_MSG.fetch_failed; return; }
        out.innerHTML = renderAudit(a, false); msg.textContent = "점검을 마쳤어요."; 
      }).catch(function () { msg.textContent = A_MSG.fetch_failed; }).then(function () { autoBusy = false; btn.disabled = false; });
    });
  }

  // ---------- 한 장 요약 ----------
  var S = R.summary;
  var kpis = S.kpis.map(function (k) {
    var mx = Math.max(k.me, k.rv, 1);
    return '<article class="kpi"><h3>' + esc(k.label) + '</h3><div class="kpi-bars">' +
      '<div class="kb"><span>' + esc(M.client.split(" ")[0]) + '</span><i style="width:' + Math.max(1.5, k.me / mx * 100) + '%"></i><b>' + fmt(k.me) + esc(k.unit) + "</b></div>" +
      '<div class="kb rv"><span>경쟁의원 A</span><i style="width:' + Math.max(1.5, k.rv / mx * 100) + '%"></i><b>' + fmt(k.rv) + esc(k.unit) + "</b></div></div></article>";
  }).join("");
  var summary = sec("summary", "summary", "한 장 요약", "SUMMARY",
    '<p class="concl">' + esc(S.conclusion) + "</p>" +
    '<div class="two"><div class="card"><h3>격차의 주요 원인 3가지</h3><ol class="num">' + S.reasons.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ol></div>" +
    '<div class="card note-card"><h3>데이터 읽는 법</h3><p>' + esc(S.note) + "</p></div></div>" +
    '<div class="kpis">' + kpis + "</div>" +
    "<h3 class=\"sub-h\">영역별 진단</h3>" + table(["영역", "상태", "관측 근거", "먼저 할 일"], S.diag.map(function (d) { return [esc(d.area), badge(d.status), esc(d.found), esc(d.todo)]; })) +
    '<p class="foot">각 영역은 ‘왜 보는가 → 관측 근거 → 진단 → 먼저 할 일’ 순서로 아래에서 자세히 봅니다.</p>');

  // ---------- 5단계 점검 지도 ----------
  var map = sec("map", "summary", "5단계 점검 지도", "MAP",
    '<p class="lead">노출은 앞 단계가 막히면 뒤 단계도 막힙니다. 순서대로 점검했습니다.</p><ol class="steps">' +
    R.steps.map(function (s) {
      return '<li class="step"><b class="sn">' + esc(s.n) + "</b><h3>" + esc(s.name) + "</h3><p>" + esc(s.text) + '</p><div class="sc"><span>예시의원 ' + badge(s.me) + "</span><span>경쟁의원 A " + badge(s.rv) + "</span></div></li>";
    }).join("") + "</ol>");

  // ---------- 01 색인 ----------
  var s1 = sec("s1", "s1", "01 색인 — 검색 결과에 등록되어 있나", "INDEX",
    why(R.s1.why) + '<div class="shots">' + R.s1.evidence.map(function (e) {
      return '<figure class="shot">' + (e.img ? '<img src="' + esc(e.img) + '" alt="' + esc(e.cap) + '" loading="lazy">' : '<div class="shot-ph" role="img" aria-label="캡처 이미지 자리">캡처 이미지 자리<br><small>img 경로를 data 파일에 넣으면 표시됩니다</small></div>') + "<figcaption>" + esc(e.cap) + "</figcaption></figure>";
    }).join("") + "</div><ul class=\"bl\">" + R.s1.bullets.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>" + result(R.s1.result));

  // ---------- 02 주제 전달 ----------
  var s2 = sec("s2", "s2", "02 주제 전달 — 검색어와 맞게 설명하나", "MESSAGE",
    why(R.s2.why) + "<h3 class=\"sub-h\">언어별 title · description · H1 비교</h3>" + table(R.s2.table.cols, R.s2.table.rows.map(function (r) { return [esc(r[0]), esc(r[1]), esc(r[2])]; }), "lang") +
    "<h3 class=\"sub-h\">검색엔진 장치 점검</h3>" + table(["항목", "상태", "메모"], R.s2.devices.map(function (d) { return [esc(d.name), badge(d.me), esc(d.note)]; })) +
    '<div class="ba"><div><small>수정 전 (예시)</small><p>' + esc(R.s2.fix.before) + '</p></div><span aria-hidden="true">→</span><div class="af"><small>수정 문구 예시</small><p>' + esc(R.s2.fix.after) + "</p></div></div><p class=\"foot\">" + esc(R.s2.fix.note) + "</p>" + result(R.s2.result));

  // ---------- 03 외부 신뢰 ----------
  var s3 = sec("s3", "s3", "03 외부 신뢰 — 다른 사이트가 소개하나", "TRUST",
    why(R.s3.why) + table(["지표", "예시의원", "경쟁의원 A"], R.s3.metrics.map(function (m) { return [esc(m.name), fmt(m.me), fmt(m.rv)]; })) +
    '<div class="bigs">' + R.s3.big.map(function (b) { return '<div class="big"><b>' + esc(b.n) + "</b><span>" + esc(b.t) + "</span></div>"; }).join("") + "</div>" +
    '<div class="cards3">' + R.s3.media.map(function (m) { return '<article class="card"><h3>' + esc(m.name) + "</h3><p>" + esc(m.note) + "</p></article>"; }).join("") + "</div>" + result(R.s3.result));

  // ---------- 04 AI 인용 ----------
  var mx4 = Math.max.apply(null, R.s4.platforms.map(function (p) { return Math.max(p.me, p.rv); }).concat([1]));
  var s4 = sec("s4", "s4", "04 AI 인용 — AI 답변이 근거로 쓰나", "AI",
    why(R.s4.why) + '<div class="card"><h3>플랫폼별 인용 건수</h3><div class="hb">' + R.s4.platforms.map(function (p) {
      return '<div class="hbr"><span class="hbn">' + esc(p.name) + '</span><div class="hbt"><i class="me" style="width:' + Math.max(1, p.me / mx4 * 100) + '%"></i><b>' + fmt(p.me) + '건</b></div><div class="hbt"><i class="rv" style="width:' + Math.max(1, p.rv / mx4 * 100) + '%"></i><b>' + fmt(p.rv) + "건</b></div></div>";
    }).join("") + '<p class="lg"><i class="me"></i>예시의원 <i class="rv"></i>경쟁의원 A</p></div></div>' +
    "<h3 class=\"sub-h\">확인된 인용 사례</h3>" + table(["플랫폼", "질문", "확인 내용"], R.s4.cases.map(function (c) { return [esc(c.platform), esc(c.q), esc(c.note)]; })) + result(R.s4.result));

  // ---------- 05 국가별 검색 기회 (#s5) ----------
  var C = R.s5.countries, keys = ["jp", "tw", "en"];
  var tot = function (k) { return C[k].keywords.reduce(function (s, x) { return s + (x.vol || 0); }, 0); };
  var exposed = function (k, who) { return C[k].keywords.filter(function (x) { return x[who] && x[who].k === "rank"; }).length; };
  var maxTot = Math.max.apply(null, keys.map(tot).concat([1]));
  var pal = ["#A88AF4", "#7C5CD6", "#CAFE61", "#C8B6F8", "#98C23A", "#5B3FB5"];
  var bars = keys.map(function (k) {
    var segs = C[k].keywords.filter(function (x) { return x.vol != null; }).map(function (x, i) {
      var w = x.vol / maxTot * 100;
      return '<i class="seg" style="width:' + w + "%;background:" + pal[i % pal.length] + '" title="' + esc(x.kw + " · " + x.ko + " · 월 " + fmt(x.vol) + "회") + '"></i>';
    }).join("");
    return '<div class="brow"><div class="btop"><b>' + esc(C[k].name) + "</b><span>월간 합계 " + fmt(tot(k)) + '회</span></div><div class="btrack" role="img" aria-label="' + esc(C[k].name + " 월간 검색량 합계 " + fmt(tot(k)) + "회, 키워드 " + C[k].keywords.length + "개 분할") + '">' + segs + "</div>" +
      '<div class="bbot"><span>예시의원 노출 <b>' + exposed(k, "me") + "/" + C[k].keywords.length + '건</b></span><span>경쟁의원 A 노출 <b>' + exposed(k, "rv") + "/" + C[k].keywords.length + "건</b></span></div></div>";
  }).join("");
  var kwTable = function (k) {
    return '<div class="tw" tabindex="0" role="region" aria-label="' + esc(C[k].name) + ' 검색어 표 (좌우로 스크롤)"><table class="kw"><thead><tr><th scope="col">현지 검색어</th><th scope="col">한국어 뜻</th><th scope="col" class="r">월 검색량</th><th scope="col">예시의원 순위</th><th scope="col">경쟁의원 A 순위</th></tr></thead><tbody>' +
      C[k].keywords.map(function (x) { return '<tr><th scope="row" lang="' + (k === "jp" ? "ja" : k === "tw" ? "zh-Hant" : "en") + '">' + esc(x.kw) + "</th><td>" + esc(x.ko) + '</td><td class="r">' + (x.vol == null ? '<span class="rk nm">미측정</span>' : fmt(x.vol)) + "</td><td>" + cell(x.me) + "</td><td>" + cell(x.rv) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  };
  var CN = R.s5.cn;
  var panels = { jp: kwTable("jp"), tw: kwTable("tw"), en: kwTable("en"), cn: '<p class="foot">' + esc(CN.note) + "</p>" + table(["점검 항목", "상태", "판단"], CN.rows.map(function (r) { return [esc(r.item), esc(r.state), esc(r.judge)]; })) };
  var tabs = [["jp", "일본"], ["tw", "대만"], ["en", "영어권"], ["cn", "중국"]];
  var s5 = sec("s5", "s5", "05 국가별 검색 기회", "OPPORTUNITY",
    '<p class="concl">' + esc(R.s5.title) + "</p>" + why(R.s5.why) +
    '<div class="card"><h3>국가별 월간 검색량 (키워드 한 조각 = 검색어 하나)</h3><div class="bars">' + bars + '</div><p class="foot">막대 조각의 너비는 해당 검색어의 월 검색량에 비례하고, 세 국가는 같은 척도라 전체 길이로 합계를 비교할 수 있습니다. 조각에 마우스를 올리면 검색어가 보입니다.</p></div>' +
    '<div class="tabs" role="tablist" aria-label="국가 선택">' + tabs.map(function (t, i) { return '<button role="tab" type="button" id="tab-' + t[0] + '" aria-controls="pn-' + t[0] + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '">' + t[1] + "</button>"; }).join("") + "</div>" +
    tabs.map(function (t, i) { return '<div role="tabpanel" id="pn-' + t[0] + '" aria-labelledby="tab-' + t[0] + '"' + (i ? " hidden" : "") + ">" + panels[t[0]] + "</div>"; }).join("") +
    '<ul class="legend-k"><li><span class="rk rank">3위</span> 순위</li><li><span class="rk out">범위 내 미노출</span> 측정한 범위(상위 20위)에서 보이지 않음</li><li><span class="rk na">확인 불가</span> 측정을 시도했으나 값을 얻지 못함</li><li><span class="rk nm">미측정</span> 측정하지 않음</li><li><b>0건</b> 측정했고 없음</li></ul>' +
    '<p class="foot">' + esc(R.s5.sources) + " " + esc(M.volumeSource) + "</p>", "hl");

  var serp = sec("s5b", "s5", "국가별 구글 검색 1페이지", "SERP",
    '<div class="cards3">' + R.s5.serp.map(function (s) {
      return '<article class="card"><h3>' + esc(s.c) + '</h3><p class="meta">검색어 <b>' + esc(s.q) + "</b> · 측정일 " + esc(s.date) + '</p><ol class="serp">' + s.list.map(function (r, i) { return "<li><b>" + (i + 1) + "</b><span>" + esc(r[0]) + "</span><em>" + esc(r[1]) + "</em></li>"; }).join("") + "</ol></article>";
    }).join("") + "</div>");

  // ---------- 월별 유입 추이 ----------
  var T = R.trend, W = 640, H = 240, pl = 44, pr = 14, pt = 14, pb = 28;
  var ymax = Math.max.apply(null, T.series.map(function (s) { return Math.max.apply(null, s.vals); }));
  var xs = function (i) { return pl + i * (W - pl - pr) / (T.months.length - 1); };
  var ys = function (v) { return pt + (1 - v / ymax) * (H - pt - pb); };
  var colors = ["#7C5CD6", "#20242E"];
  var lines = T.series.map(function (s, si) {
    var d = s.vals.map(function (v, i) { return (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(v).toFixed(1); }).join(" ");
    return '<path d="' + d + '" fill="none" stroke="' + colors[si] + '" stroke-width="2.5" stroke-linejoin="round"' + (si ? ' stroke-dasharray="6 4"' : "") + "/>";
  }).join("");
  var grid = [0, 0.5, 1].map(function (f) { var v = ymax * f, y = ys(v); return '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" stroke="#e6e4ef"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#5b6070">' + fmt(Math.round(v)) + "</text>"; }).join("");
  var xl = T.months.map(function (m, i) { return i % 2 === 0 ? '<text x="' + xs(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#5b6070">' + esc(m) + "</text>" : ""; }).join("");
  var trend = sec("trend", "s5", "월별 유입 추이", "TREND",
    '<div class="card"><h3>월 검색 유입 (추정치)</h3><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc("월별 검색 유입 추정 추이. " + T.series.map(function (s) { return s.name + " " + fmt(s.vals[0]) + "에서 " + fmt(s.vals[s.vals.length - 1]) + "회"; }).join(", ")) + '" class="lc">' + grid + lines + xl + "</svg>" +
    '<p class="lg"><i style="background:#7C5CD6"></i>' + esc(T.series[0].name) + ' <i style="background:#20242E"></i>' + esc(T.series[1].name) + '</p><p class="foot">' + esc(T.note) + "</p></div>");

  // ---------- 전체 항목 비교 ----------
  var cmp = sec("compare", "s5", "전체 항목 비교", "COMPARE",
    '<p class="lead">판단 기준은 ‘관측 근거’ 열에 적었습니다. <span class="lgd">' + markHtml("ok") + " " + esc(R.compare.legend.ok) + " " + markHtml("warn") + " " + esc(R.compare.legend.warn) + " " + markHtml("no") + " " + esc(R.compare.legend.no) + "</span></p>" +
    R.compare.groups.map(function (g) {
      return '<h3 class="sub-h">' + esc(g.g) + "</h3>" + table(["항목", "예시의원", "경쟁의원 A", "관측 근거"], g.rows.map(function (r) { return [esc(r.item), markHtml(r.me), markHtml(r.rv), esc(r.basis)]; }));
    }).join(""));

  // ---------- 유지할 요소 · 개선안 ----------
  var keep = sec("keep", "fix", "유지할 브랜드 요소", "KEEP",
    '<div class="cards4">' + R.keep.map(function (k) { return '<article class="card keep"><h3>' + esc(k.t) + "</h3><p>" + esc(k.d) + "</p></article>"; }).join("") + "</div>");
  var fix = sec("fix", "fix", "개선안", "FIX",
    '<div class="fixes">' + R.fix.items.map(function (f) { return '<article class="card fix"><span class="pt ' + f.p.toLowerCase() + '">' + esc(f.p) + "</span><h3>" + esc(f.t) + "</h3><p>" + esc(f.d) + '</p><small>근거: ' + esc(f.from) + "</small></article>"; }).join("") + "</div>" +
    '<h3 class="sub-h">어떻게 고칠까 — 두 가지 방법</h3><div class="two">' + R.fix.options.map(function (o) { return '<article class="card opt"><h3>' + esc(o.name) + "</h3><ul class=\"bl\">" + o.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + '</ul><p class="when">' + esc(o.when) + "</p></article>"; }).join("") + "</div>");
  var structure = sec("structure", "fix", "개선 항목 연결 구조", "FLOW",
    '<ul class="chain">' + R.fix.link.map(function (l) { return '<li><span>' + esc(l.from) + '</span><i aria-hidden="true">→</i><b>' + esc(l.to) + '</b><i aria-hidden="true">→</i><span>' + esc(l.end) + "</span></li>"; }).join("") + "</ul>");

  // ---------- 콘텐츠 발행 계획 ----------
  var K = R.content;
  var content = sec("content", "content", "콘텐츠 발행 계획", "CONTENT",
    '<p class="warn-box" role="note">' + esc(K.note) + "</p>" + table(["국가", "목표 키워드", "글감", "발행 언어", "검수 단계"], K.rows.map(function (r) { return [esc(r.c), esc(r.kw), esc(r.topic), esc(r.lang), esc(r.review)]; })) +
    '<ol class="flow">' + K.steps.map(function (s, i) { return "<li><b>" + (i + 1) + "</b>" + esc(s) + "</li>"; }).join("") + "</ol>");

  // ---------- 12개월 일정 ----------
  var RM = R.roadmap, hdr = "";
  for (var m = 1; m <= RM.months; m++) hdr += "<span>" + m + "월</span>";
  var rows = RM.rows.map(function (r) {
    var cells = ""; for (var q = 1; q <= RM.months; q++) { var on = r.spans.some(function (s) { return q >= s[0] && q <= s[1]; }); cells += '<i class="' + (on ? "on" : "") + '"' + (on ? ' title="' + esc(r.t + " " + q + "월 진행") + '"' : "") + "></i>"; }
    return '<div class="grow"><b>' + esc(r.t) + '</b><div class="gcells">' + cells + "</div></div>";
  }).join("");
  var roadmap = sec("roadmap", "roadmap", "12개월 일정", "ROADMAP",
    '<div class="card gantt" role="group" tabindex="0" aria-label="12개월 일정표 (좌우로 스크롤)"><div class="grow gh"><b></b><div class="gcells">' + hdr + "</div></div>" + rows + "</div>" +
    '<div class="cards4">' + RM.milestones.map(function (x) { return '<article class="card ms"><b>' + esc(x.m) + "</b><p>" + esc(x.t) + "</p></article>"; }).join("") + "</div>");

  // ---------- 서비스 범위 ----------
  var SV = R.service;
  var service = sec("service", "service", "서비스 범위", "SERVICE",
    '<ol class="flow nine">' + SV.flow.map(function (s, i) { return "<li><b>" + (i + 1) + "</b>" + esc(s) + "</li>"; }).join("") + "</ol>" +
    "<h3 class=\"sub-h\">담당 구분</h3>" + table(["업무", "담당"], SV.scope.map(function (s) { return [esc(s.t), esc(s.who)]; })) +
    '<div class="card"><h3>측정 방법</h3><ul class="bl">' + SV.measure.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>");

  // ---------- 다음 단계 ----------
  var N = R.next;
  var next = sec("next", "service", "다음 단계", "NEXT",
    '<div class="two"><div class="card"><h3>확인이 필요한 자료</h3><ul class="bl">' + N.needs.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul></div><div class="card"><h3>다음 미팅에서 결정할 사항</h3><ol class="num">' + N.decisions.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol></div></div>" +
    '<p class="foot">이 보고서의 수치는 측정 시점의 기록이며, 노출·순위·유입 증가를 보장하지 않습니다.</p>');

  root.innerHTML = cover + '<div class="rbody">' + autoSec + summary + map + s1 + s2 + s3 + s4 + s5 + serp + trend + cmp + keep + fix + structure + content + roadmap + service + next + "</div>";

  wireAuto();

  // ---------- 탭 ----------
  var tablist = root.querySelector('[role="tablist"]');
  var tabBtns = [].slice.call(tablist.querySelectorAll('[role="tab"]'));
  function pick(btn) {
    tabBtns.forEach(function (b) { var on = b === btn; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; document.getElementById(b.getAttribute("aria-controls")).hidden = !on; });
  }
  tabBtns.forEach(function (b, i) {
    b.addEventListener("click", function () { pick(b); });
    b.addEventListener("keydown", function (e) {
      var j = e.key === "ArrowRight" ? (i + 1) % tabBtns.length : e.key === "ArrowLeft" ? (i + tabBtns.length - 1) % tabBtns.length : e.key === "Home" ? 0 : e.key === "End" ? tabBtns.length - 1 : -1;
      if (j >= 0) { e.preventDefault(); pick(tabBtns[j]); tabBtns[j].focus(); }
    });
  });

  // ---------- 목차 ----------
  var toc = [["auto", "자동 점검"], ["summary", "요약"], ["s1", "색인"], ["s2", "주제"], ["s3", "신뢰"], ["s4", "AI"], ["s5", "기회"], ["fix", "개선안"], ["content", "콘텐츠"], ["roadmap", "일정"], ["service", "서비스"]];
  var links = toc.map(function (t) { return '<a href="#' + t[0] + '" data-t="' + t[0] + '">' + esc(t[1]) + "</a>"; }).join("");
  var side = document.getElementById("toc-list"), mob = document.getElementById("toc-mob-list");
  if (side) side.innerHTML = links;
  if (mob) mob.innerHTML = links;
  var tocLinks = [].slice.call(document.querySelectorAll("[data-t]"));
  var secs = [].slice.call(root.querySelectorAll("section.rs"));
  var tick = false;
  function active() {
    tick = false; var cur = "auto", line = window.innerHeight * 0.3;
    secs.forEach(function (s) { if (s.getBoundingClientRect().top <= line) cur = s.getAttribute("data-toc"); });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = "service";
    tocLinks.forEach(function (a) { var on = a.getAttribute("data-t") === cur; if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
  }
  window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(active); } }, { passive: true });
  window.addEventListener("resize", active);
  var det = document.getElementById("toc-mob");
  if (mob) mob.addEventListener("click", function (e) { if (e.target.closest("a") && det) det.open = false; });

  // #s5 처럼 주소에 해시가 있으면, 그린 뒤에 그 위치로 이동
  function goHash() {
    var id = decodeURIComponent((location.hash || "").slice(1)); if (!id) return;
    var el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  }
  window.addEventListener("hashchange", goHash);
  goHash(); active();
  document.documentElement.setAttribute("data-ready", "1");
})();
