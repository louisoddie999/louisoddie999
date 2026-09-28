#!/usr/bin/env node
/* Synthesises the soundtrack from the same clock as the picture (timeline.js).
   No samples: every drum, pad, whoosh and tick is generated from oscillators, noise and filters,
   and every sound effect is placed on the exact beat or frame of the visual event it belongs to. */
const fs = require('fs');
const path = require('path');
const TL = require('./timeline.js');

const SR = 48000;
const N = Math.round(TL.DURATION * SR);
const { BEAT, BAR } = TL;
const b = TL.b;
const T = TL.scenes.map((s) => s.start);
const TAU = Math.PI * 2;

const L = new Float32Array(N), R = new Float32Array(N); // dry bus
const VL = new Float32Array(N), VR = new Float32Array(N); // reverb send

let seed = 12345;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rand() * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const lerp = (a, c, t) => a + (c - a) * t;

/* ─────────── voice plumbing ─────────── */

function add(t0, dur, fn, { gain = 1, pan = 0, send = 0.15 } = {}) {
  const s0 = Math.max(0, Math.round(t0 * SR)), s1 = Math.min(N, Math.round((t0 + dur) * SR));
  for (let i = s0; i < s1; i++) {
    const tau = i / SR - t0;
    const v = fn(tau, i) * gain;
    const p = typeof pan === 'function' ? pan(tau) : pan;
    const gl = Math.cos(((p + 1) * Math.PI) / 4), gr = Math.sin(((p + 1) * Math.PI) / 4);
    L[i] += v * gl;
    R[i] += v * gr;
    if (send) {
      VL[i] += v * gl * send;
      VR[i] += v * gr * send;
    }
  }
}

// Chamberlin state-variable filter
class SVF {
  constructor(fc = 1000, q = 0.7) {
    this.lo = this.bp = this.hi = 0;
    this.set(fc, q);
  }
  set(fc, q = this.q) {
    this.q = q;
    this.f = 2 * Math.sin((Math.PI * Math.min(Math.max(fc, 20), SR * 0.16)) / SR);
    this.d = 1 / q;
  }
  run(x) {
    this.lo += this.f * this.bp;
    this.hi = x - this.lo - this.d * this.bp;
    this.bp += this.f * this.hi;
    return this;
  }
}
const onePole = (fc) => {
  const a = 1 - Math.exp((-TAU * fc) / SR);
  let y = 0;
  return (x) => (y += a * (x - y));
};
function polyblep(p, dt) {
  if (p < dt) {
    p /= dt;
    return p + p - p * p - 1;
  }
  if (p > 1 - dt) {
    p = (p - 1) / dt;
    return p * p + p + p + 1;
  }
  return 0;
}
function sawOsc(freq) {
  let p = rand();
  const dt = freq / SR;
  return () => {
    p += dt;
    if (p >= 1) p -= 1;
    return 2 * p - 1 - polyblep(p, dt);
  };
}

/* ─────────── sidechain ─────────── */

const KICKS = [];
for (let k = 4; k <= 27; k++) KICKS.push(b(k));
KICKS.push(T[7]);
const SC = new Float32Array(N).fill(1);
for (const tk of KICKS) {
  const s0 = Math.round(tk * SR);
  for (let i = s0; i < Math.min(N, s0 + SR * 0.45); i++) SC[i] = Math.min(SC[i], 1 - 0.72 * Math.exp(-((i - s0) / SR) * 8));
}

/* ─────────── instruments ─────────── */

function kick(t, amp = 1, tone = 1) {
  let ph = 0;
  add(t, 0.55, (tau) => {
    ph += (TAU * (42 + 130 * tone * Math.exp(-tau * 30))) / SR;
    const body = Math.sin(ph) * Math.exp(-tau * 6.5);
    const click = Math.exp(-tau * 900) * noise() * 0.6;
    return Math.tanh((body + click) * 1.6) * amp;
  }, { gain: 0.9, send: 0 });
}
function clap(t, amp = 1) {
  const f = new SVF(1400, 1.1);
  add(t, 0.45, (tau) => {
    let e = 0;
    for (const o of [0, 0.012, 0.024]) if (tau >= o) e += Math.exp(-(tau - o) * (o === 0.024 ? 13 : 110));
    return f.run(noise()).bp * e * amp;
  }, { gain: 0.75, send: 0.35 });
}
function hat(t, amp = 1, dec = 50, pan = 0) {
  const f = new SVF(7200, 0.8);
  add(t, Math.min(0.6, 7 / dec), (tau) => f.run(noise()).hi * Math.exp(-tau * dec) * amp, { gain: 0.2, pan, send: 0.05 });
}
function bass(t, dur, m, amp = 1) {
  let ph = 0;
  const saw = sawOsc(mtof(m)), lp = onePole(600), f = mtof(m);
  add(t, dur + 0.03, (tau, i) => {
    ph += (TAU * f) / SR;
    const env = Math.min(1, tau / 0.004) * (tau < dur ? 1 : Math.exp(-(tau - dur) * 120));
    const x = Math.sin(ph) + 0.55 * lp(saw()) * Math.exp(-tau * 7);
    return Math.tanh(1.6 * x) * env * SC[i] * amp;
  }, { gain: 0.36, send: 0 });
}
function pad(t, dur, notes, amp = 1, { attack = 0.06, release = 0.35, cutoff = 1500, duck = true } = {}) {
  for (const m of notes)
    for (const d of [-1, 0, 1]) {
      const osc = sawOsc(mtof(m) * Math.pow(2, (d * 0.09) / 12));
      const lp1 = onePole(cutoff), lp2 = onePole(cutoff);
      add(t, dur + release, (tau, i) => {
        const env = Math.min(1, tau / attack) * (tau < dur ? 1 : Math.exp(-(tau - dur) * (3 / release)));
        return lp2(lp1(osc())) * env * (duck ? SC[i] : 1) * amp;
      }, { gain: 0.06, pan: d * 0.6, send: 0.5 });
    }
}
function pluck(t, m, amp = 1, pan = 0, dec = 10) {
  const o1 = sawOsc(mtof(m)), o2 = sawOsc(mtof(m) * 1.004), f = new SVF(3000, 1.2);
  add(t, 0.5, (tau, i) => {
    f.set(300 + 4200 * Math.exp(-tau * 18), 1.3);
    return f.run((o1() + o2()) * 0.5).lo * Math.exp(-tau * dec) * Math.min(1, tau / 0.002) * SC[i] * amp;
  }, { gain: 0.15, pan, send: 0.4 });
}
function blip(t, f0, f1, dur, amp = 1, pan = 0, send = 0.3) {
  let ph = 0;
  add(t, dur, (tau) => {
    const p = tau / dur;
    ph += (TAU * f0 * Math.pow(f1 / f0, p)) / SR;
    return Math.sin(ph) * Math.min(1, tau / 0.003) * (1 - p) * (1 - p) * amp;
  }, { gain: 0.3, pan, send });
}
function fmBloop(t, m, amp = 1, pan = 0) {
  let pc = 0, pm = 0;
  const f = mtof(m);
  add(t, 0.45, (tau) => {
    const fc = f * (1 + 0.5 * Math.exp(-tau * 30));
    pc += (TAU * fc) / SR;
    pm += (TAU * fc * 2) / SR;
    return Math.sin(pc + 3 * Math.exp(-tau * 12) * Math.sin(pm)) * Math.exp(-tau * 7) * Math.min(1, tau / 0.002) * amp;
  }, { gain: 0.26, pan, send: 0.45 });
}
function whoosh(t, dur, f0, f1, amp = 1, pan0 = 0, pan1 = 0, shape = 'bell', q = 1.5) {
  const f = new SVF(f0, q);
  add(t, dur, (tau) => {
    const p = tau / dur;
    f.set(f0 * Math.pow(f1 / f0, p), q);
    const env = shape === 'rise' ? Math.pow(p, 2.2) : shape === 'fall' ? Math.pow(1 - p, 2) : Math.pow(Math.sin(Math.PI * p), 1.6);
    return f.run(noise()).bp * env * amp;
  }, { gain: 0.5, pan: (tau) => lerp(pan0, pan1, tau / dur), send: 0.3 });
}
function crash(t, amp = 1, dec = 2.6) {
  for (const p of [-0.6, 0.6]) {
    const hp = new SVF(4200, 0.7);
    add(t, 2, (tau) => hp.run(noise()).hi * Math.exp(-tau * dec) * amp, { gain: 0.16, pan: p, send: 0.5 });
  }
}
function impact(t, amp = 1) {
  kick(t, amp, 1.2);
  let ph = 0;
  add(t, 1.6, (tau) => {
    ph += (TAU * (36 + 34 * Math.exp(-tau * 4))) / SR;
    return Math.sin(ph) * Math.exp(-tau * 2.2) * amp;
  }, { gain: 0.5, send: 0 });
  crash(t, amp);
}
function riser(t0, t1, amp = 1) {
  const dur = t1 - t0;
  whoosh(t0, dur, 300, 7000, amp, -0.4, 0.4, 'rise', 2.5);
  let ph = 0;
  add(t0, dur, (tau) => {
    const p = tau / dur;
    ph += (TAU * 180 * Math.pow(8, p * p)) / SR;
    return (Math.sin(ph) + 0.3 * Math.sin(2.01 * ph)) * p * p * amp;
  }, { gain: 0.1, send: 0.4 });
}
function tick(t, freq = 3200, amp = 1, pan = 0) {
  let ph = 0;
  add(t, 0.03, (tau) => {
    ph += (TAU * freq) / SR;
    return Math.sin(ph) * Math.exp(-tau * 180) * amp;
  }, { gain: 0.17, pan, send: 0.25 });
}
function thwack(t, amp = 1) {
  blip(t, 900, 150, 0.09, amp, 0, 0.1);
  const lp = onePole(2500);
  add(t, 0.08, (tau) => lp(noise()) * Math.exp(-tau * 60) * amp, { gain: 0.5, send: 0.2 });
}
function glitch(t, dur, amp = 1) {
  let ph = 0, f = 400, hold = 0;
  add(t, dur, (tau, i) => {
    if (i >= hold) {
      f = 200 + rand() * 2400;
      hold = i + Math.round(SR * (0.008 + rand() * 0.02));
    }
    ph += f / SR;
    return (Math.round((ph % 1 < 0.5 ? 1 : -1) * 4) / 4) * (1 - tau / dur) * amp;
  }, { gain: 0.07, send: 0.1 });
}
function sproing(t, amp = 1) {
  let ph = 0;
  add(t, 0.5, (tau) => {
    const z = 0.2, w = TAU * 7, wd = w * Math.sqrt(1 - z * z);
    const s = 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
    ph += (TAU * (260 + 420 * s)) / SR;
    return Math.sin(ph) * Math.exp(-tau * 6) * amp;
  }, { gain: 0.26, send: 0.3 });
}

/* ─────────── score ─────────── */

const CH = [
  [57, 60, 64, 67], // Am7
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [55, 60, 64, 67], // C/G
  [55, 59, 62, 67], // G
  [57, 60, 64, 69], // Am
  [52, 56, 59, 62], // E7
  [57, 61, 64, 68, 71], // Amaj9 — the resolve
];
const ROOT = [33, 33, 29, 36, 31, 33, 28, 33];

// harmony
pad(0, BAR, CH[0], 0.55, { attack: 0.9, duck: false, cutoff: 800 });
for (let k = 1; k <= 6; k++) pad(T[k], BAR, CH[k], 1, { cutoff: 1300 + k * 220 });
pad(T[7], 15 - T[7] - 0.14, CH[7], 1.25, { attack: 0.01, release: 0.12, duck: false, cutoff: 2600 });
for (let k = 1; k <= 6; k++) for (let j = 0; j < 8; j++) bass(T[k] + j * (BEAT / 2), BEAT * 0.4, ROOT[k] + (j % 2 ? 12 : 0));
bass(T[7], 1.6, ROOT[7], 0.9);

// drums
for (let k = 4; k <= 27; k++) kick(b(k));
for (let k = 5; k <= 27; k += 2) clap(b(k));
clap(b(24), 0.8);
clap(b(26), 0.8);
for (let k = 4; k <= 27; k++) {
  hat(b(k + 0.5), 1, k >= 20 && k < 24 ? 14 : 50, 0.2);
  if (k >= 16) {
    hat(b(k + 0.25), 0.45, 70, -0.3);
    hat(b(k + 0.75), 0.45, 70, 0.3);
  }
}

// arps: 8ths under the grid, 16ths from the explosion on
for (let bar = 3; bar <= 6; bar++) {
  const notes = CH[bar].concat(CH[bar].map((m) => m + 12));
  const step = bar === 3 ? 0.5 : 0.25, pat = [0, 2, 4, 1, 5, 3, 6, 4];
  let j = 0;
  for (let x = 0; x < 4; x += step, j++) pluck(T[bar] + b(x), notes[pat[j % 8]] + 12, bar === 3 ? 0.8 : 0.6, j % 2 ? 0.35 : -0.35);
}

// 01 · squash & stretch
blip(0.0, 520, 1040, 0.14, 0.9);
{
  let ph = 0;
  add(b(1), 0.36, (tau) => {
    ph += (TAU * 180 * Math.pow(3.6, tau / 0.36) * (1 + 0.04 * Math.sin(tau * TAU * 18))) / SR;
    return Math.sin(ph) * Math.min(1, tau / 0.01) * (1 - tau / 0.36);
  }, { gain: 0.26, send: 0.3 });
}
kick(b(2), 0.75, 0.6);
{
  let ph = 0;
  add(b(2), 0.5, (tau) => {
    ph += (TAU * 70 * (1 + 0.15 * Math.sin(tau * TAU * 30) * Math.exp(-tau * 8))) / SR;
    return Math.sin(ph) * Math.exp(-tau * 7);
  }, { gain: 0.3, send: 0.1 });
}
blip(b(2) + 0.05, 300, 560, 0.12, 0.5);
kick(b(2.5), 0.4, 0.5);
riser(b(2.5), T[1], 1);
whoosh(1.58, 0.29, 400, 3500, 0.9, 0, 0, 'rise');
impact(T[1], 1);

// 02 · kinetic type
for (const t of [b(4), b(5), b(5.5), b(6)]) thwack(t, 0.9);
whoosh(b(7), 0.3, 1500, 6000, 0.6, -0.6, 0.6);
whoosh(3.46, 0.42, 800, 5000, 1, -0.8, 0.8, 'rise');
whoosh(3.5, 0.4, 900, 6000, 0.8, 0.8, -0.8, 'bell');

// 03 · morph
[77, 81, 84, 88].forEach((m, i) => fmBloop(b(8 + i), m, 1, [-0.4, 0.4, -0.2, 0.2][i]));

// 04 · stagger
whoosh(5.36, 0.4, 3000, 500, 0.6, 0, 0, 'fall');
for (let d = 1; d <= 22; d += 1.5) tick(5.56 + d * 0.0135, 1500 + d * 150, 0.7, noise() * 0.8);
whoosh(b(13), 0.6, 600, 4000, 0.5, -0.5, 0.5, 'bell', 4);
for (let c = 3; c <= 37; c += 2) tick(b(14) + c * 0.004, [2093, 2349, 2637, 3136, 3520][c % 5], 0.75, (c - 20) / 20);
for (let r = 8; r <= 14; r++) tick(b(15) + r * 0.004 + 0.02, 4200 - r * 150, 0.8, 0);
glitch(b(15), 0.12, 0.8);
whoosh(7.22, 0.28, 500, 7000, 1, 0, 0, 'rise');

// 05 · emergence
impact(T[4], 1.1);
whoosh(7.6, 0.8, 3000, 400, 0.5, -0.8, 0.8, 'fall');
riser(8.3, b(19), 0.8);
for (const m of CH[4]) pluck(b(19), m + 12, 1.1, 0, 5);
for (let i = 0; i < 8; i++) tick(b(19) + i * 0.02, 3000 + i * 400, 0.5, noise());
crash(b(19), 0.5, 4);
whoosh(9.08, 0.29, 400, 8000, 1, 0.6, -0.6, 'rise');

// 06 · depth
impact(T[5], 0.9);
{
  const f = new SVF(600, 2);
  add(T[5], BAR, (tau) => {
    let surge = 0;
    for (let k = 20; k <= 23; k++) {
      const d = T[5] + tau - b(k);
      if (d > 0) surge += Math.exp(-d * 5);
    }
    f.set(500 + 1400 * surge + 300 * tau, 2);
    return f.run(noise()).bp * (0.6 + 0.4 * surge) * Math.min(1, tau / 0.1);
  }, { gain: 0.3, pan: (tau) => 0.4 * Math.sin(tau * 3), send: 0.2 });
}
for (let k = 21; k <= 23; k++) whoosh(b(k), 0.35, 3000, 400, 0.45, 0, 0, 'fall');
{
  let ph = 0;
  add(10.55, 0.75, (tau) => {
    const p = tau / 0.75;
    ph += (TAU * lerp(760, 320, 1 / (1 + Math.exp(-(p - 0.5) * 12)))) / SR;
    return Math.sin(ph) * Math.pow(Math.sin(Math.PI * p), 2);
  }, { gain: 0.14, pan: (tau) => lerp(-0.8, 0.8, tau / 0.75), send: 0.3 });
  whoosh(10.55, 0.75, 700, 2500, 0.8, -0.8, 0.8, 'bell', 1.2);
}
riser(10.95, T[6], 0.8);

// 07 · principles
crash(T[6], 0.7);
whoosh(T[6], 0.3, 300, 4000, 1, -0.9, 0, 'rise');
thwack(T[6] + 0.3, 1);
kick(T[6] + 0.3, 0.6);
for (let k = 24; k <= 27; k++) glitch(b(k), 0.07, 1);
sproing(b(25), 1);
whoosh(b(26), 0.13, 1200, 300, 0.7, 0.3, -0.5, 'rise');
whoosh(b(26) + 0.13, 0.22, 800, 6000, 0.9, -0.5, 0.6, 'bell');
whoosh(b(27), 0.25, 4000, 800, 0.7, 0.8, -0.8, 'fall');
for (let j = 0; j < 13; j++) tick(b(27) + 0.2 + j * 0.016, 2600 + (j % 4) * 300, 0.6, lerp(-0.7, 0.7, j / 12));
whoosh(12.85, 0.275, 300, 9000, 1, 0, 0, 'rise');

// 08 · resolve
impact(T[7], 1.15);
whoosh(13.2, 0.22, 2000, 700, 0.35, 0, -0.5);
whoosh(13.43, 0.42, 600, 4000, 0.7, -0.7, 0.7);
blip(13.83, 1200, 900, 0.06, 0.8);
kick(13.83, 0.3, 0.8);
for (let j = 0; j < 26; j += 2) tick(13.72 + j * 0.014, 2500 + rand() * 2000, 0.35, noise() * 0.3);
for (const tb of [b(30), b(31)]) {
  kick(tb, 0.45, 0.5);
  blip(tb, 880, 880, 0.35, 0.45);
}
blip(14.84, 880, 220, 0.14, 0.6);

/* ─────────── reverb + master ─────────── */

function reverb(input, spread) {
  const out = new Float32Array(N);
  for (const d0 of [1557, 1617, 1491, 1422, 1277, 1356]) {
    const d = Math.round(((d0 + spread) * SR) / 44100), buf = new Float32Array(d);
    let idx = 0, filt = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      filt = y * 0.7 + filt * 0.3;
      buf[idx] = input[i] + filt * 0.84;
      idx = (idx + 1) % d;
      out[i] += y * 0.2;
    }
  }
  let x = out;
  for (const d0 of [556, 441, 341]) {
    const d = Math.round(((d0 + spread) * SR) / 44100), buf = new Float32Array(d), y = new Float32Array(N);
    let idx = 0;
    for (let i = 0; i < N; i++) {
      const bo = buf[idx];
      y[i] = -x[i] + bo;
      buf[idx] = x[i] + bo * 0.5;
      idx = (idx + 1) % d;
    }
    x = y;
  }
  return x;
}
const WL = reverb(VL, 0), WR = reverb(VR, 23);
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] += WL[i] * 0.4;
  R[i] += WR[i] * 0.4;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const drive = 1.5, norm = Math.tanh(drive);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, i / (SR * 0.005), (N - i) / (SR * 0.08));
  for (const [ch, s] of [[0, L[i]], [1, R[i]]]) {
    const v = (Math.tanh((s / peak) * drive) / norm) * 0.93 * fade;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 4 + ch * 2);
  }
}
const out = path.join(__dirname, 'out', 'reel.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`wrote ${out}  (peak before limiting ${peak.toFixed(2)})`);
