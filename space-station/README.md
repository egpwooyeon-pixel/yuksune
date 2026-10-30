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

## 누구나 접속하는 공개 배포 (GitHub Pages + Supabase)
1. https://supabase.com 에서 무료 프로젝트를 만들고 Settings > API 의 `Project URL`과 `anon public` 키를 복사합니다.
   (별도 테이블은 필요 없습니다. Realtime의 Broadcast/Presence만 사용합니다.)
2. GitHub 저장소 Settings > Secrets and variables > Actions > **Variables** 에
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 를 추가합니다.
3. 이 브랜치를 `main`에 머지하면 `.github/workflows/deploy-pages.yml`이 홈페이지와 함께
   게임을 `https://<계정>.github.io/yuksune/moon/` 에 올립니다.
4. 로컬에서 시험하려면 `.env.example`을 `.env.local`로 복사해 값을 채우고 `npm run dev`.

방은 주소 뒤에 `#이름`을 붙여 나눌 수 있습니다(예: `.../moon/#team-a`). 기본은 `lobby` 하나입니다.
Supabase 무료 플랜의 초당 메시지 한도 때문에 위치는 초당 5번만 보내고, 동시에 10~20명 안팎이 현실적인 규모입니다.
