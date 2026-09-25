import * as THREE from 'three';
import { $, clamp, rnd, wrapA, store, hex } from './util.js';
import { stage, renderer, scene, camera, sky, sun } from './render.js';
import { N, W, LIM, LAPS, P, T, S, SEG, headingAt, nearest, clouds } from './track.js';
import { CHARS, makeKart, makePortraits } from './characters.js';
import { ICONS, ITEM_NAMES, boxes, makeHog, makeFireball, makeIceCream } from './items.js';
import { MAX_HOGS, hedgehogSpots, updateHedgehogs, collectHedgehogs, resetHedgehogs } from './hedgehogs.js';
import { parts, emit, updateParticles, burst } from './particles.js';
import { initAudio, sfx, setEngine, updateOpponents, silenceEngine, toggleMute } from './audio.js';

/* ================= Game state ================= */
const CC = [
  { base: 30, ai: 0.9, label: '50 cc', in: 'v 50 cc' },
  { base: 36, ai: 0.96, label: '100 cc', in: 've 100 cc' },
  { base: 43, ai: 1.0, label: '150 cc', in: 've 150 cc' },
  // kids' mode: automatic throttle, gentle steering, slow and forgiving opponents
  { base: 28, ai: 0.86, label: 'Dětský režim', in: 'v dětském režimu' },
];
let ccIdx = 1, selected = 0, kid = store.get('dk-kid') === '1';
const cls = () => (kid ? 3 : ccIdx);
let state = 'menu', paused = false, raceTime = 0, cdT = 0, cdShown = null, finishCount = 0, doneT = 0, gTime = 0;
let player = null, launchAt = null;
const projectiles = [], hazards = [];

const karts = CHARS.map((ch) => {
  const v = makeKart(ch);
  scene.add(v.root);
  return { ch, v, stats: ch.stats, ai: { t: 0, phase: rnd(0, 6.28), freq: rnd(0.25, 0.45), itemT: 0, hogT: 0, skill: 1 } };
});

function resetKart(k, slot) {
  const row = Math.floor(slot / 2), colm = slot % 2;
  const i = (N - 10 - row * 7 - colm * 3 + N) % N;
  const lat = colm ? 4 : -4;
  Object.assign(k, {
    idx: i, lap: -1, prog: -N, lat,
    x: P[i].x + S[i].x * lat, z: P[i].z + S[i].z * lat, y: 0, hopV: 0,
    h: headingAt(i), speed: 0, vx: 0, vz: 0, st: 0,
    drifting: false, driftDir: 0, driftCharge: 0, boost: 0, spin: 0, spinDir: 1,
    item: null, pending: null, rollT: 0, hogs: 1, hogCd: 0, finished: false, finishTime: 0, place: 0, mul: 1, wrongT: 0,
  });
  k.ai.skill = CC[cls()].ai * rnd(0.96, 1.02);
  k.ai.itemT = 0;
  k.ai.hogT = rnd(4, 8);
  k.kid = false;
  syncKart(k, 0);
}
function placeGrid() {
  const order = karts.filter((k) => k.ch !== CHARS[selected]);
  order.splice(4, 0, karts.find((k) => k.ch === CHARS[selected]));
  order.forEach((k, slot) => resetKart(k, slot));
  player = karts.find((k) => k.ch === CHARS[selected]);
  player.hogs = 3;
  player.kid = kid;
  karts.forEach((k) => (k.isPlayer = k === player));
}

function syncKart(k, dt) {
  const v = k.v;
  v.root.position.set(k.x, k.y, k.z);
  v.root.rotation.y = k.h - (k.drifting ? k.driftDir * 0.28 : 0);
  const sf = clamp(Math.abs(k.speed) / 30, 0, 1);
  v.body.rotation.z += ((k.drifting ? k.driftDir : k.st) * 0.07 * sf - v.body.rotation.z) * Math.min(1, dt * 8);
  v.head.rotation.z = k.st * 0.18;
  v.head.rotation.y = -k.st * 0.25;
  for (const w of v.wheels) w.rotation.x += (k.speed * dt) / 0.48;
  for (const p of v.pivots) p.rotation.y = -k.st * 0.45;
}

/* ================= Input ================= */
const keys = new Set();
const touch = { left: false, right: false, brake: false, drift: false };
let firePressed = false, padFirePrev = false;
const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('is-touch');

addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (['Space', 'ControlLeft', 'ControlRight'].includes(e.code)) firePressed = true;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Enter' && state === 'menu') startRace();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

document.querySelectorAll('.tbtn').forEach((b) => {
  const t = b.dataset.t;
  const on = (e) => { e.preventDefault(); if (t === 'fire') firePressed = true; else touch[t] = true; b.classList.add('on'); };
  const off = (e) => { e.preventDefault(); if (t in touch) touch[t] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('pointerleave', off);
});

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}
function playerInput() {
  const has = (...c) => c.some((x) => keys.has(x));
  let steer = (has('ArrowRight', 'KeyD') ? 1 : 0) - (has('ArrowLeft', 'KeyA') ? 1 : 0);
  let throttle = has('ArrowUp', 'KeyW');
  let brake = has('ArrowDown', 'KeyS');
  let drift = has('ShiftLeft', 'ShiftRight');
  if (isTouch) {
    steer += (touch.right ? 1 : 0) - (touch.left ? 1 : 0);
    brake = brake || touch.brake;
    throttle = throttle || !touch.brake;
    drift = drift || touch.drift;
  }
  const pad = readPad();
  if (pad) {
    const ax = pad.axes[0] || 0;
    if (Math.abs(ax) > 0.15) steer += ax;
    const b = (i) => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.3);
    throttle = throttle || b(7) || b(0);
    brake = brake || b(6) || b(1);
    drift = drift || b(5) || b(4);
    const fire = b(2) || b(3);
    if (fire && !padFirePrev) firePressed = true;
    padFirePrev = fire;
  }
  if (kid) return { steer: clamp(steer + kidAssist(player, steer), -1, 1), throttle: true, brake: false, drift: false };
  return { steer: clamp(steer, -1, 1), throttle, brake, drift };
}
// Kids' mode helper: a gentle pull towards the road ahead, strong when the child does not steer at all
function kidAssist(k, steer) {
  const ti = (k.idx + 14) % N, lane = clamp(k.lat, -W * 0.55, W * 0.55);
  const tx = P[ti].x + S[ti].x * lane, tz = P[ti].z + S[ti].z * lane;
  const diff = wrapA(Math.atan2(tx - k.x, tz - k.z) - k.h);
  return clamp(-diff * 1.6, -1, 1) * (steer ? 0.25 : 0.7);
}
const NOINPUT = { steer: 0, throttle: false, brake: false, drift: false };

/* ================= Kart physics ================= */
function stepKart(k, inp, dt) {
  const s = k.stats, base = CC[cls()].base;
  if (k.spin > 0) { k.spin -= dt; k.h += dt * 11 * k.spinDir; k.speed *= Math.pow(0.12, dt); k.drifting = false; inp = NOINPUT; }
  // kids get a slow, smooth wheel so a tap on a key never jerks the kart
  k.st += (inp.steer - k.st) * Math.min(1, dt * (k.kid ? 3 : 10));
  k.thr = inp.throttle;
  const off = Math.abs(k.lat) > W + 1.2;
  let maxS = base * s.speed * k.mul;
  if (off) maxS *= 0.48;
  if (k.boost > 0) { k.boost -= dt; maxS = Math.max(maxS, base * s.speed * 1.38); k.speed += 55 * dt; }
  else if (inp.throttle && k.speed < maxS) k.speed += 25 * s.accel * dt * (1 - 0.55 * Math.max(0, k.speed) / maxS);
  if (inp.brake) { k.speed -= (k.speed > 0 ? 45 : 14) * dt; if (k.speed < -11) k.speed = -11; }
  if (!inp.throttle && !inp.brake && k.boost <= 0) k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), 9 * dt);
  if (k.speed > maxS) k.speed -= (k.speed - maxS) * Math.min(1, 2.5 * dt);
  if (!k.drifting && k.speed > 10) k.speed -= Math.abs(k.st) * k.speed * 0.1 * dt;

  if (inp.drift && !k.drifting && Math.abs(k.st) > 0.25 && k.speed > 12 && k.y <= 0.001) {
    k.drifting = true; k.driftDir = Math.sign(k.st); k.driftCharge = 0; k.hopV = 4.5;
  }
  if (k.drifting && (!inp.drift || k.speed < 8)) {
    if (k.driftCharge > 1.8) k.boost = Math.max(k.boost, 1.15);
    else if (k.driftCharge > 0.8) k.boost = Math.max(k.boost, 0.55);
    if (k.isPlayer && k.driftCharge > 0.8) sfx.boost();
    k.drifting = false;
  }
  const sf = clamp(Math.abs(k.speed) / 7, 0, 1) * (k.speed < 0 ? -1 : 1);
  let yaw;
  if (k.drifting) {
    const into = k.st * k.driftDir;
    yaw = k.driftDir * (1.3 + 0.75 * into) * s.handling;
    if (!off) k.driftCharge += dt * (0.7 + 0.5 * Math.max(0, into));
  } else yaw = k.st * 2.0 * s.handling * (k.kid ? 0.8 : 1);
  k.h -= yaw * sf * dt;

  const fx = Math.sin(k.h), fz = Math.cos(k.h);
  const grip = k.spin > 0 ? 1.2 : k.drifting ? 2.6 : off ? 5 : 10;
  const g = 1 - Math.exp(-grip * dt);
  k.vx += (fx * k.speed - k.vx) * g;
  k.vz += (fz * k.speed - k.vz) * g;
  k.x += k.vx * dt; k.z += k.vz * dt;
  if (k.hopV || k.y > 0) { k.y += k.hopV * dt; k.hopV -= 24 * dt; if (k.y <= 0) { k.y = 0; k.hopV = 0; } }

  const i = nearest(k.x, k.z, k.idx), p = P[i], sd = S[i];
  let lat = (k.x - p.x) * sd.x + (k.z - p.z) * sd.z;
  if (Math.abs(lat) > LIM) {
    const c = Math.sign(lat) * LIM;
    k.x += sd.x * (c - lat); k.z += sd.z * (c - lat); lat = c;
    k.speed *= 0.55; k.vx *= 0.4; k.vz *= 0.4;
  }
  k.lat = lat;
  if (k.idx - i > N / 2) k.lap++;
  else if (i - k.idx > N / 2) k.lap--;
  k.idx = i;
  k.prog = k.lap * N + i;

  // effects
  const rx = k.x - fx * 1.3, rz = k.z - fz * 1.3;
  if (k.drifting && Math.random() < 0.9) {
    const c = k.driftCharge > 1.8 ? [1, 0.5, 0.12] : k.driftCharge > 0.8 ? [0.3, 0.65, 1] : [0.5, 0.5, 0.5];
    for (const sgn of [-1, 1]) emit(rx + fz * sgn * 1.05, 0.3, rz - fx * sgn * 1.05, rnd(-2, 2), rnd(1, 4), rnd(-2, 2), c[0], c[1], c[2], 0.35, 12);
  }
  if (k.boost > 0) emit(k.x - fx * 1.9, 0.75 + k.y, k.z - fz * 1.9, -fx * 8 + rnd(-1, 1), rnd(0, 2), -fz * 8 + rnd(-1, 1), 1, rnd(0.35, 0.6), 0.1, 0.25);
  if (off && Math.abs(k.speed) > 8 && Math.random() < 0.6) emit(rx, 0.4, rz, rnd(-1.5, 1.5), rnd(1, 3), rnd(-1.5, 1.5), 0.32, 0.27, 0.16, 0.6, 2);
}

function hitKart(k, by) {
  if (k.spin > 0) return;
  k.spin = 1.1; k.spinDir = Math.random() < 0.5 ? -1 : 1; k.drifting = false; k.boost = 0;
  burst(k.x, 1.2, k.z, 26, 1, 0.85, 0.2);
  if (k.isPlayer) { showMsg('Au!'); sfx.hit(); }
  else if (by && by.isPlayer) { showMsg('Zásah!'); sfx.hit(); }
}

function targetAhead(k) {
  let best = null, bd = Infinity;
  for (const o of karts) { if (o === k || o.finished) continue; const d = o.prog - k.prog; if (d > 0 && d < bd) { bd = d; best = o; } }
  return best;
}
function useItem(k) {
  const it = k.item;
  if (!it) return;
  k.item = null;
  if (it === 'turbo') { k.boost = Math.max(k.boost, 1.6); if (k.isPlayer) sfx.boost(); }
  if (it === 'fire') {
    // three fireballs fanning out along the road
    for (const s of [-1, 0, 1]) {
      projectiles.push({ kind: 'fire', idx: (k.idx + 2) % N, f: 0, lat: k.lat + s * 1.2, latV: s * 6, speed: Math.max(72, k.speed + 34), owner: k, life: 2.6, age: 0, target: null, mesh: makeFireball() });
    }
    if (k.isPlayer) sfx.fire();
  }
  if (it === 'icecream') {
    const fx = Math.sin(k.h), fz = Math.cos(k.h);
    const m = makeIceCream();
    const x = k.x - fx * 3.2, z = k.z - fz * 3.2;
    m.position.set(x, 0, z); m.rotation.y = rnd(0, 6);
    hazards.push({ x, z, life: 30, m });
    if (k.isPlayer) sfx.throw();
  }
}
function throwHog(k) {
  if (k.hogs <= 0 || k.hogCd > 0 || k.spin > 0) return;
  k.hogs--; k.hogCd = 0.3;
  projectiles.push({ kind: 'hog', idx: (k.idx + 2) % N, f: 0, lat: k.lat, speed: Math.max(58, k.speed + 24), owner: k, life: 5, age: 0, target: targetAhead(k), mesh: makeHog() });
  if (k.isPlayer) sfx.throw();
}
function rollItem(k) {
  const rank = karts.filter((o) => o.prog > k.prog).length + 1;
  const pT = 0.08 + 0.09 * (rank - 1), pH = 0.46;
  const r = Math.random();
  return r < pT ? 'turbo' : r < pT + pH ? 'fire' : 'icecream';
}

function aiInput(k, dt) {
  const a = k.ai; a.t += dt;
  const look = 8 + Math.round(Math.max(0, k.speed) * 0.32);
  const ti = (k.idx + look) % N;
  const lane = Math.sin(a.t * a.freq + a.phase) * W * 0.5;
  const tx = P[ti].x + S[ti].x * lane, tz = P[ti].z + S[ti].z * lane;
  const diff = wrapA(Math.atan2(tx - k.x, tz - k.z) - k.h);
  const inp = { steer: clamp(-diff * 2.4, -1, 1), throttle: true, brake: false, drift: false };
  const ahead = (k.idx + 30) % N;
  const bend = Math.acos(clamp(T[k.idx].x * T[ahead].x + T[k.idx].z * T[ahead].z, -1, 1));
  if (bend > 0.85 && k.speed > CC[cls()].base * 0.78) inp.throttle = false;
  if (Math.abs(diff) > 0.9 && k.speed > 12) inp.brake = true;
  if (k.item) {
    a.itemT -= dt;
    if (a.itemT <= 0) {
      if (k.item === 'fire') { const tg = targetAhead(k); if ((tg && tg.prog - k.prog < 55) || a.itemT < -8) useItem(k); }
      else if (k.item === 'turbo') { if (bend < 0.3) useItem(k); }
      else useItem(k);
    }
  }
  a.hogT -= dt;
  if (k.hogs > 0 && a.hogT <= 0) {
    const tg = targetAhead(k);
    if (tg && tg.prog - k.prog < 60) { throwHog(k); a.hogT = kid ? rnd(6, 10) : rnd(2.5, 5); }
  }
  return inp;
}

/* ================= HUD ================= */
const el = { hogs: $('#hogs'), ammo: $('#ammo'), pos: $('#pos'), lap: $('#lap'), time: $('#time'), speed: $('#speed'), slot: $('#slot'), slotLabel: $('#slotLabel'), msg: $('#msg'), cd: $('#cd'), drift: $('#driftBar') };
const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
let msgTimer = 0, lastSlot = '', lastHud = {}, lastHogs = -1;
$('#hogIcon').innerHTML = ICONS.hedgehog;
function showMsg(t, dur = 1.3) { el.msg.textContent = t; el.msg.classList.remove('pop'); void el.msg.offsetWidth; el.msg.classList.add('pop'); el.msg.hidden = false; msgTimer = dur; }
function setText(key, node, v) { if (lastHud[key] !== v) { node.textContent = v; lastHud[key] = v; } }
const ranked = () => karts.slice().sort((a, b) => (b.finished ? 1e9 - b.finishTime : b.prog) - (a.finished ? 1e9 - a.finishTime : a.prog));

function updateHud(dt) {
  const rank = ranked().indexOf(player) + 1;
  setText('pos', el.pos, player.finished ? `${player.place}.` : `${rank}.`);
  setText('lap', el.lap, `${clamp(player.lap + 1, 1, LAPS)}/${LAPS}`);
  setText('time', el.time, fmt(player.finished ? player.finishTime : raceTime));
  setText('speed', el.speed, String(Math.round(Math.abs(player.speed) * 3.6)));
  if (player.hogs !== lastHogs) {
    el.hogs.textContent = String(player.hogs);
    el.ammo.classList.toggle('empty', player.hogs === 0);
    el.ammo.classList.toggle('full', player.hogs >= MAX_HOGS);
    if (player.hogs > lastHogs && lastHogs >= 0) { el.ammo.classList.remove('pop'); void el.ammo.offsetWidth; el.ammo.classList.add('pop'); }
    lastHogs = player.hogs;
  }
  let slot;
  if (player.rollT > 0) slot = 'roll:' + ['fire', 'icecream', 'turbo'][Math.floor(gTime * 14) % 3];
  else slot = player.item || '';
  if (slot !== lastSlot) {
    const key = slot.replace('roll:', '');
    el.slot.innerHTML = key ? ICONS[key] : '';
    el.slot.classList.toggle('rolling', slot.startsWith('roll:'));
    el.slotLabel.textContent = slot.startsWith('roll:') ? '…' : key ? ITEM_NAMES[key] : 'Prázdné';
    lastSlot = slot;
  }
  const ch = player.drifting ? player.driftCharge : 0;
  el.drift.style.width = `${clamp(ch / 1.8, 0, 1) * 100}%`;
  el.drift.style.background = ch > 1.8 ? '#ff8a1f' : ch > 0.8 ? '#4aa8ff' : '#d6dde8';
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) el.msg.hidden = true; }
  drawMini();
}

const mini = $('#mini'), mctx = mini.getContext('2d');
let mb = null;
function setupMini() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), size = Math.round((mini.clientWidth || 200) * dpr);
  if (!size) return;
  mini.width = mini.height = size;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const pad = size * 0.12, s = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  mb = { s, maxX, maxZ, ox: (size - (maxX - minX) * s) / 2, oy: (size - (maxZ - minZ) * s) / 2, size, dpr, track: document.createElement('canvas') };
  mb.track.width = mb.track.height = size;
  const g = mb.track.getContext('2d');
  g.lineJoin = 'round';
  const path = () => { g.beginPath(); P.forEach((p, i) => { const [x, y] = mapPt(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  path(); g.strokeStyle = '#14213d'; g.lineWidth = 9 * dpr; g.stroke();
  path(); g.strokeStyle = '#ffffff'; g.lineWidth = 5 * dpr; g.stroke();
  const [sx, sy] = mapPt(P[0].x, P[0].z);
  g.fillStyle = '#ef476f'; g.fillRect(sx - 3 * dpr, sy - 6 * dpr, 6 * dpr, 12 * dpr);
}
function mapPt(x, z) { return [(mb.maxX - x) * mb.s + mb.ox, (mb.maxZ - z) * mb.s + mb.oy]; }
function drawMini() {
  if (!mb) return;
  mctx.clearRect(0, 0, mb.size, mb.size);
  mctx.drawImage(mb.track, 0, 0);
  mctx.fillStyle = '#8a5a30';
  for (const sp of hedgehogSpots) {
    if (!sp.here) continue;
    const [x, y] = mapPt(sp.x, sp.z);
    mctx.beginPath(); mctx.arc(x, y, 2.2 * mb.dpr, 0, Math.PI * 2); mctx.fill();
  }
  for (const k of karts.slice().sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0))) {
    const [x, y] = mapPt(k.x, k.z), r = (k.isPlayer ? 7 : 5) * mb.dpr;
    mctx.beginPath(); mctx.arc(x, y, r, 0, Math.PI * 2);
    mctx.fillStyle = hex(k.ch.kart); mctx.fill();
    mctx.lineWidth = (k.isPlayer ? 3 : 2) * mb.dpr; mctx.strokeStyle = k.isPlayer ? '#14213d' : '#ffffff'; mctx.stroke();
  }
}

/* ================= Menu ================= */
const charsEl = $('#chars');
const PORTRAITS = makePortraits();
CHARS.forEach((ch, i) => {
  const b = document.createElement('button');
  b.className = 'char'; b.setAttribute('role', 'radio'); b.id = 'char-' + ch.id;
  b.style.setProperty('--kart', hex(ch.kart)); b.style.setProperty('--skin', hex(ch.skin));
  b.innerHTML = `<span class="face">${PORTRAITS[i] ? `<img src="${PORTRAITS[i]}" alt="">` : ''}</span><b>${ch.name}</b>`;
  b.addEventListener('click', () => selectChar(i));
  charsEl.appendChild(b);
});
function selectChar(i) {
  selected = i;
  store.set('dk-char', String(i));
  charsEl.querySelectorAll('.char').forEach((b, j) => b.setAttribute('aria-checked', String(j === i)));
  const st = CHARS[i].stats, bar = (v) => `<div class="bar"><i style="width:${clamp((v - 0.84) / 0.3, 0.08, 1) * 100}%"></i></div>`;
  $('#stats').innerHTML = `<span>Rychlost</span>${bar(st.speed)}<span>Zrychlení</span>${bar(st.accel)}<span>Ovládání</span>${bar(st.handling)}`;
  placeGrid();
}
document.querySelectorAll('#cc button').forEach((b) => b.addEventListener('click', () => {
  ccIdx = Number(b.dataset.cc);
  store.set('dk-cc', String(ccIdx));
  document.querySelectorAll('#cc button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  showBest();
}));
document.querySelectorAll('#mode button').forEach((b) => b.addEventListener('click', () => setKid(b.dataset.kid === '1')));
function setKid(on) {
  kid = on;
  store.set('dk-kid', kid ? '1' : '0');
  document.querySelectorAll('#mode button').forEach((x) => x.setAttribute('aria-checked', String((x.dataset.kid === '1') === kid)));
  document.body.classList.toggle('is-kid', kid);
  show('#ccBlock', !kid);
  placeGrid(); showBest();
}
function showBest() {
  const c = CC[cls()], b = store.get('dk-best-' + cls());
  const t = b ? `Tvůj nejlepší čas ${c.in}: ${fmt(Number(b))}` : `${c.in} zatím nemáš zajetý čas.`;
  $('#best').textContent = t.charAt(0).toUpperCase() + t.slice(1);
}

function show(id, on) { $(id).hidden = !on; }
function startRace() {
  initAudio();
  placeGrid();
  for (const p of projectiles) scene.remove(p.mesh);
  for (const h of hazards) scene.remove(h.m);
  projectiles.length = hazards.length = 0;
  for (const b of boxes) { b.respawn = 0; b.m.visible = true; }
  resetHedgehogs();
  for (const q of parts) q.life = 0;
  finishCount = 0; raceTime = 0; cdT = 3.6; cdShown = null; launchAt = null; doneT = 0;
  state = 'countdown'; paused = false;
  camH = player.h;
  lastHud = {}; lastSlot = '-'; lastHogs = -1;
  el.msg.hidden = true; el.cd.hidden = true;
  show('#menu', false); show('#results', false); show('#pause', false); show('#hud', true); show('#touch', isTouch);
  requestAnimationFrame(setupMini);
}
function toMenu() {
  state = 'menu'; paused = false;
  show('#hud', false); show('#results', false); show('#pause', false); show('#touch', false); show('#menu', true);
  placeGrid(); showBest(); silenceEngine();
}
function togglePause() {
  if (state !== 'race' && state !== 'countdown') return;
  paused = !paused;
  show('#pause', paused);
  if (paused) { silenceEngine(); $('#resumeBtn').focus(); }
}
$('#startBtn').addEventListener('click', startRace);
$('#resumeBtn').addEventListener('click', togglePause);
$('#restartBtn').addEventListener('click', startRace);
$('#quitBtn').addEventListener('click', toMenu);
$('#againBtn').addEventListener('click', startRace);
$('#menuBtn').addEventListener('click', toMenu);
$('#pauseBtn').addEventListener('click', togglePause);
$('#muteBtn').addEventListener('click', toggleMute);
document.addEventListener('visibilitychange', () => { if (document.hidden && !paused && (state === 'race' || state === 'countdown')) togglePause(); });

function showResults() {
  state = 'results';
  silenceEngine();
  show('#hud', false); show('#touch', false);
  const rows = karts.map((k) => ({ k, t: k.finished ? k.finishTime : raceTime + ((LAPS * N - k.prog) * SEG) / (CC[cls()].base * 0.85), est: !k.finished }));
  rows.sort((a, b) => a.t - b.t);
  $('#resBody').innerHTML = rows.map((r, i) =>
    `<tr class="${r.k.isPlayer ? 'me' : ''}"><td>${i + 1}.</td><td><span class="dot" style="background:${hex(r.k.ch.kart)}"></span>${r.k.ch.name}</td><td class="${r.est ? 'est' : ''}">${r.est ? '≈ ' : ''}${fmt(r.t)}</td></tr>`).join('');
  const place = rows.findIndex((r) => r.k.isPlayer) + 1;
  $('#resTitle').textContent = `${place}. místo`;
  const c = CC[cls()];
  $('#resEyebrow').textContent = place === 1 ? 'Vítězství · Slunečný okruh' : `Cíl · ${c.label}`;
  const key = 'dk-best-' + cls(), prev = Number(store.get(key));
  if (!prev || player.finishTime < prev) { store.set(key, String(player.finishTime)); $('#resBest').textContent = `Nový osobní rekord ${c.in}!`; }
  else $('#resBest').textContent = `Osobní rekord ${c.in}: ${fmt(prev)}`;
  show('#results', true);
  $('#againBtn').focus();
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  setupMini();
}

/* ================= Main loop ================= */
let camH = 0;
const camTarget = new THREE.Vector3(), camLook = new THREE.Vector3();

function simulate(dt) {
  if (state === 'countdown') {
    cdT -= dt;
    const pi = playerInput();
    if (pi.throttle && launchAt === null && cdT < 3) launchAt = cdT;
    if (!pi.throttle) launchAt = null;
    const n = Math.ceil(cdT);
    if (cdT > 0 && n <= 3 && n !== cdShown) { cdShown = n; el.cd.textContent = n; el.cd.hidden = false; el.cd.classList.remove('pop'); void el.cd.offsetWidth; el.cd.classList.add('pop'); sfx.beep(); }
    if (cdT <= 0) {
      state = 'race'; sfx.go();
      el.cd.textContent = 'Jeď!'; el.cd.classList.remove('pop'); void el.cd.offsetWidth; el.cd.classList.add('pop');
      setTimeout(() => { el.cd.hidden = true; }, 800);
      if (launchAt !== null && launchAt < 0.75) { player.boost = 1.2; showMsg('Raketový start!'); sfx.boost(); }
    }
    setEngine(player, pi.throttle, dt, pi.throttle ? 0.72 + Math.sin(gTime * 6) * 0.1 : 0.1);
    return;
  }
  if (state !== 'race' && state !== 'done') return;
  raceTime += dt;
  for (const k of karts) {
    if (!k.isPlayer) {
      const diff = player.prog - k.prog;
      k.mul = k.ai.skill * clamp(1 + (diff / N) * 0.35, 0.86, 1.14);
    }
    let inp;
    if (k.isPlayer && !k.finished) {
      inp = playerInput();
      // one fire button: the item from a box goes first, otherwise a hedgehog
      if (firePressed) {
        if (k.item && k.rollT <= 0) useItem(k);
        else if (k.hogs > 0) throwHog(k);
        else if (msgTimer <= 0 && k.rollT <= 0) showMsg('Žádní ježci!', 0.8);
      }
    } else inp = aiInput(k, dt);
    if (k.hogCd > 0) k.hogCd -= dt;
    if (k.rollT > 0) { k.rollT -= dt; if (k.rollT <= 0) { k.item = k.pending; k.pending = null; } }
    const lapBefore = k.lap;
    stepKart(k, inp, dt);
    if (k.isPlayer && k.lap > lapBefore && k.lap < LAPS && k.lap > 0) showMsg(k.lap === LAPS - 1 ? 'Poslední kolo!' : `Kolo ${k.lap + 1}`);
    if (!k.finished && k.lap >= LAPS) {
      k.finished = true; k.finishTime = raceTime; k.place = ++finishCount;
      if (k.isPlayer) { state = 'done'; doneT = 3.2; showMsg(k.place === 1 ? 'Vítězství!' : `Cíl! ${k.place}. místo`, 3); sfx.finish(); }
    }
    if (k.isPlayer && !k.finished) {
      const dot = k.vx * T[k.idx].x + k.vz * T[k.idx].z;
      k.wrongT = dot < -4 ? k.wrongT + dt : 0;
      if (k.wrongT > 1 && msgTimer <= 0) showMsg('Opačný směr!');
    }
  }
  firePressed = false;

  // kart-to-kart bumps
  for (let a = 0; a < karts.length; a++) for (let b = a + 1; b < karts.length; b++) {
    const A = karts[a], B = karts[b], dx = B.x - A.x, dz = B.z - A.z, d2 = dx * dx + dz * dz;
    if (d2 < 2.4 * 2.4 && d2 > 1e-6) {
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = (2.4 - d) / 2;
      A.x -= nx * push; A.z -= nz * push; B.x += nx * push; B.z += nz * push;
      const rv = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
      if (rv < 0) { A.vx += rv * nx * 0.5; A.vz += rv * nz * 0.5; B.vx -= rv * nx * 0.5; B.vz -= rv * nz * 0.5; }
    }
  }

  // item boxes
  for (const b of boxes) {
    if (!b.m.visible) { b.respawn -= dt; if (b.respawn <= 0) b.m.visible = true; continue; }
    for (const k of karts) {
      const dx = k.x - b.m.position.x, dz = k.z - b.m.position.z;
      if (dx * dx + dz * dz < 2.5 * 2.5) {
        b.m.visible = false; b.respawn = 2.5;
        burst(b.m.position.x, 1.3, b.m.position.z, 16, 1, 0.8, 0.5);
        if (!k.item && k.rollT <= 0) {
          if (k.isPlayer) { k.pending = rollItem(k); k.rollT = 1.0; sfx.pickup(); }
          else { k.item = rollItem(k); k.ai.itemT = rnd(1, 4); }
        }
        break;
      }
    }
  }

  // hedgehogs sitting on the road
  collectHedgehogs(karts, (k, sp) => {
    k.hogs++;
    burst(sp.x, 1, sp.z, 14, 0.75, 0.5, 0.25);
    if (k.isPlayer) { sfx.hog(); if (k.hogs >= MAX_HOGS) showMsg('Plno ježků!', 0.9); }
  });

  // flying hedgehogs and fireballs
  for (let n = projectiles.length - 1; n >= 0; n--) {
    const pr = projectiles[n];
    pr.life -= dt; pr.age += dt;
    pr.f += (pr.speed * dt) / SEG;
    while (pr.f >= 1) { pr.f -= 1; pr.idx = (pr.idx + 1) % N; }
    if (pr.target && !pr.target.finished) {
      const ahead = (pr.target.idx - pr.idx + N) % N;
      if (ahead < 90) pr.lat += clamp(pr.target.lat - pr.lat, -16 * dt, 16 * dt);
    }
    const fire = pr.kind === 'fire';
    if (fire) pr.lat = clamp(pr.lat + pr.latV * dt, -W - 3, W + 3);
    const i0 = pr.idx, i1 = (pr.idx + 1) % N;
    const x = P[i0].x + (P[i1].x - P[i0].x) * pr.f + S[i0].x * pr.lat, z = P[i0].z + (P[i1].z - P[i0].z) * pr.f + S[i0].z * pr.lat;
    if (fire) {
      pr.mesh.position.set(x, 0.95, z);
      pr.mesh.userData.halo.scale.setScalar(1 + Math.sin(pr.age * 30) * 0.12);
      for (let e = 0; e < 2; e++) emit(x + rnd(-0.3, 0.3), 0.95 + rnd(-0.3, 0.3), z + rnd(-0.3, 0.3), rnd(-1.5, 1.5), rnd(1, 3.5), rnd(-1.5, 1.5), 1, rnd(0.3, 0.6), 0.08, rnd(0.25, 0.4));
    } else {
      pr.mesh.position.set(x, 0.62, z);
      pr.mesh.rotation.y = headingAt(i0);
      pr.mesh.userData.roll.rotation.x += (pr.speed * dt) / 0.6;
      if (Math.random() < 0.5) emit(x, 0.2, z, rnd(-1, 1), rnd(0.5, 2), rnd(-1, 1), 0.4, 0.3, 0.18, 0.4, 2);
    }
    let hit = false;
    for (const k of karts) {
      if ((k === pr.owner && pr.age < 1) || k.y > 1.2) continue;
      if ((k.x - x) ** 2 + (k.z - z) ** 2 < (fire ? 2.1 : 1.9) ** 2) { hitKart(k, pr.owner); hit = true; break; }
    }
    if (hit || pr.life <= 0) {
      if (fire) burst(x, 1, z, 16, 1, 0.45, 0.1);
      else if (!hit) burst(x, 0.6, z, 10, 0.6, 0.45, 0.3);
      scene.remove(pr.mesh); projectiles.splice(n, 1);
    }
  }

  // ice-cream hazards
  for (let n = hazards.length - 1; n >= 0; n--) {
    const h = hazards[n];
    h.life -= dt;
    let hit = false;
    for (const k of karts) {
      if (k.y > 0.4) continue;
      if ((k.x - h.x) ** 2 + (k.z - h.z) ** 2 < 1.7 * 1.7) { hitKart(k, null); hit = true; break; }
    }
    if (hit || h.life <= 0) { scene.remove(h.m); hazards.splice(n, 1); }
  }

  if (state === 'done') { doneT -= dt; if (doneT <= 0) showResults(); }
  setEngine(player, player.thr, dt);
  updateOpponents(player, karts.filter((o) => o !== player), camH);
}

function updateCamera(dt) {
  if (state === 'menu') {
    const k = player, a = gTime * 0.35;
    camTarget.set(k.x + Math.sin(a) * 7.5, 3.2, k.z + Math.cos(a) * 7.5);
    camera.position.lerp(camTarget, 1 - Math.exp(-4 * dt));
    camLook.set(k.x, 1.3, k.z);
    camera.lookAt(camLook);
    camera.fov += (48 - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
    return;
  }
  const k = player;
  if (k.spin <= 0) camH += wrapA(k.h - camH) * (1 - Math.exp(-5 * dt));
  const back = k.ch.camBack || 8.8, up = k.ch.camUp || 3.7;
  camTarget.set(k.x - Math.sin(camH) * back, k.y + up, k.z - Math.cos(camH) * back);
  camera.position.lerp(camTarget, 1 - Math.exp(-(state === 'countdown' ? 3 : 10) * dt));
  camLook.set(k.x + Math.sin(camH) * 5, k.y + 1.5, k.z + Math.cos(camH) * 5);
  camera.lookAt(camLook);
  const fov = 64 + clamp(Math.abs(k.speed) / 40, 0, 1.4) * 8 + (k.boost > 0 ? 7 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

function frameUpdate(dt) {
  gTime += dt;
  for (const b of boxes) { b.m.rotation.y += dt * 1.2; b.m.rotation.x += dt * 0.6; b.m.position.y = 1.3 + Math.sin(gTime * 2 + b.m.position.x) * 0.2; }
  for (const c of clouds) { c.position.x += dt * 3; if (c.position.x > 900) c.position.x = -700; }
  if (!paused) {
    const steps = dt > 1 / 50 ? 2 : 1;
    for (let s = 0; s < steps; s++) simulate(dt / steps);
    updateHedgehogs(dt, camera.position);
    for (const k of karts) syncKart(k, state === 'menu' || state === 'countdown' ? 0 : dt);
    if (state === 'menu') player.v.head.rotation.y = Math.sin(gTime * 1.3) * 0.4;
    updateParticles(dt);
  }
  updateCamera(dt);
  sky.position.copy(camera.position);
  sun.position.set(player.x + 70, 140, player.z + 50);
  sun.target.position.set(player.x, 0, player.z);
  if (state === 'race' || state === 'done' || state === 'countdown') updateHud(dt);
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frameUpdate(dt);
  renderer.render(scene, camera);
}

// boot
ccIdx = clamp(Number(store.get('dk-cc') ?? 1) || 0, 0, 2);
document.querySelectorAll('#cc button').forEach((x) => x.setAttribute('aria-checked', String(Number(x.dataset.cc) === ccIdx)));
selectChar(clamp(Number(store.get('dk-char')) || 0, 0, CHARS.length - 1));
setKid(kid);
addEventListener('resize', resize);
resize();
camera.position.set(player.x + 10, 5, player.z + 10);
requestAnimationFrame(loop);

window.__main = { camera, karts, get player() { return player; }, get state() { return state; }, frameUpdate }; // DBG
