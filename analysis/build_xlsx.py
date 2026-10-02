import csv, re, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import FormulaRule
from openpyxl.utils import get_column_letter

FONT = "맑은 고딕"
f_norm = Font(name=FONT, size=10)
f_bold = Font(name=FONT, size=10, bold=True)
f_title = Font(name=FONT, size=14, bold=True)
f_input = Font(name=FONT, size=10, color="0000FF")
f_head = Font(name=FONT, size=10, bold=True, color="FFFFFF")
f_note = Font(name=FONT, size=9, italic=True, color="595959")
fill_head = PatternFill("solid", fgColor="1F3864")
fill_input = PatternFill("solid", fgColor="FFFF00")
fill_buy = PatternFill("solid", bgColor="FF9999", fgColor="FF9999")   # 과매수: 빨강
fill_sell = PatternFill("solid", bgColor="99C2FF", fgColor="99C2FF")  # 과매도: 파랑
thin = Side(style="thin", color="BFBFBF")
box = Border(left=thin, right=thin, top=thin, bottom=thin)
NUM = '#,##0;[Red]-#,##0;0'

# ---------- load raw sheet export ----------
rows = list(csv.reader(open("sheet_raw.csv", encoding="utf-8")))
COLS = ["개인", "외국인", "기관계", "금융투자", "보험", "투신(사모)", "은행", "기타금융기관", "연기금등", "기타법인"]

def num(s):
    s = s.replace("억", "").replace(",", "").strip()
    return int(s) if s not in ("", "-") else 0

def parse(off):
    out = []
    for r in rows[3:]:
        d = r[off].strip()
        m = re.match(r"(\d{4})\. (\d\d)\. (\d\d)\.", d)
        if not m:
            continue
        out.append((dt.date(*map(int, m.groups())), [num(x) for x in r[off + 1:off + 11]]))
    return out

MK = {"코스피": parse(0), "코스닥": parse(13)}
N = len(MK["코스피"])
assert N == len(MK["코스닥"]) == 210
R0, R1 = 4, 3 + N  # data rows

wb = Workbook()
ws_sum = wb.active
ws_sum.title = "요약"

# ---------- daily sheets ----------
def build_daily(name, data):
    ws = wb.create_sheet(f"{name}_일별")
    ws["A1"] = f"{name} 투자자별 일별 순매수 (단위: 억원)"
    ws["A1"].font = f_title
    ws["A2"] = ("파란 글씨 = 원본 시트 값(입력), 검정 = 수식. 기타법인은 2026-08-20 이후 평소의 약 30배로 급증(원인 미확인). "
                "대량 판정 임계값은 '요약' 시트 C5에서 변경.")
    ws["A2"].font = f_note
    heads = ["날짜"] + COLS + ["외국인 |값|", "기관계 |값|",
             "외국인 z점수", "외국인 평소대비(배)", "외국인 구분",
             "기관계 z점수", "기관계 평소대비(배)", "기관계 구분"]
    for j, h in enumerate(heads, 1):
        c = ws.cell(row=3, column=j, value=h)
        c.font, c.fill, c.border = f_head, fill_head, box
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[3].height = 30
    for i, (d, v) in enumerate(data):
        r = R0 + i
        c = ws.cell(row=r, column=1, value=d)
        c.number_format, c.font = "yyyy-mm-dd", f_input
        for j, x in enumerate(v):
            c = ws.cell(row=r, column=2 + j, value=x)
            c.number_format, c.font = NUM, f_input
        ws.cell(row=r, column=12, value=f"=ABS(C{r})")
        ws.cell(row=r, column=13, value=f"=ABS(D{r})")
        # 외국인(C) -> N,O,P ; 기관계(D) -> Q,R,S
        for col, src, absc, zc, mc, kc in (("C", "C", "L", 14, 15, 16), ("D", "D", "M", 17, 18, 19)):
            rng = f"{src}${R0}:{src}${R1}"
            arng = f"{absc}${R0}:{absc}${R1}"
            ws.cell(row=r, column=zc, value=f"=({src}{r}-AVERAGE({rng}))/STDEVP({rng})").number_format = "0.00"
            ws.cell(row=r, column=mc, value=f"={absc}{r}/MEDIAN({arng})").number_format = "0.0"
            zl = get_column_letter(zc)
            ws.cell(row=r, column=kc,
                    value=f'=IF({zl}{r}>=요약!$C$5,"대량매수",IF({zl}{r}<=-요약!$C$5,"대량매도",""))')
        for col in range(12, 20):
            ws.cell(row=r, column=col).font = f_norm
            if col in (12, 13):
                ws.cell(row=r, column=col).number_format = NUM
    widths = [12] + [10] * 10 + [11, 11, 11, 13, 11, 11, 13, 11]
    for j, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.freeze_panes = "B4"
    ws.auto_filter.ref = f"A3:S{R1}"
    # 과매수(대량매수)=빨강, 과매도(대량매도)=파랑 배경. 값 셀과 구분 셀 모두 표시
    fb = Font(name=FONT, bold=True)
    for val_col, kc in (("C", "P"), ("D", "S")):
        for label, fl in (("대량매수", fill_buy), ("대량매도", fill_sell)):
            ws.conditional_formatting.add(f"{val_col}{R0}:{val_col}{R1}",
                FormulaRule(formula=[f'${kc}{R0}="{label}"'], fill=fl, font=fb))
            ws.conditional_formatting.add(f"{kc}{R0}:{kc}{R1}",
                FormulaRule(formula=[f'{kc}{R0}="{label}"'], fill=fl, font=fb))
    return ws

build_daily("코스피", MK["코스피"])
build_daily("코스닥", MK["코스닥"])

# ---------- flagged list (snapshot, threshold 2.0) ----------
import statistics as st
TARGET = [("외국인", 1), ("기관계", 2), ("금융투자", 3), ("투신(사모)", 5), ("연기금등", 8)]
flag_rows = []
for m, data in MK.items():
    for name, idx in TARGET:
        vals = [v[idx] for _, v in data]
        mu, sd = st.mean(vals), st.pstdev(vals)
        mad = st.median([abs(x) for x in vals])
        for (d, v) in data:
            z = (v[idx] - mu) / sd
            if abs(z) >= 2:
                flag_rows.append((m, name, d, "대량매수" if z > 0 else "대량매도", v[idx], round(abs(v[idx]) / mad, 1), round(z, 2)))
flag_rows.sort(key=lambda r: (r[0], r[1], r[2]))
ws_l = wb.create_sheet("대량매매일_목록", 1)
ws_l["A1"] = "유독 많이 사고 판 날 (z점수 ±2 이상, 단위: 억원)"
ws_l["A1"].font = f_title
ws_l["A2"] = ("분석 시점(임계값 2.0) 고정 목록입니다. 임계값을 바꾸면 '코스피_일별'·'코스닥_일별'의 구분 열이 갱신되지만 이 목록은 갱신되지 않습니다. "
              "평소대비 = |순매수| ÷ 전체 기간 |순매수| 중앙값.")
ws_l["A2"].font = f_note
for j, h in enumerate(["시장", "주체", "날짜", "구분", "순매수(억원)", "평소대비(배)", "z점수"], 1):
    c = ws_l.cell(row=3, column=j, value=h)
    c.font, c.fill, c.border = f_head, fill_head, box
    c.alignment = Alignment(horizontal="center")
for i, rw in enumerate(flag_rows):
    r = 4 + i
    for j, x in enumerate(rw, 1):
        c = ws_l.cell(row=r, column=j, value=x)
        c.font = f_norm
        c.border = box
        if j == 3: c.number_format = "yyyy-mm-dd"
        if j == 5: c.number_format = NUM
        if j == 6: c.number_format = "0.0"
        if j == 7: c.number_format = "0.00"
    for col in (4, 5):
        ws_l.cell(row=r, column=col).fill = fill_buy if rw[3] == "대량매수" else fill_sell
        ws_l.cell(row=r, column=col).font = f_bold
for j, w in enumerate([9, 12, 12, 10, 14, 12, 9], 1):
    ws_l.column_dimensions[get_column_letter(j)].width = w
ws_l.freeze_panes = "A4"
ws_l.auto_filter.ref = f"A3:G{3 + len(flag_rows)}"

# ---------- summary ----------
ws = ws_sum
ws["A1"] = "코스피·코스닥 외국인/기관 대량 매매일 분석"
ws["A1"].font = f_title
ws["A2"] = "원본: '우연 수급 게시판' 시트(코스피 탭) · 2025-11-24 ~ 2026-10-02 · 210거래일 · 단위 억원"
ws["A2"].font = f_note
ws["A4"] = "판정 기준"
ws["A4"].font = f_bold
ws["B5"] = "임계값 (z점수)"
ws["B5"].font = f_bold
ws["C5"] = 2.0
ws["C5"].font, ws["C5"].fill = f_input, fill_input
ws["D5"] = "← 수정 가능. z = (그날 순매수 − 전체기간 평균) ÷ 표준편차. 2 이상이면 대량매수, −2 이하면 대량매도."
ws["D5"].font = f_note
ws["B6"] = "평소대비(배) = |그날 순매수| ÷ 전체 기간 |순매수|의 중앙값"
ws["B6"].font = f_note

heads = ["시장", "주체", "대량매수(일)", "대량매도(일)", "최대 순매수(억)", "최대 매수일", "최대 순매도(억)", "최대 매도일"]
for j, h in enumerate(heads, 2):
    c = ws.cell(row=8, column=j, value=h)
    c.font, c.fill, c.border = f_head, fill_head, box
    c.alignment = Alignment(horizontal="center")
combos = [("코스피", "C", "P"), ("코스피", "D", "S"), ("코스닥", "C", "P"), ("코스닥", "D", "S")]
for i, (m, vc, kc) in enumerate(combos):
    r = 9 + i
    sh = f"{m}_일별"
    vr = f"{sh}!${vc}${R0}:${vc}${R1}"
    kr = f"{sh}!${kc}${R0}:${kc}${R1}"
    dr = f"{sh}!$A${R0}:$A${R1}"
    ws.cell(row=r, column=2, value=m)
    ws.cell(row=r, column=3, value="외국인" if vc == "C" else "기관계")
    ws.cell(row=r, column=4, value=f'=COUNTIF({kr},"대량매수")')
    ws.cell(row=r, column=5, value=f'=COUNTIF({kr},"대량매도")')
    ws.cell(row=r, column=6, value=f"=MAX({vr})").number_format = NUM
    ws.cell(row=r, column=7, value=f"=INDEX({dr},MATCH(F{r},{vr},0))").number_format = "yyyy-mm-dd"
    ws.cell(row=r, column=8, value=f"=MIN({vr})").number_format = NUM
    ws.cell(row=r, column=9, value=f"=INDEX({dr},MATCH(H{r},{vr},0))").number_format = "yyyy-mm-dd"
    for j in range(2, 10):
        c = ws.cell(row=r, column=j)
        c.font, c.border = f_norm, box
        c.alignment = Alignment(horizontal="center")

ws["A14"] = "주요 관찰 (분석 시점 고정 텍스트)"
ws["A14"].font = f_bold
notes = [
    "[확인] 코스피 외국인 대량 매도 10일 중 7일이 5~6월에 집중. 최대 매도는 6/29(−7.73조), 유일한 대량 매수는 7/31(+7.24조).",
    "[확인] 이번 9월 외국인 매도(9/28~10/02 5일 합 −9.0조)는 하루 규모가 평소의 3배 수준이라 대량 매도일 목록에는 없음. 규모보다 연속성이 특징.",
    "[확인] 코스닥 9/10: 외국인 −1.13조(z −3.92), 기관 +1.40조(z +3.19). 투신 +1.27조가 기관 매수 대부분.",
    "[확인] 코스닥 기관 1/26~1/30 5일 연속 대량 매수(합계 약 +10조, 최대 18배). 원인은 미확인.",
    "[추정] 6/23~6/29 일주일 안에 기관(−4.48조, −4.12조)과 외국인(−7.73조)의 대량 매도가 몰림. 지수 등락률 데이터가 있어야 확정 가능.",
    "[주의] 코스피 '기타법인'은 2026-08-20 이후 매일 약 +1.6조(이전 중앙값 +511억). 8/20 이후 외국인·개인 순매도의 상대편이 이 열. 원인 미확인.",
    "[한계] 기준이 전체 기간 단일 값이라 변동성이 큰 2~6월이 많이 잡히고 조용한 시기의 큰 날은 덜 잡힘. 매수·매도 권유가 아닌 데이터 정리용.",
]
for i, t in enumerate(notes):
    c = ws.cell(row=15 + i, column=2, value=t)
    c.font = f_norm
    c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(start_row=15 + i, start_column=2, end_row=15 + i, end_column=9)
    ws.row_dimensions[15 + i].height = 30
for j, w in enumerate([3, 12, 12, 14, 14, 16, 13, 16, 13], 1):
    ws.column_dimensions[get_column_letter(j)].width = w
for row in ws.iter_rows(min_row=1, max_row=6):
    for c in row:
        if c.font == Font():  # default
            c.font = f_norm

wb.calculation.fullCalcOnLoad = True  # 열 때 전체 재계산
wb.save("수급_대량매매일_분석.xlsx")
print("saved", len(flag_rows), "flagged rows")
