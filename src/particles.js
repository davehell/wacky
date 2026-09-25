import * as THREE from 'three';
import { rnd } from './util.js';
import { scene, canvasTex } from './render.js';

/* ================= Particles ================= */
const PMAX = 900;
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
const parts = Array.from({ length: PMAX }, () => ({ life: 0, max: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0, grav: 0 }));
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const dotTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.7, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
points.frustumCulled = false;
scene.add(points);
let pHead = 0;
function emit(x, y, z, vx, vy, vz, r, g, b, life, grav = 0) {
  const q = parts[pHead]; pHead = (pHead + 1) % PMAX;
  Object.assign(q, { x, y, z, vx, vy, vz, r, g, b, life, max: life, grav });
}
function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    const q = parts[i], j = i * 3;
    if (q.life <= 0) { pPos[j + 1] = -99; pCol[j] = pCol[j + 1] = pCol[j + 2] = 0; continue; }
    q.life -= dt; q.vy -= q.grav * dt;
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    const f = Math.max(0, q.life / q.max);
    pPos[j] = q.x; pPos[j + 1] = q.y; pPos[j + 2] = q.z;
    pCol[j] = q.r * f; pCol[j + 1] = q.g * f; pCol[j + 2] = q.b * f;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}
function burst(x, y, z, n, r, g, b) {
  for (let i = 0; i < n; i++) emit(x, y, z, rnd(-8, 8), rnd(3, 10), rnd(-8, 8), r, g, b, rnd(0.4, 0.8), 18);
}

export { parts, emit, updateParticles, burst };
