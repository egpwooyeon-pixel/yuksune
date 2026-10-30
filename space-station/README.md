# 정거장 (space-station)

3D 우주정거장을 무중력으로 떠다니는 웹 게임 (현재: 혼자 이동). three.js + Vite. 외부 에셋 없이 코드로만 만들었습니다.

```bash
cd space-station
npm install
npm run dev      # http://localhost:5173
npm run build
```

- 이동: 클릭한 곳으로 떠가기 / WASD·방향키(보는 방향으로 추진) · Space·E 위 · Shift·Q 아래
- 둘러보기: 드래그 · 확대/축소: 휠·핀치 · 손 흔들기: 3
- 관성이 있어 멈추려면 반대로 밀거나 기다려야 하고, 벽·가구에 부딪히면 튕깁니다.
- `src/station.js` 정거장(방, 지구, 소품) · `src/astronaut.js` 캐릭터 · `src/audio.js` 환경음

다음 단계: 방 더 늘리기, 행동 추가, 그다음 실시간 멀티플레이(GitHub Pages는 정적 호스팅이라 외부 실시간 서비스가 필요).
