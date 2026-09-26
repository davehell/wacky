/* ================= Background music ================= */
// A calm generated loop: soft pad chords, a round bass and a sparse marimba melody on the
// C major pentatonic, so no random note can ever clash with the chords underneath.
const BEAT = 60 / 76;
const VOL = 0.7;
// [bass root, pad chord] as MIDI notes; each chord lasts two bars
const PROGS = [
  [[48, [60, 64, 67]], [45, [57, 60, 64]], [41, [57, 60, 65]], [43, [55, 59, 62]]],
  [[48, [60, 64, 67]], [41, [57, 60, 65]], [45, [57, 60, 64]], [43, [55, 59, 62]]],
];
const PENTA = [69, 72, 74, 76, 79, 81, 84];
const STEPS = 64;

let ac = null, out = null, echo = null, nextT = 0, step = 0, prog = PROGS[0], mel = 3;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function tone(freq, t, dur, type, vol, attack, dest, detune = 0) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function pad(notes, t, dur) {
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  lp.connect(out);
  for (const m of notes) for (const d of [-7, 7]) tone(hz(m), t, dur, 'triangle', 0.016, 1.4, lp, d);
}
function marimba(m, t) {
  tone(hz(m), t, 1.1, 'sine', 0.05, 0.006, out);
  tone(hz(m), t, 1.1, 'sine', 0.02, 0.006, echo);
  tone(hz(m) * 4, t, 0.15, 'sine', 0.008, 0.003, out);
}
function play(s, t) {
  if (s === 0) prog = PROGS[Math.random() < 0.6 ? 0 : 1];
  const [root, chord] = prog[Math.floor(s / 16)], e = s % 16;
  if (e === 0) pad(chord, t, BEAT * 8 + 1.2);
  if (e === 0 || e === 8) tone(hz(e === 0 ? root : root + 7), t, BEAT * 3.5, 'sine', 0.045, 0.04, out);
  // the last bar of every chord breathes; strong beats play more often than off-beats
  const p = e >= 14 ? 0 : s % 4 === 0 ? 0.5 : s % 2 === 0 ? 0.3 : 0.12;
  if (Math.random() < p) {
    mel = Math.max(0, Math.min(PENTA.length - 1, mel + Math.round((Math.random() - 0.5) * 3.2)));
    marimba(PENTA[mel], t);
  }
}
function tick() {
  // a throttled background tab must not fire a burst of catch-up notes
  if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
  while (nextT < ac.currentTime + 0.5) {
    play(step, nextT);
    nextT += BEAT / 2;
    step = (step + 1) % STEPS;
  }
}
function startMusic(ctx, dest) {
  if (ac) return;
  ac = ctx;
  out = ac.createGain();
  out.gain.setValueAtTime(0, ac.currentTime);
  out.gain.setTargetAtTime(VOL, ac.currentTime, 1.5);
  out.connect(dest);
  // a soft, darkened echo gives the marimba some space
  echo = ac.createDelay(2); echo.delayTime.value = BEAT * 0.75;
  const fb = ac.createGain(); fb.gain.value = 0.3;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
  echo.connect(lp).connect(fb).connect(echo);
  lp.connect(out);
  nextT = ac.currentTime + 0.1;
  tick();
  setInterval(tick, 100);
}
// steps aside for a moment so sound effects are never drowned out
function duckMusic() {
  if (!out) return;
  const t = ac.currentTime;
  out.gain.cancelScheduledValues(t);
  out.gain.setTargetAtTime(VOL * 0.5, t, 0.03);
  out.gain.setTargetAtTime(VOL, t + 0.35, 0.5);
}

export { startMusic, duckMusic };
