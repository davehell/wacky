import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rnd, col } from './util.js';
import { scene, canvasTex, std, mesh } from './render.js';
import { N, P, S } from './track.js';

/* ================= Items ================= */
const ICONS = {
  hedgehog: '<svg viewBox="0 0 64 64"><path d="M6 46 9 33l5 5 3-15 6 10 4-16 6 13 5-14 5 13 6-9 3 26z" fill="#5a3620"/><ellipse cx="44" cy="44" rx="14" ry="10" fill="#d9a066"/><circle cx="48" cy="40" r="2.4" fill="#14213d"/><circle cx="58" cy="45" r="3" fill="#14213d"/><rect x="6" y="45" width="40" height="5" rx="2.5" fill="#5a3620"/></svg>',
  icecream: '<svg viewBox="0 0 64 64"><path d="M20 30h24L32 60z" fill="#e0a458" stroke="#b97c35" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="24" r="14" fill="#f7a8b8"/><circle cx="24" cy="30" r="7" fill="#f7a8b8"/><circle cx="40" cy="30" r="7" fill="#f7a8b8"/><circle cx="34" cy="9" r="4" fill="#ef476f"/></svg>',
  fire: '<svg viewBox="0 0 64 64"><defs><g id="fl"><path d="M12 30C5 30 1 25 2 19c1-5 5-7 5-13 4 3 6 6 6 9 2-2 2-5 2-8 5 4 8 9 8 14 0 6-5 9-11 9z" fill="#ff7b25" stroke="#b33a0e" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="22" r="5" fill="#ffd166"/></g></defs><use href="#fl" x="20" y="1"/><use href="#fl" x="2" y="31"/><use href="#fl" x="38" y="31"/></svg>',
  turbo: '<svg viewBox="0 0 64 64"><path d="M36 4 12 36h16l-6 24 30-36H35z" fill="#ffc93c" stroke="#14213d" stroke-width="3" stroke-linejoin="round"/></svg>',
};
const ITEM_NAMES = { fire: 'Oheň', icecream: 'Zmrzlina', turbo: 'Turbo' };

const qTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#ffd166'); gr.addColorStop(0.5, '#ef476f'); gr.addColorStop(1, '#7b61ff');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = '#fff'; g.font = '84px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('?', w / 2, h / 2 + 6);
}, false, true);
const boxMat = new THREE.MeshStandardMaterial({ map: qTex, emissive: 0xffffff, emissiveMap: qTex, emissiveIntensity: 0.35, transparent: true, opacity: 0.92, roughness: 0.3 });
const boxGeo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
const boxes = [];
for (const f of [0.17, 0.46, 0.73]) {
  const i = Math.floor(N * f);
  for (const lat of [-6.5, -2.2, 2.2, 6.5]) {
    const m = mesh(boxGeo, boxMat);
    m.position.set(P[i].x + S[i].x * lat, 1.3, P[i].z + S[i].z * lat);
    m.rotation.set(rnd(0, 3), rnd(0, 3), 0);
    scene.add(m);
    boxes.push({ m, respawn: 0 });
  }
}

// Shared by every thrown hedgehog, since there are a lot of them now
const HOG_BODY = new THREE.SphereGeometry(0.55, 16, 12), HOG_FACE = new THREE.SphereGeometry(0.3, 12, 10), HOG_NOSE = new THREE.SphereGeometry(0.08, 8, 6);
const HOG_SPIKES = (() => {
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), geos = [];
  const cone = new THREE.ConeGeometry(0.12, 0.5, 6);
  for (let i = 0; i < 26; i++) {
    const y = 1 - (2 * (i + 0.5)) / 26, r = Math.sqrt(1 - y * y), th = i * 2.39996;
    const dir = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    q.setFromUnitVectors(up, dir);
    geos.push(cone.clone().applyMatrix4(m.compose(dir.clone().multiplyScalar(0.58), q, one)));
  }
  return BufferGeometryUtils.mergeBufferGeometries(geos);
})();
function makeHog() {
  const outer = new THREE.Group(), g = new THREE.Group();
  outer.add(g);
  g.add(mesh(HOG_BODY, std(0x6b4226, { roughness: 0.8 })));
  g.add(mesh(HOG_SPIKES, std(0x3b2414, { roughness: 0.8 })));
  const face = mesh(HOG_FACE, std(0xe0b07a)); face.position.set(0, -0.05, 0.42); g.add(face);
  const nose = mesh(HOG_NOSE, std(0x121212)); nose.position.set(0, -0.02, 0.72); g.add(nose);
  outer.userData.roll = g;
  scene.add(outer);
  return outer;
}
// A glowing ball of fire: bright core inside a soft additive halo
const FIRE_CORE = new THREE.SphereGeometry(0.45, 16, 12), FIRE_HALO = new THREE.SphereGeometry(0.85, 16, 12);
const fireCoreMat = new THREE.MeshBasicMaterial({ color: col(0xfff1a8) });
const fireHaloMat = new THREE.MeshBasicMaterial({ color: col(0xff7b25), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
function makeFireball() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(FIRE_CORE, fireCoreMat));
  const halo = new THREE.Mesh(FIRE_HALO, fireHaloMat);
  g.add(halo);
  g.userData.halo = halo;
  scene.add(g);
  return g;
}
function makeIceCream() {
  const g = new THREE.Group();
  const splat = new THREE.Mesh(new THREE.CircleGeometry(1.2, 22), std(0xf7a8b8, { roughness: 0.3 }));
  splat.rotation.x = -Math.PI / 2; splat.position.y = 0.07; splat.receiveShadow = true; g.add(splat);
  const cone = mesh(new THREE.ConeGeometry(0.35, 1.1, 14), std(0xe0a458, { roughness: 0.8 }));
  cone.rotation.z = Math.PI / 2.4; cone.position.set(0.3, 0.35, 0); g.add(cone);
  const scoop = mesh(new THREE.SphereGeometry(0.45, 16, 12), std(0xf7a8b8, { roughness: 0.4 })); scoop.position.set(-0.35, 0.35, 0); g.add(scoop);
  const cherry = mesh(new THREE.SphereGeometry(0.14, 10, 8), std(0xef476f, { roughness: 0.2 })); cherry.position.set(-0.45, 0.8, 0); g.add(cherry);
  scene.add(g);
  return g;
}

export { ICONS, ITEM_NAMES, boxes, makeHog, makeFireball, makeIceCream };
