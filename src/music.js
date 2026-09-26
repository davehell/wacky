import { $, store } from './util.js';

/* ================= Music ================= */
// Cheerful background tunes, synthesised on the fly. Every song has a fixed theme (A) and parts that are
// composed afresh from a seed on every pass round the loop, so the music keeps its tune but never just repeats.
const MAJOR = [0, 2, 4, 5, 7, 9, 11], DORIAN = [0, 2, 3, 5, 7, 9, 10];
// root: MIDI note of the key; A/B: chord roots as scale degrees, one per bar; lead: the melody's voice
const SONGS = {
  menu: { bpm: 100, root: 60, scale: MAJOR, A: [0, 5, 3, 4], B: [3, 4, 0, 5], form: ['A', 'B'], lead: 'flute', drums: 'soft', seed: 11 },
  sunny: { bpm: 126, root: 57, scale: MAJOR, A: [0, 4, 5, 3], B: [3, 0, 4, 4], form: ['A', 'V', 'B', 'V'], lead: 'chip', drums: 'pop', seed: 3 },
  snow: { bpm: 112, root: 65, scale: MAJOR, A: [0, 5, 3, 4], B: [5, 3, 0, 4], form: ['A', 'V', 'B', 'A'], lead: 'bell', drums: 'soft', seed: 7 },
  desert: { bpm: 120, root: 62, scale: DORIAN, A: [0, 6, 3, 0], B: [3, 4, 6, 4], form: ['A', 'V', 'B', 'V'], lead: 'pluck', drums: 'shaker', seed: 5 },
  podium: { bpm: 132, root: 60, scale: MAJOR, A: [0, 3, 4, 0], B: [5, 3, 4, 4], form: ['A', 'B'], lead: 'chip', drums: 'pop', seed: 19 },
};

let AC = null, bus = null, noise = null, on = store.get('dk-music') !== '0';
let song = null, nextT = 0, step = 0, loop = 0, tempo = 1, parts = null;
// a few decibels under the sound effects, so it stays in the background
const LEVEL = 0.3;

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
// a scale degree (may be negative or above 7) as a MIDI note
function deg(s, d) { const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7; return s.root + o * 12 + s.scale[i]; }
// the bass stays between E2 and E3: deep enough to carry the tune, too high to boom
function low(m) { while (m > 52) m -= 12; while (m < 40) m += 12; return m; }

// Rhythms for one bar of melody in sixteenths: 1 starts a note that lasts until the next one
const RHYTHMS = [
  [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0],
  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
];
// A four-bar phrase: bars one and three share a rhythm (a motif and its answer), bar four comes to rest.
// Strong beats land on chord tones, the notes in between mostly step to the next one.
function phrase(s, chords, r) {
  const notes = [];
  const r1 = RHYTHMS[Math.floor(r() * RHYTHMS.length)], r2 = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
  let d = 7 + [0, 2, 4][Math.floor(r() * 3)], dir = 1;
  chords.forEach((c, bar) => {
    const rh = bar === 3 ? [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] : bar === 1 ? r2 : r1;
    const tones = [c, c + 2, c + 4, c + 7, c + 9, c + 11];
    for (let i = 0; i < 16; i++) {
      if (!rh[i]) continue;
      if (i % 4 === 0) {
        // the chord tone nearest to one step further in the direction the tune is going
        let best = tones[0], bd = 99;
        for (const t of tones) for (const o of [0, 7]) { const v = t + o - 7, dd = Math.abs(v - (d + dir)) + r() * 0.8; if (dd < bd) { bd = dd; best = v; } }
        d = best;
      } else {
        // runs up or down, turning round now and then
        if (r() < 0.3) dir = -dir;
        d += dir * (r() < 0.7 ? 1 : 2);
      }
      // bounce off the edges of the range instead of sticking to them
      if (d < 4) { d = 8 - d; dir = 1; }
      if (d > 14) { d = 28 - d; dir = -1; }
      let len = 1;
      while (i + len < 16 && !rh[i + len]) len++;
      notes.push({ at: bar * 16 + i, d, len: bar === 3 && i === 4 ? 12 : len });
    }
  });
  return notes;
}
// the whole song for one pass: the theme stays, the variation (V) and the bridge (B) are new each time
function compose(s, pass) {
  const theme = phrase(s, s.A, rng(s.seed));
  return s.form.map((part) => {
    if (part === 'A') return { chords: s.A, mel: theme };
    // every other pass the variation gets a second voice a third below
    if (part === 'V') return { chords: s.A, mel: phrase(s, s.A, rng(s.seed * 97 + pass * 13 + 1)), harmony: pass % 2 === 1 };
    return { chords: s.B, mel: phrase(s, s.B, rng(s.seed * 31 + pass * 7 + 2)), bridge: true };
  });
}

/* ---------- Instruments ---------- */
function env(t, dur, vol, a = 0.01) {
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(bus);
  return g;
}
function osc(type, f, t, dur, out, detune = 0) {
  const o = AC.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  o.connect(out); o.start(t); o.stop(t + dur + 0.05);
  return o;
}
function lowpass(f, out) { const l = AC.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = f; l.connect(out); return l; }
const LEADS = {
  // soft square wave, as in an old console game, but rounded off
  chip(t, f, dur) { const g = env(t, dur + 0.05, 0.05); osc('square', f, t, dur, lowpass(2600, g)); osc('triangle', f, t, dur, g); },
  // a breathy flute for the menu
  flute(t, f, dur) {
    const g = env(t, dur + 0.12, 0.07, 0.05);
    const o = osc('sine', f, t, dur + 0.1, g);
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 5; lg.gain.value = f * 0.008;
    lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.15);
    osc('triangle', f * 2, t, dur, env(t, dur, 0.012, 0.05));
  },
  // glockenspiel for the snow
  bell(t, f) { osc('sine', f, t, 1.2, env(t, 1.2, 0.07, 0.004)); osc('sine', f * 4.01, t, 0.4, env(t, 0.4, 0.02, 0.002)); },
  // a plucked string for the desert
  pluck(t, f, dur) {
    const g = env(t, Math.min(0.6, dur + 0.25), 0.07, 0.004);
    const l = AC.createBiquadFilter(); l.type = 'lowpass'; l.frequency.setValueAtTime(3200, t); l.frequency.exponentialRampToValueAtTime(500, t + 0.35); l.connect(g);
    osc('sawtooth', f, t, 0.6, l); osc('triangle', f, t, 0.6, g);
  },
};
function bass(t, f, dur) { osc('triangle', f, t, dur, env(t, dur, 0.13, 0.01)); osc('sine', f * 2, t, dur, env(t, dur * 0.6, 0.02)); }
function pad(t, f, dur) { const g = env(t, dur, 0.018, 0.02); osc('square', f, t, dur, lowpass(1400, g)); }
function hit(t, type, f, dur, vol, q = 1) {
  const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = env(t, dur, vol, 0.002);
  s.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  s.connect(fl).connect(g); s.start(t); s.stop(t + dur + 0.05);
}
// light percussion only: a soft thump, never a boom
function kick(t) { const g = env(t, 0.16, 0.16, 0.003); const o = osc('sine', 150, t, 0.16, g); o.frequency.exponentialRampToValueAtTime(60, t + 0.12); }
const DRUMS = {
  pop(t, i, bridge) {
    if (i % 8 === 0 && !(bridge && i === 8)) kick(t);
    if (i % 8 === 4) hit(t, 'bandpass', 1800, 0.12, 0.05, 0.9);
    if (i % 2 === 0) hit(t, 'highpass', 7000, 0.04, i % 4 === 2 ? 0.03 : 0.015);
  },
  soft(t, i) {
    if (i % 16 === 0) kick(t);
    if (i % 4 === 2) hit(t, 'highpass', 6500, 0.05, 0.018);
  },
  shaker(t, i) {
    if (i % 8 === 0) kick(t);
    hit(t, 'bandpass', 5500, 0.05, i % 4 === 2 ? 0.03 : 0.012, 1.5);
    if (i % 16 === 10) hit(t, 'bandpass', 900, 0.08, 0.04, 2);
  },
};

/* ---------- Scheduler ---------- */
function schedule() {
  if (!song) return;
  const s = SONGS[song], sixteenth = 60 / (s.bpm * tempo) / 4;
  while (nextT < AC.currentTime + 0.15) {
    const barsPerPart = 4, partLen = barsPerPart * 16, total = parts.length * partLen;
    const pi = Math.floor(step / partLen), part = parts[pi], i = step % partLen, bar = Math.floor(i / 16), b16 = i % 16;
    const chord = part.chords[bar], t = nextT;
    // melody
    for (const n of part.mel) {
      if (n.at !== i) continue;
      LEADS[s.lead](t, hz(deg(s, n.d)), n.len * sixteenth * 0.9);
      if (part.harmony) LEADS[s.lead](t, hz(deg(s, n.d - 2)), n.len * sixteenth * 0.9);
    }
    // bass on the beat, with a step up at the end of a bar
    if (b16 % 4 === 0) bass(t, hz(low(deg(s, chord + (b16 === 12 && bar === 3 ? 4 : 0)))), sixteenth * (b16 === 0 ? 3 : 2));
    if (b16 === 14) bass(t, hz(low(deg(s, chord + 2))), sixteenth);
    // broken chords in eighths
    if (b16 % 2 === 0) pad(t, hz(deg(s, chord + [0, 2, 4, 2][(b16 / 2) % 4])), sixteenth * 1.6);
    // the drums pause for the first bar of the bridge, which makes the tune breathe
    if (!(part.bridge && bar === 0)) DRUMS[s.drums](t, b16, part.bridge);
    nextT += sixteenth;
    step++;
    if (step >= total) { step = 0; loop++; parts = compose(s, loop); }
  }
}

function initMusic(ctx, out, noiseBuf) {
  if (AC) return;
  AC = ctx; noise = noiseBuf;
  bus = AC.createGain(); bus.gain.value = on ? LEVEL : 0;
  bus.connect(out);
  setInterval(schedule, 40);
}
// Starts a song from the top (or keeps playing it if it is already on)
function playSong(id) {
  if (!AC || song === id) return;
  song = id; step = 0; loop = 0; tempo = 1;
  parts = compose(SONGS[id], 0);
  nextT = AC.currentTime + 0.1;
  bus.gain.cancelScheduledValues(AC.currentTime);
  bus.gain.setTargetAtTime(on ? LEVEL : 0, AC.currentTime, 0.05);
}
function stopSong(fade = 0.3) {
  if (!AC || !song) return;
  song = null;
  bus.gain.setTargetAtTime(0, AC.currentTime, fade);
}
// the last lap goes a little faster
function setTempo(mul) { tempo = mul; }
// quieter while paused
function duckMusic(duck) { if (AC && song) bus.gain.setTargetAtTime(on ? (duck ? LEVEL * 0.3 : LEVEL) : 0, AC.currentTime, 0.1); }
function drawMusicIcon() {
  $('#musicIcon').innerHTML = '<path d="M7 14.5V4l9-2v10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="5" cy="14.5" r="2.5" fill="currentColor"/><circle cx="14" cy="12.5" r="2.5" fill="currentColor"/>' +
    (on ? '' : '<path d="M2 2l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
}
function toggleMusic() {
  on = !on;
  store.set('dk-music', on ? '1' : '0');
  if (AC && song) bus.gain.setTargetAtTime(on ? LEVEL : 0, AC.currentTime, 0.05);
  drawMusicIcon();
}
drawMusicIcon();

export { initMusic, playSong, stopSong, setTempo, duckMusic, toggleMusic };
