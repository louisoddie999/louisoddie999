#!/usr/bin/env node
/* Original score for "First is a habit." — synthesised from the same clock as the picture.
   No samples. Highlife guitar (Karplus–Strong), talking drum, Rhodes (FM), agogô bell, shaker,
   amapiano log drum, pads and every sound effect are built from oscillators, noise and filters,
   and each effect sits on the exact beat of the visual event it belongs to. */
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
for (let k = 4; k <= 7; k += 2) KICKS.push([b(k), 0.55]); // bar 1: soft kicks on 1 & 3
for (let k = 12; k <= 51; k++) KICKS.push([b(k), 1]);
const SC = new Float32Array(N).fill(1);
for (const [tk, a] of KICKS) {
  const s0 = Math.round(tk * SR);
  for (let i = s0; i < Math.min(N, s0 + SR * 0.4); i++) SC[i] = Math.min(SC[i], 1 - 0.6 * a * Math.exp(-((i - s0) / SR) * 9));
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

/* ─────────── harmony ─────────── */

const Ab = [56, 60, 63, 67], Db = [49, 53, 56, 60, 63], Eb = [51, 55, 58, 60], Fm9 = [53, 56, 60, 63, 67], Cm7 = [48, 51, 55, 58], AbM9 = [56, 60, 63, 67, 70];
const CYCLE = [[Fm9, 29], [Db, 37], [Eb, 39], [Cm7, 36]];

// act 1 · highlife intro: talking drum, guitar, Rhodes, vinyl
for (const h of TL.talk) talkingDrum(h, h.t > BR(12) ? 1.1 : 1);
{
  const hiss = onePole(5000);
  add(0, BR(3), (tau) => (hiss(noise()) * 0.03 + (rand() < 0.0004 ? noise() * 0.6 : 0)) * (1 - Math.max(0, tau - BR(2)) / BAR), { gain: 0.5, send: 0 });
}
[[0, Ab], [2, Db], [4, Eb], [6, Ab]].forEach(([beat, ch]) => chord(b(beat), ch, BEAT * 2 - 0.05, 0.8, 0.02));
{
  // highlife guitar: bright arpeggios, one note per sixteenth
  const figs = [[68, 72, 75, 72], [68, 73, 77, 73], [70, 74, 75, 79], [68, 72, 75, 80]];
  for (let s = 0; s < 32; s++) {
    const f = figs[Math.floor(s / 8)];
    guitar(b(s / 4), f[s % 4], s % 4 === 0 ? 1 : 0.7, 0.35);
  }
}
for (let s = 8; s < 48; s++) shaker(b(s / 4) + (s % 2 ? 0.018 : 0), s % 2 ? 0.8 : 0.45);
for (const [tk, a] of KICKS.filter(([tk]) => tk < BR(3))) kick(tk, a);
// act 1 · events
for (let j = 0; j < 4; j++) {
  tick(b(1) + j * 0.134, 900, 0.8);
  thud(b(1) + j * 0.134, 0.25);
}
thud(b(2), 1);
crash(b(2), 0.15, 5);
whoosh(b(6), 0.3, 2500, 4000, 0.35, -0.3, 0.3);
// bar 2 · build: odometer clatter, filter sweep, snare roll, riser
for (const t0 of [b(8), b(9.5)]) for (let k = 0; k < 18; k++) tick(t0 + k * 0.022, 2200 + (k % 3) * 400, 0.5, (k % 2 ? 0.3 : -0.3));
pad(BR(2), BAR, Fm9, 0.9, { attack: 0.6, cutoff: 900, duck: false });
for (let s = 0; s < 20; s++) clap(BR(2) + (s < 12 ? s * S16 : 12 * S16 + (s - 12) * S16 * 0.5), 0.2 + s * 0.035);
riser(BR(2) + BEAT, BR(3), 1);
whoosh(5.9, BR(3) - 5.9, 200, 9000, 1, 0, 0, 'rise', 1.2);

// acts 2–4 · the amapiano groove (bars 3–10), breakdown in bar 11
for (let bar = 3; bar <= 10; bar++) {
  const [ch, root] = CYCLE[(bar - 3) % 4];
  const t0 = BR(bar);
  pad(t0, BAR, ch, 1, { cutoff: 1500 });
  // log drum: syncopated, with an octave slide at the end of every other bar
  [[0, 0], [3, 0], [6, 7], [8, 0], [10, 12], [13, 7]].forEach(([s, iv], k) => logDrum(t0 + s * S16, root + 12 + iv, k === 0 ? 1 : 0.85, bar % 2 && k === 5 ? -12 : 0));
  // Rhodes stabs on the off-beats
  for (const s of [2, 7, 10, 14]) chord(t0 + s * S16, ch.map((m) => m + 12), S16 * 1.5, 0.7, 0.004);
  for (let beat = 0; beat < 4; beat++) {
    if (beat % 2) clap(t0 + beat * BEAT, 0.9);
    openHat(t0 + beat * BEAT + BEAT / 2, 0.8);
  }
  for (let s = 0; s < 16; s++) shaker(t0 + s * S16 + (s % 2 ? 0.018 : 0), s % 2 ? 1 : 0.55);
  for (const s of [0, 2, 4, 5, 7, 9, 11, 12, 14]) bell(t0 + s * S16, s % 4 === 0, s % 4 === 0 ? 1 : 0.7);
}
for (const [tk, a] of KICKS.filter(([tk]) => tk >= BR(3) && tk < BR(12))) kick(tk, a * 0.85);
{
  // bar 11 · breakdown under the receipt printer
  pad(BR(11), BAR, Db, 1, { cutoff: 700 });
  for (let s = 0; s < 16; s++) shaker(BR(11) + s * S16 + (s % 2 ? 0.018 : 0), s % 2 ? 0.6 : 0.3);
  for (let k = 0; k < 12; k++) printer(b(44) + k * 0.134);
  thud(b(47), 1);
  riser(b(46), BR(12), 0.9);
}

// act 2 · drop + onboarding
impact(BR(3), 1.1);
for (const beat of [13, 14, 14.5, 15]) whoosh(b(beat) - 0.05, 0.2, 800, 3000, 0.4, 0.2, 0.6);
whoosh(b(15.5), 0.2, 2000, 6000, 0.4, -0.3, 0.5);
for (let k = 0; k < 11; k++) tick(b(16) + 0.05 + k * 0.03, 2000, 0.45, -0.3);
for (let k = 0; k < 11; k++) tick(b(17) + 0.05 + k * 0.03, 2200, 0.45, -0.3);
for (const beat of [16.5, 17.5, 18.5]) whoosh(b(beat), 0.17, 1500, 5000, 0.5, -0.2, 0.4, 'bell', 2);
{
  let ph = 0;
  add(b(18), 0.35, (tau) => {
    ph += (TAU * 220 * (1 + 0.08 * Math.sin(tau * TAU * 14))) / SR;
    return Math.sin(ph) * Math.exp(-tau * 5);
  }, { gain: 0.09, send: 0.2 });
}
chime(b(19), 84, 1, -0.2);
chime(b(19) + 0.09, 91, 1, 0.2);
whoosh(10.4, 0.32, 3000, 400, 0.6, 0, -0.5, 'fall');

// act 3 · SEND: every arc launches with a swish and lands with a pitched ping
const PENTA = [77, 80, 82, 84, 87, 89, 92, 94, 96];
for (let i = 0; i < 9; i++) {
  const t0 = b(20.5) + i * b(0.5);
  whoosh(t0, 0.42, 900, 3500, 0.35, -0.6, 0.6);
  chime(t0 + 0.42, PENTA[i], 0.7, lerp(-0.5, 0.5, i / 8));
}
whoosh(12.5, 0.36, 400, 2400, 0.6, 0, 0, 'rise');
// SAVE: coins clink in, each ring completes with a chime
for (let i = 0; i < 3; i++) {
  const t0 = b(24.5) + i * b(0.5);
  for (let j = 0; j < 4; j++) chime(t0 + j * 0.2, 96 + ((i + j) % 3) * 2, 0.35, [-0.5, 0, 0.5][i]);
  chime(t0 + 0.9, [84, 87, 91][i], 0.9, [-0.5, 0, 0.5][i]);
}
whoosh(14.72, 0.28, 600, 4000, 0.6, -0.8, 0.8);
// PAY: card spin flutter, contactless beep, bars rise
{
  const f = new SVF(1200, 2);
  add(BR(7), 0.95, (tau) => {
    const p = tau / 0.95;
    f.set(lerp(3000, 600, p), 2);
    return f.run(noise()).bp * (0.5 + 0.5 * Math.sin(TAU * lerp(28, 4, p) * tau)) * (1 - p);
  }, { gain: 0.5, pan: (tau) => lerp(0.8, 0.2, tau / 0.95), send: 0.2 });
}
blip(b(30), 1800, 1800, 0.12, 1);
blip(b(30) + 0.13, 2400, 2400, 0.14, 1);
chime(b(30) + 0.1, 88, 0.8);
whoosh(16.86, BR(8) - 16.86, 300, 3000, 0.8, 0, 0, 'rise');
// GROW: the growth line climbs as a rising arpeggio
{
  const notes = [65, 68, 72, 75, 77, 80, 84, 87];
  notes.forEach((m, i) => guitar(BR(8) + 0.35 + i * 0.15, m, 0.8, lerp(-0.6, 0.6, i / 7), 0.996));
  for (let k = 0; k < 16; k++) tick(BR(8) + 0.5 + k * 0.094, 3500 + (k % 4) * 300, 0.25, noise() * 0.8);
}
// FOR THE …: a stab under every word
for (let i = 0; i < 4; i++) chord(b(36 + i), [65, 68, 72, 75].map((m) => m + (i === 3 ? 3 : 0)), 0.3, 1.1, 0.003);
// greetings: a slash before every card (the talking drum answers each one)
for (let i = 0; i < 4; i++) whoosh(b(40 + i) - 0.12, 0.2, 800, 5000, 0.6, i % 2 ? 0.7 : -0.7, i % 2 ? -0.7 : 0.7, 'rise');

// act 5 · resolve on A♭ major
impact(BR(12), 1.15);
pad(BR(12), 30 - BR(12) - 0.25, AbM9, 1.1, { attack: 0.02, release: 0.2, cutoff: 2200, duck: false });
chord(BR(12), AbM9, 1.5, 1.2, 0.02);
for (const [tk, a] of KICKS.filter(([tk]) => tk >= BR(12))) kick(tk, a * 0.8);
[[0, 0], [3, 0], [6, 7], [8, 0], [10, 12], [13, 7]].forEach(([s, iv]) => logDrum(BR(12) + s * S16, 32 + 12 + iv, 0.9));
for (let s = 0; s < 32; s++) shaker(BR(12) + s * S16 + (s % 2 ? 0.018 : 0), (s % 2 ? 0.8 : 0.4) * (s < 16 ? 1 : 0.6));
whoosh(BR(12) + 0.3, 0.55, 500, 3000, 0.7, -0.4, 0.4);
whoosh(b(49) + 0.1, 0.5, 1000, 5000, 0.5, -0.7, 0.7);
[84, 87, 91, 94, 96].forEach((m, i) => chime(b(51) + i * 0.07, m, 0.5, lerp(-0.6, 0.6, i / 4)));
tick(b(53), 1500, 1);
chord(b(55), AbM9.map((m) => m + 12), 0.4, 1, 0.015);
kick(b(55), 0.8, 0.8);
crash(b(55), 0.25, 3);

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
