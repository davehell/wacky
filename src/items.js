import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rnd, col } from './util.js';
import { scene, canvasTex, std, mesh } from './render.js';
import { N, P, S } from './track.js';

/* ================= Items ================= */
const ICONS = {
  hedgehog: '<svg viewBox="0 0 64 64"><path d="M6 46 9 33l5 5 3-15 6 10 4-16 6 13 5-14 5 13 6-9 3 26z" fill="#5a3620"/><ellipse cx="44" cy="44" rx="14" ry="10" fill="#d9a066"/><circle cx="48" cy="40" r="2.4" fill="#14213d"/><circle cx="58" cy="45" r="3" fill="#14213d"/><rect x="6" y="45" width="40" height="5" rx="2.5" fill="#5a3620"/></svg>',
  icecream: '<svg viewBox="0 0 64 64"><path d="M20 30h24L32 60z" fill="#e0a458" stroke="#b97c35" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="24" r="14" fill="#f7a8b8"/><circle cx="24" cy="30" r="7" fill="#f7a8b8"/><circle cx="40" cy="30" r="7" fill="#f7a8b8"/><circle cx="34" cy="9" r="4" fill="#ef476f"/></svg>',
  fire: '<svg viewBox="0 0 64 64"><path d="M22 54C10 52 8 38 16 30L58 4 42 24 62 18 44 36 60 36 34 54z" fill="#ff7b25" stroke="#b33a0e" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 46 48 16 38 30 52 28 36 42z" fill="#ffd166"/><circle cx="23" cy="42" r="15" fill="#ff9a1f" stroke="#b33a0e" stroke-width="2.5"/><circle cx="23" cy="42" r="10" fill="#ffd166"/><circle cx="20" cy="45" r="4.5" fill="#fff6d0"/></svg>',
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
// A dragon's fireball: a white-hot core in two lumpy, churning flame shells, trailing licking flame tongues.
// Local +z is the direction of flight.
function lumpy(r, amp, seed) {
  const g = new THREE.IcosahedronGeometry(r, 2), p = g.attributes.position, v = new THREE.Vector3();
  for (let n = 0; n < p.count; n++) {
    v.fromBufferAttribute(p, n);
    const u = v.clone().normalize();
    const k = 1 + amp * Math.sin(u.x * 5 + seed) * Math.sin(u.y * 6 + seed * 2) * Math.sin(u.z * 4 + seed * 3);
    // stretched backwards like a comet
    v.multiplyScalar(k);
    if (v.z < 0) v.z *= 1.35;
    p.setXYZ(n, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
// tongue colour from the hot base to the fading tip (canvas bottom = base)
const flameTex = canvasTex(8, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(200,30,10,0)'); gr.addColorStop(0.4, 'rgba(235,60,15,0.75)'); gr.addColorStop(0.75, 'rgba(255,130,25,0.95)'); gr.addColorStop(1, 'rgba(255,215,90,1)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const flameMat = (opts) => new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false }, opts));
const FIRE_CORE = new THREE.SphereGeometry(0.46, 16, 12);
const FIRE_INNER = lumpy(0.62, 0.22, 1.3), FIRE_OUTER = lumpy(0.9, 0.3, 4.1);
const FIRE_TONGUE = new THREE.ConeGeometry(0.45, 2.2, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.75);
const fireCoreMat = new THREE.MeshBasicMaterial({ color: col(0xfff6d0) });
const fireInnerMat = flameMat({ color: col(0xff9a1f), opacity: 0.8 });
const fireOuterMat = flameMat({ color: col(0xe8340f), opacity: 0.45 });
const fireTongueMat = flameMat({ map: flameTex, side: THREE.DoubleSide });
function makeFireball() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(FIRE_CORE, fireCoreMat));
  const inner = new THREE.Mesh(FIRE_INNER, fireInnerMat), outer = new THREE.Mesh(FIRE_OUTER, fireOuterMat);
  g.add(inner, outer);
  const tongues = [];
  for (let n = 0; n < 4; n++) {
    const t = new THREE.Mesh(FIRE_TONGUE, fireTongueMat);
    const a = (n / 4) * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0);
    t.rotation.set(Math.sin(a) * 0.08, -Math.cos(a) * 0.08, 0);
    t.userData.ph = rnd(0, 6);
    g.add(t); tongues.push(t);
  }
  g.userData = { inner, outer, tongues };
  scene.add(g);
  return g;
}
function animateFireball(g, t) {
  const { inner, outer, tongues } = g.userData;
  inner.rotation.set(t * 7, t * 5, t * 3);
  outer.rotation.set(-t * 4, t * 6, -t * 5);
  outer.scale.setScalar(1 + Math.sin(t * 31) * 0.08);
  for (const tg of tongues) {
    const f = Math.sin(t * 24 + tg.userData.ph);
    tg.scale.set(1 + f * 0.12, 1 + f * 0.12, 0.8 + 0.35 * Math.sin(t * 17 + tg.userData.ph * 2));
  }
}
function makeIceCream() {
  const g = new THREE.Group();
  const splat = new THREE.Mesh(new THREE.CircleGeometry(1.2, 22), std(0xf7a8b8, { roughness: 0.3 }));
  splat.rotation.x = -Math.PI / 2; splat.position.y = 0.07; splat.receiveShadow = true; g.add(splat);
  g.userData.splat = splat;
  const cone = mesh(new THREE.ConeGeometry(0.35, 1.1, 14), std(0xe0a458, { roughness: 0.8 }));
  cone.rotation.z = Math.PI / 2.4; cone.position.set(0.3, 0.35, 0); g.add(cone);
  const scoop = mesh(new THREE.SphereGeometry(0.45, 16, 12), std(0xf7a8b8, { roughness: 0.4 })); scoop.position.set(-0.35, 0.35, 0); g.add(scoop);
  const cherry = mesh(new THREE.SphereGeometry(0.14, 10, 8), std(0xef476f, { roughness: 0.2 })); cherry.position.set(-0.45, 0.8, 0); g.add(cherry);
  scene.add(g);
  return g;
}

export { ICONS, ITEM_NAMES, boxes, makeHog, makeFireball, animateFireball, makeIceCream };
