import * as THREE from 'three';
import { rnd, col } from './util.js';
import { scene, canvasTex, std, mesh } from './render.js';
import { P, T, S } from './track.js';

/* ================= Podium ================= */
// After the race the first three stand on the podium just past the finish line, facing the camera, and
// everybody celebrates in their own way while confetti rains down.
const AT = 30;
const BLOCKS = [
  // place, sideways offset (seen from the camera: second on the left, third on the right), height, colour
  { place: 1, x: 0, h: 2.4, top: 0xffc93c },
  { place: 2, x: -4.8, h: 1.7, top: 0xc9d3e3 },
  { place: 3, x: 4.8, h: 1.1, top: 0xd98b4a },
];
// the rest line up beside the podium
const OTHERS = [{ x: -10, z: 2.5 }, { x: 10, z: 2.5 }, { x: -14.5, z: 4.5 }];

const root = new THREE.Group();
root.visible = false;
scene.add(root);
const numTex = (n, bg) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; g.font = '96px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#14213d'; g.strokeText(String(n), w / 2, h / 2 + 6); g.fillText(String(n), w / 2, h / 2 + 6);
}, false, true);
for (const b of BLOCKS) {
  const side = std(0xf5f7fa, { roughness: 0.6 });
  const front = new THREE.MeshStandardMaterial({ map: numTex(b.place, ['#e8a800', '#8d9bb3', '#b8662e'][b.place - 1]), roughness: 0.6 });
  // local +z faces the camera
  const m = mesh(new THREE.BoxGeometry(4.4, b.h, 4.4), [side, side, std(b.top, { roughness: 0.35, metalness: 0.2 }), side, front, side]);
  m.position.set(b.x, b.h / 2, 0);
  root.add(m);
}
// a red carpet in front and a striped arch behind
{
  const carpet = mesh(new THREE.BoxGeometry(15, 0.06, 7), std(0xe63946, { roughness: 0.9 }));
  carpet.position.set(0, 0.04, 3.5);
  root.add(carpet);
  const archCol = [0xef476f, 0xffc93c, 0x06b6a4, 0x3a86ff, 0x8338ec];
  for (let n = 0; n < 5; n++) {
    const arc = mesh(new THREE.TorusGeometry(9 - n * 0.55, 0.28, 8, 40, Math.PI), std(archCol[n], { roughness: 0.5 }));
    arc.position.set(0, 0, -3.2);
    root.add(arc);
  }
}
// the winner's cup at the end of a cup series
const trophy = new THREE.Group();
{
  // there is no environment map, so the gold glows a little instead of being properly metallic
  const gold = std(0xffc93c, { metalness: 0.25, roughness: 0.3, emissive: col(0x6b4a00) });
  const bowl = mesh(new THREE.CylinderGeometry(0.75, 0.35, 1.0, 24, 1, true), gold); bowl.position.y = 1.35; trophy.add(bowl);
  const bottom = mesh(new THREE.SphereGeometry(0.36, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), gold); bottom.position.y = 0.86; trophy.add(bottom);
  const stem = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 12), gold); stem.position.y = 0.55; trophy.add(stem);
  const base = mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 20), std(0x14213d, { roughness: 0.4 })); base.position.y = 0.15; trophy.add(base);
  for (const s of [-1, 1]) { const h = mesh(new THREE.TorusGeometry(0.34, 0.07, 8, 16, Math.PI * 1.2), gold); h.position.set(s * 0.8, 1.4, 0); h.rotation.z = s > 0 ? -Math.PI * 0.6 : Math.PI * 1.6; trophy.add(h); }
  const star = mesh(new THREE.OctahedronGeometry(0.2), std(0xffffff, { emissive: col(0xfff3b0), roughness: 0.2 })); star.position.y = 2.1; trophy.add(star);
  trophy.visible = false;
  root.add(trophy);
}

// confetti: little paper squares tumbling down over the podium
const CONF_N = 320;
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.34), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF_N);
confetti.frustumCulled = false;
root.add(confetti);
const bits = [];
{
  const colours = [0xef476f, 0xffc93c, 0x06b6a4, 0x3a86ff, 0x8338ec, 0xffffff, 0xfb5607];
  for (let n = 0; n < CONF_N; n++) {
    bits.push({ x: rnd(-12, 12), y: rnd(0, 16), z: rnd(-4, 8), vy: rnd(1.8, 3.2), sw: rnd(0, 6), sp: rnd(2, 6), rx: rnd(0, 6), ry: rnd(0, 6) });
    confetti.setColorAt(n, col(colours[n % colours.length]));
  }
}
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

// Each animal cheers in its own way: `b` is the kart's resting pose, t the time, s the place's excitement
const CHEER = {
  // spins round and round on the spot
  shark(v, b, t, s) { const c = t % 2.4; v.root.rotation.y = b.h + (c < 0.9 ? (c / 0.9) * Math.PI * 2 : 0); v.root.position.y = b.y + hop(t * 2.6) * 0.5 * s; },
  // swings the long neck from side to side
  giraffe(v, b, t, s) { v.head.rotation.z = Math.sin(t * 3.2) * 0.35 * s; v.head.rotation.y = 0; v.root.position.y = b.y + hop(t * 1.6) * 0.3 * s; },
  // nods the antlers to a beat
  deer(v, b, t, s) { v.head.rotation.x = Math.sin(t * 7) * 0.25 * s; v.head.rotation.z = Math.sin(t * 3.5) * 0.15; v.root.position.y = b.y + hop(t * 1.75) * 0.4 * s; },
  // big frog jumps
  frog(v, b, t, s) { v.root.position.y = b.y + hop(t * 1.3) * 1.6 * s; v.head.rotation.x = -hop(t * 1.3) * 0.3; },
  // quick little bunny hops
  bunny(v, b, t, s) { v.root.position.y = b.y + hop(t * 4) * 0.45 * s; v.head.rotation.z = Math.sin(t * 8) * 0.12; },
  // raises the trunk and rocks side to side
  elephant(v, b, t, s) { v.head.rotation.x = -0.35 - Math.sin(t * 2.5) * 0.15 * s; v.body.rotation.z = Math.sin(t * 2.5) * 0.12 * s; v.root.position.y = b.y + hop(t * 1.25) * 0.3 * s; },
};
// a jump curve: up and down once per unit of time, resting in between
function hop(t) { const f = t % 1; return f < 0.5 ? Math.sin(f * 2 * Math.PI) : 0; }

let shown = [], time = 0;
const center = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3();

// order: the karts from first to last; cup: show the trophy above the winner
function showPodium(order, cup) {
  center.copy(P[AT]); fwd.copy(T[AT]); side.copy(S[AT]);
  root.position.copy(center);
  // local +z towards the camera, which stands further along the road
  root.rotation.y = Math.atan2(fwd.x, fwd.z);
  root.visible = true;
  trophy.visible = cup;
  time = 0;
  shown = order.map((k, i) => {
    const b = BLOCKS[i], o = OTHERS[i - 3];
    const lx = b ? b.x : o.x, lz = b ? 0 : o.z, y = b ? b.h : 0;
    const wx = center.x + side.x * lx + fwd.x * lz, wz = center.z + side.z * lx + fwd.z * lz;
    const h = Math.atan2(fwd.x, fwd.z);
    Object.assign(k, { x: wx, z: wz, y, h, speed: 0, vx: 0, vz: 0, st: 0, spin: 0, drifting: false, bubble: 0, magnet: 0, rain: 0, safe: 0, shake: 0 });
    k.v.root.position.set(wx, y, wz);
    k.v.root.rotation.set(0, h, 0);
    k.v.root.visible = true;
    k.dizzy = 0;
    k.v.stars.visible = false;
    return { k, b: { x: wx, y, z: wz, h }, s: i < 3 ? 1 : 0.4, delay: i * 0.25 };
  });
  if (cup) trophy.position.set(0, BLOCKS[0].h + 4.2, 0);
}
function hidePodium() {
  root.visible = false;
  for (const { k } of shown) { k.v.head.rotation.set(0, 0, 0); k.v.body.rotation.set(0, 0, 0); }
  shown = [];
}
const podiumOn = () => root.visible;

function updatePodium(dt, gTime) {
  time += dt;
  for (const { k, b, s, delay } of shown) {
    const v = k.v, t = Math.max(0, time - delay);
    v.root.position.set(b.x, b.y, b.z);
    v.root.rotation.set(0, b.h, 0);
    v.body.rotation.set(0, 0, 0); v.body.position.set(0, 0, 0);
    v.head.rotation.set(0, 0, 0);
    CHEER[k.ch.id](v, b, t, s);
    for (const w of v.wheels) w.rotation.x += dt * 2 * s;
    v.bubble.visible = v.magnet.visible = false;
  }
  trophy.rotation.y = gTime * 1.2;
  trophy.children[trophy.children.length - 1].rotation.y = gTime * 3;
  for (let n = 0; n < CONF_N; n++) {
    const c = bits[n];
    c.y -= c.vy * dt;
    if (c.y < 0) { c.y += 16; c.x = rnd(-12, 12); c.z = rnd(-4, 8); }
    c.rx += dt * c.sp; c.ry += dt * c.sp * 0.7;
    q.setFromEuler(e.set(c.rx, c.ry, 0));
    m4.compose(v3.set(c.x + Math.sin(time * 1.5 + c.sw) * 0.6, c.y, c.z), q, one);
    confetti.setMatrixAt(n, m4);
  }
  confetti.instanceMatrix.needsUpdate = true;
}
// Where the camera stands and what it looks at: in front of the podium, drifting gently from side to side.
// On a wide screen the podium sits left of the results panel; on a tall one it moves back and up, above it.
function podiumCamera(pos, look, aspect) {
  const tall = aspect < 1, sw = Math.sin(time * 0.35) * (tall ? 1.5 : 4);
  const off = tall ? 0 : 5, dist = tall ? 19 / aspect : 15, lookY = tall ? -6 : 2.6;
  pos.set(center.x + fwd.x * dist + side.x * (sw + off), 4.6 + (tall ? 2 : 0), center.z + fwd.z * dist + side.z * (sw + off));
  look.set(center.x + fwd.x * 2 + side.x * off, lookY, center.z + fwd.z * 2 + side.z * off);
}

export { showPodium, hidePodium, podiumOn, updatePodium, podiumCamera };
