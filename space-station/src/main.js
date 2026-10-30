import * as THREE from 'three';
import { buildMoon, heightAt, OBSTACLES, BOUND } from './moon.js';
import { createAstronaut } from './astronaut.js';
import { createAmbience } from './audio.js';
import { createDust } from './dust.js';
import { createNet } from './net.js';
import { createFootprints } from './footprints.js';

const world = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
world.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);

const moon = buildMoon(scene);
const dust = createDust(scene);
const net = createNet();
const prints = createFootprints(scene);
const myPrints = prints.walker();

// ---- 나 ----
const player = createAstronaut({ accent: new THREE.Color().setHSL(net.me.h / 360, 0.75, 0.55).getHex() });
scene.add(player.group);
const feet = new THREE.Vector3(0, 0, 9);
feet.y = heightAt(feet.x, feet.z);
const vel = new THREE.Vector3();
let grounded = true;
let waveAt = 0;

// ---- 카메라 ----
const cam = { yaw: 0, pitch: 0.28, dist: 6.5, minDist: 3, maxDist: 14 };
const camTarget = new THREE.Vector3(feet.x, feet.y + 1.4, feet.z);

// ---- 입력 ----
const keys = new Set();
const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run' };
let jumpQueued = false;
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
  if (e.code === 'Space') { jumpQueued = true; hideHint(); e.preventDefault(); return; }
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); if (KEYMAP[e.code] !== 'run') cancelTravel(); hideHint(); e.preventDefault(); }
  if (e.code === 'Digit3') doWave();
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
window.addEventListener('blur', () => keys.clear());

const pointers = new Map();
let dragMoved = 0, pinchStart = 0;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragMoved = 0;
  if (pointers.size === 2) pinchStart = pinchDistance();
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (pointers.size === 1) {
    cam.yaw -= dx * 0.005;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.004, -0.2, 1.3);
  } else if (pointers.size === 2) {
    const d = pinchDistance();
    if (pinchStart) cam.dist = THREE.MathUtils.clamp(cam.dist * (pinchStart / d), cam.minDist, cam.maxDist);
    pinchStart = d;
  }
});
function endPointer(e) {
  const had = pointers.delete(e.pointerId);
  if (had && e.type === 'pointerup' && pointers.size === 0 && dragMoved < 6) walkTo(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.001), cam.minDist, cam.maxDist);
}, { passive: false });
function pinchDistance() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---- 클릭해서 걷기 ----
const raycaster = new THREE.Raycaster();
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.28, 0.4, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.9, depthWrite: false })
);
marker.visible = false;
scene.add(marker);
let travel = null;
function setTravel(x, z) {
  const r = Math.hypot(x, z);
  if (r > BOUND - 1) { x *= (BOUND - 1) / r; z *= (BOUND - 1) / r; }
  travel = new THREE.Vector3(x, 0, z);
  marker.position.set(x, heightAt(x, z) + 0.06, z);
  marker.visible = true;
}
function walkTo(cx, cy) {
  const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(moon.near, false)[0];
  if (!hit) return;
  setTravel(hit.point.x, hit.point.z);
  hideHint();
}
function cancelTravel() { travel = null; marker.visible = false; }

// ---- 충돌 ----
function collide() {
  const r = Math.hypot(feet.x, feet.z);
  if (r > BOUND) {
    feet.x *= BOUND / r; feet.z *= BOUND / r;
    const nx = feet.x / BOUND, nz = feet.z / BOUND, out = vel.x * nx + vel.z * nz;
    if (out > 0) { vel.x -= nx * out; vel.z -= nz * out; }
  }
  for (const o of OBSTACLES) {
    if (feet.y > o.top - 0.15) continue; // 위로 뛰어넘음
    const dx = feet.x - o.x, dz = feet.z - o.z, rr = o.r + 0.4;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1e-3;
    feet.x = o.x + (dx / d) * rr; feet.z = o.z + (dz / d) * rr;
    const vn = (vel.x * dx + vel.z * dz) / d;
    if (vn < 0) { vel.x -= (dx / d) * vn; vel.z -= (dz / d) * vn; }
  }
}

// ---- UI ----
const hint = document.getElementById('hint');
let hintTimer = setTimeout(hideHint, 12000);
function hideHint() { clearTimeout(hintTimer); hint.classList.add('is-hidden'); }
function doWave() { player.wave(); waveAt = Date.now(); }
document.getElementById('wave').addEventListener('click', doWave);
document.getElementById('jump').addEventListener('click', () => { jumpQueued = true; hideHint(); });
document.getElementById('gather').addEventListener('click', () => { setTravel(Math.cos(Math.random() * 6.28) * 3, Math.sin(Math.random() * 6.28) * 3); hideHint(); });

const ambience = createAmbience();
const soundBtn = document.getElementById('sound');
soundBtn.addEventListener('click', () => {
  const on = ambience.toggle();
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.textContent = on ? '소리 켜짐' : '소리 꺼짐';
  soundBtn.setAttribute('aria-label', on ? '소리 끄기' : '소리 켜기');
});

const toast = document.getElementById('toast');
let toastTimer = 0;
function say(text) {
  toast.textContent = text;
  toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-on'), 3200);
}
const people = document.getElementById('people');
const labelsEl = document.getElementById('labels');

// ---- 다른 사람들 ----
const remotes = new Map(); // peer id -> { ast, label, pos, target, lastW, v, g }
const str = (v, n = 24) => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} ]/gu, '').slice(0, n) : '');
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

function makeLabel(name, isSelf) {
  const el = document.createElement('div');
  el.className = 'tag' + (isSelf ? ' is-self' : '');
  if (isSelf) { const b = document.createElement('b'); b.textContent = '나'; el.appendChild(b); }
  const s = document.createElement('span');
  s.textContent = name;
  el.appendChild(s);
  labelsEl.appendChild(el);
  return el;
}
const selfLabel = makeLabel(net.me.n, true);
net.on('join', (p) => say(`${str(p.presence.n) || '누군가'}님이 도착했어요`));
net.on('leave', (p) => say(`${str(p.presence.n) || '누군가'}님이 떠났어요`));

function syncRemotes(dt, t) {
  const seen = new Set();
  for (const p of net.peers()) {
    const s = p.presence;
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    seen.add(p.peer);
    let r = remotes.get(p.peer);
    if (!r) {
      const hue = num(s.h, 200);
      r = {
        ast: createAstronaut({ accent: new THREE.Color().setHSL((((hue % 360) + 360) % 360) / 360, 0.75, 0.55).getHex() }),
        label: makeLabel(str(s.n) || '방문객', false),
        pos: new THREE.Vector3(s.x, num(s.y), s.z),
        step: prints.walker(), v: new THREE.Vector3(), lastW: num(s.w), prev: new THREE.Vector3(s.x, num(s.y), s.z),
      };
      scene.add(r.ast.group);
      remotes.set(p.peer, r);
    }
    const target = new THREE.Vector3(s.x, num(s.y), s.z);
    r.prev.copy(r.pos);
    r.pos.lerp(target, 1 - Math.exp(-dt * 9));
    r.v.set((r.pos.x - r.prev.x) / dt, (r.pos.y - r.prev.y) / dt, (r.pos.z - r.prev.z) / dt);
    r.g = s.g !== 0;
    if (num(s.w) !== r.lastW) { r.lastW = num(s.w); r.ast.wave(); }
    r.step(r.pos.x, r.pos.z, r.g);
    r.ast.group.position.set(r.pos.x, r.pos.y + 1.0, r.pos.z);
    r.ast.update(dt, t, r.v, r.g);
  }
  for (const [id, r] of remotes) {
    if (seen.has(id)) continue;
    scene.remove(r.ast.group);
    r.label.remove();
    remotes.delete(id);
  }
}

const tmp = new THREE.Vector3();
function placeLabel(el, pos, dy) {
  tmp.set(pos.x, pos.y + dy, pos.z).project(camera);
  const show = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
  el.style.display = show ? '' : 'none';
  if (show) el.style.transform = `translate(${((tmp.x + 1) / 2) * window.innerWidth}px, ${((1 - tmp.y) / 2) * window.innerHeight}px) translate(-50%, -100%)`;
}

// ---- 루프 ----
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const GRAVITY = 1.62;     // 달 표면 중력 (m/s²)
const JUMP = 3.6;         // 점프 초속 → 약 4초 체공, 높이 약 4m
const WALK = 4.2, RUN = 7;
const want = new THREE.Vector3();
const clock = new THREE.Clock();
let stepT = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // 이동 의사
  const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  want.set(0, 0, 0);
  if (keys.has('f')) want.add(fwd);
  if (keys.has('b')) want.sub(fwd);
  if (keys.has('r')) want.add(right);
  if (keys.has('l')) want.sub(right);
  let speed = keys.has('run') ? RUN : WALK;
  if (want.lengthSq() > 0) want.normalize();
  else if (travel) {
    want.set(travel.x - feet.x, 0, travel.z - feet.z);
    const d = want.length();
    if (d < 0.4) cancelTravel(); else want.divideScalar(d);
    speed = Math.min(speed, d * 2 + 1);
  }

  // 수평: 땅에서는 즉각적, 공중에서는 관성이 남음(저중력)
  const rate = grounded ? 9 : 1.2;
  vel.x += (want.x * speed - vel.x) * Math.min(1, dt * rate);
  vel.z += (want.z * speed - vel.z) * Math.min(1, dt * rate);

  const gy = heightAt(feet.x, feet.z);
  if (jumpQueued && grounded) {
    vel.y = JUMP; grounded = false;
    dust.emit(feet, 6);
  }
  jumpQueued = false;

  feet.x += vel.x * dt;
  feet.z += vel.z * dt;
  const g2 = heightAt(feet.x, feet.z);
  if (grounded) {
    if (feet.y - g2 < 0.5) feet.y = g2; else grounded = false; // 낭떠러지에서는 떨어짐
  }
  if (!grounded) {
    vel.y -= GRAVITY * dt;
    feet.y += vel.y * dt;
    if (feet.y <= g2) {
      if (vel.y < -1.5) dust.emit(feet, 8, 1.6);
      feet.y = g2; vel.y = 0; grounded = true;
    }
  }
  collide();

  // 발걸음 먼지
  const horiz = Math.hypot(vel.x, vel.z);
  if (grounded && horiz > 1) { stepT += dt * horiz; if (stepT > 1.6) { stepT = 0; dust.emit(feet, 2, 0.5); } }

  myPrints(feet.x, feet.z, grounded);
  player.group.position.set(feet.x, feet.y + 1.0, feet.z);
  player.update(dt, t, vel, grounded);
  dust.update(dt);
  syncRemotes(dt, t);

  // 내 상태를 다른 사람에게 (바뀐 것만)
  net.send({
    n: net.me.n, h: net.me.h,
    x: +feet.x.toFixed(2), y: +feet.y.toFixed(2), z: +feet.z.toFixed(2),
    g: grounded ? 1 : 0, w: waveAt,
  }, performance.now());

  // 카메라
  camTarget.lerp(tmp.set(feet.x, feet.y + 1.4, feet.z), 1 - Math.pow(0.0005, dt));
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  camera.position.set(camTarget.x + Math.sin(cam.yaw) * cp * cam.dist, camTarget.y + sp * cam.dist, camTarget.z + Math.cos(cam.yaw) * cp * cam.dist);
  camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 0.6);
  camera.lookAt(camTarget);

  marker.scale.setScalar(1 + Math.sin(t * 5) * 0.12);
  moon.update(dt, t, feet);

  const n = net.count();
  people.textContent = net.connected() ? `${n}명 함께 있어요` : '혼자 있어요';
  placeLabel(selfLabel, player.group.position, 1.25);
  for (const r of remotes.values()) placeLabel(r.label, r.ast.group.position, 1.25);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.getElementById('boot').classList.add('is-done');

window.__moon = { feet, vel, cam, get grounded() { return grounded; }, net, remotes };
