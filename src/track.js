import * as THREE from 'three';
import { col, rnd } from './util.js';
import { scene, canvasTex, std, mesh } from './render.js';

/* ================= Track ================= */
const N = 900, W = 15, LIM = W + 13, LAPS = 3;
const ctrl = [[0, 0], [150, 0], [230, 40], [252, 130], [200, 202], [110, 192], [62, 132], [0, 160], [-80, 222], [-172, 192], [-204, 100], [-152, 28], [-80, -10]]
  .map(([x, z]) => new THREE.Vector3(x * 1.35, 0, z * 1.35));
const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
const P = curve.getSpacedPoints(N).slice(0, N);
const TL = curve.getLength(), SEG = TL / N;
const T = [], S = [];
for (let i = 0; i < N; i++) {
  const t = new THREE.Vector3().subVectors(P[(i + 1) % N], P[(i - 1 + N) % N]).normalize();
  T.push(t);
  S.push(new THREE.Vector3(t.z, 0, -t.x));
}
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

function ribbon(inner, outer, y, vScale, mat) {
  const pos = [], uv = [], idx = [];
  let d = 0;
  for (let i = 0; i <= N; i++) {
    const k = i % N, p = P[k], s = S[k];
    if (i > 0) d += SEG;
    pos.push(p.x + s.x * inner, y, p.z + s.z * inner, p.x + s.x * outer, y, p.z + s.z * outer);
    uv.push(0, d / vScale, 1, d / vScale);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

const grassTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#5cb84a'; g.fillRect(0, 0, w, h);
  const shades = ['#4fa83f', '#68c455', '#57b146', '#73cc5e', '#4a9f3b'];
  for (let i = 0; i < 9000; i++) { g.fillStyle = shades[i % 5]; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 2 + Math.random() * 4); }
}, true);
grassTex.repeat.set(160, 160);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const roadTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4b505e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 7000; i++) { const v = 60 + Math.random() * 60; g.fillStyle = `rgba(${v},${v + 4},${v + 14},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = '#f4f4ef'; g.fillRect(6, 0, 5, h); g.fillRect(w - 11, 0, 5, h);
  g.fillStyle = 'rgba(244,244,239,0.85)'; g.fillRect(w / 2 - 3, 0, 6, h / 2);
}, true);
ribbon(-W, W, 0.03, 26, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85, side: THREE.DoubleSide }));
const curbTex = canvasTex(8, 64, (g, w, h) => { g.fillStyle = '#e63946'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f7f7f2'; g.fillRect(0, h / 2, w, h / 2); }, true);
curbTex.magFilter = THREE.NearestFilter;
const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6, side: THREE.DoubleSide });
ribbon(W, W + 1.6, 0.06, 3.2, curbMat);
ribbon(-W - 1.6, -W, 0.06, 3.2, curbMat);
const sandMat = new THREE.MeshStandardMaterial({ color: col(0xdcc792), roughness: 1, side: THREE.DoubleSide });
ribbon(W + 1.6, W + 5, 0.02, 10, sandMat);
ribbon(-W - 5, -W - 1.6, 0.02, 10, sandMat);

// Tyre-wall fence where it does not cross another part of the circuit
const fenceTex = canvasTex(64, 16, (g, w, h) => { g.fillStyle = '#ef476f'; g.fillRect(0, 0, w / 2, h); g.fillStyle = '#ffffff'; g.fillRect(w / 2, 0, w / 2, h); }, true);
fenceTex.magFilter = THREE.NearestFilter;
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
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: fenceTex, roughness: 0.7, side: THREE.DoubleSide }));
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
}
fence(1); fence(-1);

// Start line and gantry
function trackFrame(i, lat = 0) {
  const g = new THREE.Group();
  g.position.set(P[i].x + S[i].x * lat, 0, P[i].z + S[i].z * lat);
  g.rotation.y = headingAt(i);
  scene.add(g);
  return g;
}
const checkTex = canvasTex(160, 32, (g) => { for (let x = 0; x < 20; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); } });
checkTex.magFilter = THREE.NearestFilter;
{
  const g = trackFrame(0);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 2.4), new THREE.MeshStandardMaterial({ map: checkTex, roughness: 0.8 }));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.05; line.receiveShadow = true;
  g.add(line);
  const post = new THREE.BoxGeometry(0.8, 8, 0.8), postM = std(0x14213d);
  for (const s of [-1, 1]) { const p = mesh(post, postM); p.position.set(s * (W + 2), 4, 0); g.add(p); }
  const bannerTex = canvasTex(1024, 128, (c, w, h) => {
    c.fillStyle = '#14213d'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffc93c'; c.font = '72px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('DIVOKÁ KOLA', w / 2, h / 2 + 4);
    c.fillStyle = '#ef476f'; c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8);
  }, false, true);
  const bm = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6 });
  const side = std(0x14213d);
  const banner = mesh(new THREE.BoxGeometry((W + 2) * 2 + 0.8, 2.2, 0.5), [side, side, side, side, bm, bm]);
  banner.position.set(0, 8.2, 0);
  g.add(banner);
}

// Grandstand with a crowd beside the start straight
let standPos = null;
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

// Trees, bushes and distant hills
{
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const count = 520, spots = [];
  let guard = 0;
  while (spots.length < count && guard++ < 20000) {
    const x = rnd(minX - 160, maxX + 160), z = rnd(minZ - 160, maxZ + 160);
    if (nearestFull(x, z, 3).d < LIM + 5) continue;
    if (standPos && Math.hypot(x - standPos.x, z - standPos.z) < 30) continue;
    spots.push([x, z, rnd(0.75, 1.5), Math.random()]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.6, 6).translate(0, 1.3, 0);
  const roundGeo = new THREE.IcosahedronGeometry(2.5, 0).translate(0, 4.4, 0);
  const pineGeo = new THREE.ConeGeometry(2.2, 6, 7).translate(0, 5.4, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, std(0x7a5234, { roughness: 0.9 }), spots.length);
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
  const nRound = spots.filter((s) => s[3] < 0.6).length;
  const rounds = new THREE.InstancedMesh(roundGeo, leafMat, nRound);
  const pines = new THREE.InstancedMesh(pineGeo, leafMat, spots.length - nRound);
  const greens = [0x3f9b3a, 0x4caf50, 0x2e8b57, 0x5fb34d, 0x7bc043, 0x2f7d32];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let ri = 0, pi = 0;
  spots.forEach(([x, z, s, kind], i) => {
    q.setFromEuler(e.set(0, rnd(0, 6.28), 0));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m4);
    const c = col(greens[i % greens.length]);
    if (kind < 0.6) { rounds.setMatrixAt(ri, m4); rounds.setColorAt(ri++, c); }
    else { pines.setMatrixAt(pi, m4); pines.setColorAt(pi++, c); }
  });
  for (const m of [trunks, rounds, pines]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const hillGeo = new THREE.ConeGeometry(1, 1, 7);
  const hills = new THREE.InstancedMesh(hillGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 46);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rnd(-0.05, 0.05), r = rnd(820, 1150), h = rnd(90, 260), w = rnd(140, 260);
    m4.compose(new THREE.Vector3(cx + Math.cos(a) * r, h / 2 - 5, cz + Math.sin(a) * r), q.setFromEuler(e.set(0, rnd(0, 6), 0)), new THREE.Vector3(w, h, w));
    hills.setMatrixAt(i, m4);
    hills.setColorAt(i, col([0x6e9f7f, 0x7fae8a, 0x5f8f74][i % 3]));
  }
  scene.add(hills);
}

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

export { N, W, LIM, LAPS, P, T, S, TL, SEG, headingAt, nearest, nearestFull, circDist, clouds };
