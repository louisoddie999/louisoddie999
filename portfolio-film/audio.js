#!/usr/bin/env node
/* Cinematic score for "Prompt → Product" — synthesised from the same clock as the picture.
   No samples: sub pulses, soft kicks, pads, plucks, bells, risers, impacts and UI sounds are all
   oscillators, noise and filters, each placed on the beat of the visual event it belongs to. */
const fs = require('fs');
const path = require('path');
const TL = require('./timeline.js');

const SR = 48000;
const N = Math.round(TL.DURATION * SR);
const { BEAT, BAR } = TL;
const b = TL.b;
const BR = TL.bar;
const S16 = BEAT / 4;
const TAU = Math.PI * 2;

const L = new Float32Array(N), R = new Float32Array(N);
const VL = new Float32Array(N), VR = new Float32Array(N);

let seed = 20260928;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rand() * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const lerp = (a, c, t) => a + (c - a) * t;

function add(t0, dur, fn, { gain = 1, pan = 0, send = 0.15 } = {}) {
  const s0 = Math.max(0, Math.round(t0 * SR)), s1 = Math.min(N, Math.round((t0 + dur) * SR));
  for (let i = s0; i < s1; i++) {
    const tau = Math.max(0, i / SR - t0);
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
function sawOsc(freq) {
  let p = rand();
  const dt = freq / SR;
  const blep = (q) => (q < dt ? ((q /= dt), q + q - q * q - 1) : q > 1 - dt ? ((q = (q - 1) / dt), q * q + q + q + 1) : 0);
  return () => {
    p += dt;
    if (p >= 1) p -= 1;
    return 2 * p - 1 - blep(p);
  };
}

/* ─────────── sidechain from the kick ─────────── */

const KICKS = [];
for (let k = 8; k < 52; k++) if (k < 22 || k > 24) KICKS.push([b(k), k < 16 ? 0.6 : 1]);
const SC = new Float32Array(N).fill(1);
for (const [tk, a] of KICKS) {
  const s0 = Math.round(tk * SR);
  for (let i = s0; i < Math.min(N, s0 + SR * 0.4); i++) SC[i] = Math.min(SC[i], 1 - 0.55 * a * Math.exp(-((i - s0) / SR) * 8));
}

/* ─────────── instruments ─────────── */

function kick(t, amp = 1, tone = 1) {
  let ph = 0;
  add(t, 0.5, (tau) => {
    ph += (TAU * (40 + 110 * tone * Math.exp(-tau * 28))) / SR;
    return Math.tanh((Math.sin(ph) * Math.exp(-tau * 7) + Math.exp(-tau * 900) * noise() * 0.4) * 1.5) * amp;
  }, { gain: 0.8, send: 0 });
}
function clap(t, amp = 1) {
  const f = new SVF(1500, 1.1);
  add(t, 0.4, (tau) => {
    let e = 0;
    for (const o of [0, 0.011, 0.022]) if (tau >= o) e += Math.exp(-(tau - o) * (o === 0.022 ? 15 : 110));
    return f.run(noise()).bp * e * amp;
  }, { gain: 0.6, send: 0.35 });
}
function shaker(t, amp = 1, pan = -0.25) {
  const f = new SVF(6500, 1.2);
  add(t, 0.09, (tau) => f.run(noise()).bp * Math.min(1, tau / 0.008) * Math.exp(-tau * 45) * amp, { gain: 0.32, pan, send: 0.05 });
}
function openHat(t, amp = 1) {
  const f = new SVF(7400, 0.8);
  add(t, 0.3, (tau) => f.run(noise()).hi * Math.exp(-tau * 14) * amp, { gain: 0.1, pan: 0.3, send: 0.05 });
}
function bell(t, hi, amp = 1) {
  const f = hi ? 1480 : 1108;
  let p1 = 0, p2 = 0;
  add(t, 0.25, (tau) => {
    p1 += (TAU * f) / SR;
    p2 += (TAU * f * 2.76) / SR;
    return (Math.sin(p1) + 0.4 * Math.sin(p2) * Math.exp(-tau * 30)) * Math.exp(-tau * 14) * amp;
  }, { gain: 0.06, pan: 0.4, send: 0.15 });
}
// Amapiano log drum: a punchy pitched bass with a fast pitch fall and warm saturation.
function logDrum(t, m, amp = 1, slide = 0) {
  const f0 = mtof(m), lp = onePole(1500);
  let ph = 0;
  add(t, 0.55, (tau, i) => {
    const bend = Math.pow(2, (7 * Math.exp(-tau * 40) + slide * Math.min(1, tau / 0.25)) / 12);
    ph += (TAU * f0 * bend) / SR;
    const x = Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph);
    return lp(Math.tanh(x * 2.2)) * Math.min(1, tau / 0.002) * Math.exp(-tau * 5.5) * SC[i] * amp;
  }, { gain: 0.4, send: 0.06 });
}
// FM electric piano
function rhodes(t, m, dur, amp = 1, pan = 0) {
  const f = mtof(m);
  let pc = 0, pm = 0;
  add(t, dur + 0.4, (tau, i) => {
    pc += (TAU * f) / SR;
    pm += (TAU * f) / SR;
    const idx = 1.8 * Math.exp(-tau * 4) + 0.2;
    const env = Math.min(1, tau / 0.004) * Math.exp(-tau * 1.4) * (tau < dur ? 1 : Math.exp(-(tau - dur) * 12));
    return Math.sin(pc + idx * Math.sin(pm)) * env * (1 + 0.15 * Math.sin(TAU * 5 * tau)) * (0.6 + 0.4 * SC[i]) * amp;
  }, { gain: 0.09, pan, send: 0.35 });
}
const chord = (t, notes, dur, amp = 1, spread = 0.01) => notes.forEach((m, i) => rhodes(t + i * spread, m, dur, amp, (i / (notes.length - 1) - 0.5) * 0.6));
// Karplus–Strong plucked string: the highlife guitar
function guitar(t, m, amp = 1, pan = 0.3, dec = 0.994) {
  const n = Math.max(2, Math.round(SR / mtof(m))), buf = new Float32Array(n), lp = onePole(3500);
  for (let i = 0; i < n; i++) buf[i] = lp(noise());
  let idx = 0;
  add(t, 1.1, () => {
    const v = buf[idx];
    buf[idx] = dec * 0.5 * (v + buf[(idx + 1) % n]);
    idx = (idx + 1) % n;
    return v * amp;
  }, { gain: 0.55, pan, send: 0.25 });
}
function pad(t, dur, notes, amp = 1, { attack = 0.08, release = 0.4, cutoff = 1300, duck = true } = {}) {
  for (const m of notes)
    for (const d of [-1, 0, 1]) {
      const osc = sawOsc(mtof(m) * Math.pow(2, (d * 0.08) / 12)), lp1 = onePole(cutoff), lp2 = onePole(cutoff);
      add(t, dur + release, (tau, i) => {
        const env = Math.min(1, tau / attack) * (tau < dur ? 1 : Math.exp(-(tau - dur) * (3 / release)));
        return lp2(lp1(osc())) * env * (duck ? SC[i] : 1) * amp;
      }, { gain: 0.045, pan: d * 0.6, send: 0.5 });
    }
}
// The talking drum: a pitched membrane whose tension (pitch) bends like speech.
function talkingDrum(h, amp = 1) {
  const base = 174.6;
  let ph = 0;
  const slap = new SVF(1600, 1.5);
  add(h.t, 0.6, (tau) => {
    const p = lerp(h.p0, h.p1, Math.min(1, tau / 0.12));
    ph += (TAU * base * Math.pow(2, p / 12)) / SR;
    const body = (Math.sin(ph) + 0.3 * Math.sin(2.3 * ph) * Math.exp(-tau * 10)) * Math.exp(-tau * 6) * Math.min(1, tau / 0.003);
    return (body + slap.run(noise()).bp * Math.exp(-tau * 60) * 0.8) * amp;
  }, { gain: 0.5, pan: -0.1, send: 0.3 });
}
function blip(t, f0, f1, dur, amp = 1, pan = 0, send = 0.3) {
  let ph = 0;
  add(t, dur, (tau) => {
    const p = tau / dur;
    ph += (TAU * f0 * Math.pow(f1 / f0, p)) / SR;
    return Math.sin(ph) * Math.min(1, tau / 0.003) * (1 - p) * (1 - p) * amp;
  }, { gain: 0.26, pan, send });
}
function chime(t, m, amp = 1, pan = 0) {
  const f = mtof(m);
  let pc = 0, pm = 0;
  add(t, 1, (tau) => {
    pc += (TAU * f) / SR;
    pm += (TAU * f * 3.5) / SR;
    return Math.sin(pc + 1.2 * Math.exp(-tau * 6) * Math.sin(pm)) * Math.exp(-tau * 5) * Math.min(1, tau / 0.002) * amp;
  }, { gain: 0.12, pan, send: 0.45 });
}
function tick(t, freq = 3000, amp = 1, pan = 0) {
  let ph = 0;
  add(t, 0.03, (tau) => {
    ph += (TAU * freq) / SR;
    return Math.sin(ph) * Math.exp(-tau * 180) * amp;
  }, { gain: 0.14, pan, send: 0.2 });
}
function thud(t, amp = 1) {
  const lp = onePole(900);
  add(t, 0.2, (tau) => lp(noise()) * Math.exp(-tau * 30) * amp, { gain: 0.9, send: 0.2 });
  kick(t, amp * 0.5, 0.5);
}
function whoosh(t, dur, f0, f1, amp = 1, pan0 = 0, pan1 = 0, shape = 'bell', q = 1.5) {
  const f = new SVF(f0, q);
  add(t, dur, (tau) => {
    const p = tau / dur;
    f.set(f0 * Math.pow(f1 / f0, p), q);
    const env = shape === 'rise' ? Math.pow(p, 2.2) : shape === 'fall' ? Math.pow(1 - p, 2) : Math.pow(Math.sin(Math.PI * p), 1.6);
    return f.run(noise()).bp * env * amp;
  }, { gain: 0.45, pan: (tau) => lerp(pan0, pan1, tau / dur), send: 0.3 });
}
function crash(t, amp = 1, dec = 2.4) {
  for (const p of [-0.6, 0.6]) {
    const hp = new SVF(4200, 0.7);
    add(t, 2, (tau) => hp.run(noise()).hi * Math.exp(-tau * dec) * amp, { gain: 0.13, pan: p, send: 0.5 });
  }
}
function impact(t, amp = 1) {
  kick(t, amp, 1.2);
  let ph = 0;
  add(t, 1.6, (tau) => {
    ph += (TAU * (36 + 34 * Math.exp(-tau * 4))) / SR;
    return Math.sin(ph) * Math.exp(-tau * 2.2) * amp;
  }, { gain: 0.45, send: 0 });
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
  }, { gain: 0.08, send: 0.4 });
}
function printer(t, dur = 0.11, amp = 1) {
  let ph = 0;
  add(t, dur, (tau) => {
    ph += 900 / SR;
    const am = Math.sin(TAU * 120 * tau) > 0 ? 1 : 0.3;
    return ((ph % 1 < 0.5 ? 0.5 : -0.5) + noise() * 0.5) * am * Math.min(1, tau / 0.005) * (1 - tau / dur) * amp;
  }, { gain: 0.07, send: 0.05 });
}

/* ─────────── score (D minor: Dm – B♭ – F – C) ─────────── */

const Dm = [50, 53, 57, 62], Bb = [46, 50, 53, 58], F = [53, 57, 60, 65], Cm = [48, 52, 55, 60], Dsus = [50, 55, 57, 62];
const PROG = [Dm, Bb, F, Cm];
const ROOTS = [26, 34, 29, 36];
// bars 0–1: a single held tone and the typing — tension
pad(0.2, BR(2) - 0.2, [50, 57], 0.8, { attack: 1.2, cutoff: 700, duck: false });
for (let j = 0; j < 30; j++) tick(TL.typeStart + j * TL.typePer, 1800 + (j % 3) * 300, 0.55, -0.1 + (j % 5) * 0.05);
chime(TL.enter, 86, 1);
thud(TL.enter, 0.4);
// shatter → the build begins
riser(TL.enter, TL.shatter, 0.7);
impact(TL.shatter, 0.8);
whoosh(TL.shatter, 1.6, 4000, 300, 0.7, -0.6, 0.6, 'fall');
// bars 2–14: the pulse
for (let bar = 2; bar < 15; bar++) {
  const ch = PROG[bar % 4], root = ROOTS[bar % 4], t0 = BR(bar);
  const quiet = bar === 6; // the review gate holds its breath
  pad(t0, BAR, bar >= 13 ? Dsus : ch, bar >= 11 ? 1.2 : 0.9, { cutoff: 900 + bar * 90, duck: bar >= 3 });
  if (bar >= 3 && !quiet) for (let q = 0; q < 8; q++) logDrum(t0 + q * (BEAT / 2), root + 12, q % 2 ? 0.35 : 0.6);
  if (bar >= 4 && !quiet) for (let s = 0; s < 16; s++) shaker(t0 + s * S16, s % 2 ? 0.55 : 0.25, 0.3);
  if (bar >= 7 && bar !== 12) for (const s of [0, 3, 6, 8, 11, 14]) guitar(t0 + s * S16, ch[s % ch.length] + 24, 0.45, (s % 2 ? 0.4 : -0.4), 0.992);
}
for (const [tk, a] of KICKS) kick(tk, a * 0.9);
for (let k = 9; k < 52; k += 2) if (k < 21 || k > 25) clap(b(k), 0.55);
// act 2 · each node pops with a pitched bell, pipes whoosh between them
TL.nodes.forEach((tn, i) => {
  chime(tn, [74, 77, 81, 84, 79, 86][i], 1, (i % 2 ? 0.4 : -0.4));
  if (i < 5) whoosh(tn + 0.3, 1.2, 600, 3200, 0.4, i % 2 ? -0.5 : 0.5, i % 2 ? 0.5 : -0.5);
});
// the gate: a low held tension note, then approval
{
  let ph = 0;
  add(TL.nodes[4], TL.approve - TL.nodes[4], (tau) => {
    ph += (TAU * 73.4 * (1 + 0.003 * Math.sin(tau * 30))) / SR;
    return Math.sin(ph) * Math.min(1, tau / 0.3) * 0.8;
  }, { gain: 0.25, send: 0.2 });
  for (let k = 0; k < 3; k++) tick(TL.nodes[4] + 0.3 + k * BEAT, 900, 0.8);
}
riser(TL.approve - 0.6, TL.approve, 0.6);
impact(TL.approve, 0.7);
[86, 90, 93].forEach((m, i) => chime(TL.approve + i * 0.07, m, 0.9, (i - 1) * 0.4));
// act 3 · panels snap into a product
impact(TL.product, 0.6);
for (let i = 0; i < 8; i++) tick(TL.product + 0.05 + i * 0.07, 2600 + i * 150, 0.6, (i % 2 ? 0.5 : -0.5));
for (let i = 0; i < 5; i++) tick(TL.product + 0.8 + i * (BEAT / 2), 3200, 0.4, 0.2);
// act 4 · orbit: an airy swell
whoosh(TL.orbit, 1.4, 300, 2200, 0.7, -0.7, 0.7);
pad(TL.orbit, TL.globe - TL.orbit, [62, 65, 69, 74], 0.7, { attack: 0.8, cutoff: 2400, duck: false });
// act 5 · the globe: impact, then a shimmer on each arc landing
riser(TL.globe - 1.2, TL.globe, 0.9);
impact(TL.globe, 1);
for (let i = 0; i < 9; i++) chime(TL.globe + 1.9 + i * 0.26 + 0.9, [81, 84, 86, 89, 93, 91, 88, 86, 84][i], 0.45, -0.8 + i * 0.2);
// end card: the final hit and resolve
riser(TL.end - 1.2, TL.end, 1);
impact(TL.end, 1.15);
chord(TL.end, [62, 65, 69, 74, 77], 2.4, 1.1, 0.02);
pad(TL.end, 36 - TL.end - 0.3, [50, 57, 62, 65, 69], 1.1, { attack: 0.02, release: 0.25, cutoff: 2600, duck: false });
for (let i = 0; i < 12; i++) tick(TL.end + 0.05 + i * 0.035, 2400 + i * 120, 0.35, (i % 2 ? 0.3 : -0.3));
chime(TL.end + 1.2, 86, 0.8);
[74, 77, 81, 86].forEach((m, i) => chime(b(56) + i * 0.08, m, 0.6, (i - 1.5) * 0.3));

/* ─────────── reverb + master ─────────── */

function reverb(input, spread) {
  const out = new Float32Array(N);
  for (const d0 of [1557, 1617, 1491, 1422, 1277, 1356]) {
    const d = Math.round(((d0 + spread) * SR) / 44100), buf = new Float32Array(d);
    let idx = 0, filt = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      filt = y * 0.7 + filt * 0.3;
      buf[idx] = input[i] + filt * 0.83;
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
  L[i] += WL[i] * 0.38;
  R[i] += WR[i] * 0.38;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const drive = 1.6, norm = Math.tanh(drive);
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
  const fade = Math.min(1, i / (SR * 0.005), (N - i) / (SR * 0.12));
  for (const [ch, s] of [[0, L[i]], [1, R[i]]]) {
    const v = (Math.tanh((s / peak) * drive) / norm) * 0.93 * fade;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 4 + ch * 2);
  }
}
const out = path.join(__dirname, 'out', 'reel.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`wrote ${out}  (peak before limiting ${peak.toFixed(2)})`);
