import * as THREE from 'three';

// 외부 모델 없이 기본 도형만으로 만든 우주복 캐릭터.
// group.position = 몸 중심(발에서 1m 위).
export function createAstronaut({ accent = 0xff8a3d } = {}) {
  const group = new THREE.Group();
  const yawG = new THREE.Group();
  const tiltG = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = -1.0;
  group.add(yawG);
  yawG.add(tiltG);
  tiltG.add(body);

  const suit = new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.55, metalness: 0.1 });
  const trim = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 });
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
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  let waveT = 0;
  let phase = 0;
  let walkAmt = 0;
  yawG.rotation.y = Math.PI;
  const wrap = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

  return {
    group,
    wave() { waveT = 2.2; },
    // vel: 속도(m/s), grounded: 땅에 닿아 있는지
    update(dt, t, vel, grounded) {
      const horiz = Math.hypot(vel.x, vel.z);
      if (horiz > 0.4) {
        yawG.rotation.y += wrap(Math.atan2(vel.x, vel.z) - yawG.rotation.y) * Math.min(1, dt * 8);
      }
      const walking = grounded && horiz > 0.4;
      walkAmt += ((walking ? Math.min(1, horiz / 4) : 0) - walkAmt) * Math.min(1, dt * 10);
      if (walking) phase += dt * (4 + horiz * 1.2); // 저중력이라 보폭이 크고 느릿함

      const swing = Math.sin(phase) * 0.75 * walkAmt;
      let lx = swing, rx = -swing, alx = -swing * 0.8, arx = swing * 0.8, alz = 0.08, arz = -0.08;
      if (!grounded) { // 공중: 팔을 벌리고 다리를 벌림
        lx = 0.5; rx = -0.35; alx = -0.2; arx = -0.2; alz = 0.9; arz = -0.9;
      }
      legL.rotation.x += (lx - legL.rotation.x) * Math.min(1, dt * 14);
      legR.rotation.x += (rx - legR.rotation.x) * Math.min(1, dt * 14);
      armL.rotation.x += (alx - armL.rotation.x) * Math.min(1, dt * 14);
      armR.rotation.x += (arx - armR.rotation.x) * Math.min(1, dt * 14);
      armL.rotation.z += (alz - armL.rotation.z) * Math.min(1, dt * 14);
      armR.rotation.z += (arz - armR.rotation.z) * Math.min(1, dt * 14);

      const lean = Math.min(horiz * 0.04, 0.25);
      tiltG.rotation.x += (lean - tiltG.rotation.x) * Math.min(1, dt * 6);
      body.position.y = -1.0 + Math.abs(Math.sin(phase)) * 0.1 * walkAmt;

      if (waveT > 0) {
        waveT -= dt;
        const k = Math.min(1, Math.min(waveT, 2.2 - waveT) * 4);
        armR.rotation.x = -0.1 * k + armR.rotation.x * (1 - k);
        armR.rotation.z = -(Math.PI * 0.8) * k + Math.sin(t * 12) * 0.25 * k + armR.rotation.z * (1 - k);
      }
    },
  };
}
