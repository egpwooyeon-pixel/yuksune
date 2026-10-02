import csv,re,statistics as st
rows=list(csv.reader(open('sheet_raw.csv',encoding='utf-8')))
COLS=['개인','외국인','기관계','금융투자','보험','투신','은행','기타금융','연기금','기타법인']
def num(s):
    s=s.replace('억','').replace(',','').strip()
    return int(s) if s not in('','-') else 0
def parse(off):
    out={}
    for r in rows[3:]:
        d=r[off].strip()
        if not re.match(r'\d{4}\. \d\d\. \d\d\.',d): continue
        out[d.replace('. ','-').rstrip('.')]=dict(zip(COLS,[num(x) for x in r[off+1:off+11]]))
    return out
MK={'코스피':parse(0),'코스닥':parse(13)}
TARGET=['외국인','기관계','금융투자','투신','연기금']
res=[]
for m,data in MK.items():
    dates=sorted(data)
    for c in TARGET:
        vals=[data[d][c] for d in dates]
        mu=st.mean(vals); sd=st.pstdev(vals); mad=st.median([abs(v) for v in vals])
        for d,v in zip(dates,vals):
            z=(v-mu)/sd
            res.append(dict(시장=m,주체=c,날짜=d,순매수_억=v,z점수=round(z,2),평소대비배수=round(abs(v)/mad,1),구분=('대량매수' if z>=2 else '대량매도' if z<=-2 else '')))
with open('unusual_days_all.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=list(res[0])); w.writeheader(); w.writerows(res)
flag=[r for r in res if r['구분']]
with open('unusual_days_flagged.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=list(res[0])); w.writeheader(); w.writerows(sorted(flag,key=lambda r:(r['시장'],r['주체'],r['날짜'])))
for m in MK:
  for c in TARGET:
    sub=[r for r in res if r['시장']==m and r['주체']==c]
    vals=[r['순매수_억'] for r in sub]
    print(f"\n## {m} {c}: n={len(vals)} 평균 {st.mean(vals):.0f} 표준편차 {st.pstdev(vals):.0f} 중앙|값| {st.median([abs(v) for v in vals]):.0f}억, 대량매수 {sum(r['구분']=='대량매수' for r in sub)}일 대량매도 {sum(r['구분']=='대량매도' for r in sub)}일")
    if c in('외국인','기관계'):
        for r in sorted(sub,key=lambda r:r['z점수'])[:6]: print('  매도',r['날짜'],r['순매수_억'],'z',r['z점수'],'x',r['평소대비배수'])
        for r in sorted(sub,key=lambda r:-r['z점수'])[:6]: print('  매수',r['날짜'],r['순매수_억'],'z',r['z점수'],'x',r['평소대비배수'])
