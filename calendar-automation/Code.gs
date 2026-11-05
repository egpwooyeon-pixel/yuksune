/**
 * 방문 일정 자동 등록
 * 구글 시트에 일정을 입력하고 "상태"를 '등록대기'로 바꾸면
 *   1) 구글 캘린더에 일정이 등록되고
 *   2) 이메일 칸의 고객에게 캘린더 초대 메일이 자동 발송됩니다.
 * 수정/취소도 상태 값만 바꾸면 캘린더에 반영됩니다.
 */

// ============================== 설정 ==============================
const CONFIG = {
  SHEET_NAME: '방문일정',
  CALENDAR_NAME: '',              // '' = 내 기본 캘린더. 이름을 적으면(예: '브레디트 방문') 없을 때 자동 생성
  TITLE_PREFIX: '[브레디트 방문]', // 일정 제목 = "[브레디트 방문] 고객명"
  REMINDER_MINUTES: 120,          // 내 캘린더 팝업 알림: 방문 2시간 전
  DEFAULT_DURATION_MIN: 60,       // 종료 시간을 비워두면 시작 + 60분
  SEND_INVITES: true,             // false면 고객에게 메일을 보내지 않음(캘린더에만 등록)
  TEST_EMAIL: '',                 // 값을 넣으면 모든 초대가 이 주소로만 감 (테스트용, 운영 전 반드시 비우기)
  GUEST_NOTE: '',                 // 고객에게 보이는 초대장 설명에 덧붙일 문구 (고객이 읽는 내용임에 주의)

  // ---- 원본 시트에서 일정 가져오기 ----
  SOURCE_URL: '',                 // 원본(캠페인) 시트 주소 전체를 붙여넣기. 비어 있으면 가져오기 안 됨
  SOURCE_GID: 0,                  // 원본 시트의 탭 번호(주소 끝 gid=숫자). 0이면 첫 번째 탭
  SKIP_TYPES: ['클립체험단'],      // 구분 열에 이 글자가 들어간 행은 가져오지 않음 (예: 겹치는 표 제외). 없으면 []
  IMPORT_STATUS: '',              // 가져온 행의 상태. '' = 검토 후 직접 '등록대기'로 변경(권장), '등록대기' = 가져오자마자 캘린더 등록까지 자동
  SYNC_EVERY_MINUTES: 10          // 자동 가져오기 주기(분). 1, 5, 10, 15, 30 중 하나
};

// 열 번호 (A=1)
const COL = { NAME: 1, TYPE: 2, DATE: 3, START: 4, END: 5, PHONE: 6, EMAIL: 7, PLACE: 8, STATUS: 9, EVENT_ID: 10, NOTE: 11 };
const HEADERS = ['고객명', '구분', '방문일', '시작', '종료', '연락처', '이메일', '장소', '상태', '이벤트ID', '처리결과'];
const STATUS = {
  PENDING: '등록대기', DONE: '등록완료', UPDATE: '수정대기',
  CANCEL: '취소요청', CANCELED: '취소됨', VISITED: '방문완료', ERROR: '오류'
};
const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

// ============================== 메뉴 / 설치 ==============================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📅 방문일정')
    .addItem('원본 시트에서 일정 가져오기', 'syncFromSource')
    .addItem('대기 중인 일정 전체 처리', 'processAllPending')
    .addSeparator()
    .addItem('① 시트 초기 설정 (최초 1회)', 'setupSheet')
    .addItem('② 자동 실행 켜기 (최초 1회)', 'installTrigger')
    .addItem('③ 원본 자동 가져오기 켜기', 'installSyncTrigger')
    .addToUi();
}

/** 시트 양식(머리글, 드롭다운, 서식, 입력 검증)을 만든다. */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
  const rows = 500;

  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#e8eaed');
  sh.setFrozenRows(1);

  sh.getRange(2, COL.DATE, rows, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, COL.START, rows, 2).setNumberFormat('HH:mm');
  sh.getRange(2, COL.PHONE, rows, 1).setNumberFormat('@'); // 앞자리 0 보존

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(STATUS), true).setAllowInvalid(false).build();
  sh.getRange(2, COL.STATUS, rows, 1).setDataValidation(statusRule);

  const phoneRule = SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(F2="",REGEXMATCH(TO_TEXT(F2),"^01[016789]-?\\d{3,4}-?\\d{4}$"))')
    .setAllowInvalid(true).setHelpText('휴대폰 형식: 010-1234-5678').build();
  sh.getRange(2, COL.PHONE, rows, 1).setDataValidation(phoneRule);

  sh.getRange(2, COL.EVENT_ID, rows, 2).setBackground('#f1f3f4'); // 자동 기록 열 표시
  sh.setColumnWidths(1, HEADERS.length, 110);
  sh.setColumnWidth(COL.EMAIL, 200);
  sh.setColumnWidth(COL.NOTE, 320);
  SpreadsheetApp.getActive().toast('시트 설정 완료. 다음은 ② 자동 실행 켜기.');
}

/** 시트 수정 시 자동 실행되는 "설치형 트리거"를 만든다. (단순 onEdit은 캘린더 권한이 없어 쓸 수 없음) */
function installTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onSheetEdit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  SpreadsheetApp.getActive().toast('자동 실행이 켜졌습니다. 이제 "상태"를 바꾸면 처리됩니다.');
}

// ============================== 트리거 진입점 ==============================
/** 상태 열이 수정되면 해당 행들을 처리한다. */
function onSheetEdit(e) {
  if (!e || !e.range) return;
  const range = e.range;
  const sh = range.getSheet();
  if (sh.getName() !== CONFIG.SHEET_NAME) return;
  if (range.getColumn() > COL.STATUS || range.getLastColumn() < COL.STATUS) return; // 상태 열을 건드린 경우만
  const first = Math.max(range.getRow(), 2);
  if (range.getLastRow() < first) return;
  processRows_(sh, first, range.getLastRow());
}

/** 메뉴에서 수동 실행: 시트 전체에서 처리 대상 행을 모두 처리한다. */
function processAllPending() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) { SpreadsheetApp.getUi().alert('"' + CONFIG.SHEET_NAME + '" 시트가 없습니다. 먼저 ① 시트 초기 설정을 실행하세요.'); return; }
  if (sh.getLastRow() < 2) return;
  processRows_(sh, 2, sh.getLastRow());
}

// ============================== 핵심 처리 ==============================
function processRows_(sh, firstRow, lastRow) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { sh.getParent().toast('다른 처리가 진행 중입니다. 잠시 후 다시 시도하세요.'); return; }
  try {
    const tz = sh.getParent().getSpreadsheetTimeZone();
    const cal = getCalendar_();
    for (let r = firstRow; r <= lastRow; r++) {
      const status = String(sh.getRange(r, COL.STATUS).getValue()).trim();
      if (status !== STATUS.PENDING && status !== STATUS.UPDATE && status !== STATUS.CANCEL) continue;
      try {
        processRow_(sh, r, status, cal, tz);
      } catch (err) {
        writeResult_(sh, r, STATUS.ERROR, '실패: ' + err.message);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function processRow_(sh, r, status, cal, tz) {
  const v = sh.getRange(r, 1, 1, HEADERS.length).getValues()[0];
  const eventId = String(v[COL.EVENT_ID - 1] || '').trim();

  // ---- 취소 ----
  if (status === STATUS.CANCEL) {
    if (!eventId) return writeResult_(sh, r, STATUS.CANCELED, '등록된 캘린더 일정이 없어 시트만 취소 처리');
    const ev = cal.getEventById(eventId);
    if (ev) ev.deleteEvent();
    sh.getRange(r, COL.EVENT_ID).clearContent();
    return writeResult_(sh, r, STATUS.CANCELED, ev ? '캘린더 일정 삭제함' : '캘린더에 일정이 이미 없음(시트만 취소 처리)');
  }

  // ---- 등록 / 수정 공통: 검증 ----
  const f = parseAndValidate_(v, tz);
  if (f.errors.length) return writeResult_(sh, r, STATUS.ERROR, '입력 확인: ' + f.errors.join(' / '));

  const title = CONFIG.TITLE_PREFIX + ' ' + f.name;
  const desc = [f.type, CONFIG.GUEST_NOTE].filter(String).join('\n');
  const notes = [];

  // 같은 제목 접두어를 가진 다른 일정과 시간이 겹치면 경고(등록은 진행)
  const overlaps = cal.getEvents(f.start, f.end)
    .filter(e => e.getId() !== eventId && e.getTitle().indexOf(CONFIG.TITLE_PREFIX) === 0);
  if (overlaps.length) notes.push('⚠ 같은 시간대 일정 ' + overlaps.length + '건: ' + overlaps.map(e => e.getTitle()).join(', '));

  const guests = (CONFIG.TEST_EMAIL ? [CONFIG.TEST_EMAIL] : f.emails).join(',');

  // ---- 수정 ----
  if (status === STATUS.UPDATE) {
    const ev = eventId ? cal.getEventById(eventId) : null;
    if (!ev) return writeResult_(sh, r, STATUS.ERROR, '수정할 캘린더 일정을 찾지 못함(이벤트ID 확인). 새로 등록하려면 상태를 등록대기로 바꾸고 이벤트ID를 지우세요');
    ev.setTitle(title);
    ev.setTime(f.start, f.end);
    ev.setDescription(desc);
    ev.setLocation(f.place);
    const have = ev.getGuestList().map(g => g.getEmail().toLowerCase());
    const want = guests ? guests.split(',').map(s => s.toLowerCase()) : [];
    want.filter(x => have.indexOf(x) < 0).forEach(x => ev.addGuest(x));
    have.filter(x => want.indexOf(x) < 0).forEach(x => ev.removeGuest(x));
    notes.unshift('수정 반영됨');
    return writeResult_(sh, r, STATUS.DONE, notes.join(' '));
  }

  // ---- 등록 ----
  if (eventId && cal.getEventById(eventId)) {
    return writeResult_(sh, r, STATUS.DONE, '이미 등록된 일정입니다(중복 등록 방지). 변경하려면 상태를 수정대기로 바꾸세요');
  }
  const opts = { description: desc, location: f.place };
  if (guests) { opts.guests = guests; opts.sendInvites = CONFIG.SEND_INVITES; }
  const ev = cal.createEvent(title, f.start, f.end, opts);
  ev.removeAllReminders();
  ev.addPopupReminder(CONFIG.REMINDER_MINUTES);
  sh.getRange(r, COL.EVENT_ID).setValue(ev.getId());

  if (!guests) notes.unshift('등록됨 (이메일 없음 → 초대 메일 미발송)');
  else if (!CONFIG.SEND_INVITES) notes.unshift('등록됨 (SEND_INVITES=false → 메일 미발송)');
  else notes.unshift('등록됨 + 초대 메일 발송: ' + guests + (CONFIG.TEST_EMAIL ? ' (테스트 모드)' : ''));
  writeResult_(sh, r, STATUS.DONE, notes.join(' '));
}

function writeResult_(sh, r, status, note) {
  sh.getRange(r, COL.STATUS).setValue(status);
  const stamp = Utilities.formatDate(new Date(), sh.getParent().getSpreadsheetTimeZone(), 'MM-dd HH:mm');
  sh.getRange(r, COL.NOTE).setValue('[' + stamp + '] ' + note);
}

function getCalendar_() {
  if (!CONFIG.CALENDAR_NAME) return CalendarApp.getDefaultCalendar();
  const found = CalendarApp.getCalendarsByName(CONFIG.CALENDAR_NAME);
  return found.length ? found[0] : CalendarApp.createCalendar(CONFIG.CALENDAR_NAME);
}

// ============================== 입력 해석 / 검증 ==============================
function parseAndValidate_(v, tz) {
  const errors = [];
  const name = String(v[COL.NAME - 1] || '').trim();
  const type = String(v[COL.TYPE - 1] || '').trim();
  const place = String(v[COL.PLACE - 1] || '').trim();
  const phone = String(v[COL.PHONE - 1] || '').trim();
  const emailRaw = String(v[COL.EMAIL - 1] || '').trim();

  if (!name) errors.push('고객명 없음');

  const ymd = toYmd_(v[COL.DATE - 1], tz);
  if (!ymd) errors.push('방문일 형식 오류');

  const st = toHHmm_(v[COL.START - 1], tz);
  if (!st) errors.push('시작 시간 형식 오류');

  let en = null;
  const endRaw = v[COL.END - 1];
  if (endRaw === '' || endRaw === null) { en = 'AUTO'; } else {
    en = toHHmm_(endRaw, tz);
    if (!en) errors.push('종료 시간 형식 오류');
  }

  if (phone && !PHONE_RE.test(phone)) errors.push('연락처 형식 오류(' + phone + ')');

  const emails = emailRaw ? emailRaw.split(/[,;\s]+/).filter(String) : [];
  emails.forEach(x => { if (!EMAIL_RE.test(x)) errors.push('이메일 형식 오류(' + x + ')'); });

  let start = null, end = null;
  if (ymd && st) {
    start = Utilities.parseDate(ymd + ' ' + st, tz, 'yyyy-MM-dd HH:mm');
    if (en === 'AUTO') {
      end = new Date(start.getTime() + CONFIG.DEFAULT_DURATION_MIN * 60000);
    } else if (en) {
      end = Utilities.parseDate(ymd + ' ' + en, tz, 'yyyy-MM-dd HH:mm');
      if (end <= start) errors.push('종료 시간이 시작보다 빠르거나 같음');
    }
    if (start < new Date()) errors.push('이미 지난 일정은 등록하지 않음');
  }
  return { errors: errors, name: name, type: type, place: place, emails: emails, start: start, end: end };
}

/** 날짜 셀(Date 또는 "2026.11.03" 같은 문자열) → 'yyyy-MM-dd' 또는 null */
function toYmd_(val, tz) {
  if (val instanceof Date && !isNaN(val)) return Utilities.formatDate(val, tz, 'yyyy-MM-dd');
  const m = String(val || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return m[1] + '-' + pad2_(mo) + '-' + pad2_(d);
}

/** 시간 셀(Date, 하루 중 비율 숫자, "15:00", "오후 3:00") → 'HH:mm' 또는 null */
function toHHmm_(val, tz) {
  if (val instanceof Date && !isNaN(val)) return Utilities.formatDate(val, tz, 'HH:mm');
  if (typeof val === 'number' && val >= 0 && val < 1) {
    const mins = Math.round(val * 1440);
    return pad2_(Math.floor(mins / 60)) + ':' + pad2_(mins % 60);
  }
  const s = String(val || '').trim();
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m && +m[1] < 24 && +m[2] < 60) return pad2_(+m[1]) + ':' + m[2];
  m = s.match(/^(오전|오후)\s*(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] < 60) {
    let h = +m[2] % 12;
    if (m[1] === '오후') h += 12;
    return pad2_(h) + ':' + m[3];
  }
  return null;
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

// ============================== 원본 시트에서 가져오기 ==============================
/** 원본 시트의 모든 표에서 (이름, 방문일, 방문시간, 전화번호, 구분)을 읽어 새 행만 추가한다. */
function syncFromSource() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) return notify_('"' + CONFIG.SHEET_NAME + '" 시트가 없습니다. 먼저 ① 시트 초기 설정을 실행하세요.');
  if (!CONFIG.SOURCE_URL) return notify_('Code.gs 상단 CONFIG.SOURCE_URL에 원본 시트 주소를 붙여넣어 주세요.');

  const src = SpreadsheetApp.openByUrl(CONFIG.SOURCE_URL);
  const srcSheet = CONFIG.SOURCE_GID
    ? src.getSheets().filter(s => s.getSheetId() === CONFIG.SOURCE_GID)[0]
    : src.getSheets()[0];
  if (!srcSheet) return notify_('원본 시트에서 gid=' + CONFIG.SOURCE_GID + ' 탭을 찾지 못했습니다.');

  const tz = ss.getSpreadsheetTimeZone();
  const found = extractVisits_(srcSheet.getDataRange().getValues(), src.getSpreadsheetTimeZone(), CONFIG.SKIP_TYPES);

  // 이미 시트에 있는 (이름|방문일) 은 건너뜀
  const existing = {};
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, COL.DATE).getValues().forEach(r => {
      const ymd = toYmd_(r[COL.DATE - 1], tz);
      if (r[COL.NAME - 1] && ymd) existing[String(r[COL.NAME - 1]).trim() + '|' + ymd] = true;
    });
  }

  const seen = {}, fresh = [], conflicts = [];
  found.visits.forEach(v => {
    const key = v.name + '|' + v.ymd;
    if (existing[key]) return;
    if (seen[key]) {
      if (seen[key].hhmm !== v.hhmm) conflicts.push(v.name + ' ' + v.ymd + ' (' + seen[key].hhmm + ' vs ' + v.hhmm + ')');
      return;
    }
    seen[key] = v;
    fresh.push(v);
  });

  let startRow = 0;
  if (fresh.length) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) return notify_('다른 처리가 진행 중입니다. 잠시 후 다시 시도하세요.');
    try {
      startRow = Math.max(sh.getLastRow(), 1) + 1;
      const now = new Date();
      const rows = fresh.map(v => {
        const past = Utilities.parseDate(v.ymd + ' ' + v.hhmm, tz, 'yyyy-MM-dd HH:mm') < now;
        const note = '[가져옴] 원본 ' + v.srcRow + '행' + (past ? ' · 지난 일정이라 방문완료로 표시' : '');
        return [v.name, v.type, v.ymd, v.hhmm, '', v.phone, '', '', past ? STATUS.VISITED : CONFIG.IMPORT_STATUS, '', note];
      });
      sh.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
    } finally {
      lock.releaseLock();
    }
    if (CONFIG.IMPORT_STATUS === STATUS.PENDING) processRows_(sh, startRow, startRow + fresh.length - 1);
  }

  const msg = ['새로 가져온 일정: ' + fresh.length + '건'];
  msg.push('[진단] 읽은 탭: "' + srcSheet.getName() + '" (gid=' + srcSheet.getSheetId() + '), 표 머리글 ' + found.headers
    + '개 발견, 원본 일정 ' + found.visits.length + '건, 제외 ' + found.skipped + '건, 중복/이미 있어 건너뜀 '
    + (found.visits.length - fresh.length) + '건');
  if (!found.headers) msg.push('→ 이 탭에서 "방문일"과 "이름"이 함께 있는 머리글 행을 찾지 못했습니다. 일정이 있는 탭의 gid를 SOURCE_GID에 넣어 주세요. (원본 탭 목록: '
    + src.getSheets().map(t => t.getName() + '=' + t.getSheetId()).join(', ') + ')');
  if (found.problems.length) msg.push('가져오지 못한 행(날짜/시간 확인 필요): ' + found.problems.join(', '));
  if (conflicts.length) msg.push('같은 사람·같은 날인데 시간이 다른 중복(먼저 나온 것만 가져옴): ' + conflicts.join(', '));
  notify_(msg.join('\n'));
}

/** 시간 기반 자동 가져오기 트리거를 만든다. */
function installSyncTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncFromSource')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncFromSource').timeBased().everyMinutes(CONFIG.SYNC_EVERY_MINUTES).create();
  notify_('원본 시트를 ' + CONFIG.SYNC_EVERY_MINUTES + '분마다 확인해 새 일정을 가져옵니다.');
}

/**
 * 원본 값(2차원 배열)에서 표를 찾아 방문 일정을 추출한다.
 * "방문일"과 "이름"이 함께 있는 행을 머리글로 보고, 다음 머리글이 나올 때까지의 행을 데이터로 읽는다.
 * 이름이 비어 있는 행은 건너뛰고, 이름은 있는데 날짜/시간이 이상한 행은 problems에 담는다.
 */
function extractVisits_(values, tz, skipTypes) {
  const visits = [], problems = [];
  let headers = 0, skipped = 0;
  skipTypes = skipTypes || [];
  let h = null;
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const labels = row.map(c => String(c === null || c === undefined ? '' : c).trim());
    if (labels.indexOf('방문일') >= 0 && labels.indexOf('이름') >= 0) {
      h = { date: labels.indexOf('방문일'), time: labels.indexOf('방문시간'), name: labels.indexOf('이름'),
            phone: labels.indexOf('전화번호'), type: labels.indexOf('구분') };
      headers++;
      continue;
    }
    if (!h) continue;
    const name = labels[h.name];
    if (!name) continue;
    const type = h.type >= 0 ? labels[h.type] : '';
    if (skipTypes.some(k => k && type.indexOf(k) >= 0)) { skipped++; continue; } // 제외 대상 표
    const ymd = toYmd_(row[h.date], tz);
    const hhmm = h.time >= 0 ? toHHmm_(row[h.time], tz) : null;
    if (!ymd || !hhmm) { problems.push(name + '(원본 ' + (i + 1) + '행)'); continue; }
    let phone = h.phone >= 0 ? row[h.phone] : '';
    if (typeof phone === 'number') { phone = String(phone); if (phone.length === 10 && phone[0] === '1') phone = '0' + phone; }
    visits.push({ name: name, type: type, ymd: ymd, hhmm: hhmm,
                  phone: String(phone || '').trim(), srcRow: i + 1 });
  }
  return { visits: visits, problems: problems, headers: headers, skipped: skipped };
}

/** 화면이 있으면 알림창, 트리거로 실행될 때는 로그만 남긴다. */
function notify_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
