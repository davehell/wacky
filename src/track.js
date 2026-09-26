import * as THREE from 'three';
import { col, rnd } from './util.js';
import { scene, canvasTex, std, mesh, setSkyTheme } from './render.js';

/* ================= Tracks ================= */
const N = 900, W = 15, LIM = W + 13, LAPS = 3;

// Surfaces a kart can be on: how fast it may go, how well it grips and what it kicks up
const SURF = {
  road: { speed: 1, grip: 1, rumble: 0, dust: null },
  off: { speed: 0.48, grip: 0.5, rumble: 1, dust: [0.32, 0.27, 0.16] },
  ice: { speed: 1, grip: 0.3, rumble: 0, dust: [0.75, 0.9, 1] },
  sand: { speed: 0.72, grip: 0.8, rumble: 0.6, dust: [0.85, 0.66, 0.4] },
};

// ctrl: the circuit's control points; zones: ice or sand patches
const TRACKS = [
  {
    id: 'sunny', name: 'Slunečný okruh', in: 'na Slunečném okruhu',
    ctrl: [[0, 0], [150, 0], [230, 40], [252, 130], [200, 202], [110, 192], [62, 132], [0, 160], [-80, 222], [-172, 192], [-204, 100], [-152, 28], [-80, -10]],
    zones: [],
    theme: {
      sky: [0x3b8fe8, 0x9fd6fb, 0xcdeafc], fog: [320, 1500], hemi: [0xcfe8ff, 0x5d7f3c, 0.75], sun: [0xfff0d4, 1.55],
      ground: ['#5cb84a', ['#4fa83f', '#68c455', '#57b146', '#73cc5e', '#4a9f3b']], verge: 0xdcc792,
      hills: [0x6e9f7f, 0x7fae8a, 0x5f8f74], scenery: 'meadow', swatch: ['#5cb84a', '#9fd6fb'],
    },
  },
  {
    id: 'snow', name: 'Zasněžené údolí', in: 'v Zasněženém údolí',
    ctrl: [[0, 0], [140, 0], [210, -40], [270, 10], [260, 110], [190, 150], [120, 130], [70, 180], [70, 250], [-10, 290], [-110, 260], [-165, 185], [-120, 110], [-150, 40], [-80, -10]],
    zones: [{ a: 175, b: 235, lat: [-W, W], s: 'ice' }, { a: 505, b: 560, lat: [-W, W], s: 'ice' }, { a: 30, b: 60, lat: [0, W], s: 'ice' }],
    theme: {
      sky: [0x6f9fd8, 0xc9e1f5, 0xe8f2fa], fog: [260, 1300], hemi: [0xe6f1ff, 0x9aa9bf, 0.85], sun: [0xfff6ea, 1.35],
      ground: ['#eef4fa', ['#e3ecf5', '#f7fbff', '#dbe6f1', '#ffffff', '#e9f0f7']], verge: 0xf4f8fc,
      hills: [0xdce7f2, 0xc9d8e8, 0xeef4fa], scenery: 'snow', swatch: ['#eef4fa', '#6f9fd8'],
    },
  },
  {
    id: 'desert', name: 'Pouštní kaňon', in: 'v Pouštním kaňonu',
    ctrl: [[0, 0], [170, 0], [240, -60], [320, -20], [330, 80], [260, 130], [180, 110], [130, 170], [40, 230], [-60, 200], [-60, 120], [-140, 90], [-190, 20], [-120, -20]],
    zones: [{ a: 200, b: 226, lat: [1, W], s: 'sand' }, { a: 555, b: 585, lat: [-W, -1], s: 'sand' }, { a: 700, b: 728, lat: [1, W], s: 'sand' }, { a: 90, b: 112, lat: [-W, -2], s: 'sand' }],
    theme: {
      sky: [0x4a8fd6, 0xa8d4f0, 0xf6e3c4], fog: [340, 1500], hemi: [0xfff1d9, 0xb07a45, 0.8], sun: [0xffe9c4, 1.65],
      ground: ['#e6c48a', ['#dcb87c', '#efcf95', '#d9b276', '#f2d6a2', '#e0bb80']], verge: 0xd49a5c,
      hills: [0xc8693a, 0xd9814a, 0xb85a33], scenery: 'desert', swatch: ['#e6c48a', '#c8693a'],
    },
  },
];

// The current circuit. The arrays are filled in place and the numbers are live bindings, so every
// module that imports them sees the track that is loaded right now.
const P = [], T = [], S = [];
let TL = 0, SEG = 0, track = TRACKS[0];
const headingAt = (i) => Math.atan2(T[i].x, T[i].z);

function nearestFull(x, z, step = 1) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < N; i += step) { const dx = P[i].x - x, dz = P[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
  return { i: best, d: Math.sqrt(bd) };
}
function nearest(x, z, hint) {
  let best = hint, bd = Infinity, edge = false;
  for (let o = -28; o <= 28; o++) {
    const i = (hint + o + N) % N, dx = P[i].x - x, dz = P[i].z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; edge = Math.abs(o) === 28; }
  }
  return edge ? nearestFull(x, z).i : best;
}
const circDist = (a, b) => { const d = Math.abs(a - b) % N; return Math.min(d, N - d); };
const inRange = (i, a, b) => (a <= b ? i >= a && i <= b : i >= a || i <= b);

// What a kart is driving on
function surfaceAt(idx, lat) {
  if (Math.abs(lat) > W + 1.2) return SURF.off;
  for (const zn of track.zones) if (inRange(idx, zn.a, zn.b) && lat >= zn.lat[0] && lat <= zn.lat[1]) return SURF[zn.s];
  return SURF.road;
}

/* ---------- Building ---------- */
let root = null;
const built = new Map();
const add = (o) => { root.add(o); return o; };

function ribbonFrom(pts, sides, inner, outer, y, vScale, mat, closed) {
  const pos = [], uv = [], idx = [], n = pts.length, count = closed ? n + 1 : n;
  let d = 0;
  for (let i = 0; i < count; i++) {
    const k = i % n, p = pts[k], s = sides[k];
    if (i > 0) d += p.distanceTo(pts[(i - 1) % n]);
    pos.push(p.x + s.x * inner, y, p.z + s.z * inner, p.x + s.x * outer, y, p.z + s.z * outer);
    uv.push(0, d / vScale, 1, d / vScale);
    if (i < count - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return add(m);
}
const ribbon = (inner, outer, y, vScale, mat) => ribbonFrom(P, S, inner, outer, y, vScale, mat, true);
// a stretch of road between two indices
function patch(a, b, inner, outer, y, vScale, mat) {
  const pts = [], sides = [];
  for (let i = a; ; i = (i + 1) % N) { pts.push(P[i]); sides.push(S[i]); if (i === b) break; }
  return ribbonFrom(pts, sides, inner, outer, y, vScale, mat, false);
}

const roadTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4b505e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 7000; i++) { const v = 60 + Math.random() * 60; g.fillStyle = `rgba(${v},${v + 4},${v + 14},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = '#f4f4ef'; g.fillRect(6, 0, 5, h); g.fillRect(w - 11, 0, 5, h);
  g.fillStyle = 'rgba(244,244,239,0.85)'; g.fillRect(w / 2 - 3, 0, 6, h / 2);
}, true);
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85, side: THREE.DoubleSide });
const curbTex = canvasTex(8, 64, (g, w, h) => { g.fillStyle = '#e63946'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f7f7f2'; g.fillRect(0, h / 2, w, h / 2); }, true);
curbTex.magFilter = THREE.NearestFilter;
const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6, side: THREE.DoubleSide });
const fenceTex = canvasTex(64, 16, (g, w, h) => { g.fillStyle = '#ef476f'; g.fillRect(0, 0, w / 2, h); g.fillStyle = '#ffffff'; g.fillRect(w / 2, 0, w / 2, h); }, true);
fenceTex.magFilter = THREE.NearestFilter;
const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex, roughness: 0.7, side: THREE.DoubleSide });
const iceTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#bfe6fb'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
  for (let i = 0; i < 18; i++) { g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + rnd(-30, 30), y + rnd(-30, 30)); g.stroke(); }
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
}, true);
const iceMat = new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
const sandTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#dcb06c'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(190,140,80,0.6)'; g.lineWidth = 3;
  for (let y = 8; y < h; y += 16) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 10) * 4); g.stroke(); }
}, true);
const sandPatchMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
const checkTex = canvasTex(160, 32, (g) => { for (let x = 0; x < 20; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); } });
checkTex.magFilter = THREE.NearestFilter;
const bannerTex = canvasTex(1024, 128, (c, w, h) => {
  c.fillStyle = '#14213d'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffc93c'; c.font = '72px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('DIVOKÁ KOLA', w / 2, h / 2 + 4);
  c.fillStyle = '#ef476f'; c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8);
}, false, true);
function trackFrame(i, lat = 0) {
  const g = new THREE.Group();
  g.position.set(P[i].x + S[i].x * lat, 0, P[i].z + S[i].z * lat);
  g.rotation.y = headingAt(i);
  return add(g);
}

// Tyre-wall fence where it does not cross another part of the circuit
function fence(side) {
  const pos = [], uv = [], idx = [];
  let d = 0, lastOk = false, count = 0, px = 0, pz = 0;
  const off = side * (LIM + 0.8);
  for (let i = 0; i <= N; i++) {
    const k = i % N, x = P[k].x + S[k].x * off, z = P[k].z + S[k].z * off;
    const nf = nearestFull(x, z, 2);
    const ok = circDist(nf.i, k) < 40 && nf.d > LIM - 1;
    if (ok) {
      if (lastOk) d += Math.hypot(x - px, z - pz);
      pos.push(x, 0, z, x, 1.2, z);
      uv.push(d / 3, 0, d / 3, 1);
      if (lastOk) { const v = count * 2; idx.push(v - 2, v, v - 1, v - 1, v, v + 1); }
      count++; px = x; pz = z;
    }
    lastOk = ok;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, fenceMat);
  m.castShadow = true; m.receiveShadow = true;
  add(m);
}

function buildScenery(th) {
  const bb = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of P) { bb.minX = Math.min(bb.minX, p.x); bb.maxX = Math.max(bb.maxX, p.x); bb.minZ = Math.min(bb.minZ, p.z); bb.maxZ = Math.max(bb.maxZ, p.z); }
  const free = (x, z, r) => nearestFull(x, z, 3).d > LIM + r && !(standPos && Math.hypot(x - standPos.x, z - standPos.z) < 30);
  const spots = [];
  let guard = 0;
  while (spots.length < 520 && guard++ < 20000) {
    const x = rnd(bb.minX - 160, bb.maxX + 160), z = rnd(bb.minZ - 160, bb.maxZ + 160);
    if (free(x, z, 5)) spots.push([x, z, rnd(0.75, 1.5), Math.random()]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3();
  const place = (list, geoMats, colours) => {
    const meshes = geoMats.map(([geo, mat]) => new THREE.InstancedMesh(geo, mat, list.length));
    list.forEach(([x, z, s], i) => {
      q.setFromEuler(e.set(0, rnd(0, 6.28), 0));
      m4.compose(v3.set(x, 0, z), q, new THREE.Vector3(s, s, s));
      meshes.forEach((m, n) => { m.setMatrixAt(i, m4); if (colours && colours[n]) m.setColorAt(i, col(colours[n][i % colours[n].length])); });
    });
    for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; add(m); }
  };
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.6, 6).translate(0, 1.3, 0);
  const trunkMat = std(0x7a5234, { roughness: 0.9 });
  const leafMat = () => new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
  if (th.scenery === 'meadow') {
    const round = spots.filter((s) => s[3] < 0.6), pine = spots.filter((s) => s[3] >= 0.6);
    const greens = [0x3f9b3a, 0x4caf50, 0x2e8b57, 0x5fb34d, 0x7bc043, 0x2f7d32];
    place(round, [[trunkGeo, trunkMat], [new THREE.IcosahedronGeometry(2.5, 0).translate(0, 4.4, 0), leafMat()]], [null, greens]);
    place(pine, [[trunkGeo, trunkMat], [new THREE.ConeGeometry(2.2, 6, 7).translate(0, 5.4, 0), leafMat()]], [null, greens]);
  } else if (th.scenery === 'snow') {
    const pine = spots.filter((s) => s[3] < 0.85), bush = spots.filter((s) => s[3] >= 0.85);
    const snowM = std(0xffffff, { roughness: 0.7, flatShading: true });
    place(pine, [
      [trunkGeo, trunkMat],
      [new THREE.ConeGeometry(2.4, 4.2, 7).translate(0, 4.2, 0), leafMat()],
      [new THREE.ConeGeometry(1.8, 3.4, 7).translate(0, 6.4, 0), leafMat()],
      [new THREE.ConeGeometry(1.0, 2.0, 7).translate(0, 8.0, 0), snowM],
      [new THREE.CylinderGeometry(1.7, 2.3, 0.35, 7).translate(0, 5.0, 0), snowM],
    ], [null, [0x2f6f4a, 0x2e7d55, 0x356b4b], [0x2f6f4a, 0x2e7d55, 0x356b4b]]);
    place(bush, [[new THREE.IcosahedronGeometry(1.6, 1).translate(0, 0.8, 0), snowM]]);
    // snowmen watching the race
    for (let n = 0; n < 16; n++) {
      const i = Math.floor((n / 16) * N + 20), sd = n % 2 ? 1 : -1, lat = sd * (LIM + rnd(6, 14));
      const x = P[i].x + S[i].x * lat, z = P[i].z + S[i].z * lat;
      if (!free(x, z, 3)) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = headingAt(i) - sd * Math.PI / 2 + rnd(-0.3, 0.3);
      const sm = std(0xffffff, { roughness: 0.6 });
      for (const [y, r] of [[1.1, 1.2], [2.7, 0.85], [3.9, 0.6]]) { const b = mesh(new THREE.SphereGeometry(r, 16, 12), sm); b.position.y = y; g.add(b); }
      const nose = mesh(new THREE.ConeGeometry(0.13, 0.7, 8), std(0xf08a24)); nose.rotation.x = Math.PI / 2; nose.position.set(0, 3.9, 0.85); g.add(nose);
      for (const s of [-1, 1]) { const eye = mesh(new THREE.SphereGeometry(0.08, 8, 6), std(0x1b1b22)); eye.position.set(s * 0.22, 4.08, 0.52); g.add(eye); }
      const hat = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.6, 14), std([0xef476f, 0x3a86ff, 0x8338ec][n % 3])); hat.position.y = 4.6; g.add(hat);
      const brim = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 14), hat.material); brim.position.y = 4.32; g.add(brim);
      const scarf = mesh(new THREE.TorusGeometry(0.62, 0.14, 8, 18), std([0xffc93c, 0x06b6a4, 0xef476f][n % 3])); scarf.rotation.x = Math.PI / 2; scarf.position.y = 3.4; g.add(scarf);
      add(g);
    }
  } else {
    const cactus = spots.filter((s) => s[3] < 0.45), rock = spots.filter((s) => s[3] >= 0.45 && s[3] < 0.8), bush = spots.filter((s) => s[3] >= 0.8);
    const cm = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const arm = (s) => {
      const g1 = new THREE.CylinderGeometry(0.35, 0.35, 1.4, 8).rotateZ(Math.PI / 2).translate(s * 0.9, 2.6 + s * 0.3, 0);
      const g2 = new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8).translate(s * 1.5, 3.4 + s * 0.3, 0);
      const cap = new THREE.SphereGeometry(0.35, 8, 6).translate(s * 1.5, 4.3 + s * 0.3, 0);
      return [[g1, cm], [g2, cm], [cap, cm]];
    };
    const greens = [0x4f9a55, 0x5aa864, 0x478d4c];
    place(cactus, [
      [new THREE.CylinderGeometry(0.55, 0.6, 5, 10).translate(0, 2.5, 0), cm],
      [new THREE.SphereGeometry(0.55, 10, 8).translate(0, 5, 0), cm],
      ...arm(1), ...arm(-1),
    ], [greens, greens, greens, greens, greens, greens, greens, greens]);
    place(rock, [[new THREE.DodecahedronGeometry(1.6, 0).scale(1.3, 0.8, 1).translate(0, 0.6, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true })]], [[0xc8693a, 0xb85a33, 0xd9814a, 0xa9542f]]);
    place(bush, [[new THREE.IcosahedronGeometry(0.9, 0).translate(0, 0.6, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true })]], [[0x9a8f4a, 0xaf9d55, 0x8a8a44]]);
  }

  // distant hills: green cones, snowy peaks or flat-topped mesas
  const cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
  const hillGeo = th.scenery === 'desert' ? new THREE.CylinderGeometry(0.62, 1, 1, 7) : new THREE.ConeGeometry(1, 1, 7);
  const hills = new THREE.InstancedMesh(hillGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 46);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rnd(-0.05, 0.05), r = rnd(820, 1150), h = rnd(90, 260) * (th.scenery === 'desert' ? 0.6 : th.scenery === 'snow' ? 1.3 : 1), w = rnd(140, 260);
    m4.compose(new THREE.Vector3(cx + Math.cos(a) * r, h / 2 - 5, cz + Math.sin(a) * r), q.setFromEuler(e.set(0, rnd(0, 6), 0)), new THREE.Vector3(w, h, w));
    hills.setMatrixAt(i, m4);
    hills.setColorAt(i, col(th.hills[i % 3]));
  }
  add(hills);
  if (th.scenery === 'snow') {
    // white caps on the mountains
    const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), std(0xffffff, { roughness: 0.8, flatShading: true }), 46);
    const mm = new THREE.Matrix4(), pp = new THREE.Vector3(), qq = new THREE.Quaternion(), ss = new THREE.Vector3();
    for (let i = 0; i < 46; i++) {
      // the top third of each peak, a hair larger so it sits on the surface
      hills.getMatrixAt(i, mm); mm.decompose(pp, qq, ss);
      pp.y += ss.y * 0.5 - ss.y * 0.18;
      mm.compose(pp, qq, ss.set(ss.x * 0.37, ss.y * 0.36, ss.z * 0.37));
      caps.setMatrixAt(i, mm);
    }
    add(caps);
  }
}

let standPos = null;
function buildTrack(tr) {
  const th = tr.theme;
  const grassTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = th.ground[0]; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = th.ground[1][i % 5]; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 2 + Math.random() * 4); }
  }, true);
  grassTex.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  add(ground);

  ribbon(-W, W, 0.03, 26, roadMat);
  ribbon(W, W + 1.6, 0.06, 3.2, curbMat);
  ribbon(-W - 1.6, -W, 0.06, 3.2, curbMat);
  const vergeMat = new THREE.MeshStandardMaterial({ color: col(th.verge), roughness: 1, side: THREE.DoubleSide });
  ribbon(W + 1.6, W + 5, 0.02, 10, vergeMat);
  ribbon(-W - 5, -W - 1.6, 0.02, 10, vergeMat);
  for (const zn of tr.zones) {
    const m = patch(zn.a, zn.b, zn.lat[0], zn.lat[1], 0.04, zn.s === 'ice' ? 18 : 9, zn.s === 'ice' ? iceMat : sandPatchMat);
    m.renderOrder = 1;
  }
  fence(1); fence(-1);

  // start line and gantry
  {
    const g = trackFrame(0);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 2.4), new THREE.MeshStandardMaterial({ map: checkTex, roughness: 0.8 }));
    line.rotation.x = -Math.PI / 2; line.position.y = 0.05; line.receiveShadow = true;
    g.add(line);
    const post = new THREE.BoxGeometry(0.8, 8, 0.8), postM = std(0x14213d);
    for (const s of [-1, 1]) { const p = mesh(post, postM); p.position.set(s * (W + 2), 4, 0); g.add(p); }
    const bm = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6 });
    const side = std(0x14213d);
    const banner = mesh(new THREE.BoxGeometry((W + 2) * 2 + 0.8, 2.2, 0.5), [side, side, side, side, bm, bm]);
    banner.position.set(0, 8.2, 0);
    g.add(banner);
  }

  // grandstand with a crowd beside the start straight
  standPos = null;
  {
    const iS = N - 40;
    for (const sd of [1, -1]) {
      const lat = sd * (LIM + 9);
      const x = P[iS].x + S[iS].x * lat, z = P[iS].z + S[iS].z * lat;
      const nf = nearestFull(x, z);
      if (circDist(nf.i, iS) > 30) continue;
      standPos = { x, z };
      const g = trackFrame(iS, sd * (LIM + 3));
      const steps = 5, len = 34;
      for (let k = 0; k < steps; k++) {
        const h = (k + 1) * 1.1;
        const b = mesh(new THREE.BoxGeometry(2.2, h, len), std(k % 2 ? 0xdfe6ee : 0xf5f7fa));
        b.position.set(sd * (k * 2.2 + 1.1), h / 2, 0);
        g.add(b);
      }
      const roof = mesh(new THREE.BoxGeometry(13, 0.4, len + 2), std(0xef476f));
      roof.position.set(sd * 5.5, 9.5, 0); roof.rotation.z = -sd * 0.08;
      g.add(roof);
      for (const zz of [-len / 2, 0, len / 2]) { const p = mesh(new THREE.BoxGeometry(0.4, 9.5, 0.4), std(0x14213d)); p.position.set(sd * 10.8, 4.75, zz); g.add(p); }
      const crowdN = 150;
      const crowd = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.34, 1.1, 6).translate(0, 0.55, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), crowdN);
      const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 8, 6).translate(0, 1.35, 0), new THREE.MeshStandardMaterial({ roughness: 0.7 }), crowdN);
      const shirts = [0xef476f, 0xffc93c, 0x06b6a4, 0x3a86ff, 0x8338ec, 0xfb5607, 0xffffff];
      const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
      const m4 = new THREE.Matrix4();
      for (let n = 0; n < crowdN; n++) {
        const k = n % steps;
        m4.makeTranslation(sd * (k * 2.2 + 1.1 + rnd(-0.5, 0.5)), (k + 1) * 1.1, rnd(-len / 2 + 1, len / 2 - 1));
        crowd.setMatrixAt(n, m4); heads.setMatrixAt(n, m4);
        crowd.setColorAt(n, col(shirts[n % shirts.length])); heads.setColorAt(n, col(skins[n % skins.length]));
      }
      crowd.castShadow = heads.castShadow = true;
      g.add(crowd, heads);
      break;
    }
  }
  buildScenery(th);
}

// Falling snow around the camera in the snowy valley
const SNOW_N = 1400, SNOW_R = 70;
const snowPos = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) { snowPos[i * 3] = rnd(-SNOW_R, SNOW_R); snowPos[i * 3 + 1] = rnd(0, 40); snowPos[i * 3 + 2] = rnd(-SNOW_R, SNOW_R); }
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const flakeTex = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.35, map: flakeTex, transparent: true, depthWrite: false }));
snow.frustumCulled = false;
snow.visible = false;
scene.add(snow);

// Clouds
const clouds = [];
{
  const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: col(0xdfefff), emissiveIntensity: 0.45, roughness: 1, flatShading: true });
  const cg = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(cg, cm); m.position.set(k * 9 - 18 + rnd(-3, 3), rnd(-2, 3), rnd(-5, 5)); m.scale.setScalar(rnd(8, 14)); m.scale.y *= 0.6; g.add(m); }
    g.position.set(rnd(-600, 800), rnd(150, 230), rnd(-500, 800));
    scene.add(g);
    clouds.push(g);
  }
}
function updateScenery(dt, cam) {
  for (const c of clouds) { c.position.x += dt * 3; if (c.position.x > 900) c.position.x = -700; }
  if (!snow.visible) return;
  snow.position.set(cam.x, 0, cam.z);
  for (let i = 0; i < SNOW_N; i++) {
    const j = i * 3;
    snowPos[j + 1] -= dt * (2.2 + (i % 5) * 0.4);
    snowPos[j] += Math.sin(snowPos[j + 1] * 0.4 + i) * dt * 0.8;
    if (snowPos[j + 1] < 0) { snowPos[j + 1] += 40; snowPos[j] = rnd(-SNOW_R, SNOW_R); snowPos[j + 2] = rnd(-SNOW_R, SNOW_R); }
  }
  snowGeo.attributes.position.needsUpdate = true;
}

// Switches the whole world to another circuit. Each circuit is built once and then kept, hidden.
function loadTrack(n) {
  track = TRACKS[n];
  const curve = new THREE.CatmullRomCurve3(track.ctrl.map(([x, z]) => new THREE.Vector3(x * 1.35, 0, z * 1.35)), true, 'centripetal');
  P.length = T.length = S.length = 0;
  P.push(...curve.getSpacedPoints(N).slice(0, N));
  TL = curve.getLength(); SEG = TL / N;
  for (let i = 0; i < N; i++) {
    const t = new THREE.Vector3().subVectors(P[(i + 1) % N], P[(i - 1 + N) % N]).normalize();
    T.push(t);
    S.push(new THREE.Vector3(t.z, 0, -t.x));
  }
  for (const g of built.values()) g.root.visible = false;
  let b = built.get(track.id);
  if (!b) {
    root = new THREE.Group();
    scene.add(root);
    buildTrack(track);
    b = { root, standPos };
    built.set(track.id, b);
  } else {
    standPos = b.standPos;
  }
  b.root.visible = true;
  snow.visible = track.theme.scenery === 'snow';
  setSkyTheme(track.theme);
  return track;
}
const currentTrack = () => track;

export {
  N, W, LIM, LAPS, P, T, S, TL, SEG, TRACKS, SURF,
  headingAt, nearest, nearestFull, circDist, surfaceAt, loadTrack, currentTrack, updateScenery, clouds,
};
