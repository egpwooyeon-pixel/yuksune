import * as THREE from 'three';

export const BOUND = 46;       // 걸어 다닐 수 있는 반경(m)
export const OBSTACLES = [];   // {x, z, r, top}
const NEAR_R = 70;

// ---- 노이즈 ----
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 5) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += valueNoise(x * f, y * f) * amp; f *= 2; amp *= 0.5; }
  return s;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- 지형 높이 (모든 곳에서 같은 함수를 씀) ----
const CRATERS = [];
(() => {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  while (CRATERS.length < 16) {
    const r = 4 + rnd() * 10, a = rnd() * Math.PI * 2, d = 20 + rnd() * 42;
    const c = { x: Math.cos(a) * d, z: Math.sin(a) * d, r, d: r * 0.16 };
    // 랜드마크 자리와 겹치지 않게
    if (CRATERS.every((o) => Math.hypot(o.x - c.x, o.z - c.z) > o.r + c.r + 2)
      && Math.hypot(c.x + 24, c.z + 20) > r + 8 && Math.hypot(c.x - 26, c.z + 16) > r + 8) CRATERS.push(c);
  }
})();

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const flat = smooth(7, 16, r);
  let h = (fbm(x / 14 + 3, z / 14 + 7, 4) - 0.5) * 1.6 * flat;
  h += (fbm(x / 3.2, z / 3.2, 3) - 0.5) * 0.18 * flat;
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d > c.r * 1.8) continue;
    const u = d / c.r;
    if (u < 1) h -= c.d * (1 - u * u);
    h += c.d * 0.4 * Math.exp(-(((u - 1) / 0.25) ** 2));
  }
  const m = smooth(140, 800, r);
  if (m > 0) h += m * (8 + fbm(x / 160 + 9, z / 160 + 4, 5) * 120);
  return h;
}

// 극좌표 원판 메시. 바깥으로 갈수록 간격이 넓어짐.
function polarDisc(r0, r1, nR, nT, power) {
  const pos = [], nor = [], uv = [], idx = [];
  const e = 0.25;
  for (let i = 0; i <= nR; i++) {
    const r = r0 + (r1 - r0) * Math.pow(i / nR, power);
    for (let j = 0; j < nT; j++) {
      const a = (j / nT) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, heightAt(x, z), z);
      const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
      const n = new THREE.Vector3(-dx / (2 * e), 1, -dz / (2 * e)).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(x / 7, z / 7);
    }
  }
  for (let i = 0; i < nR; i++) {
    for (let j = 0; j < nT; j++) {
      const a = i * nT + j, b = i * nT + (j + 1) % nT, c = (i + 1) * nT + j, d = (i + 1) * nT + (j + 1) % nT;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function regolithTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // 가장자리에서 이어지도록 반복 가능한 노이즈 대신 해시 기반 입자 + 저주파 얼룩
      const n = hash(x * 0.9, y * 1.1) * 0.5 + valueNoise(x / 16, y / 16) * 0.35 + valueNoise(x / 64, y / 64) * 0.4;
      const v = 150 + (n - 0.6) * 90;
      const i = (y * S + x) * 4;
      img.data[i] = v; img.data[i + 1] = v - 3; img.data[i + 2] = v - 9; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function earthTextures() {
  const W = 1024, H = 512;
  const land = document.createElement('canvas');
  land.width = W; land.height = H;
  const lc = land.getContext('2d');
  const img = lc.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 110, y / 110);
      const lat = Math.abs(y / H - 0.5) * 2;
      let r, g, b;
      if (n > 0.52) {
        const h = (n - 0.52) * 4;
        r = 60 + h * 120; g = 110 + h * 50; b = 55 + h * 40;
        if (lat > 0.82) r = g = b = 235;
      } else {
        const d = Math.max(0, 0.52 - n);
        r = 10; g = 45 + (1 - d * 3) * 40; b = 110 + (1 - d * 3) * 60;
        if (lat > 0.9) r = g = b = 225;
      }
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  lc.putImageData(img, 0, 0);
  const cloud = document.createElement('canvas');
  cloud.width = W; cloud.height = H;
  const cc = cloud.getContext('2d');
  const cimg = cc.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 70 + 40, y / 50 + 10);
      const a = Math.max(0, Math.min(1, (n - 0.5) * 4));
      const i = (y * W + x) * 4;
      cimg.data[i] = cimg.data[i + 1] = cimg.data[i + 2] = 255;
      cimg.data[i + 3] = a * 210;
    }
  }
  cc.putImageData(cimg, 0, 0);
  const t1 = new THREE.CanvasTexture(land), t2 = new THREE.CanvasTexture(cloud);
  for (const t of [t1, t2]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
  return { land: t1, cloud: t2 };
}

function glowSprite(color, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color); grad.addColorStop(0.25, color.replace('1)', '0.35)')); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  return s;
}

export function buildMoon(scene) {
  const updaters = [];
  const SUN = new THREE.Vector3(0.75, 0.28, 0.6).normalize();

  // ---- 빛 ----
  const sun = new THREE.DirectionalLight(0xfff3e2, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -30; sc.right = sc.top = 30; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0x5d7096, 0x2a2724, 0.85));

  // ---- 땅 ----
  const tex = regolithTexture();
  const groundMat = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.0, color: 0xc9c5bd, roughness: 1, metalness: 0 });
  const near = new THREE.Mesh(polarDisc(0, NEAR_R, 130, 256, 1), groundMat);
  near.receiveShadow = true;
  const far = new THREE.Mesh(polarDisc(NEAR_R, 1300, 70, 256, 2.4), groundMat);
  scene.add(near, far);

  // ---- 하늘: 별, 해, 지구 ----
  const N = 3500, spos = new Float32Array(N * 3), scol = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    spos.set([r * Math.cos(a) * 1800, u * 1800, r * Math.sin(a) * 1800], i * 3);
    const k = 0.5 + Math.random() * 0.5;
    scol.set([k, k, Math.min(1, k + 0.1)], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true })));

  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(34, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfffaf0 }));
  sunDisc.position.copy(SUN).multiplyScalar(1600);
  const sunGlow = glowSprite('rgba(255,244,220,1)', 420);
  sunGlow.position.copy(sunDisc.position);
  scene.add(sunDisc, sunGlow);

  const et = earthTextures();
  const earth = new THREE.Group();
  earth.position.set(-350, 380, -800);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(140, 96, 64), new THREE.MeshStandardMaterial({ map: et.land, roughness: 0.9 }));
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(141.4, 96, 64), new THREE.MeshStandardMaterial({ map: et.cloud, transparent: true, depthWrite: false }));
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(148, 64, 48), new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.2, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  earth.add(globe, clouds, atmo);
  scene.add(earth);
  updaters.push((dt) => { globe.rotation.y += dt * 0.02; clouds.rotation.y += dt * 0.028; });

  // ---- 바위 ----
  const rockGeos = [];
  for (let k = 0; k < 6; k++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = 0.75 + hash(p.getX(i) * 9 + k, p.getZ(i) * 7 + p.getY(i) * 3) * 0.5;
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.72, p.getZ(i) * s);
    }
    g.computeVertexNormals();
    rockGeos.push(g);
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8a85, roughness: 1, flatShading: true });
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function rock(x, z, s, tall = 1) {
    const m = new THREE.Mesh(rockGeos[Math.floor(rnd() * rockGeos.length)], rockMat);
    const y = heightAt(x, z);
    m.position.set(x, y + s * 0.2, z);
    m.scale.set(s, s * tall, s * (0.8 + rnd() * 0.4));
    m.rotation.y = rnd() * 6.28;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    if (s > 0.6) OBSTACLES.push({ x, z, r: s * 0.85, top: y + s * 0.9 * tall });
    return m;
  }
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, d = 10 + Math.sqrt(rnd()) * 56;
    rock(Math.cos(a) * d, Math.sin(a) * d, 0.25 + Math.pow(rnd(), 3) * 1.6);
  }
  for (let i = 0; i < 10; i++) {
    const a = rnd() * Math.PI * 2, d = 30 + rnd() * 50;
    rock(Math.cos(a) * d, Math.sin(a) * d, 2.2 + rnd() * 1.8, 1.2);
  }

  // ---- 모임터 (중앙) ----
  const plaza = new THREE.Group();
  scene.add(plaza);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.45, 96).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = heightAt(0, 5.3) + 0.05;
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.2, 64).rotateX(-Math.PI / 2), ringMat);
  ring2.position.y = heightAt(0, 2.2) + 0.05;
  plaza.add(ring, ring2);
  for (let i = 0; i < 8; i++) { // 둘러앉는 돌의자
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const x = Math.cos(a) * 6.8, z = Math.sin(a) * 6.8;
    const m = rock(x, z, 0.95, 0.6);
    m.scale.x = 1.4;
    OBSTACLES.push({ x, z, r: 0.9, top: heightAt(x, z) + 0.45 });
  }
  const y0 = heightAt(0, 0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 10), new THREE.MeshStandardMaterial({ color: 0xd8dde0, metalness: 0.8, roughness: 0.35 }));
  pole.position.set(0, y0 + 2.1, 0);
  const flagTex = (() => {
    const c = document.createElement('canvas'); c.width = 192; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f2f4f5'; g.fillRect(0, 0, 192, 128);
    g.fillStyle = '#1d3b6e'; g.beginPath(); g.arc(96, 64, 38, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f2f4f5'; g.beginPath(); g.arc(110, 56, 34, 0, Math.PI * 2); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  flagTex.colorSpace = THREE.SRGBColorSpace;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 1 }));
  flag.position.set(0.9, y0 + 3.5, 0);
  flag.castShadow = true;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.6, roughness: 0.5 }));
  base.position.set(0, y0 + 0.1, 0);
  pole.castShadow = base.castShadow = true;
  plaza.add(pole, flag, base);
  OBSTACLES.push({ x: 0, z: 0, r: 0.5, top: y0 + 4.2 });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 90, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  beam.position.set(0, y0 + 45, 0);
  plaza.add(beam);
  updaters.push((dt, t) => { ringMat.opacity = 0.6 + Math.sin(t * 1.4) * 0.2; });

  // ---- 착륙선 ----
  {
    const lx = -24, lz = -20, ly = heightAt(lx, lz);
    const g = new THREE.Group();
    g.position.set(lx, ly, lz);
    g.rotation.y = 0.5;
    const gold = new THREE.MeshStandardMaterial({ color: 0xc89b3c, metalness: 0.9, roughness: 0.3 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 0.7, roughness: 0.45 });
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 1.6, 8), gold);
    stage.position.y = 2.1;
    const cabin = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 1.5, 8), silver);
    cabin.position.y = 3.6;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.2), new THREE.MeshStandardMaterial({ color: 0x0a1620, metalness: 1, roughness: 0.1 }));
    win.position.set(0, 3.7, 1.6);
    g.add(stage, cabin, win);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 6), silver);
      leg.position.set(Math.cos(a) * 2.4, 1.35, Math.sin(a) * 2.4);
      leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.1, 12), silver);
      pad.position.set(Math.cos(a) * 3.1, 0.05, Math.sin(a) * 3.1);
      g.add(leg, pad);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    OBSTACLES.push({ x: lx, z: lz, r: 3.3, top: ly + 4.4 });
  }

  // ---- 거주 돔 ----
  {
    const dx = 26, dz = -16, dy = heightAt(dx, dz);
    const g = new THREE.Group();
    g.position.set(dx, dy, dz);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.6, metalness: 0.2 }));
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2, 0.4), new THREE.MeshStandardMaterial({ color: 0x2c343b, roughness: 0.5, metalness: 0.7 }));
    door.position.set(0, 1, 3.9);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: 0x4dff9a }));
    lamp.position.set(0, 2.4, 4.0);
    g.add(dome, door, lamp);
    g.rotation.y = -0.8;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    OBSTACLES.push({ x: dx, z: dz, r: 4.1, top: dy + 4 });
  }

  const sunOffset = SUN.clone().multiplyScalar(80);
  return {
    near,
    update(dt, t, focus) {
      for (const u of updaters) u(dt, t);
      // 그림자 영역이 플레이어를 따라다니게
      sun.target.position.copy(focus);
      sun.position.copy(focus).add(sunOffset);
    },
  };
}
