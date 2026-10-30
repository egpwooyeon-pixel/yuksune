import * as THREE from 'three';

// 달 먼지: 대기가 없어서 위로 튀었다가 천천히 가라앉음
export function createDust(scene) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(200,196,188,0.9)'); grad.addColorStop(1, 'rgba(200,196,188,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);

  const pool = [];
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    scene.add(s);
    pool.push({ s, v: new THREE.Vector3(), life: 0, max: 1 });
  }
  let next = 0;
  return {
    emit(pos, n, speed = 1.2) {
      for (let i = 0; i < n; i++) {
        const d = pool[next++ % pool.length];
        d.s.position.copy(pos);
        d.s.position.x += (Math.random() - 0.5) * 0.4;
        d.s.position.z += (Math.random() - 0.5) * 0.4;
        d.v.set((Math.random() - 0.5) * speed * 2, 0.4 + Math.random() * speed, (Math.random() - 0.5) * speed * 2);
        d.life = d.max = 1.2 + Math.random() * 0.8;
        d.s.visible = true;
      }
    },
    update(dt) {
      for (const d of pool) {
        if (d.life <= 0) continue;
        d.life -= dt;
        if (d.life <= 0) { d.s.visible = false; continue; }
        d.v.y -= 1.0 * dt;
        d.v.multiplyScalar(Math.exp(-0.8 * dt));
        d.s.position.addScaledVector(d.v, dt);
        const k = d.life / d.max;
        d.s.material.opacity = k * 0.55;
        d.s.scale.setScalar(0.5 + (1 - k) * 1.1);
      }
    },
  };
}
