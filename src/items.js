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
// A dropped ice cream in the same cute style as the hedgehogs: a smiling scoop with sprinkles, the waffle
// cone stuck on top upside down, sitting in a melted puddle. Local +z is the face.
const waffleTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#e8b064'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#b97c35'; g.lineWidth = 4;
  for (let n = -64; n < 128; n += 16) {
    g.beginPath(); g.moveTo(n, 0); g.lineTo(n + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(n + 64, 0); g.lineTo(n, 64); g.stroke();
  }
}, true);
waffleTex.repeat.set(3, 2);
const ICE = {
  cream: std(0xf7a8b8, { roughness: 0.25 }),
  melt: std(0xf28aa3, { roughness: 0.15 }),
  waffle: new THREE.MeshStandardMaterial({ map: waffleTex, roughness: 0.8 }),
  rim: std(0xd08f45, { roughness: 0.7 }),
  black: std(0x1b1b22, { roughness: 0.25 }),
  white: std(0xffffff, { roughness: 0.3 }),
  blush: std(0xff7f9a, { roughness: 0.8 }),
  mouth: std(0x7a2130),
  cherry: std(0xef476f, { roughness: 0.15 }),
  sprinkles: [0xffc93c, 0x3a86ff, 0x06b6a4, 0xffffff, 0x8338ec].map((c) => std(c, { roughness: 0.4 })),
};
const ICE_SPH = new THREE.SphereGeometry(1, 20, 14);
const ICE_SPRINKLE = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6);
const ICE_SMILE = new THREE.TorusGeometry(0.13, 0.03, 8, 16, Math.PI);
const ICE_CONE = new THREE.ConeGeometry(0.46, 1.25, 20, 1);
const ICE_RIM = new THREE.TorusGeometry(0.44, 0.08, 8, 24);
const ICE_PUDDLE = (() => {
  const sh = new THREE.Shape();
  for (let n = 0; n <= 48; n++) {
    const a = (n / 48) * Math.PI * 2, r = 1.2 + 0.16 * Math.sin(a * 5) + 0.08 * Math.sin(a * 3 + 1);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (n) sh.lineTo(x, y); else sh.moveTo(x, y);
  }
  return new THREE.ShapeGeometry(sh);
})();
function makeIceCream() {
  const g = new THREE.Group();
  const splat = new THREE.Group();
  const pud = new THREE.Mesh(ICE_PUDDLE, ICE.melt);
  pud.rotation.x = -Math.PI / 2; pud.position.y = 0.05; pud.receiveShadow = true; splat.add(pud);
  for (let n = 0; n < 6; n++) {
    const a = n * 1.1 + 0.4, r = 1.35 + (n % 3) * 0.12;
    const d = mesh(ICE_SPH, ICE.melt); d.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r); d.scale.set(0.14, 0.05, 0.14); splat.add(d);
  }
  g.add(splat);
  g.userData.splat = splat;
  // the scoop with its face
  const scoop = new THREE.Group(); scoop.position.y = 0.42; g.add(scoop);
  const ball = mesh(ICE_SPH, ICE.cream); ball.scale.set(0.62, 0.48, 0.62); scoop.add(ball);
  // melting at the bottom
  const base = mesh(ICE_SPH, ICE.cream); base.position.y = -0.34; base.scale.set(0.75, 0.12, 0.75); scoop.add(base);
  for (const sx of [-1, 1]) {
    const e = mesh(ICE_SPH, ICE.black); e.position.set(sx * 0.19, 0.08, 0.55); e.scale.set(0.075, 0.1, 0.05); scoop.add(e);
    const hl = mesh(ICE_SPH, ICE.white); hl.position.set(sx * 0.19 + 0.025, 0.12, 0.595); hl.scale.setScalar(0.028); scoop.add(hl);
    const b = mesh(ICE_SPH, ICE.blush); b.position.set(sx * 0.34, -0.06, 0.47); b.scale.set(0.09, 0.06, 0.03); b.rotation.y = sx * 0.6; scoop.add(b);
  }
  const smile = mesh(ICE_SMILE, ICE.mouth); smile.position.set(0, -0.06, 0.58); smile.rotation.z = Math.PI; scoop.add(smile);
  for (let n = 0; n < 16; n++) {
    // spread over the upper half of the scoop, away from the face
    const th = n * 2.4, y = 0.15 + ((n * 37) % 16) / 16 * 0.8, r = Math.sqrt(1 - y * y);
    const dir = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    if (dir.z > 0.55 && dir.y < 0.6) continue;
    const sp = mesh(ICE_SPRINKLE, ICE.sprinkles[n % ICE.sprinkles.length]);
    sp.position.set(dir.x * 0.6, dir.y * 0.47, dir.z * 0.6); sp.rotation.set(n * 1.3, n * 0.7, n * 2.1);
    scoop.add(sp);
  }
  // the cone upside down on top, a little crooked
  const cone = new THREE.Group(); cone.position.set(0.05, 0.95, -0.05); cone.rotation.set(-0.25, 0, 0.18); g.add(cone);
  const c = mesh(ICE_CONE, ICE.waffle); c.position.y = 0.55; cone.add(c);
  const rim = mesh(ICE_RIM, ICE.rim); rim.rotation.x = Math.PI / 2; rim.position.y = -0.07; cone.add(rim);
  const cherry = mesh(ICE_SPH, ICE.cherry); cherry.scale.setScalar(0.17); cherry.position.y = 1.25; cone.add(cherry);
  scene.add(g);
  return g;
}

export { ICONS, ITEM_NAMES, boxes, makeHog, makeFireball, animateFireball, makeIceCream };
