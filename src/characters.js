import * as THREE from 'three';
import { col } from './util.js';
import { canvasTex, std, mesh } from './render.js';

/* ================= Characters & karts ================= */
const CHARS = [
  { id: 'shark', name: 'Žralok Žorž', skin: 0x4f86c6, kart: 0xfb5607, stats: { speed: 1.07, accel: 0.93, handling: 0.95 } },
  { id: 'giraffe', name: 'Žirafa Žofie', skin: 0xf6c453, kart: 0x06b6a4, shirt: 0xef476f, camUp: 5.1, camBack: 10.5, stats: { speed: 1.03, accel: 0.96, handling: 0.98 } },
  { id: 'deer', name: 'Jelen Jarda', skin: 0xb0703f, kart: 0x8338ec, shirt: 0x06b6a4, stats: { speed: 1.0, accel: 1.02, handling: 1.03 } },
  { id: 'frog', name: 'Žabák Franta', skin: 0x5cbf4a, kart: 0xef476f, shirt: 0xf5f5f0, stats: { speed: 0.96, accel: 1.1, handling: 1.08 } },
  { id: 'bunny', name: 'Zajíček Bobek', skin: 0xf7f4ef, kart: 0x3a86ff, shirt: 0xffc93c, stats: { speed: 0.97, accel: 1.08, handling: 1.12 } },
  { id: 'elephant', name: 'Slonice Ela', skin: 0xa7aecb, kart: 0xffc93c, shirt: 0x3a86ff, stats: { speed: 1.09, accel: 0.9, handling: 0.92 } },
];

const SPH = new THREE.SphereGeometry(1, 28, 20);
const M = {
  white: std(0xffffff, { roughness: 0.25 }),
  black: std(0x15151a, { roughness: 0.25 }),
  pink: std(0xffa3b8, { roughness: 0.7 }),
  blush: std(0xff8fa3, { roughness: 0.8 }),
};
function part(parent, geo, mat, x, y, z, sx = 1, sy = sx, sz = sx) {
  const m = mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}
function group(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function eye(parent, x, y, z, r, yaw = 0) {
  const g = group(parent, x, y, z);
  g.rotation.y = yaw;
  part(g, SPH, M.white, 0, 0, 0, r);
  part(g, SPH, M.black, 0, r * 0.05, r * 0.72, r * 0.62, r * 0.68, r * 0.38);
  part(g, SPH, M.white, r * 0.2, r * 0.3, r * 1.04, r * 0.2, r * 0.2, r * 0.1);
}
function smile(parent, x, y, z, r, color = 0x7a2130) {
  const m = part(parent, new THREE.TorusGeometry(r, 0.035, 8, 20, Math.PI), std(color), x, y, z);
  m.rotation.z = Math.PI;
  return m;
}
function cheeks(parent, x, y, z) { for (const s of [-1, 1]) { const c = part(parent, SPH, M.blush, s * x, y, z, 0.11, 0.08, 0.04); c.rotation.y = s * 0.6; } }
function shirtTorso(g, ch) {
  part(g, SPH, std(ch.shirt, { roughness: 0.7 }), 0, 1.3, -0.45, 0.5, 0.55, 0.43);
  for (const s of [-1, 1]) part(g, SPH, std(ch.skin, { roughness: 0.7 }), s * 0.22, 1.3, 0.3, 0.13);
}
function spotTexture(base, spot, n) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = spot;
    for (let i = 0; i < n; i++) {
      const cx = (((i * 97) % 11) / 11) * w + (i % 3) * 9, cy = (((i * 53) % 13) / 13) * h, r = 13 + (i % 4) * 4;
      g.beginPath();
      for (let k = 0; k <= 7; k++) {
        const a = (k / 7) * Math.PI * 2, rr = r * (0.75 + ((i * 7 + k * 13) % 10) / 30);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        if (k) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.fill();
    }
  }, true);
}
let giraffeMat = null;

const SPECIES = {
  shark(g, ch) {
    const skin = std(ch.skin, { roughness: 0.4 }), belly = std(0xf2f5f8, { roughness: 0.6 });
    part(g, SPH, skin, 0, 1.5, -0.4, 0.62, 0.9, 0.6);
    part(g, SPH, belly, 0, 1.4, -0.08, 0.44, 0.7, 0.32);
    for (const s of [-1, 1]) { const f = part(g, SPH, skin, s * 0.7, 1.4, -0.25, 0.48, 0.1, 0.26); f.rotation.z = -s * 0.45; }
    const fin = new THREE.Shape();
    fin.moveTo(-0.45, 0); fin.lineTo(0.45, 0); fin.quadraticCurveTo(0.35, 0.55, 0.7, 1.15); fin.quadraticCurveTo(0.05, 0.75, -0.45, 0);
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3 });
    fg.translate(0, 0, -0.1); fg.rotateY(Math.PI / 2);
    part(g, fg, skin, 0, 2.35, -0.6);
    const tail = group(g, 0, 1.35, -1.25);
    for (const s of [-1, 1]) { const t = part(tail, SPH, skin, 0, s * 0.3, -0.25, 0.08, 0.42, 0.18); t.rotation.x = -s * 0.7; }
    const h = group(g, 0, 2.02, -0.3);
    part(h, SPH, skin, 0, 0, 0, 0.62, 0.58, 0.62);
    part(h, SPH, belly, 0, -0.2, 0.28, 0.46, 0.32, 0.36);
    eye(h, -0.3, 0.12, 0.44, 0.16, -0.45); eye(h, 0.3, 0.12, 0.44, 0.16, 0.45);
    smile(h, 0, -0.16, 0.6, 0.2);
    for (const s of [-1, 1]) { const t = part(h, new THREE.ConeGeometry(0.035, 0.09, 6), M.white, s * 0.08, -0.34, 0.6); t.rotation.x = Math.PI; }
    cheeks(h, 0.4, -0.1, 0.4);
    return h;
  },
  giraffe(g, ch) {
    if (!giraffeMat) giraffeMat = new THREE.MeshStandardMaterial({ map: spotTexture('#f6c453', '#b8692e', 40), roughness: 0.7 });
    const sp = giraffeMat, brown = std(0x8a4b22, { roughness: 0.7 }), muzzle = std(0xf3dfb0, { roughness: 0.7 });
    shirtTorso(g, ch);
    const n = group(g, 0, 1.55, -0.45);
    n.rotation.x = 0.14;
    part(n, new THREE.CylinderGeometry(0.19, 0.27, 1.6, 16), sp, 0, 0.8, 0);
    part(n, new THREE.BoxGeometry(0.1, 1.45, 0.14), brown, 0, 0.85, -0.22);
    part(n, SPH, sp, 0, 1.7, 0.08, 0.36, 0.36, 0.5);
    part(n, SPH, muzzle, 0, 1.6, 0.5, 0.27, 0.24, 0.25);
    for (const s of [-1, 1]) {
      part(n, SPH, M.black, s * 0.08, 1.66, 0.72, 0.035);
      eye(n, s * 0.24, 1.82, 0.26, 0.13, s * 0.5);
      part(n, new THREE.CylinderGeometry(0.05, 0.06, 0.34, 8), sp, s * 0.14, 2.1, -0.06);
      part(n, SPH, brown, s * 0.14, 2.28, -0.06, 0.085);
      const e = part(n, SPH, sp, s * 0.38, 1.9, -0.08, 0.22, 0.08, 0.11); e.rotation.z = -s * 0.35;
    }
    cheeks(n, 0.27, 1.58, 0.36);
    smile(n, 0, 1.55, 0.7, 0.1);
    return n;
  },
  deer(g, ch) {
    const skin = std(ch.skin, { roughness: 0.7 }), light = std(0xf1dcc0, { roughness: 0.7 }), ant = std(0xe9d3a4, { roughness: 0.6 });
    shirtTorso(g, ch);
    const h = group(g, 0, 2.1, -0.35);
    part(h, SPH, skin, 0, 0, 0, 0.56, 0.54, 0.56);
    part(h, SPH, light, 0, -0.17, 0.4, 0.3, 0.24, 0.34);
    part(h, SPH, M.black, 0, -0.06, 0.72, 0.1, 0.075, 0.075);
    for (const s of [-1, 1]) {
      eye(h, s * 0.24, 0.1, 0.43, 0.15, s * 0.35);
      const e = part(h, SPH, skin, s * 0.6, 0.12, -0.05, 0.3, 0.12, 0.16); e.rotation.z = s * 0.35;
      const ei = part(h, SPH, M.pink, s * 0.6, 0.12, 0.02, 0.22, 0.08, 0.1); ei.rotation.z = s * 0.35;
      const a = group(h, s * 0.22, 0.42, -0.1);
      a.rotation.z = -s * 0.5;
      part(a, new THREE.CylinderGeometry(0.05, 0.07, 1.0, 8), ant, 0, 0.5, 0);
      part(a, SPH, ant, 0, 1.0, 0, 0.07);
      for (const [y, ang, len] of [[0.35, 0.9, 0.42], [0.65, -0.8, 0.38], [0.85, 0.7, 0.3]]) {
        const t = group(a, 0, y, 0);
        t.rotation.z = s * ang;
        part(t, new THREE.CylinderGeometry(0.035, 0.05, len, 8), ant, 0, len / 2, 0);
        part(t, SPH, ant, 0, len, 0, 0.05);
      }
    }
    cheeks(h, 0.36, -0.1, 0.42);
    for (const [x, y] of [[-0.25, 1.55], [0.2, 1.4], [0.02, 1.2], [-0.15, 1.15], [0.28, 1.2]]) part(g, SPH, M.white, x, y, -0.86, 0.06, 0.06, 0.03);
    return h;
  },
  frog(g, ch) {
    const skin = std(ch.skin, { roughness: 0.4 }), belly = std(0xd8f0a8, { roughness: 0.6 }), dark = std(0x3f8f35, { roughness: 0.5 });
    const gold = std(0xffc93c, { metalness: 0.6, roughness: 0.25 });
    shirtTorso(g, ch);
    const h = group(g, 0, 2.0, -0.3);
    part(h, SPH, skin, 0, 0, 0, 0.8, 0.5, 0.62);
    part(h, SPH, belly, 0, -0.15, 0.16, 0.68, 0.34, 0.47);
    for (const s of [-1, 1]) {
      part(h, SPH, skin, s * 0.4, 0.4, 0.02, 0.3);
      eye(h, s * 0.4, 0.46, 0.2, 0.2, s * 0.2);
      part(h, SPH, dark, s * 0.32, 0.2, -0.5, 0.15, 0.1, 0.07);
    }
    part(h, SPH, dark, 0, 0.28, -0.52, 0.12, 0.09, 0.06);
    smile(h, 0, -0.04, 0.55, 0.38, 0x2f5d22);
    cheeks(h, 0.55, -0.08, 0.34);
    const c = group(h, 0, 0.55, -0.12);
    part(c, new THREE.CylinderGeometry(0.24, 0.27, 0.16, 18), gold, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      part(c, new THREE.ConeGeometry(0.07, 0.2, 6), gold, Math.sin(a) * 0.22, 0.17, Math.cos(a) * 0.22);
      part(c, SPH, gold, Math.sin(a) * 0.22, 0.29, Math.cos(a) * 0.22, 0.035);
    }
    part(c, SPH, std(0xef476f, { roughness: 0.15 }), 0, 0.02, 0.27, 0.06);
    return h;
  },
  bunny(g, ch) {
    const skin = std(ch.skin, { roughness: 0.8 });
    shirtTorso(g, ch);
    part(g, SPH, skin, 0, 1.62, -1.1, 0.26);
    const h = group(g, 0, 2.1, -0.35);
    part(h, SPH, skin, 0, 0, 0, 0.56, 0.54, 0.54);
    for (const s of [-1, 1]) {
      part(h, SPH, skin, s * 0.13, -0.18, 0.42, 0.19, 0.15, 0.15);
      eye(h, s * 0.22, 0.1, 0.43, 0.15, s * 0.3);
      const e = group(h, s * 0.2, 0.4, -0.08);
      e.rotation.z = -s * 0.14;
      if (s < 0) e.rotation.x = -0.35;
      part(e, SPH, skin, 0, 0.62, 0, 0.17, 0.64, 0.1);
      part(e, SPH, M.pink, 0, 0.62, 0.05, 0.1, 0.5, 0.06);
    }
    part(h, SPH, M.pink, 0, -0.07, 0.55, 0.08, 0.06, 0.06);
    part(h, new THREE.BoxGeometry(0.15, 0.13, 0.05), M.white, 0, -0.33, 0.49);
    cheeks(h, 0.36, -0.12, 0.4);
    return h;
  },
  elephant(g, ch) {
    const skin = std(ch.skin, { roughness: 0.7 });
    shirtTorso(g, ch);
    const h = group(g, 0, 2.1, -0.35);
    part(h, SPH, skin, 0, 0, 0, 0.6, 0.56, 0.58);
    for (const s of [-1, 1]) {
      const e = part(h, SPH, skin, s * 0.74, 0.02, -0.14, 0.52, 0.56, 0.08); e.rotation.y = -s * 0.35;
      const ei = part(h, SPH, M.pink, s * 0.72, 0.02, -0.08, 0.38, 0.42, 0.05); ei.rotation.y = -s * 0.35;
      eye(h, s * 0.24, 0.13, 0.45, 0.14, s * 0.35);
      const t = part(h, new THREE.ConeGeometry(0.05, 0.26, 8), M.white, s * 0.2, -0.32, 0.46); t.rotation.x = 1.9;
    }
    const trunk = new THREE.CatmullRomCurve3([[0, -0.05, 0.45], [0, -0.3, 0.7], [0, -0.55, 0.76], [0, -0.64, 0.93], [0, -0.52, 1.05]].map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    part(h, new THREE.TubeGeometry(trunk, 24, 0.11, 12), skin, 0, 0, 0);
    part(h, SPH, skin, 0, -0.52, 1.05, 0.11);
    for (const x of [-0.08, 0, 0.08]) { const hr = part(h, new THREE.CylinderGeometry(0.015, 0.02, 0.22, 5), std(0x5b5f75), x, 0.62, -0.02); hr.rotation.z = -x * 3; }
    cheeks(h, 0.38, -0.1, 0.42);
    return h;
  },
};
function makeDriver(ch) {
  const g = new THREE.Group();
  const head = SPECIES[ch.id](g, ch);
  return { group: g, head };
}

function makePortraits() {
  let r = null;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(192, 192); r.outputEncoding = THREE.sRGBEncoding;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(col(0xffffff), col(0x8890aa), 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(3, 5, 6); sc.add(dl);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
    return CHARS.map((ch) => {
      const d = makeDriver(ch);
      sc.add(d.group);
      d.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(d.group);
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const dist = (Math.max(sz.x, sz.y) * 0.62) / Math.tan((13 * Math.PI) / 180);
      cam.position.set(c.x + dist * 0.42, c.y + dist * 0.1, c.z + dist * 0.9);
      cam.lookAt(c);
      r.render(sc, cam);
      const url = r.domElement.toDataURL('image/png');
      sc.remove(d.group);
      return url;
    });
  } catch (e) {
    return [];
  } finally {
    if (r) { r.dispose(); if (r.forceContextLoss) r.forceContextLoss(); }
  }
}

function makeKart(ch) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const paint = std(ch.kart, { roughness: 0.32, metalness: 0.15 });
  const dark = std(0x23262f, { roughness: 0.8 }), chrome = std(0xd7dde6, { metalness: 0.75, roughness: 0.25 });
  const add = (geo, mat, x, y, z, parent = body) => { const m = mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  add(new THREE.BoxGeometry(1.7, 0.3, 3.0), paint, 0, 0.55, 0);
  add(new THREE.BoxGeometry(1.3, 0.32, 1.1), paint, 0, 0.78, 1.15).rotation.x = 0.22;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.42, 1.8), paint, s * 0.95, 0.62, -0.1);
  add(new THREE.BoxGeometry(2.1, 0.22, 0.35), dark, 0, 0.5, 1.72);
  add(new THREE.BoxGeometry(1.2, 0.9, 0.25), dark, 0, 1.05, -0.95);
  add(new THREE.BoxGeometry(2.0, 0.1, 0.55), paint, 0, 1.6, -1.55);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.1, 0.75, 0.2), dark, s * 0.6, 1.22, -1.5);
    add(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 10), chrome, s * 0.35, 0.72, -1.65).rotation.x = Math.PI / 2;
  }
  add(new THREE.TorusGeometry(0.22, 0.05, 8, 18), dark, 0, 1.28, 0.35).rotation.x = -0.9;
  const wGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.44, 18).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.46, 10).rotateZ(Math.PI / 2);
  const wheels = [], pivots = [];
  for (const [x, z, front] of [[-1.05, 1.05, 1], [1.05, 1.05, 1], [-1.08, -1.0, 0], [1.08, -1.0, 0]]) {
    const pv = new THREE.Group(); pv.position.set(x, 0.48, z); root.add(pv);
    const w = new THREE.Group(); pv.add(w);
    w.add(mesh(wGeo, dark), mesh(hubGeo, chrome));
    wheels.push(w);
    if (front) pivots.push(pv);
  }
  const driver = makeDriver(ch);
  body.add(driver.group);
  const head = driver.head;
  return { root, body, wheels, pivots, head };
}

export { CHARS, makeKart, makePortraits };
