import { $, clamp, store } from './util.js';
import { W } from './track.js';

/* ================= Audio ================= */
let AC = null, master = null, sfxBus = null, noiseBuf = null, eng = null, muted = store.get('dk-muted') === '1';
const opp = [];
// Quiet enough to stay under the other karts' engines when they are close, but audible on its own
// so the player is never driving in total silence when out in front alone
const PLAYER_ENGINE_VOL = 0.4;
// Gear boundaries as fractions of the class's top speed. The top gears sit around cruising speed, so
// bends, bumps and turbos keep the gearbox busy for the whole race instead of only at the start.
const GEAR_F = [0, 0.14, 0.3, 0.46, 0.62, 0.78, 0.94, 1.1, 1.45];
let GEARS = GEAR_F.map((f) => f * 36);
function setGearBase(base) { GEARS = GEAR_F.map((f) => f * base); }
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4;
    master = AC.createGain(); master.gain.value = muted ? 0 : 0.8;
    master.connect(comp).connect(AC.destination);
    sfxBus = AC.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Every engine voice has the same graph; the chosen profile only retunes it.
    // An LFO pumping the volume makes the "pr-pr-pr" putter, a slow wobble on the pitch makes it rubbery.
    const voice = () => {
      const osc = AC.createOscillator();
      const hp = AC.createBiquadFilter(); hp.type = 'highpass';
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass';
      const putt = AC.createGain();
      const lfo = AC.createOscillator(); lfo.frequency.value = 8;
      const depth = AC.createGain();
      lfo.connect(depth).connect(putt.gain);
      const wob = AC.createOscillator(); wob.frequency.value = 4.5 + Math.random();
      const wobDepth = AC.createGain();
      wob.connect(wobDepth).connect(osc.detune);
      const gain = AC.createGain(); gain.gain.value = 0;
      osc.connect(hp).connect(lp).connect(putt).connect(gain);
      osc.start(); lfo.start(); wob.start();
      return { osc, hp, lp, putt, lfo, depth, wobDepth, gain };
    };
    const loopNoise = (type, f, q) => {
      const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = AC.createGain(); g.gain.value = 0;
      s.connect(fl).connect(g).connect(master); s.start();
      return { f: fl, g };
    };
    const v = voice();
    v.gain.connect(master);
    eng = Object.assign(v, { w: 0, gear: 1, shiftT: 0, skid: loopNoise('bandpass', 1500, 3), rumble: loopNoise('lowpass', 420, 0.7), vs: 0, blipT: 0, load: 0 });

    for (let i = 0; i < 5; i++) {
      const o = voice();
      const pan = AC.createStereoPanner ? AC.createStereoPanner() : null;
      if (pan) o.gain.connect(pan).connect(master); else o.gain.connect(master);
      opp.push(Object.assign(o, { pan, pitch: 0.85 + i * 0.09 }));
    }
    tuneEngines();
  } catch (e) { AC = null; eng = null; }
}
function note(freq, at, dur, type = 'sine', vol = 0.1, endFreq = 0) {
  if (!AC) return;
  const t = AC.currentTime + at, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
function whoosh(at, dur, type, f0, f1, vol, q = 1) {
  if (!AC) return;
  const t = AC.currentTime + at, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(sfxBus); s.start(t); s.stop(t + dur + 0.05);
}
const sfx = {
  pickup: () => { note(1047, 0, 0.16, 'triangle', 0.07); note(1319, 0.06, 0.16, 'triangle', 0.07); note(1568, 0.12, 0.22, 'triangle', 0.07); },
  hit: () => { note(300, 0, 0.3, 'sine', 0.25, 90); whoosh(0, 0.3, 'bandpass', 1600, 300, 0.25, 1.2); note(880, 0.05, 0.12, 'triangle', 0.05, 440); },
  boost: () => { whoosh(0, 0.5, 'bandpass', 500, 3000, 0.3, 1.4); note(330, 0, 0.35, 'triangle', 0.06, 660); },
  // a hedgehog curls up and rolls away: a springy "boing" and a happy squeak
  throwHog: () => { whoosh(0, 0.22, 'bandpass', 2200, 600, 0.14, 2); note(330, 0, 0.18, 'triangle', 0.09, 660); note(1175, 0.08, 0.14, 'triangle', 0.04, 1760); },
  // the ice cream pops out of the kart with a cheerful "plop"
  throwIce: () => { note(520, 0, 0.12, 'sine', 0.12, 1040); note(1040, 0.1, 0.16, 'triangle', 0.05, 1320); whoosh(0.02, 0.4, 'bandpass', 900, 2400, 0.08, 1.5); },
  // and lands with a soft wet splat
  splat: () => { whoosh(0, 0.22, 'lowpass', 1800, 250, 0.16, 0.8); note(400, 0, 0.14, 'sine', 0.08, 180); },
  // a dragon's breath: a rising roar of air and crackling sparks
  fire: () => {
    [0, 0.06, 0.12].forEach((t) => whoosh(t, 0.45, 'bandpass', 300, 1800, 0.14, 0.8));
    whoosh(0, 0.6, 'lowpass', 600, 2400, 0.1, 0.7);
    for (let i = 0; i < 6; i++) whoosh(0.08 + i * 0.07, 0.05, 'highpass', 3500, 5000, 0.05, 1);
    note(196, 0, 0.4, 'triangle', 0.06, 392);
  },
  // an opponent the player has hit: a comic "bonk" and a little fanfare
  score: () => { note(620, 0, 0.14, 'sine', 0.13, 310); note(988, 0.12, 0.12, 'triangle', 0.06); note(1319, 0.2, 0.2, 'triangle', 0.06); },
  // the extra layer on top of `hit` telling what it was
  hitBy: (kind) => {
    if (kind === 'fire') whoosh(0, 0.5, 'highpass', 2500, 6000, 0.08, 0.7);
    else if (kind === 'ice') whoosh(0, 0.25, 'lowpass', 1800, 250, 0.16, 0.8);
    else note(1400, 0.02, 0.1, 'triangle', 0.04, 2000);
  },
  // hitting a wall: a soft thud and rattling bits, never a harsh bang
  crash: (s) => {
    note(170, 0, 0.22, 'sine', 0.12 + 0.12 * s, 70);
    whoosh(0, 0.25, 'lowpass', 900, 160, 0.12 + 0.12 * s, 0.9);
    for (let i = 0; i < 3; i++) note(700 + i * 230, 0.05 + i * 0.05, 0.07, 'triangle', 0.03 * s, 500);
  },
  // two karts rubbing wheels: a rubbery "boing"
  bump: (s = 0.5) => {
    note(150, 0, 0.2, 'sine', 0.08 + 0.12 * s, 70);
    whoosh(0, 0.18, 'lowpass', 1400, 250, 0.08 + 0.12 * s, 0.9);
    note(260, 0.02, 0.18, 'triangle', 0.08 + 0.06 * s, 420);
    note(880, 0.04, 0.08, 'triangle', 0.04 * s, 620);
  },
  // little squeak of a hedgehog climbing aboard
  hog: () => { note(784, 0, 0.09, 'triangle', 0.06, 1175); note(1175, 0.07, 0.12, 'triangle', 0.05, 1568); },
  beep: () => { note(587, 0, 0.3, 'sine', 0.16); note(1174, 0, 0.2, 'sine', 0.035); },
  go: () => { note(1175, 0, 0.6, 'sine', 0.13); note(1568, 0, 0.6, 'sine', 0.08); note(2350, 0, 0.3, 'sine', 0.02); },
  finish: () => { [784, 988, 1175, 1568].forEach((f, i) => note(f, i * 0.12, i === 3 ? 0.7 : 0.18, 'triangle', 0.09)); },
  // a bright chime as the drift charge reaches the small (1) or the big (2) turbo
  charge: (level) => {
    if (level === 1) { note(1319, 0, 0.18, 'triangle', 0.06); note(1760, 0.07, 0.25, 'triangle', 0.05); }
    else { note(1568, 0, 0.16, 'triangle', 0.07); note(2093, 0.06, 0.16, 'triangle', 0.06); note(2637, 0.12, 0.3, 'triangle', 0.05); }
  },
  shift: () => { if (prof.shift) prof.shift(); },
};
function gearOf(v) { let g = 1; while (g < GEARS.length - 1 && v >= GEARS[g]) g++; return g; }
function revOf(v, g) { const lo = GEARS[g - 1], hi = GEARS[g]; return clamp(0.25 + 0.75 * ((v - lo) / (hi - lo)), 0.2, 1); }

// Engine sound profiles. harm: harmonic amplitudes of the tone; pitch: [idle Hz, rise per rev];
// lp: low-pass [base, per rev, extra on throttle]; putt: depth of the putter (0 = smooth);
// wobble: pitch wobble in cents; dip: pitch drop during an upshift.
const ENGINES = {
  // a round, hollow tone that putters and sweeps widely through each gear: a cartoon "vroooom"
  cartoon: {
    name: 'Kreslený', harm: [1, 0.35, 0.18, 0.06, 0.03], hp: 90, q: 0.7, lp: [900, 1500, 400], oppLp: 1400,
    pitch: [95, 230], putt: 0.4, wobble: 20, dip: 0.85, vol: 1,
    shift: () => note(420, 0, 0.14, 'sine', 0.035, 680),
  },
  // an almost pure, quiet hum, like an electric toy car
  soft: {
    name: 'Měkký', harm: [1, 0.12, 0.04], hp: 60, q: 0.5, lp: [600, 900, 200], oppLp: 900,
    pitch: [75, 150], putt: 0, wobble: 6, dip: 0.93, vol: 1, shift: null,
  },
  // a bright high scream with many harmonics and sharp upshifts; the doppler of passing karts does the rest
  f1: {
    name: 'Formule 1', harm: Array.from({ length: 24 }, (_, i) => (i % 2 ? 0.6 : 1) / (i + 1)), hp: 220, q: 1.1,
    lp: [1400, 2600, 800], oppLp: 3000, pitch: [190, 520], putt: 0.06, wobble: 4, dip: 0.72, vol: 0.7,
    shift: () => whoosh(0, 0.07, 'highpass', 3200, 1600, 0.04, 1),
  },
  // the original nasal buzz of a small single-cylinder engine (30 % pulse wave)
  buzz: {
    name: 'Původní', harm: Array.from({ length: 31 }, (_, i) => (Math.sin((i + 1) * Math.PI * 0.3) / (i + 1)) * Math.exp(-(i + 1) / 14)),
    hp: 150, q: 0.8, lp: [700, 1800, 700], oppLp: 1400, pitch: [78, 170], putt: 0, wobble: 0, dip: 0.9, vol: 1,
    shift: () => whoosh(0, 0.09, 'bandpass', 2500, 1200, 0.05, 2),
  },
};
let prof = ENGINES[store.get('dk-engine')] || ENGINES.cartoon;
const pitchOf = (r) => prof.pitch[0] + r * prof.pitch[1];
const puttOf = (r) => 7 + r * 13;
function tuneEngines() {
  if (!eng) return;
  const im = new Float32Array([0, ...prof.harm]);
  const wave = AC.createPeriodicWave(new Float32Array(im.length), im);
  for (const v of [eng, ...opp]) {
    v.osc.setPeriodicWave(wave);
    v.hp.frequency.value = prof.hp;
    v.lp.Q.value = prof.q;
    v.putt.gain.value = 1 - prof.putt;
    v.depth.gain.value = prof.putt;
    v.wobDepth.gain.value = prof.wobble;
  }
  for (const o of opp) o.lp.frequency.value = prof.oppLp;
}
function setEngineSound(id) {
  if (!ENGINES[id]) return;
  prof = ENGINES[id];
  store.set('dk-engine', id);
  tuneEngines();
}
// a short rev through two gears so the sound can be heard from the menu
function previewEngine() {
  initAudio();
  if (!eng) return;
  const t = AC.currentTime, vol = 0.07 * PLAYER_ENGINE_VOL * prof.vol;
  const f = eng.osc.frequency, lf = eng.lfo.frequency, g = eng.gain.gain, lp = eng.lp.frequency;
  for (const p of [f, lf, g, lp]) p.cancelScheduledValues(t);
  f.setValueAtTime(pitchOf(0.25), t); f.linearRampToValueAtTime(pitchOf(1), t + 0.9);
  f.setValueAtTime(pitchOf(1) * prof.dip, t + 0.9); f.linearRampToValueAtTime(pitchOf(0.35), t + 1.05);
  f.linearRampToValueAtTime(pitchOf(1), t + 2);
  lf.setValueAtTime(puttOf(0.25), t); lf.linearRampToValueAtTime(puttOf(1), t + 2);
  lp.setValueAtTime(prof.lp[0] + prof.lp[2], t); lp.linearRampToValueAtTime(prof.lp[0] + prof.lp[1] + prof.lp[2], t + 2);
  g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(vol, t + 0.08);
  g.setValueAtTime(vol, t + 2); g.linearRampToValueAtTime(0, t + 2.4);
  if (prof.shift) setTimeout(prof.shift, 900);
}

// rev: optional override (0..1) used while waiting on the grid
function setEngine(k, throttle, dt, rev = null) {
  if (!eng) return;
  const t = AC.currentTime, v = Math.abs(k.speed), off = Math.abs(k.lat) > W + 1.2;
  // the gearbox hears a speed that climbs slowly, so the pull through the gears lasts several seconds
  const top = GEARS[GEARS.length - 3];
  // a sharp bend "lifts off" a little, dropping a gear on the way in and picking it up on the way out
  eng.load += (Math.abs(k.st) - eng.load) * Math.min(1, dt * 2);
  const heard = v * (1 - 0.3 * eng.load);
  eng.vs = heard > eng.vs ? Math.min(heard, eng.vs + top * 0.12 * dt) : Math.max(heard, eng.vs - top * 0.6 * dt);
  let r;
  if (rev !== null) { r = rev; eng.vs = 0; }
  else {
    let g = gearOf(eng.vs);
    // hold the gear through small dips so it does not hunt up and down
    if (g === eng.gear - 1 && eng.vs > GEARS[g] - top * 0.015) g = eng.gear;
    if (g !== eng.gear) {
      if (g > eng.gear) { eng.shiftT = 0.16; if (PLAYER_ENGINE_VOL > 0) sfx.shift(); } else eng.blipT = 0.18;
      eng.gear = g;
    }
    r = revOf(eng.vs, g);
    // a downshift blips the throttle
    if (eng.blipT > 0) r += 0.18;
    if (k.drifting) r += 0.1;
    if (k.boost > 0) r += 0.14;
    if (k.y > 0.05) r += 0.12;
    if (!throttle) r *= 0.82;
    r -= Math.abs(k.st) * 0.05;
  }
  eng.shiftT = Math.max(0, eng.shiftT - dt);
  eng.blipT = Math.max(0, eng.blipT - dt);
  eng.w += (Math.random() - 0.5) * dt * 0.5;
  eng.w *= 1 - dt * 0.6;
  eng.w = clamp(eng.w, -0.04, 0.04);
  const bump = off && v > 5 ? (Math.random() - 0.5) * 0.1 : 0;
  const f = pitchOf(r) * (1 + eng.w + bump) * (eng.shiftT > 0 ? prof.dip : 1);
  eng.osc.frequency.setTargetAtTime(f, t, 0.035);
  eng.lfo.frequency.setTargetAtTime(puttOf(r) + (throttle ? 2 : 0), t, 0.1);
  eng.lp.frequency.setTargetAtTime(prof.lp[0] + r * prof.lp[1] + (throttle ? prof.lp[2] : 0), t, 0.08);
  const vol = eng.shiftT > 0 ? 0.03 : (throttle ? 0.07 : 0.045) + r * 0.02;
  eng.gain.gain.setTargetAtTime(vol * PLAYER_ENGINE_VOL * prof.vol, t, 0.05);
  eng.skid.g.gain.setTargetAtTime(k.drifting ? 0.04 : 0, t, 0.05);
  eng.skid.f.frequency.setTargetAtTime(1300 + v * 12 + Math.sin(t * 9) * 150, t, 0.05);
  eng.rumble.g.gain.setTargetAtTime(off ? clamp(v / 20, 0, 1) * 0.12 : 0, t, 0.08);
}
// heading: camera yaw, used to pan opponents left or right
function updateOpponents(listener, others, heading) {
  if (!eng) return;
  const t = AC.currentTime;
  const rx = Math.cos(heading), rz = -Math.sin(heading);
  others.forEach((k, i) => {
    const o = opp[i];
    if (!o) return;
    const dx = k.x - listener.x, dz = k.z - listener.z, d = Math.hypot(dx, dz) || 1;
    const vr = ((k.vx - listener.vx) * dx + (k.vz - listener.vz) * dz) / d;
    const doppler = clamp(1 - vr / 70, 0.75, 1.3);
    const v = Math.abs(k.speed);
    const r = revOf(v, gearOf(v));
    o.osc.frequency.setTargetAtTime(pitchOf(r) * o.pitch * doppler, t, 0.05);
    o.lfo.frequency.setTargetAtTime(puttOf(r) * o.pitch, t, 0.1);
    o.gain.gain.setTargetAtTime(0.06 * prof.vol * Math.pow(clamp(1 - d / 50, 0, 1), 2), t, 0.08);
    if (o.pan) o.pan.pan.setTargetAtTime(clamp(-(dx * rx + dz * rz) / 12, -0.9, 0.9), t, 0.08);
  });
}
// fade: time constant in seconds, longer for a gentle fade-out at the finish
function silenceEngine(fade = 0.05) {
  if (!eng) return;
  const t = AC.currentTime;
  for (const n of [eng.gain, eng.skid.g, eng.rumble.g, ...opp.map((o) => o.gain)]) n.gain.setTargetAtTime(0, t, fade);
}
function drawMuteIcon() {
  $('#muteIcon').innerHTML = '<path d="M3 7h3l5-4v14l-5-4H3z" fill="currentColor"/>' +
    (muted ? '<path d="m13 7 5 6m0-6-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : '<path d="M14 6.5a5 5 0 0 1 0 7M16.5 4a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
}
function toggleMute() {
  muted = !muted;
  store.set('dk-muted', muted ? '1' : '0');
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, AC.currentTime, 0.02);
  drawMuteIcon();
}
drawMuteIcon();

export { initAudio, sfx, setEngine, setGearBase, updateOpponents, silenceEngine, toggleMute, ENGINES, setEngineSound, previewEngine };
