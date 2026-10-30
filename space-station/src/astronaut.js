import * as THREE from 'three';

// 외부 모델 없이 기본 도형만으로 만든 우주복 캐릭터
export function createAstronaut() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

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
  let walkPhase = 0;
  let walkAmt = 0;
  let targetYaw = 0;
  body.rotation.y = Math.PI; // 처음엔 창(-z)을 바라봄

  return {
    group,
    wave() { waveT = 2.2; },
    faceTo(yaw, dt) {
      targetYaw = yaw;
      let d = ((targetYaw - body.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      body.rotation.y += d * Math.min(1, dt * 12);
    },
    update(dt, t, moving) {
      walkAmt += ((moving ? 1 : 0) - walkAmt) * Math.min(1, dt * 10);
      if (moving) walkPhase += dt * 9;
      const swing = Math.sin(walkPhase) * 0.7 * walkAmt;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
      body.position.y = Math.abs(Math.sin(walkPhase)) * 0.05 * walkAmt + Math.sin(t * 1.6) * 0.008;
      head.rotation.z = Math.sin(t * 0.8) * 0.02;

      if (waveT > 0) {
        waveT -= dt;
        const k = Math.min(1, Math.min(waveT, 2.2 - waveT) * 4); // 올렸다 내리는 부드러운 전환
        armR.rotation.x = 0;
        armR.rotation.z = -(Math.PI * 0.8) * k + Math.sin(t * 12) * 0.25 * k;
      } else {
        armR.rotation.z = 0;
      }
    },
  };
}
