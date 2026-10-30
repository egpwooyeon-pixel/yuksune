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
const START = new THREE.Vector3(0, 3.6, 6);
player.group.position.copy(START);
scene.add(player.group);

// ---- 카메라 (플레이어 주위를 도는 3인칭) ----
const cam = { yaw: 0, pitch: 0.3, dist: 7, minDist: 3, maxDist: 13 };
const camTarget = START.clone();

// ---- 입력 ----
const keys = new Set();
const KEYMAP = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b',
  KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  Space: 'u', KeyE: 'u', ShiftLeft: 'd', ShiftRight: 'd', KeyQ: 'd',
};
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
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.004, -1.2, 1.25);
  } else if (pointers.size === 2) {
    const d = pinchDistance();
    if (pinchStart) cam.dist = THREE.MathUtils.clamp(cam.dist * (pinchStart / d), cam.minDist, cam.maxDist);
    pinchStart = d;
  }
});
function endPointer(e) {
  const had = pointers.delete(e.pointerId);
  if (had && e.type === 'pointerup' && pointers.size === 0 && dragMoved < 6) flyTo(e.clientX, e.clientY);
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

// ---- 몸의 범위 (원점이 몸 중심) ----
const R = 0.6;            // 수평 반지름
const Y_MIN = 1.0;        // 중심이 이보다 낮으면 발이 바닥을 뚫음
const Y_MAX = ROOM.height - 1.0;
const BOUNCE = 0.35;

// ---- 클릭한 곳으로 떠가기 ----
const raycaster = new THREE.Raycaster();
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.14, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.85, depthWrite: false })
);
marker.visible = false;
scene.add(marker);
let travel = null;

// 카메라 시선이 방 안쪽 면 어디에 닿는지 계산
function roomHit(origin, dir) {
  let t = Infinity;
  const bounds = [[ROOM.halfX, 'x'], [ROOM.halfZ, 'z'], [ROOM.height, 'y']];
  for (const [max, a] of bounds) {
    const min = a === 'y' ? 0 : -max;
    const d = dir[a];
    if (Math.abs(d) < 1e-6) continue;
    const ta = ((d > 0 ? max : min) - origin[a]) / d;
    if (ta > 0 && ta < t) t = ta;
  }
  return Number.isFinite(t) ? origin.clone().addScaledVector(dir, t) : null;
}

function flyTo(cx, cy) {
  const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = roomHit(raycaster.ray.origin, raycaster.ray.direction);
  if (!hit) return;
  hit.x = THREE.MathUtils.clamp(hit.x, -ROOM.halfX + R + 0.4, ROOM.halfX - R - 0.4);
  hit.z = THREE.MathUtils.clamp(hit.z, -ROOM.halfZ + R + 0.4, ROOM.halfZ - R - 0.4);
  hit.y = THREE.MathUtils.clamp(hit.y, Y_MIN, Y_MAX);
  travel = hit;
  marker.position.copy(hit);
  marker.visible = true;
  hideHint();
}
function cancelTravel() { travel = null; marker.visible = false; }

// ---- 충돌 (구 vs 상자, 튕김) ----
function collide(pos, vel) {
  const bx = ROOM.halfX - R, bz = ROOM.halfZ - R;
  if (pos.x < -bx) { pos.x = -bx; if (vel.x < 0) vel.x *= -BOUNCE; }
  if (pos.x > bx) { pos.x = bx; if (vel.x > 0) vel.x *= -BOUNCE; }
  if (pos.z < -bz) { pos.z = -bz; if (vel.z < 0) vel.z *= -BOUNCE; }
  if (pos.z > bz) { pos.z = bz; if (vel.z > 0) vel.z *= -BOUNCE; }
  if (pos.y < Y_MIN) { pos.y = Y_MIN; if (vel.y < 0) vel.y *= -BOUNCE; }
  if (pos.y > Y_MAX) { pos.y = Y_MAX; if (vel.y > 0) vel.y *= -BOUNCE; }

  const n = new THREE.Vector3();
  for (const o of OBSTACLES) {
    // 머리·발 길이를 고려해 세로는 몸 높이(±1)만큼 확장해서 검사
    const cx = THREE.MathUtils.clamp(pos.x, o.minX, o.maxX);
    const cy = THREE.MathUtils.clamp(pos.y, o.minY - 0.9, o.maxY + 0.9);
    const cz = THREE.MathUtils.clamp(pos.z, o.minZ, o.maxZ);
    n.set(pos.x - cx, pos.y - cy, pos.z - cz);
    const d = n.length();
    if (d >= R) continue;
    if (d > 1e-6) {
      n.divideScalar(d);
      pos.addScaledVector(n, R - d);
    } else { // 상자 안쪽에 있으면 가장 가까운 면으로 탈출
      const faces = [
        [pos.x - o.minX, -1, 0, 0], [o.maxX - pos.x, 1, 0, 0],
        [pos.z - o.minZ, 0, 0, -1], [o.maxZ - pos.z, 0, 0, 1],
        [o.maxY + 0.9 - pos.y, 0, 1, 0],
      ].sort((a, b) => a[0] - b[0])[0];
      n.set(faces[1], faces[2], faces[3]);
      pos.addScaledVector(n, faces[0] + R);
    }
    const vn = vel.dot(n);
    if (vn < 0) vel.addScaledVector(n, -(1 + BOUNCE) * vn);
  }
}

// ---- UI ----
const hint = document.getElementById('hint');
let hintTimer = setTimeout(hideHint, 10000);
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

const ACCEL = 9;        // 추진 가속 (m/s²)
const MAX_SPEED = 6;    // 최고 속도 (m/s)
const DRAG = 0.8;       // 약한 공기저항 느낌: 놔두면 1~2초에 걸쳐 느려짐
const vel = new THREE.Vector3();
const thrust = new THREE.Vector3();
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const desired = new THREE.Vector3();
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // 카메라가 보는 방향(상하 포함)으로 추진
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  fwd.set(-Math.sin(cam.yaw) * cp, -sp, -Math.cos(cam.yaw) * cp);
  right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  thrust.set(0, 0, 0);
  if (keys.has('f')) thrust.add(fwd);
  if (keys.has('b')) thrust.sub(fwd);
  if (keys.has('r')) thrust.add(right);
  if (keys.has('l')) thrust.sub(right);
  if (keys.has('u')) thrust.add(up);
  if (keys.has('d')) thrust.sub(up);

  if (thrust.lengthSq() > 0) {
    vel.addScaledVector(thrust.normalize(), ACCEL * dt);
  } else if (travel) {
    desired.subVectors(travel, player.group.position);
    const dist = desired.length();
    if (dist < 0.3) cancelTravel();
    else {
      desired.multiplyScalar(Math.min(MAX_SPEED, dist * 1.6) / dist);
      vel.lerp(desired, Math.min(1, dt * 3));
    }
  }
  vel.multiplyScalar(Math.exp(-DRAG * dt));
  if (vel.length() > MAX_SPEED) vel.setLength(MAX_SPEED);

  player.group.position.addScaledVector(vel, dt);
  collide(player.group.position, vel);
  player.update(dt, t, vel);

  // 카메라: 플레이어를 부드럽게 따라가되 방 밖으로 나가지 않게 제한
  camTarget.lerp(player.group.position, 1 - Math.pow(0.001, dt));
  camera.position.set(
    camTarget.x + Math.sin(cam.yaw) * cp * cam.dist,
    camTarget.y + sp * cam.dist,
    camTarget.z + Math.cos(cam.yaw) * cp * cam.dist
  );
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -ROOM.halfX + 0.4, ROOM.halfX - 0.4);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -ROOM.halfZ + 0.4, ROOM.halfZ - 0.4);
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.6, ROOM.height - 1.3);
  camera.lookAt(camTarget);

  marker.scale.setScalar(1 + Math.sin(t * 5) * 0.2);
  station.update(dt, t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.getElementById('boot').classList.add('is-done');

// 테스트/디버깅용
window.__station = { player, cam, camera, vel };
