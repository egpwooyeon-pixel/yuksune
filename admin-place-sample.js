// 테스트 데이터: UPFLOW_API_KEY 가 없을 때만 화면 확인용으로 씁니다. (실제 업플로우 데이터가 아닙니다)
// 업플로우 공식 문서를 확인하지 못해서, 사용자가 알려 준 필드 이름(추적 키워드 ID, 플레이스 ID, search_day, rank=0, failed/captcha, checked_range)만 반영한 '추정 형식'입니다.
window.PlaceSample = (function () {
  const kst = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  const ago = n => { const d = new Date(kst() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const rec = (n, rank, o = {}) => ({ search_day: ago(n), rank, status: o.status || "success", checked_range: 300, source: "upflow", search_mode: "standard", device: "mobile", checked_at: ago(n) + "T09:10:00+09:00", metrics: { visitor_review_count: o.v ?? 859 - n * 3, blog_review_count: o.b ?? 123 - n, save_count: o.s ?? 410 - n }, ...(o.x || {}) });
  const series = {
    "900101": [28, 28, 27, 25, 25, 24, 22, 22, 21, 20],              // 상승
    "900102": [4, 4, 5, 5, 6, 7, 9, 10, 12, 25],                     // 급락
    "900103": [null, 0, 0, 0, 0, 0, 0, 0, 0, 8],                      // 미노출 → 10위 안 진입
    "900104": [30, 28, 27, 22, 20, 18, 16, 15, 14, 0],                // 미노출 전환
    "900105": [12, 12, 11, 11, "failed", "captcha", 10, 10, 9, 9],    // 실패 기록 섞임
  };
  const place = { "900101": ["2058364838", "갓구운빵공장 명동점", "베이커리"], "900102": ["2058364838", "갓구운빵공장 명동점", "베이커리"], "900103": ["1802710303", "샘플 한식당 신사점", "한식"], "900104": ["1802710303", "샘플 한식당 신사점", "한식"], "900105": ["2051529393", "샘플 카페 성수점", "카페"] };
  const kwText = { "900101": "명동 빵집", "900102": "명동 베이커리", "900103": "신사역 맛집", "900104": "신사 한식", "900105": "성수 카페" };
  function history(id) {
    const out = []; series[id].forEach((v, i) => {                    // i = 오늘로부터 며칠 전 (오래된 값이 뒤)
      const n = series[id].length - 1 - i;                             // 배열 앞쪽이 오래된 기록
      if (v === null) return;
      if (v === "failed" || v === "captcha") out.push(rec(n, null, { status: v })); else out.push(rec(n, v));
    });
    return out.reverse();
  }
  function make() {
    const ids = Object.keys(series);
    const keywords = ids.map(id => {
      const h = history(id), pickDay = n => h.find(r => r.search_day === ago(n));
      return { id: Number(id), keyword: kwText[id], service: "place", place: { place_id: place[id][0], name: place[id][1], category: place[id][2] }, volume: { total: 1000 + Number(id) % 7 * 300 }, metrics: h[0].metrics,
        ranks_summary: { today: h[0], yesterday: h[1] } };
    });
    const ranks = {}; ids.forEach(id => ranks[id] = history(id));
    return { verify: { ok: true }, keywords, ranks };
  }
  return { make, ago };
})();
