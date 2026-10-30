import * as THREE from 'three';

export const ROOM = { halfX: 16, halfZ: 11, height: 7 };
export const OBSTACLES = [];

function box(minX, maxX, minZ, maxZ) {
  OBSTACLES.push({ minX, maxX, minZ, maxZ });
}

// ---- 절차적 텍스처 ----
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
function fbm(x, y) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 5; i++) { s += valueNoise(x * f, y * f) * amp; f *= 2; amp *= 0.5; }
  return s;
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
        r = 60 + h * 120; g = 110 + h * 50; b = 55 + h * 40;       // 땅
        if (lat > 0.82) { r = g = b = 235; }                         // 극지방 얼음
      } else {
        const d = Math.max(0, 0.52 - n);
        r = 10; g = 45 + (1 - d * 3) * 40; b = 110 + (1 - d * 3) * 60; // 바다
        if (lat > 0.9) { r = g = b = 225; }
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

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#46515a'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#161b20'; g.lineWidth = 4;
  g.strokeRect(2, 2, 252, 252);
  g.strokeStyle = 'rgba(95,227,255,.18)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.04)';
  for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ROOM.halfX * 2 / 4, ROOM.halfZ * 2 / 4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildStation(scene) {
  const { halfX: HX, halfZ: HZ, height: H } = ROOM;
  const updaters = [];

  const hull = new THREE.MeshStandardMaterial({ color: 0x8a949c, roughness: 0.6, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2128, roughness: 0.7, metalness: 0.4 });
  const glow = (color, intensity = 1.6) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity });

  // 조명
  scene.add(new THREE.AmbientLight(0x8fa3b5, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
  sun.position.set(-30, 40, 60);
  scene.add(sun);

  // 바닥 / 천장
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), dark);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  scene.add(ceiling);

  // 천장 조명 띠
  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(HX * 2 - 4, 0.08, 0.5), glow(0xcfeaff, 1.4));
    strip.position.set(0, H - 0.05, i * 4.4);
    scene.add(strip);
  }

  // 벽 (동·서·남) + 늑골
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6f7b85, roughness: 0.65, metalness: 0.35 });
  const wall = (w, h, d, x, y, z, mat = wallMat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  wall(0.4, H, HZ * 2, -HX - 0.2, H / 2, 0);
  wall(0.4, H, HZ * 2, HX + 0.2, H / 2, 0);
  wall(HX * 2, H, 0.4, 0, H / 2, HZ + 0.2);
  for (let x = -HX + 4; x <= HX - 4; x += 4) wall(0.5, H, 0.5, x, H / 2, HZ - 0.15, hull);
  for (let z = -HZ + 4; z <= HZ - 4; z += 4) {
    wall(0.5, H, 0.5, -HX + 0.15, H / 2, z, hull);
    wall(0.5, H, 0.5, HX - 0.15, H / 2, z, hull);
  }
  // 벽 아래쪽 조명 띠
  wall(HX * 2, 0.08, 0.1, 0, 0.18, HZ - 0.05, glow(0x5fe3ff, 1.2));
  wall(0.1, 0.08, HZ * 2, -HX + 0.05, 0.18, 0, glow(0x5fe3ff, 1.2));
  wall(0.1, 0.08, HZ * 2, HX - 0.05, 0.18, 0, glow(0x5fe3ff, 1.2));

  // 남쪽 벽 해치(장식)
  for (const x of [-8, 8]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.13, 12, 40), hull);
    ring.position.set(x, 2.2, HZ - 0.05);
    scene.add(ring);
    const door = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), new THREE.MeshStandardMaterial({ color: 0x2c343b, roughness: 0.5, metalness: 0.7 }));
    door.position.set(x, 2.2, HZ - 0.08);
    door.rotation.y = Math.PI;
    scene.add(door);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), glow(0x4dff9a, 2));
    lamp.position.set(x, 3.9, HZ - 0.15);
    scene.add(lamp);
  }

  // 북쪽 벽: 거대한 관측창
  const winBottom = 1.2, winTop = 6;
  wall(HX * 2, winBottom, 0.4, 0, winBottom / 2, -HZ - 0.2);
  wall(HX * 2, H - winTop, 0.4, 0, (H + winTop) / 2, -HZ - 0.2);
  for (let x = -HX; x <= HX; x += HX / 2) wall(0.6, winTop - winBottom, 0.5, x, (winTop + winBottom) / 2, -HZ - 0.1, hull);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(HX * 2, winTop - winBottom),
    new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.05, roughness: 0, metalness: 0.2, depthWrite: false })
  );
  glass.position.set(0, (winTop + winBottom) / 2, -HZ - 0.02);
  scene.add(glass);

  // ---- 창밖: 별, 지구 ----
  const starGeo = new THREE.BufferGeometry();
  const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([r * Math.cos(a) * 300, u * 300, r * Math.sin(a) * 300], i * 3);
    const k = 0.55 + Math.random() * 0.45;
    col.set([k, k, Math.min(1, k + 0.12)], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors: true, fog: false }));
  scene.add(stars);

  const tex = earthTextures();
  const earth = new THREE.Group();
  earth.position.set(6, -52, -105);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(60, 96, 64), new THREE.MeshStandardMaterial({ map: tex.land, roughness: 0.9 }));
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(60.6, 96, 64), new THREE.MeshStandardMaterial({ map: tex.cloud, transparent: true, depthWrite: false, roughness: 1 }));
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(63.5, 64, 48),
    new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.22, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  earth.add(globe, clouds, atmo);
  scene.add(earth);
  updaters.push((dt) => {
    globe.rotation.y += dt * 0.012;
    clouds.rotation.y += dt * 0.017;
    stars.rotation.y += dt * 0.0006;
  });

  // ---- 중앙 홀로그램 기둥 ----
  const column = new THREE.Group();
  column.position.set(0, 0, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.3, 0.5, 40), hull);
  base.position.y = 0.25;
  const top = base.clone();
  top.position.y = H - 0.25;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, H - 1, 40, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  beam.position.y = H / 2;
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: 0xbff4ff, wireframe: true }));
  core.position.y = 2.6;
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.04, 8, 64), glow(0x5fe3ff, 2.5));
  const ringB = ringA.clone();
  ringA.position.y = 1.6; ringB.position.y = 3.8;
  ringA.rotation.x = ringB.rotation.x = Math.PI / 2;
  column.add(base, top, beam, core, ringA, ringB);
  scene.add(column);
  box(-2.2, 2.2, -2.2, 2.2);
  const coreLight = new THREE.PointLight(0x5fe3ff, 40, 16, 1.6);
  coreLight.position.set(0, 2.6, 0);
  scene.add(coreLight);
  updaters.push((dt, t) => {
    core.rotation.y += dt * 0.6;
    core.rotation.x += dt * 0.3;
    ringA.rotation.z += dt * 0.5;
    ringB.rotation.z -= dt * 0.4;
    ringA.position.y = 1.6 + Math.sin(t * 0.7) * 0.15;
    ringB.position.y = 3.8 + Math.cos(t * 0.7) * 0.15;
    coreLight.intensity = 38 + Math.sin(t * 2) * 4;
  });

  // ---- 콘솔 (동·서쪽 벽) ----
  const screens = [];
  function console_(x, z, faceX) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 2.6), dark);
    body.position.y = 0.5;
    const slope = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 2.5), hull);
    slope.position.set(-faceX * 0.0, 1.05, 0);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x001a22, emissive: 0x2fd4ff, emissiveIntensity: 1.2 })
    );
    screen.position.set(-faceX * 0.55, 1.65, 0);
    screen.rotation.y = faceX > 0 ? -Math.PI / 2 : Math.PI / 2;
    screen.rotation.x = 0.0;
    g.add(body, slope, screen);
    scene.add(g);
    screens.push(screen);
    box(x - 0.8, x + 0.8, z - 1.4, z + 1.4);
  }
  for (const z of [-6, 0, 6]) { console_(HX - 1.0, z, 1); console_(-HX + 1.0, z, -1); }
  updaters.push((dt, t) => {
    screens.forEach((s, i) => { s.material.emissiveIntensity = 1.0 + Math.sin(t * 1.3 + i * 1.7) * 0.25 + (Math.sin(t * 9 + i) > 0.97 ? 0.5 : 0); });
  });

  // ---- 관측창 앞 벤치 ----
  for (const x of [-7, 7]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.8 }));
    bench.position.set(x, 0.25, -HZ + 1.8);
    const back = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 1.2), glow(0xff8a3d, 0.7));
    back.position.set(x, 0.54, -HZ + 1.8);
    scene.add(bench, back);
    box(x - 2.5, x + 2.5, -HZ + 1.2, -HZ + 2.4);
  }

  // ---- 수경재배 화단 (남동쪽 구석) ----
  const planter = new THREE.Group();
  planter.position.set(HX - 3, 0, HZ - 2.2);
  const planterBox = new THREE.Mesh(new THREE.BoxGeometry(4, 0.7, 2), dark);
  planterBox.position.y = 0.35;
  planter.add(planterBox);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f9e5a, emissive: 0x0b3a1c, roughness: 0.8 });
  for (let i = 0; i < 26; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2 + Math.random() * 0.22, 10, 8), leafMat);
    leaf.scale.y = 1.6;
    leaf.position.set((Math.random() - 0.5) * 3.6, 0.95 + Math.random() * 0.4, (Math.random() - 0.5) * 1.6);
    planter.add(leaf);
  }
  const growLight = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.06, 0.4), glow(0xff5fd2, 1.6));
  growLight.position.y = 2.2;
  planter.add(growLight);
  scene.add(planter);
  box(HX - 5, HX - 1, HZ - 3.2, HZ - 1.2);

  // 보조 조명
  const warm = new THREE.PointLight(0xff9a55, 22, 14, 1.6);
  warm.position.set(-6, 3, -7);
  scene.add(warm);
  const green = new THREE.PointLight(0xff5fd2, 10, 9, 1.8);
  green.position.set(HX - 3, 2, HZ - 2.2);
  scene.add(green);

  return {
    update(dt, t) { for (const u of updaters) u(dt, t); },
  };
}
