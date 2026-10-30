import * as THREE from 'three';

// 외부 모델 없이 기본 도형만으로 만든 우주복 캐릭터.
// group.position = 몸 중심(무중력이라 발이 아니라 중심 기준).
export function createAstronaut() {
  const group = new THREE.Group();
  const yawG = new THREE.Group();   // 바라보는 방향(좌우)
  const tiltG = new THREE.Group();  // 이동 방향으로 기울기
  const body = new THREE.Group();
  body.position.y = -1.0;           // 모델 원점(발)을 몸 중심으로 옮김
  group.add(yawG);
  yawG.add(tiltG);
  tiltG.add(body);

  const suit = new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.55, metalness: 0.1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.5 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x0a1822, roughness: 0.1, metalness: 0.9, emissive: 0x0b3b52, emissiveIntensity: 0.6 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.45, 6, 14), suit);
  torso.position.y = 1.05;
  body.add(torso);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.07, 18), trim);
  belt.position.y = 0.88;
  body.add(belt);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.2), new THREE.MeshStandardMaterial({ color: 0xaab4bb, roughness: 0.6 }));
  pack.position.set(0, 1.12, -0.33);
  body.add(pack);
  for (const x of [-0.12, 0.12]) { // 등짐 추진 노즐
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.1, 10), trim);
    nozzle.position.set(x, 0.8, -0.35);
    body.add(nozzle);
  }

  const head = new THREE.Group();
  head.position.y = 1.62;
  body.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18), suit));
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18, Math.PI / 2 - Math.PI / 2.2, Math.PI / 1.1, Math.PI * 0.2, Math.PI * 0.55), visor);
  face.scale.set(1.08, 1, 1.08);
  face.position.z = 0.1;
  head.add(face);

  function limb(radius, length, x, y, mat) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat);
    mesh.position.y = -(length / 2 + radius * 0.6);
    pivot.add(mesh);
    body.add(pivot);
    return pivot;
  }
  const armL = limb(0.1, 0.4, -0.4, 1.3, suit);
  const armR = limb(0.1, 0.4, 0.4, 1.3, suit);
  const legL = limb(0.12, 0.45, -0.15, 0.78, suit);
  const legR = limb(0.12, 0.45, 0.15, 0.78, suit);
  for (const leg of [legL, legR]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.34), trim);
    boot.position.set(0, -0.72, 0.05);
    leg.add(boot);
  }

  let waveT = 0;
  yawG.rotation.y = Math.PI; // 처음엔 창(-z)을 바라봄

  const wrap = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

  return {
    group,
    wave() { waveT = 2.2; },
    // vel: 현재 속도. 수평 속도가 있으면 그쪽을 바라보고, 이동 방향으로 몸을 기울인다.
    update(dt, t, vel) {
      const horiz = Math.hypot(vel.x, vel.z);
      if (horiz > 0.5) {
        const target = Math.atan2(vel.x, vel.z);
        yawG.rotation.y += wrap(target - yawG.rotation.y) * Math.min(1, dt * 4);
      }
      const lean = Math.min(horiz * 0.09, 0.55) - THREE.MathUtils.clamp(vel.y * 0.06, -0.35, 0.35);
      tiltG.rotation.x += (lean - tiltG.rotation.x) * Math.min(1, dt * 5);
      tiltG.rotation.z = Math.sin(t * 0.7) * 0.06;
      body.position.y = -1.0 + Math.sin(t * 1.3) * 0.05;

      // 무중력 자세: 팔다리가 앞으로 살짝 떠 있고 천천히 일렁임
      const sway = Math.sin(t * 1.4);
      legL.rotation.x = 0.25 + sway * 0.12;
      legR.rotation.x = 0.35 - sway * 0.12;
      armL.rotation.x = -0.45 + Math.sin(t * 1.1 + 1) * 0.1;
      armR.rotation.x = -0.45 + Math.sin(t * 1.1) * 0.1;
      armL.rotation.z = 0.25;
      armR.rotation.z = -0.25;
      head.rotation.x = -tiltG.rotation.x * 0.5;

      if (waveT > 0) {
        waveT -= dt;
        const k = Math.min(1, Math.min(waveT, 2.2 - waveT) * 4);
        armR.rotation.x = -0.45 * (1 - k);
        armR.rotation.z = -(Math.PI * 0.8) * k + Math.sin(t * 12) * 0.25 * k;
      }
    },
  };
}
