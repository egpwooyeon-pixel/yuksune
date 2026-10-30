# 정거장 (space-station)

3D 우주정거장을 걸어 다니는 웹 게임 (1단계: 혼자 이동). three.js + Vite. 외부 에셋 없이 코드로만 만들었습니다.

```bash
cd space-station
npm install
npm run dev      # http://localhost:5173
npm run build
```

- 이동: 바닥 클릭 / WASD·방향키 · 둘러보기: 드래그 · 확대/축소: 휠·핀치 · 손 흔들기: 3
- `src/station.js` 정거장(방, 지구, 소품) · `src/astronaut.js` 캐릭터 · `src/audio.js` 환경음

다음 단계: 방 더 늘리기, 행동 추가, 그다음 실시간 멀티플레이.
