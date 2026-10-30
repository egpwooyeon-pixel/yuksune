import * as THREE from 'three';
import { heightAt } from './moon.js';

// 땅에 남는 발자국 (바람이 없어서 오래 남음). 오래된 것부터 덮어씀.
export function createFootprints(scene, max = 600) {
  const geo = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x15130f, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  let n = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(0.16, 1, 0.36);
  const up = new THREE.Vector3(0, 1, 0);

  // 걷는 존재(나, 다른 사람)마다 하나씩 만들어 쓴다
  function walker() {
    let lx = NaN, lz = NaN, side = 1;
    return (x, z, grounded) => {
      if (!grounded) { lx = NaN; return; }
      if (Number.isNaN(lx)) { lx = x; lz = z; return; }
      const dx = x - lx, dz = z - lz, d = Math.hypot(dx, dz);
      if (d < 0.9) return;
      const yaw = Math.atan2(dx, dz);
      q.setFromAxisAngle(up, yaw);
      p.set(x + Math.cos(yaw) * 0.18 * side, 0, z - Math.sin(yaw) * 0.18 * side);
      p.y = heightAt(p.x, p.z) + 0.03;
      m.compose(p, q, s);
      mesh.setMatrixAt(n % max, m);
      n++; mesh.count = Math.min(n, max); mesh.instanceMatrix.needsUpdate = true;
      side = -side; lx = x; lz = z;
    };
  }
  return { walker };
}
