# 고요의 바다 (space-station)

달 표면에서 사람들이 모여 노는 3D 웹 게임. three.js + Vite, 외부 에셋 없이 코드로만 만들었습니다.

```bash
cd space-station
npm install
npm run dev      # http://localhost:5173
npm run build
```

- 이동: 클릭한 곳으로 걷기 / WASD·방향키 · Shift 달리기 · Space 점프(저중력) · 3 손 흔들기
- 둘러보기: 드래그 · 확대/축소: 휠·핀치
- 걸으면 발자국이 남고, 같이 있는 사람들의 발자국도 보입니다.
- `src/moon.js` 지형·하늘·랜드마크 · `src/astronaut.js` 캐릭터 · `src/net.js` 실시간 접속 · `src/footprints.js` 발자국 · `src/dust.js` 달 먼지

## 멀티플레이
`src/net.js`는 claude.ai 아티팩트의 `room`(presence) 기능을 사용합니다. 아티팩트 링크를 연 사람끼리만 보이고,
그 밖의 환경(로컬 실행, GitHub Pages)에서는 연결이 없어 혼자 플레이로 동작합니다.
GitHub Pages에서 여러 명이 만나려면 외부 실시간 서비스(Supabase Realtime 등)로 `net.js`를 교체해야 합니다.
