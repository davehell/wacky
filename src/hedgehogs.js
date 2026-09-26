import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rnd, clamp } from './util.js';
import { scene, canvasTex, std, mesh } from './render.js';
import { N, W, P, S, headingAt } from './track.js';

/* ================= Roadside hedgehogs ================= */
// As in Wacky Wheels, hedgehogs sit on the road going about their business; driving over one adds it to
// the kart's ammo. Every hedgehog has one of several everyday activities and switches to another now and then.
const MAX_HOGS = 10, SIZE = 1.2, PICK_R = 2.6;

const SPH = new THREE.SphereGeometry(1, 20, 14);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 16);
const CONE = new THREE.ConeGeometry(1, 1, 12);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const BOWL = new THREE.CylinderGeometry(1, 0.7, 1, 20);
const RING = new THREE.TorusGeometry(1, 0.2, 8, 20);
const ARC = new THREE.TorusGeometry(1, 0.28, 6, 12, Math.PI);
const CANOPY = new THREE.ConeGeometry(1, 0.5, 12, 1, true);
const ROPE = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, n) => {
  const u = n / 12;
  return new THREE.Vector3(-0.55 + 1.1 * u, -Math.sin(Math.PI * u) * 0.8, 0);
})), 24, 0.025, 5);

const M = {
  spike: std(0x5a3620, { roughness: 0.85 }),
  fur: std(0x9a6a3e, { roughness: 0.8 }),
  cream: std(0xf3d9b1, { roughness: 0.75 }),
  paw: std(0xd9a066, { roughness: 0.75 }),
  black: std(0x1b1b22, { roughness: 0.25 }),
  white: std(0xffffff, { roughness: 0.3 }),
  blush: std(0xff8fa3, { roughness: 0.8 }),
  mouth: std(0x7a2130),
  porcelain: std(0xf7f7f4, { roughness: 0.15 }),
  metal: std(0xb8c0cc, { metalness: 0.6, roughness: 0.3 }),
  wood: std(0xb07a45, { roughness: 0.8 }),
  red: std(0xe63946, { roughness: 0.35 }),
  yellow: std(0xffc93c, { roughness: 0.4 }),
  blue: std(0x3a86ff, { roughness: 0.4 }),
  green: std(0x57b146, { roughness: 0.6 }),
  orange: std(0xf08a24, { roughness: 0.45 }),
  dark: std(0x2b2d42, { roughness: 0.4 }),
  pink: std(0xf7a8b8, { roughness: 0.6 }),
  glass: std(0x8fd3ff, { roughness: 0.1, transparent: true, opacity: 0.75 }),
};

const texMat = (tex, opts) => new THREE.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.8 }, opts));
const stripes = (colors, n, vertical = true) => canvasTex(64, 64, (g, w, h) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    if (vertical) g.fillRect((i * w) / n, 0, w / n + 1, h); else g.fillRect(0, (i * h) / n, w, h / n + 1);
  }
});
const NEWS_FRONT = texMat(canvasTex(256, 192, (g, w, h) => {
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#14213d'; g.font = '40px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('NOVINY', w / 2, 34); g.fillRect(12, 60, w - 24, 4);
  g.fillStyle = '#a9dcfb'; g.fillRect(14, 74, 110, 104);
  g.fillStyle = '#ef476f'; g.fillRect(34, 128, 70, 22);
  g.fillStyle = '#14213d';
  for (const x of [48, 92]) { g.beginPath(); g.arc(x, 154, 11, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#9aa0ab';
  for (let y = 80; y < 176; y += 12) g.fillRect(134, y, 108, 5);
}, false, true));
const NEWS_INNER = texMat(canvasTex(256, 192, (g, w, h) => {
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9aa0ab';
  for (let y = 14; y < h - 10; y += 12) { g.fillRect(12, y, 108, 5); g.fillRect(136, y, 108, 5); }
}));
const CHAIR_MAT = texMat(stripes(['#3a86ff', '#ffffff'], 8));
const PARASOL_MAT = texMat(stripes(['#ef476f', '#fff4d6'], 12), { side: THREE.DoubleSide });
const UMBRELLA_MAT = texMat(stripes(['#ef476f', '#ffc93c', '#06b6a4', '#3a86ff', '#8338ec', '#fb5607'], 12), { side: THREE.DoubleSide });
const BLANKET_MAT = texMat(canvasTex(64, 64, (g) => {
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#ffffff' : '#f7a8b8'; g.fillRect(x * 16, y * 16, 16, 16); }
}));
const checkTex = canvasTex(64, 48, (g) => { for (let x = 0; x < 8; x++) for (let y = 0; y < 6; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); } });
checkTex.magFilter = THREE.NearestFilter;
const CHECK_MAT = texMat(checkTex, { side: THREE.DoubleSide });
const SIGN_MAT = texMat(canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#ffc93c'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#14213d'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = '#14213d'; g.font = '62px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('HURÁ!', w / 2, h / 2 + 4);
}, false, true));
const Z_TEX = canvasTex(64, 64, (g) => {
  g.font = '50px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.strokeText('Z', 32, 34);
  g.fillStyle = '#3a86ff'; g.fillText('Z', 32, 34);
}, false, true);
const NOTE_TEX = canvasTex(64, 64, (g) => {
  g.fillStyle = '#8338ec';
  for (const [x, y] of [[20, 50], [46, 44]]) { g.beginPath(); g.ellipse(x, y, 10, 7, -0.35, 0, Math.PI * 2); g.fill(); }
  g.fillRect(26, 12, 5, 38); g.fillRect(52, 6, 5, 38);
  g.beginPath(); g.moveTo(26, 12); g.lineTo(57, 6); g.lineTo(57, 15); g.lineTo(26, 21); g.fill();
});

// Spikes along the part of an ellipsoid that `keep` selects, merged into one geometry and swept backwards
function spikes(n, rx, ry, rz, keep, len, rad) {
  const cone = new THREE.ConeGeometry(rad, len, 5).translate(0, len / 2, 0);
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  const geos = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), th = i * 2.39996;
    const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    if (!keep(d)) continue;
    const nrm = new THREE.Vector3(d.x / rx, d.y / ry, d.z / rz).normalize();
    nrm.z -= 0.45; nrm.normalize();
    q.setFromUnitVectors(up, nrm);
    m.compose(new THREE.Vector3(d.x * rx, d.y * ry, d.z * rz).multiplyScalar(0.9), q, one);
    geos.push(cone.clone().applyMatrix4(m));
  }
  return BufferGeometryUtils.mergeBufferGeometries(geos);
}
const BODY_SPIKES = spikes(90, 0.42, 0.44, 0.38, (d) => d.z < 0.2 && d.y > -0.6, 0.3, 0.075).translate(0, 0.5, -0.02);
const HEAD_SPIKES = spikes(70, 0.4, 0.4, 0.4, (d) => d.z < 0.05 && d.y > -0.35, 0.26, 0.07);

/* ---------- The hedgehog ---------- */
// Props of the activity being built are collected here so the next switch can remove them
let bag = null;
function part(parent, geo, mat, x, y, z, sx = 1, sy = sx, sz = sx) {
  const m = mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  parent.add(m);
  if (bag) bag.push(m);
  return m;
}
function group(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  if (bag) bag.push(g);
  return g;
}

// Local +z is the face; the root is turned to face oncoming karts
function makeHedgehog() {
  const root = new THREE.Group(), body = group(root, 0, 0, 0);
  const legs = [1, -1].map((s) => { const l = group(body, s * 0.2, 0.22, 0.02); part(l, SPH, M.paw, 0, -0.14, 0.12, 0.13, 0.08, 0.19); return l; });
  part(body, SPH, M.fur, 0, 0.5, -0.02, 0.42, 0.44, 0.38);
  part(body, SPH, M.cream, 0, 0.47, 0.12, 0.33, 0.35, 0.28);
  body.add(mesh(BODY_SPIKES, M.spike));
  const head = group(body, 0, 1.0, 0.04);
  part(head, SPH, M.fur, 0, 0, 0, 0.4);
  head.add(mesh(HEAD_SPIKES, M.spike));
  part(head, SPH, M.cream, 0, -0.06, 0.16, 0.32, 0.29, 0.28);
  part(head, SPH, M.cream, 0, -0.1, 0.38, 0.14, 0.12, 0.2);
  part(head, SPH, M.black, 0, -0.07, 0.57, 0.07);
  const mouth = part(head, ARC, M.mouth, 0, -0.19, 0.4, 0.06); mouth.rotation.set(-0.3, 0, Math.PI);
  const eyes = group(head, 0, 0, 0), closed = group(head, 0, 0, 0);
  const arms = [], hands = [];
  for (const s of [1, -1]) {
    part(eyes, SPH, M.black, s * 0.14, 0.07, 0.36, 0.065, 0.085, 0.05);
    part(eyes, SPH, M.white, s * 0.14 + 0.02, 0.1, 0.4, 0.022);
    const c = part(closed, ARC, M.black, s * 0.14, 0.05, 0.37, 0.055); c.rotation.z = Math.PI;
    const ch = part(head, SPH, M.blush, s * 0.25, -0.12, 0.3, 0.07, 0.05, 0.03); ch.rotation.y = s * 0.6;
    part(head, SPH, M.fur, s * 0.27, 0.25, 0.02, 0.1, 0.1, 0.06);
    const a = group(body, s * 0.36, 0.68, 0.06);
    part(a, SPH, M.fur, 0, -0.17, 0, 0.09, 0.2, 0.09);
    part(a, SPH, M.paw, 0, -0.36, 0, 0.085);
    arms.push(a); hands.push(group(a, 0, -0.38, 0));
  }
  closed.visible = false;
  return { root, body, head, arms, hands, legs, eyes, closed };
}

// x < 0 swings the arm forward, z > 0 lifts it outwards (mirrored for the second arm)
function setArm(c, i, x, z) { c.arms[i].rotation.set(x, 0, i ? -z : z); }
// 0 = paw in the lap, 1 = paw at the mouth
function toMouth(c, i, f) { setArm(c, i, -0.7 - 1.3 * f, 0.05 - 0.63 * f); }
function sipCycle(t, rate) { const v = clamp((Math.sin(t * rate) + 0.2) / 0.6, 0, 1); return v * v * (3 - 2 * v); }
function rest(c) {
  c.body.position.set(0, 0, 0); c.body.rotation.set(0, 0, 0); c.body.scale.set(1, 1, 1);
  c.head.rotation.set(0, 0, 0);
  setArm(c, 0, -0.15, 0.3); setArm(c, 1, -0.15, 0.3);
  for (const l of c.legs) l.rotation.set(0, 0, 0);
  c.eyes.visible = true; c.closed.visible = false;
}
// Something that rises from a point and fades: sleeping Zs, music notes, steam
function floater(c, obj, x, y, z, speed, off, rise = 0.9) {
  obj.material.transparent = true; obj.material.depthWrite = false;
  obj.userData.own = true;
  c.root.add(obj); bag.push(obj);
  const base = obj.scale.x;
  return (t) => {
    const p = (t * speed + off) % 1;
    obj.position.set(x + Math.sin(p * 6) * 0.12, y + p * rise, z);
    obj.material.opacity = Math.sin(p * Math.PI);
    obj.scale.setScalar(base * (0.6 + p * 0.6));
  };
}
const sprite = (tex, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex })); s.scale.set(size, size, 1); return s; };
const puff = () => { const m = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xffffff })); m.scale.setScalar(0.08); return m; };

/* ---------- Activities ---------- */
// Each one adds its props and pose, and returns the per-frame animation
const ACTS = [
  function toilet(c) {
    part(c.root, BOWL, M.porcelain, 0, 0.27, -0.08, 0.42, 0.54, 0.4);
    const seat = part(c.root, RING, M.porcelain, 0, 0.56, -0.05, 0.36); seat.rotation.x = Math.PI / 2;
    part(c.root, BOX, M.porcelain, 0, 1.1, -0.74, 1.15, 0.95, 0.3);
    part(c.root, CYL, M.metal, 0.38, 1.6, -0.74, 0.08, 0.05, 0.08);
    part(c.root, CYL, M.metal, 0.8, 0.36, -0.1, 0.03, 0.72, 0.03);
    const roll = part(c.root, CYL, M.white, 0.8, 0.66, -0.1, 0.14, 0.2, 0.14); roll.rotation.z = Math.PI / 2;
    c.body.position.y = 0.5;
    setArm(c, 0, -0.9, 0.15); setArm(c, 1, -0.9, 0.15);
    const note = floater(c, sprite(NOTE_TEX, 0.4), 0.35, 1.8, 0.2, 0.45, 0);
    return (t) => {
      c.legs[0].rotation.x = Math.sin(t * 4) * 0.5 - 0.5;
      c.legs[1].rotation.x = -Math.sin(t * 4) * 0.5 - 0.5;
      c.head.rotation.z = Math.sin(t * 2) * 0.12;
      note(t);
    };
  },
  function newspaper(c) {
    part(c.root, CYL, M.wood, 0, 0.2, -0.05, 0.36, 0.4, 0.36);
    c.body.position.y = 0.36;
    const paper = group(c.body, 0, 0.56, 0.7);
    part(paper, PLANE, NEWS_FRONT, 0, 0, 0, 0.95, 0.7, 1);
    part(paper, PLANE, NEWS_INNER, 0, 0, -0.01, 0.95, 0.7, 1).rotation.y = Math.PI;
    return (t) => {
      // now and then the paper goes down to watch the race
      const peek = Math.pow(Math.max(0, Math.sin(t * 0.8)), 6);
      paper.position.y = 0.56 - peek * 0.2;
      paper.rotation.x = -0.15 + peek * 0.15;
      c.head.rotation.x = 0.2 * (1 - peek);
      c.head.rotation.y = Math.sin(t * 1.4) * 0.25 * (1 - peek);
      setArm(c, 0, -1.4 + peek * 0.3, 0.35); setArm(c, 1, -1.4 + peek * 0.3, 0.35);
    };
  },
  function sunbathe(c) {
    part(c.root, BOX, CHAIR_MAT, 0, 0.32, 0.22, 0.9, 0.05, 0.8);
    part(c.root, BOX, CHAIR_MAT, 0, 0.62, -0.32, 0.9, 0.05, 0.95).rotation.x = 1.1;
    for (const s of [-1, 1]) {
      part(c.root, BOX, M.wood, s * 0.47, 0.16, 0.5, 0.05, 0.32, 0.05);
      part(c.root, BOX, M.wood, s * 0.47, 0.5, -0.4, 0.05, 1.0, 0.05).rotation.x = -0.45;
      part(c.head, CYL, M.black, s * 0.14, 0.07, 0.4, 0.11, 0.03, 0.09).rotation.x = Math.PI / 2;
    }
    part(c.head, BOX, M.black, 0, 0.09, 0.42, 0.14, 0.025, 0.02);
    part(c.root, CYL, M.white, -1.0, 1.1, -0.15, 0.035, 2.2, 0.035);
    part(c.root, CANOPY, PARASOL_MAT, -1.0, 2.25, -0.15, 1.1, 1, 1.1);
    part(c.root, CYL, M.glass, 0.78, 0.13, 0.45, 0.08, 0.26, 0.08);
    part(c.root, CYL, M.pink, 0.8, 0.33, 0.45, 0.012, 0.3, 0.012).rotation.z = -0.3;
    c.eyes.visible = false;
    c.body.position.set(0, 0.32, 0.2); c.body.rotation.x = -0.6;
    c.head.rotation.x = 0.45;
    setArm(c, 1, 0.2, 2.5); setArm(c, 0, -0.3, 0.55);
    return (t) => {
      c.legs[0].rotation.x = -0.3 + Math.max(0, Math.sin(t * 6)) * 0.35;
      c.legs[1].rotation.x = -0.3;
      c.body.scale.y = 1 + Math.sin(t * 1.5) * 0.02;
      c.head.rotation.z = Math.sin(t * 0.7) * 0.1;
    };
  },
  function sleep(c) {
    part(c.root, BOX, BLANKET_MAT, -0.45, 0.02, 0.05, 2.0, 0.04, 1.1);
    part(c.root, SPH, M.white, -1.05, 0.14, 0.02, 0.4, 0.14, 0.32);
    c.body.position.set(-0.05, 0.42, 0); c.body.rotation.z = 1.35;
    c.eyes.visible = false; c.closed.visible = true;
    setArm(c, 0, -0.5, 0.2); setArm(c, 1, -0.7, 0.9);
    const zs = [0, 0.5].map((off) => floater(c, sprite(Z_TEX, 0.45), -0.8, 1.1, 0.3, 0.35, off, 1.2));
    return (t) => {
      const b = Math.sin(t * 1.6) * 0.03;
      c.body.scale.set(1 + b, 1 + b, 1);
      c.head.rotation.z = Math.sin(t * 0.4) * 0.05;
      zs.forEach((z) => z(t));
    };
  },
  function apple(c) {
    const a = group(c.hands[0], 0, -0.1, 0.1);
    part(a, SPH, M.red, 0, 0, 0, 0.15);
    part(a, CYL, M.wood, 0, 0.16, 0, 0.015, 0.08, 0.015);
    part(a, SPH, M.green, 0.05, 0.17, 0, 0.06, 0.02, 0.035).rotation.z = 0.5;
    setArm(c, 1, -0.4, 0.25);
    return (t) => {
      const f = sipCycle(t, 1.6);
      toMouth(c, 0, f);
      c.head.rotation.x = f * Math.sin(t * 14) * 0.06;
      c.body.position.y = Math.abs(Math.sin(t * 0.8)) * 0.03;
    };
  },
  function guitar(c) {
    const g = group(c.body, -0.05, 0.5, 0.44);
    g.rotation.set(0.15, 0, -1.0);
    part(g, SPH, M.orange, 0, 0, 0, 0.28, 0.3, 0.09);
    part(g, SPH, M.orange, 0, 0.32, 0, 0.22, 0.22, 0.09);
    part(g, CYL, M.black, 0, 0.12, 0.08, 0.08, 0.02, 0.08).rotation.x = Math.PI / 2;
    part(g, BOX, M.wood, 0, 0.78, 0.03, 0.08, 0.72, 0.04);
    part(g, BOX, M.dark, 0, 1.18, 0.03, 0.12, 0.16, 0.05);
    const notes = [0, 0.5].map((off) => floater(c, sprite(NOTE_TEX, 0.4), off ? -0.5 : 0.5, 1.5, 0.3, 0.4, off));
    return (t) => {
      setArm(c, 0, -1.9, 0.55 + Math.sin(t * 1.2) * 0.05);
      setArm(c, 1, -1.15 + Math.sin(t * 14) * 0.25, -0.1);
      c.head.rotation.z = Math.sin(t * 3.5) * 0.15;
      c.head.rotation.x = 0.1;
      c.body.position.y = Math.abs(Math.sin(t * 3.5)) * 0.04;
      notes.forEach((n) => n(t));
    };
  },
  function balloon(c) {
    const h = c.hands[0];
    part(h, CYL, M.white, 0, -0.62, 0, 0.012, 1.24, 0.012);
    part(h, CONE, M.red, 0, -1.24, 0, 0.06, 0.1, 0.06);
    part(h, SPH, M.red, 0, -1.68, 0, 0.36, 0.44, 0.36);
    return (t) => {
      setArm(c, 0, -0.15 + Math.sin(t * 1.1) * 0.1, 2.75 + Math.sin(t * 1.7) * 0.08);
      setArm(c, 1, -0.2, 0.35 + Math.max(0, Math.sin(t * 5)) * 0.5);
      c.body.position.y = Math.abs(Math.sin(t * 3)) * 0.14;
      c.head.rotation.z = Math.sin(t * 1.5) * 0.1;
    };
  },
  function juggle(c) {
    const balls = [M.red, M.yellow, M.blue].map((m) => part(c.body, SPH, m, 0, 0, 0, 0.12));
    return (t) => {
      balls.forEach((b, i) => {
        const a = (t * 1.3 + i / 3) * Math.PI * 2;
        b.position.set(Math.cos(a) * 0.55, 1.65 + Math.sin(a) * 0.45, 0.6);
      });
      for (const i of [0, 1]) setArm(c, i, -2.5 + Math.sin(t * 8.2 + i * Math.PI) * 0.2, 0.15);
      c.head.rotation.x = -0.2;
    };
  },
  function flag(c) {
    const h = c.hands[0];
    part(h, CYL, M.white, 0, -0.55, 0, 0.025, 1.4, 0.025);
    const f = group(h, 0, -1.0, 0);
    part(f, PLANE, CHECK_MAT, 0.4, 0, 0, 0.8, 0.55, 1);
    setArm(c, 1, -0.1, 0.7);
    return (t) => {
      setArm(c, 0, -0.3, 2.3 + Math.sin(t * 5) * 0.45);
      f.rotation.y = Math.sin(t * 10) * 0.35;
      c.body.rotation.y = Math.sin(t * 2.5) * 0.15;
      c.body.position.y = Math.abs(Math.sin(t * 5)) * 0.05;
    };
  },
  function umbrella(c) {
    const u = group(c.hands[0], 0, 0, 0);
    u.rotation.x = 1.5;
    part(u, CYL, M.dark, 0, 0.7, 0, 0.025, 1.5, 0.025);
    const top = group(u, 0, 1.42, 0);
    part(top, CANOPY, UMBRELLA_MAT, 0, 0, 0, 0.9, 0.8, 0.9);
    part(top, SPH, M.dark, 0, 0.22, 0, 0.05);
    setArm(c, 0, -1.5, 0.1); setArm(c, 1, -0.2, 0.35);
    return (t) => {
      top.rotation.y = t * 1.5;
      c.body.rotation.z = Math.sin(t * 2) * 0.08;
      c.body.position.y = Math.abs(Math.sin(t * 2)) * 0.05;
      c.head.rotation.z = Math.sin(t * 2 + 0.5) * 0.12;
    };
  },
  function tea(c) {
    part(c.root, SPH, M.red, 0, 0.07, 0, 0.55, 0.12, 0.5);
    part(c.root, CYL, M.wood, 0.85, 0.45, 0.2, 0.32, 0.05, 0.32);
    part(c.root, CYL, M.wood, 0.85, 0.22, 0.2, 0.05, 0.45, 0.05);
    part(c.root, SPH, M.pink, 0.85, 0.6, 0.2, 0.17, 0.14, 0.17);
    part(c.root, SPH, M.pink, 0.85, 0.75, 0.2, 0.045);
    part(c.root, CONE, M.pink, 0.66, 0.66, 0.2, 0.04, 0.18, 0.04).rotation.z = 1.0;
    const mug = group(c.hands[0], 0, -0.08, 0.1);
    part(mug, CYL, M.white, 0, 0, 0, 0.08, 0.15, 0.08);
    part(mug, RING, M.white, 0.09, 0, 0, 0.045);
    c.body.position.y = 0.14;
    setArm(c, 1, -0.5, 0.2);
    const steam = [0, 0.33, 0.66].map((off) => floater(c, puff(), 0.58, 0.8, 0.2, 0.5, off, 0.6));
    return (t) => {
      const f = sipCycle(t, 1.1);
      toMouth(c, 0, f);
      c.head.rotation.x = -0.15 * f;
      steam.forEach((s) => s(t));
    };
  },
  function jumprope(c) {
    const r = group(c.body, 0, 0.4, 0.12);
    part(r, ROPE, M.pink, 0, 0, 0);
    for (const s of [-1, 1]) part(r, CYL, M.yellow, s * 0.55, 0, 0, 0.045, 0.18, 0.045).rotation.z = Math.PI / 2;
    return (t) => {
      const ph = t * 6, up = Math.max(0, Math.cos(ph));
      r.rotation.x = -ph;
      c.body.position.y = 0.42 * up;
      for (const l of c.legs) l.rotation.x = -0.5 * up;
      for (const i of [0, 1]) setArm(c, i, -0.4 + Math.sin(ph) * 0.15, 0.55);
    };
  },
  function cheer(c) {
    const s = group(c.body, 0, 0.95, 0.42);
    part(s, CYL, M.wood, 0, 0.55, 0, 0.03, 1.1, 0.03);
    part(s, BOX, [M.wood, M.wood, M.wood, M.wood, SIGN_MAT, SIGN_MAT], 0, 1.3, 0, 1.1, 0.55, 0.05);
    return (t) => {
      const b = Math.abs(Math.sin(t * 4));
      s.rotation.z = Math.sin(t * 4) * 0.18;
      c.body.position.y = b * 0.12;
      for (const i of [0, 1]) setArm(c, i, -2.5 + b * 0.1, -0.35);
    };
  },
];

function setAct(sp, a) {
  for (const o of sp.bag) {
    if (o.parent) o.parent.remove(o);
    if (o.userData.own) o.material.dispose();
  }
  rest(sp.c);
  bag = sp.bag = [];
  sp.anim = ACTS[a](sp.c);
  bag = null;
  sp.act = a;
}
const nextAct = (sp) => (sp.act + 1 + Math.floor(Math.random() * (ACTS.length - 1))) % ACTS.length;

/* ---------- Placement ---------- */
const spots = [];
{
  const COUNT = 11, avoid = [0.17, 0.46, 0.73].map((f) => Math.floor(N * f));
  const order = ACTS.map((_, n) => n).sort(() => Math.random() - 0.5);
  for (let n = 0; n < COUNT; n++) {
    let i = Math.floor(60 + (n * (N - 140)) / COUNT);
    if (avoid.some((a) => Math.abs(a - i) < 14)) i += 16;
    // spread across the road, but well away from its edges
    const lat = ((n * 5) % 9 - 4) * (W * 0.55) / 4;
    const c = makeHedgehog();
    const x = P[i].x + S[i].x * lat, z = P[i].z + S[i].z * lat;
    c.root.position.set(x, 0, z);
    c.root.rotation.y = headingAt(i) + Math.PI;
    c.root.scale.setScalar(SIZE);
    scene.add(c.root);
    const sp = { c, x, z, act: 0, anim: null, bag: [], t: rnd(0, 10), here: true, respawn: 0, switchT: rnd(15, 30), grow: 1 };
    setAct(sp, order[n % order.length]);
    spots.push(sp);
  }
}

function updateHedgehogs(dt, cam) {
  for (const sp of spots) {
    const r = sp.c.root;
    if (!sp.here) {
      sp.respawn -= dt;
      if (sp.respawn > 0) continue;
      setAct(sp, nextAct(sp));
      sp.here = true; sp.grow = 0;
    }
    const d2 = (cam.x - sp.x) ** 2 + (cam.z - sp.z) ** 2;
    sp.switchT -= dt;
    if (sp.switchT <= 0 && d2 > 90 * 90) { setAct(sp, nextAct(sp)); sp.switchT = rnd(15, 30); }
    r.visible = d2 < 170 * 170;
    if (!r.visible) continue;
    sp.t += dt;
    if (sp.grow < 1) sp.grow = Math.min(1, sp.grow + dt * 3);
    r.scale.setScalar(SIZE * (sp.grow + Math.sin(sp.grow * Math.PI) * 0.3));
    sp.anim(sp.t);
  }
}
// Karts that drive over a hedgehog take it along, unless their ammo is full
function collectHedgehogs(karts, onPick) {
  for (const sp of spots) {
    if (!sp.here) continue;
    for (const k of karts) {
      if (k.hogs >= (k.maxHogs ?? MAX_HOGS) || k.y > 1.5) continue;
      if ((k.x - sp.x) ** 2 + (k.z - sp.z) ** 2 < PICK_R * PICK_R) {
        sp.here = false; sp.c.root.visible = false; sp.respawn = rnd(6, 9);
        onPick(k, sp);
        break;
      }
    }
  }
}
function resetHedgehogs() {
  for (const sp of spots) {
    if (!sp.here) { sp.here = true; setAct(sp, nextAct(sp)); }
    sp.grow = 1;
  }
}

export { MAX_HOGS, spots as hedgehogSpots, updateHedgehogs, collectHedgehogs, resetHedgehogs };
