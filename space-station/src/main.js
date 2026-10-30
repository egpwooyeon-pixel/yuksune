import * as THREE from 'three';
import { buildStation, ROOM, OBSTACLES } from './station.js';
import { createAstronaut } from './astronaut.js';
import { createAmbience } from './audio.js';

const world = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
world.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);

const station = buildStation(scene);
const player = createAstronaut();
player.group.position.set(0, 0, 6);
scene.add(player.group);

// ---- 카메라 (플레이어 뒤에서 도는 3인칭) ----
const cam = { yaw: 0, pitch: 0.38, dist: 7, minDist: 3, maxDist: 13 };
const camTarget = new THREE.Vector3();

// ---- 입력 ----
const keys = new Set();
const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); cancelTravel(); hideHint(); e.preventDefault(); }
  if (e.code === 'Digit3') player.wave();
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
window.addEventListener('blur', () => keys.clear());

const pointers = new Map();
let dragMoved = 0;
let pinchStart = 0;
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
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.004, 0.05, 1.25);
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

// ---- 클릭 이동 ----
const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.28, 0.36, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.9, depthWrite: false })
);
marker.position.y = 0.02;
marker.visible = false;
scene.add(marker);
let travel = null;

function walkTo(cx, cy) {
  const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(floorPlane, hit)) return;
  hit.x = THREE.MathUtils.clamp(hit.x, -ROOM.halfX + 0.6, ROOM.halfX - 0.6);
  hit.z = THREE.MathUtils.clamp(hit.z, -ROOM.halfZ + 0.6, ROOM.halfZ - 0.6);
  travel = hit;
  marker.position.set(hit.x, 0.02, hit.z);
  marker.visible = true;
  hideHint();
}
function cancelTravel() { travel = null; marker.visible = false; }

// ---- 충돌 (원 vs 상자) ----
const RADIUS = 0.45;
function collide(pos) {
  pos.x = THREE.MathUtils.clamp(pos.x, -ROOM.halfX + RADIUS, ROOM.halfX - RADIUS);
  pos.z = THREE.MathUtils.clamp(pos.z, -ROOM.halfZ + RADIUS, ROOM.halfZ - RADIUS);
  for (const o of OBSTACLES) {
    const nx = THREE.MathUtils.clamp(pos.x, o.minX, o.maxX);
    const nz = THREE.MathUtils.clamp(pos.z, o.minZ, o.maxZ);
    let dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), push = RADIUS - d;
      pos.x += (dx / d) * push; pos.z += (dz / d) * push;
    } else { // 상자 안쪽으로 파고든 경우 가장 가까운 면으로 밀어냄
      const l = pos.x - o.minX, r = o.maxX - pos.x, f = pos.z - o.minZ, b = o.maxZ - pos.z;
      const m = Math.min(l, r, f, b);
      if (m === l) pos.x = o.minX - RADIUS; else if (m === r) pos.x = o.maxX + RADIUS;
      else if (m === f) pos.z = o.minZ - RADIUS; else pos.z = o.maxZ + RADIUS;
    }
  }
}

// ---- UI ----
const hint = document.getElementById('hint');
let hintTimer = setTimeout(hideHint, 9000);
function hideHint() { clearTimeout(hintTimer); hint.classList.add('is-hidden'); }
document.getElementById('wave').addEventListener('click', () => player.wave());

const ambience = createAmbience();
const soundBtn = document.getElementById('sound');
soundBtn.addEventListener('click', () => {
  const on = ambience.toggle();
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.textContent = on ? '소리 켜짐' : '소리 꺼짐';
  soundBtn.setAttribute('aria-label', on ? '소리 끄기' : '소리 켜기');
});

// ---- 루프 ----
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const SPEED = 4.2;
const move = new THREE.Vector3();
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  move.set(0, 0, 0);
  const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  if (keys.has('f')) move.add(fwd);
  if (keys.has('b')) move.sub(fwd);
  if (keys.has('r')) move.add(right);
  if (keys.has('l')) move.sub(right);

  let moving = false;
  if (move.lengthSq() > 0) {
    move.normalize();
    moving = true;
  } else if (travel) {
    move.subVectors(travel, player.group.position).setY(0);
    if (move.length() < 0.15) cancelTravel();
    else { move.normalize(); moving = true; }
  }

  if (moving) {
    const before = player.group.position.clone();
    player.group.position.addScaledVector(move, SPEED * dt);
    collide(player.group.position);
    if (travel && player.group.position.distanceToSquared(before) < 1e-6) cancelTravel();
    player.faceTo(Math.atan2(move.x, move.z), dt);
  }
  player.update(dt, t, moving);

  // 카메라: 플레이어를 따라가되 방 밖으로 나가지 않게 제한
  camTarget.lerp(new THREE.Vector3(player.group.position.x, 1.3, player.group.position.z), 1 - Math.pow(0.001, dt));
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  camera.position.set(
    camTarget.x + Math.sin(cam.yaw) * cp * cam.dist,
    camTarget.y + sp * cam.dist,
    camTarget.z + Math.cos(cam.yaw) * cp * cam.dist
  );
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -ROOM.halfX + 0.4, ROOM.halfX - 0.4);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -ROOM.halfZ + 0.4, ROOM.halfZ - 0.4);
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.6, ROOM.height - 0.5);
  camera.lookAt(camTarget);

  marker.scale.setScalar(1 + Math.sin(t * 5) * 0.12);
  station.update(dt, t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
camTarget.set(0, 1.3, 6);
requestAnimationFrame(frame);
document.getElementById('boot').classList.add('is-done');

// 테스트/디버깅용
window.__station = { player, cam, camera };
