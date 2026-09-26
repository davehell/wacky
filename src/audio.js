import { $, clamp, store } from './util.js';
import { W } from './track.js';

/* ================= Audio ================= */
let AC = null, master = null, sfxBus = null, noiseBuf = null, pulse = null, eng = null, muted = store.get('dk-muted') === '1';
const opp = [];
// The player's own engine drowned out everything else, so it is silent for now; raise to bring it back
const PLAYER_ENGINE_VOL = 0;
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
    // Pulse wave with a 30 % duty cycle: the nasal buzz of a small single-cylinder engine
    const H = 32, re = new Float32Array(H), im = new Float32Array(H);
    for (let n = 1; n < H; n++) im[n] = (Math.sin(n * Math.PI * 0.3) / n) * Math.exp(-n / 14);
    pulse = AC.createPeriodicWave(re, im);

    const voice = (lpFreq) => {
      const osc = AC.createOscillator(); osc.setPeriodicWave(pulse);
      const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150;
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpFreq; lp.Q.value = 0.8;
      const gain = AC.createGain(); gain.gain.value = 0;
      osc.connect(hp).connect(lp).connect(gain);
      osc.start();
      return { osc, lp, gain };
    };
    const loopNoise = (type, f, q) => {
      const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = AC.createGain(); g.gain.value = 0;
      s.connect(fl).connect(g).connect(master); s.start();
      return { f: fl, g };
    };
    const v = voice(1200);
    const peak = AC.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 900; peak.gain.value = 4; peak.Q.value = 1;
    v.gain.connect(peak).connect(master);
    eng = Object.assign(v, { w: 0, gear: 1, shiftT: 0, skid: loopNoise('bandpass', 1500, 3), rumble: loopNoise('lowpass', 420, 0.7), vs: 0, blipT: 0, load: 0 });

    for (let i = 0; i < 5; i++) {
      const o = voice(1400);
      const pan = AC.createStereoPanner ? AC.createStereoPanner() : null;
      if (pan) o.gain.connect(pan).connect(master); else o.gain.connect(master);
      opp.push(Object.assign(o, { pan, pitch: 0.85 + i * 0.09 }));
    }
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
  bump: () => { note(240, 0, 0.16, 'sine', 0.1, 360); whoosh(0, 0.12, 'bandpass', 700, 300, 0.06, 1.2); },
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
  shift: () => whoosh(0, 0.09, 'bandpass', 2500, 1200, 0.05, 2),
};
function gearOf(v) { let g = 1; while (g < GEARS.length - 1 && v >= GEARS[g]) g++; return g; }
function revOf(v, g) { const lo = GEARS[g - 1], hi = GEARS[g]; return clamp(0.25 + 0.75 * ((v - lo) / (hi - lo)), 0.2, 1); }

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
  const f = (78 + r * 170) * (1 + eng.w + bump) * (eng.shiftT > 0 ? 0.9 : 1);
  eng.osc.frequency.setTargetAtTime(f, t, 0.035);
  eng.lp.frequency.setTargetAtTime(700 + r * 1800 + (throttle ? 700 : 0), t, 0.08);
  const vol = eng.shiftT > 0 ? 0.03 : (throttle ? 0.07 : 0.045) + r * 0.02;
  eng.gain.gain.setTargetAtTime(vol * PLAYER_ENGINE_VOL, t, 0.05);
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
    const f = (78 + revOf(v, gearOf(v)) * 170) * o.pitch * doppler;
    o.osc.frequency.setTargetAtTime(f, t, 0.05);
    o.gain.gain.setTargetAtTime(0.06 * Math.pow(clamp(1 - d / 50, 0, 1), 2), t, 0.08);
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

export { initAudio, sfx, setEngine, setGearBase, updateOpponents, silenceEngine, toggleMute };
