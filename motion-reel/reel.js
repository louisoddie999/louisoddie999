/* MOTION REEL
   A 15-second motion study in which every pixel is a pure function of time.
   Because render(t) has no hidden state, frames can be rendered in any order,
   in parallel, and sampled several times per frame for true temporal motion blur. */
(function (root) {
  'use strict';

  const TL = root.TL;
  const { W, H, FPS, DURATION, BEAT, BAR } = TL;
  const b = TL.b;
  const T = TL.scenes.map((s) => s.start);
  const TAU = Math.PI * 2;
  const CX = W / 2;
  const CY = H / 2;
  const DIAG = Math.hypot(CX, CY) + 60;

  const C = { ink: '#0c0c0f', paper: '#f2ede4', red: '#ff4d2e', blue: '#2d4bff', lime: '#d7ff3d' };
  const FONT = 'Archivo';
  const MONO = '"JetBrains Mono"';

  /* ─────────────────────────── math ─────────────────────────── */

  const clamp = (x, a = 0, c = 1) => (x < a ? a : x > c ? c : x);
  const lerp = (a, c, t) => a + (c - a) * t;
  const prog = (t, t0, d) => clamp((t - t0) / d);
  const frac = (x) => x - Math.floor(x);

  const E = {
    inQuad: (x) => x * x,
    outQuad: (x) => 1 - (1 - x) * (1 - x),
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    inQuart: (x) => x * x * x * x,
    outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
    inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  };

  // CSS-style cubic-bezier timing function (Newton–Raphson with bisection fallback).
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u) => ((ax * u + bx) * u + cx) * u;
    const sy = (u) => ((ay * u + by) * u + cy) * u;
    const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(u) - x;
        if (Math.abs(e) < 1e-6) return sy(u);
        const d = dx(u);
        if (Math.abs(d) < 1e-6) break;
        u -= e / d;
      }
      let lo = 0, hi = 1;
      u = x;
      for (let i = 0; i < 40; i++) {
        const v = sx(u);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = u;
        else hi = u;
        u = (lo + hi) / 2;
      }
      return sy(u);
    };
  }

  // Step response of a damped harmonic oscillator: a physically-based spring.
  function spring(tau, freq, zeta) {
    if (tau <= 0) return 0;
    const w = TAU * freq;
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * tau) * (Math.cos(wd * tau) + ((zeta * w) / wd) * Math.sin(wd * tau));
  }

  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };
  const noise = (x) => {
    const i = Math.floor(x), f = x - i;
    return lerp(hash(i), hash(i + 1), f * f * (3 - 2 * f)) * 2 - 1;
  };
  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ─────────────────────────── colour ─────────────────────────── */

  const hexCache = new Map();
  const hex = (h) => {
    let v = hexCache.get(h);
    if (!v) {
      v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      hexCache.set(h, v);
    }
    return v;
  };
  const mix = (a, c, t) => {
    const A = hex(a), B = hex(c);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  };
  const rgba = (h, a) => {
    const A = hex(h);
    return `rgba(${A[0]},${A[1]},${A[2]},${a})`;
  };

  /* ─────────────────────────── canvas helpers ─────────────────────────── */

  function makeCanvas(w = W, h = H) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function bg(ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(-300, -300, W + 600, H + 600);
  }
  function disc(ctx, x, y, r) {
    if (r <= 0) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  function font(ctx, weight, size, stretch = 'normal', family = FONT) {
    ctx.font = `${Math.round(clamp(weight, 100, 900))} ${size}px ${family}`;
    ctx.fontStretch = stretch;
  }
  function dotGrid(ctx, alpha, ox = 0, oy = 0) {
    if (alpha <= 0.002) return;
    ctx.fillStyle = rgba(C.paper, alpha);
    const s = 48;
    const x0 = (((ox % s) + s) % s) - s + 24;
    const y0 = (((oy % s) + s) % s) - s + 24;
    for (let y = y0; y < H + s; y += s) for (let x = x0; x < W + s; x += s) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  // Plot an easing curve u∈[0,1] → v into a box, drawn up to uNow, with a playhead dot.
  function plot(ctx, fn, x, y, w, h, vmin, vmax, uNow, color, alpha, lw, dotR, steps = 90) {
    const gx = (u) => x + u * w;
    const gy = (v) => y + h - ((v - vmin) / (vmax - vmin)) * h;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const n = Math.max(1, Math.round(steps * uNow));
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * uNow;
      i ? ctx.lineTo(gx(u), gy(fn(u))) : ctx.moveTo(gx(u), gy(fn(u)));
    }
    ctx.stroke();
    if (dotR > 0) {
      ctx.fillStyle = color;
      disc(ctx, gx(uNow), gy(fn(uNow)), dotR);
    }
    return { gx, gy };
  }

  /* ─────────────────────────── camera energy ─────────────────────────── */

  // Hits that kick the camera and split the lens. [time, strength]
  const IMPACTS = [
    [b(2), 0.35], [b(4), 1], [b(5), 0.3], [b(5.5), 0.25], [b(6), 0.4], [b(8), 0.25], [b(9), 0.2], [b(10), 0.2],
    [b(11), 0.2], [T[4], 1], [b(19), 0.55], [T[5], 0.85], [b(22), 0.3], [T[6], 0.9], [11.55, 0.5], [b(25), 0.55],
    [b(26), 0.5], [b(27), 0.55], [T[7], 1],
  ];
  function shake(t) {
    let x = 0, y = 0;
    for (const [ti, s] of IMPACTS) {
      const tau = t - ti;
      if (tau < 0 || tau > 0.5) continue;
      const env = s * Math.exp(-tau * 11);
      x += noise(tau * 38 + ti * 10) * env * 15;
      y += noise(tau * 38 + ti * 10 + 77) * env * 15;
    }
    return { x, y };
  }
  function aberration(t) {
    let a = 0;
    for (const [ti, s] of IMPACTS) {
      const tau = t - ti;
      if (tau >= 0 && tau < 0.3) a += s * Math.exp(-tau * 16);
    }
    return a;
  }

  /* ═════════════════════ 01 · SQUASH & STRETCH ═════════════════════ */

  const S1 = { R: 46, jump: b(1), land: b(2), hop: b(2) + 0.05, land2: b(2.5), boom: 1.6 };
  S1.G = CY + S1.R; // ground: the resting dot sits dead centre

  function s1JumpY(t) {
    if (t > S1.jump && t < S1.land) {
      const u = (t - S1.jump) / (S1.land - S1.jump);
      return -330 * 4 * u * (1 - u);
    }
    if (t > S1.hop && t < S1.land2) {
      const u = (t - S1.hop) / (S1.land2 - S1.hop);
      return -92 * 4 * u * (1 - u);
    }
    return 0;
  }
  // The ground behaves like a membrane: it dents on impact and rings outward.
  function s1Dent(dx, t) {
    let y = 0;
    for (const [tl, amp] of [[S1.land, 1], [S1.land2, 0.45]]) {
      const tau = t - tl;
      if (tau < 0 || tau > 1.4) continue;
      y += amp * 22 * Math.exp(-tau * 9) * Math.cos(tau * 30) * Math.exp(-(dx * dx) / (2 * 120 * 120));
      const ad = Math.abs(dx);
      if (ad < tau * 900) y += amp * 7 * Math.exp(-tau * 4) * Math.sin(ad * 0.045 - tau * 42) * Math.exp(-ad / 600);
    }
    return y;
  }
  function s1Dot(t) {
    const y = s1JumpY(t);
    const vy = (s1JumpY(t + 0.004) - s1JumpY(t - 0.004)) / 0.008;
    let sx = 1, sy = 1;
    const a = t < S1.jump ? E.inOutCubic(prog(t, 0.26, S1.jump - 0.26)) : 0; // anticipation
    sx *= 1 + 0.4 * a;
    sy *= 1 - 0.36 * a;
    if (y < -0.5) {
      const st = 1 + Math.min(0.6, Math.abs(vy) / 3800); // stretch along velocity
      sy *= st;
      sx /= st;
    }
    for (const [tl, amp] of [[S1.land, 0.45], [S1.land2, 0.24]]) {
      const tau = t - tl;
      if (tau >= 0 && tau < 0.7) {
        const q = amp * Math.exp(-tau * 10) * Math.cos(tau * 32);
        sx *= 1 + q;
        sy *= 1 - 0.85 * q;
      }
    }
    const ch = E.inOutCubic(prog(t, S1.land2 + 0.02, S1.boom - S1.land2 - 0.02));
    const pop = E.outBack(prog(t, 0, 0.36), 2.8);
    const s = pop * (1 - 0.42 * ch);
    return { x: CX + noise(t * 70) * ch * 5, y, sx: sx * s, sy: sy * s, ch };
  }

  const s1Boom = bezier(0.5, 0, 0.12, 1);
  function s1(ctx, t) {
    const { R, G } = S1;
    bg(ctx, C.ink);
    dotGrid(ctx, 0.09 * E.outCubic(prog(t, 0.1, 0.9)), 0, -t * 24);
    const d = s1Dot(t);

    // ground line + ruler
    const L = 760 * E.outExpo(prog(t, 0.04, 0.8));
    if (L > 1) {
      ctx.strokeStyle = rgba(C.paper, 0.42);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -L; x <= L; x += 8) {
        const y = G + s1Dent(x, t);
        x === -L ? ctx.moveTo(CX + x, y) : ctx.lineTo(CX + x, y);
      }
      ctx.stroke();
      ctx.fillStyle = rgba(C.paper, 0.28);
      for (let k = -12; k <= 12; k++) {
        const x = k * 60;
        if (Math.abs(x) > L) continue;
        ctx.fillRect(CX + x - 1, G + 12 + s1Dent(x, t), 2, k % 4 === 0 ? 14 : 7);
      }
    }

    // landing shockwaves + dust
    for (const [tl, amp] of [[S1.land, 1], [S1.land2, 0.5]]) {
      const tau = t - tl;
      if (tau < 0 || tau > 0.8) continue;
      const p = prog(tau, 0, 0.7), e = E.outExpo(p);
      ctx.strokeStyle = rgba(C.lime, (1 - p) * 0.9 * amp);
      ctx.lineWidth = 3 * (1 - e) + 0.5;
      const rx = 30 + 340 * e * amp;
      ctx.beginPath();
      ctx.ellipse(CX, G + 2, rx, rx * 0.12, 0, 0, TAU);
      ctx.stroke();
      const r = rng(Math.round(tl * 1000));
      ctx.fillStyle = C.paper;
      for (let i = 0; i < 14 * amp; i++) {
        const side = i % 2 ? 1 : -1, vx = side * (140 + r() * 380), vy = 150 + r() * 330, sz = 2 + r() * 4;
        const x = CX + side * R * 0.8 + vx * tau, y = G - (vy * tau - 0.5 * 1800 * tau * tau);
        if (y > G + 1) continue;
        ctx.globalAlpha = clamp(1 - tau / 0.6);
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;
    }

    // height annotation — the animator's study sheet
    if (d.y < -6 && t < S1.land) {
      const top = G - R * 2 + d.y, al = clamp(-d.y / 60) * 0.7;
      ctx.strokeStyle = rgba(C.paper, al);
      ctx.fillStyle = rgba(C.paper, al);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(CX + 120, G);
      ctx.lineTo(CX + 120, top + R);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(CX - 200, G - 2 * R - 330);
      ctx.lineTo(CX + 200, G - 2 * R - 330);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillRect(CX + 112, top + R - 1, 16, 2);
      font(ctx, 500, 15, 'normal', MONO);
      ctx.fillText(`${Math.round(-d.y)}px`, CX + 136, (G + top + R) / 2 + 5);
      ctx.fillText('APEX · 330px', CX + 212, G - 2 * R - 325);
    }

    // charge: speed lines rush inward, rings contract
    if (t > S1.land2 - 0.05) {
      const r = rng(7);
      ctx.strokeStyle = C.paper;
      ctx.lineCap = 'round';
      for (let i = 0; i < 30; i++) {
        const th = (i / 30) * TAU + r() * 0.15, s0 = S1.land2 - 0.05 + r() * 0.3, lw = 2 + 2 * r();
        const p = prog(t, s0, 0.26);
        if (p <= 0 || p >= 1) continue;
        const head = lerp(1150, R * 1.5, E.inQuad(p)), len = lerp(280, 10, p);
        ctx.globalAlpha = 0.75 * Math.sin(Math.PI * p);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(CX + Math.cos(th) * head, CY + Math.sin(th) * head);
        ctx.lineTo(CX + Math.cos(th) * (head + len), CY + Math.sin(th) * (head + len));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (t < S1.boom + 0.05) {
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const f = frac(t * 3.2 + k / 3);
          ctx.strokeStyle = rgba(C.lime, f * d.ch * 0.8);
          ctx.beginPath();
          ctx.arc(d.x, CY, R * (0.9 + 2.6 * (1 - f)), 0, TAU);
          ctx.stroke();
        }
      }
    }

    // boom: staggered rings, the last one becomes the next scene's background
    for (const [col, t0, du] of [[C.blue, 1.585, 0.21], [C.lime, 1.62, 0.215], [C.red, 1.655, T[1] - 1.655]]) {
      const p = prog(t, t0, du);
      if (p <= 0) continue;
      ctx.fillStyle = col;
      disc(ctx, CX, CY, DIAG * s1Boom(p));
    }

    // the dot
    const sB = t < S1.boom ? 1 : lerp(1, 1.5, E.outCubic(prog(t, S1.boom, 0.06))) * (1 - E.inBack(prog(t, 1.68, 0.17), 2));
    const rx = R * d.sx * sB, ry = R * d.sy * sB;
    if (rx > 0.1 && ry > 0.1) {
      ctx.fillStyle = mix(C.paper, C.lime, d.ch);
      ctx.beginPath();
      ctx.ellipse(d.x, G + s1Dent(0, t) - ry + d.y, rx, ry, 0, 0, TAU);
      ctx.fill();
    }
  }

  /* ═════════════════════ 02 · KINETIC TYPE ═════════════════════ */

  const S2 = {
    lines: [
      { text: 'EVERY', t: b(4) },
      { text: 'FRAME', t: b(5) },
      { text: 'IS A', t: b(5.5) },
      { text: 'DECISION.', t: b(6), accent: true },
    ],
    SIZE: 236,
    LH: 204,
    X0: 176,
  };
  S2.TOP = (H - S2.LH * 4) / 2;
  const s2Enter = bezier(0.16, 1, 0.3, 1);
  const s2Wipe = bezier(0.7, 0, 0.2, 1);

  function s2(ctx, t) {
    const { lines, SIZE, LH, X0, TOP } = S2;
    bg(ctx, C.red);
    ctx.save();
    let punch = 1 + 0.035 * prog(t, T[1], BAR);
    for (const L of lines) {
      const tau = t - L.t;
      if (tau > 0) punch += 0.022 * Math.exp(-tau * 9);
    }
    ctx.translate(CX, CY);
    ctx.scale(punch, punch);
    ctx.translate(-CX, -CY);

    // vertical margin guide grows with each line
    let guide = 0;
    for (const L of lines) guide += E.outExpo(prog(t, L.t, 0.45)) * LH;
    ctx.fillStyle = rgba(C.ink, 0.55);
    ctx.fillRect(X0 - 44, TOP, 2, guide);

    lines.forEach((L, i) => {
      const tau = t - L.t;
      if (tau < 0) return;
      const top = TOP + i * LH, base = top + LH * 0.5 + SIZE * 0.36;
      ctx.fillStyle = rgba(C.ink, 0.22);
      ctx.fillRect(0, base, W * E.outExpo(prog(tau, 0, 0.55)), 1.5);

      // variable-font inflation: each letter swells from 140 → 900 weight as it rises
      const wt = (j) => lerp(140, 900, E.outCubic(prog(tau - j * 0.03, 0, 0.5)));
      const xs = [];
      let x = 0;
      for (let j = 0; j < L.text.length; j++) {
        font(ctx, wt(j), SIZE, 'condensed');
        xs.push(x);
        x += ctx.measureText(L.text[j]).width - 2;
      }
      const width = x;
      const paint = (color) => {
        ctx.fillStyle = color;
        for (let j = 0; j < L.text.length; j++) {
          const q = s2Enter(prog(tau - j * 0.03, 0, 0.46));
          font(ctx, wt(j), SIZE, 'condensed');
          ctx.fillText(L.text[j], X0 + xs[j], base + (1 - q) * LH * 1.15);
        }
      };

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, W, LH);
      ctx.clip();
      if (L.accent) {
        const p = s2Wipe(prog(t, b(7), 0.28));
        const bx0 = X0 - 18, bx1 = lerp(bx0, X0 + width + 22, p);
        paint(C.paper);
        if (p > 0) {
          ctx.fillStyle = C.ink;
          ctx.fillRect(bx0, top + 14, bx1 - bx0, LH - 22);
          ctx.save();
          ctx.beginPath();
          ctx.rect(bx0, top, bx1 - bx0, LH);
          ctx.clip();
          paint(C.lime);
          ctx.restore();
        }
      } else paint(C.ink);
      ctx.restore();

      // annotation
      const al = E.outCubic(prog(tau, 0.12, 0.3));
      if (al > 0) {
        font(ctx, 500, 15, 'normal', MONO);
        ctx.letterSpacing = '1px';
        ctx.textAlign = 'right';
        ctx.fillStyle = rgba(C.ink, 0.85 * al);
        ctx.fillText(`L0${i + 1}  ·  t=${L.t.toFixed(3)}s  ·  wght 140→900`, W - 150 + (1 - al) * 30, top + LH * 0.5 - 30);
        ctx.textAlign = 'left';
        ctx.letterSpacing = '0px';
      }
    });
    ctx.restore();
  }

  let bufS2 = null;
  const sliceEase = bezier(0.7, 0, 0.84, 0);
  function s2Slices(ctx, t) {
    if (!bufS2) bufS2 = makeCanvas();
    const o = bufS2.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    s2(o, t);
    const N = 12, h = H / N;
    for (let k = 0; k < N; k++) {
      const p = sliceEase(prog(t, 3.52 + k * 0.011, 0.26));
      if (p >= 1) continue;
      const dir = k % 2 ? 1 : -1, dx = dir * (W + 60) * p;
      ctx.drawImage(bufS2, 0, k * h, W, h, dx, k * h, W, h);
      if (p > 0) {
        ctx.fillStyle = C.lime;
        ctx.fillRect(dir > 0 ? dx - 8 : dx + W, k * h, 8, h);
      }
    }
  }

  /* ═════════════════════ 03 · MORPH ═════════════════════ */

  const NS = 256;
  const COS = Float32Array.from({ length: NS }, (_, k) => Math.cos((k / NS) * TAU));
  const SIN = Float32Array.from({ length: NS }, (_, k) => Math.sin((k / NS) * TAU));
  // Any polygon → a polar radius table, so every shape can morph into every other.
  function polar(verts) {
    const out = new Float32Array(NS);
    for (let k = 0; k < NS; k++) {
      const dx = COS[k], dy = SIN[k];
      let best = Infinity;
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], c = verts[(i + 1) % verts.length];
        const ex = c[0] - a[0], ey = c[1] - a[1];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const r = (a[0] * ey - a[1] * ex) / den, s = (a[0] * dy - a[1] * dx) / den;
        if (r > 0 && s >= -1e-6 && s <= 1 + 1e-6 && r < best) best = r;
      }
      out[k] = best;
    }
    return out;
  }
  const ngon = (n, r, rot) => Array.from({ length: n }, (_, k) => [Math.cos(rot + (k * TAU) / n) * r, Math.sin(rot + (k * TAU) / n) * r]);
  const SH = {
    circle: new Float32Array(NS).fill(1),
    tri: polar(ngon(3, 1.3, -Math.PI / 2)),
    star: polar(Array.from({ length: 10 }, (_, k) => {
      const r = k % 2 ? 0.56 : 1.28, a = -Math.PI / 2 + (k * TAU) / 10;
      return [Math.cos(a) * r, Math.sin(a) * r];
    })),
    flower: Float32Array.from({ length: NS }, (_, k) => 0.93 + 0.15 * Math.cos((k / NS) * TAU * 8)),
    square: polar(ngon(4, 1.16, Math.PI / 4)),
  };
  const MORPHS = [
    [b(8), SH.tri, C.lime],
    [b(9), SH.star, C.paper],
    [b(10), SH.flower, C.red],
    [b(11), SH.square, C.paper],
  ];
  const S3R = 205;

  // Morphs superpose as independent springs, so a new morph can interrupt an unsettled one without a pop.
  function s3Radii(t, out) {
    out.set(SH.circle);
    let prev = SH.circle;
    for (const [tm, shp] of MORPHS) {
      if (t <= tm) break;
      const e = spring(t - tm, 2.5, 0.36);
      for (let k = 0; k < NS; k++) out[k] += (shp[k] - prev[k]) * e;
      prev = shp;
    }
    return out;
  }
  function s3Rot(t) {
    let r = 0;
    for (const [tm] of MORPHS) r += (Math.PI / 2) * spring(t - tm, 2.0, 0.45);
    return r;
  }
  function s3Color(t) {
    let c = C.paper;
    for (const [tm, , col] of MORPHS) if (t >= tm) c = col;
    return c;
  }
  function shapePath(ctx, radii, R) {
    ctx.beginPath();
    for (let k = 0; k < NS; k++) {
      const r = radii[k] * R;
      k ? ctx.lineTo(COS[k] * r, SIN[k] * r) : ctx.moveTo(COS[k] * r, SIN[k] * r);
    }
    ctx.closePath();
  }

  let ringText = null;
  function buildRingText() {
    const S = 1000, rad = 450;
    ringText = makeCanvas(S, S);
    const g = ringText.getContext('2d');
    font(g, 500, 17, 'normal', MONO);
    g.fillStyle = C.paper;
    g.textAlign = 'center';
    const phrase = 'SHAPE IS JUST TIME, SLOWED DOWN — ';
    const count = phrase.length * Math.round((TAU * rad) / 10.6 / phrase.length);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      g.save();
      g.translate(S / 2 + Math.cos(a) * rad, S / 2 + Math.sin(a) * rad);
      g.rotate(a + Math.PI / 2);
      g.fillText(phrase[i % phrase.length], 0, 0);
      g.restore();
    }
  }

  const rA = new Float32Array(NS), rB = new Float32Array(NS);
  // opts.lock blends toward a clean square with zero net rotation (used by the match-cut into 04).
  function s3Scene(ctx, t, scale, deco, lock = 0) {
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(scale, scale);

    if (deco > 0.01) {
      ctx.globalAlpha = deco;
      ctx.strokeStyle = rgba(C.paper, 0.1);
      ctx.lineWidth = 1.5;
      for (const r of [560, 700, 860]) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();
      }
      // dial: ticks step round on every beat
      const beats = (t - T[2]) / BEAT, n = Math.floor(beats);
      const dial = (n + E.outExpo(clamp((beats - n) / 0.45))) * (TAU / 24);
      ctx.save();
      ctx.rotate(dial);
      ctx.strokeStyle = rgba(C.paper, 0.4);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * TAU, long = i % 8 === 0;
        ctx.moveTo(Math.cos(a) * (long ? 356 : 366), Math.sin(a) * (long ? 356 : 366));
        ctx.lineTo(Math.cos(a) * 380, Math.sin(a) * 380);
      }
      ctx.stroke();
      ctx.restore();
      // orbiting type
      ctx.save();
      ctx.rotate(-t * 0.35);
      ctx.globalAlpha = deco * 0.55;
      ctx.drawImage(ringText, -500, -500);
      ctx.restore();
      ctx.globalAlpha = deco;
      for (const [r, w, s, col, ph] of [[300, 1.9, 10, C.lime, 0], [410, -1.2, 7, C.paper, 2], [520, 0.8, 14, C.red, 4]]) {
        ctx.strokeStyle = rgba(C.paper, 0.14);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();
        const a = ph + t * w;
        ctx.fillStyle = col;
        disc(ctx, Math.cos(a) * r, Math.sin(a) * r, s);
      }
      ctx.globalAlpha = 1;
    }

    const ent = E.outBack(prog(t, 3.48, 0.5), 1.6);
    const lockRadii = (radii) => {
      if (lock > 0) for (let k = 0; k < NS; k++) radii[k] = lerp(radii[k], SH.square[k], lock);
      return radii;
    };
    const rotAt = (tt) => lerp(s3Rot(tt), TAU, lock);

    // echo trails — time-offset copies of the same function
    ctx.lineWidth = 2.5;
    for (let k = 6; k >= 1; k--) {
      const te = t - k * 0.032;
      const radii = lockRadii(s3Radii(te, rB));
      ctx.save();
      ctx.rotate(rotAt(te));
      ctx.strokeStyle = rgba(C.paper, 0.5 * (1 - k / 7) * Math.max(deco, 0.2));
      shapePath(ctx, radii, S3R * E.outBack(prog(te, 3.48, 0.5), 1.6));
      ctx.stroke();
      ctx.restore();
    }
    const radii = lockRadii(s3Radii(t, rA));
    ctx.save();
    ctx.rotate(rotAt(t));
    ctx.fillStyle = lock > 0 ? C.paper : s3Color(t);
    shapePath(ctx, radii, S3R * ent);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }
  function s3(ctx, t) {
    bg(ctx, C.blue);
    s3Scene(ctx, t, 1, 1);
  }

  /* ═════════════════════ 04 · STAGGER ═════════════════════ */

  const G4 = { cols: 41, rows: 23 };
  G4.cell = W / G4.cols;
  G4.oy = (H - G4.rows * G4.cell) / 2;
  G4.cc = 20;
  G4.cr = 11;
  const PIX = {
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
    G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  };
  function glyphMask(word) {
    const m = new Uint8Array(G4.cols * G4.rows);
    const wc = word.length * 6 - 1, c0 = Math.floor((G4.cols - wc) / 2), r0 = Math.floor((G4.rows - 7) / 2);
    [...word].forEach((ch, i) => PIX[ch].forEach((row, ry) => [...row].forEach((v, rx) => {
      if (v === '#') m[(r0 + ry) * G4.cols + c0 + i * 6 + rx] = 1;
    })));
    return m;
  }
  const MASK_A = glyphMask('TIMING'), MASK_B = glyphMask('RHYTHM');
  const TILES = [];
  for (let r = 0; r < G4.rows; r++)
    for (let c = 0; c < G4.cols; c++)
      TILES.push({ c, r, i: r * G4.cols + c, x: (c + 0.5) * G4.cell, y: G4.oy + (r + 0.5) * G4.cell, d: Math.hypot(c - G4.cc, r - G4.cr), center: c === G4.cc && r === G4.cr });

  const ON = 43.5, OFF = 7, BASE = 34;
  function tileState(tl, t) {
    let size = BASE, rot = 0, round = 0, col = C.paper, alpha = 1, sx = 1;
    const pop = tl.center ? 1 : E.outBack(prog(t, 5.56 + tl.d * 0.0135, 0.32), 2.2);
    size *= 1 + 0.06 * Math.sin(t * 7 - tl.d * 0.55) * prog(t, 5.8, 0.3) * (1 - prog(t, b(14), 0.2));

    // text A: sweeps in left → right
    const pa = prog(t, b(14) + tl.c * 0.004, 0.24);
    if (pa > 0) {
      const onA = MASK_A[tl.i], e = E.outBack(pa, 2), s = E.outCubic(pa);
      size = lerp(size, onA ? ON : OFF, e);
      round = lerp(0, onA ? 0 : 0.5, s);
      alpha = lerp(1, onA ? 1 : 0.32, s);
    }
    // text B: every tile card-flips in a top → bottom wave
    const pb = prog(t, b(15) + tl.r * 0.004 + tl.c * 0.001, 0.16);
    if (pb > 0) {
      sx = Math.abs(Math.cos(Math.PI * pb));
      if (pb >= 0.5) {
        const onB = MASK_B[tl.i];
        size = onB ? ON : OFF;
        round = onB ? 0 : 0.5;
        alpha = onB ? 1 : 0.32;
        col = onB ? C.lime : C.paper;
      }
    }
    // ripple
    const rp = prog(t, b(13) + tl.d * 0.014, 0.36);
    if (rp > 0 && rp < 1) {
      rot = (Math.PI / 2) * E.inOutCubic(rp);
      const bump = Math.sin(Math.PI * rp);
      size *= 1 - 0.5 * bump;
      if (pa <= 0) col = mix(C.paper, C.lime, bump);
    }
    // anticipation before the explosion
    const im = E.inCubic(prog(t, 7.34, 0.16));
    const k = 1 - 0.06 * im;
    return { x: CX + (tl.x - CX) * k, y: CY + (tl.y - CY) * k, size: size * pop * (1 - 0.2 * im), rot, round, col, alpha, sx };
  }
  function drawTile(ctx, s) {
    if (s.size < 0.5 || s.sx < 0.01) return;
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = s.col;
    const hw = (s.size * s.sx) / 2, hh = s.size / 2;
    if (s.rot === 0 && s.round < 0.01) {
      ctx.fillRect(s.x - hw, s.y - hh, hw * 2, hh * 2);
      return;
    }
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, Math.min(hw, hh, s.round * s.size));
    ctx.fill();
    ctx.restore();
  }
  const zoomEase = bezier(0.7, 0, 0.2, 1);
  function s4(ctx, t) {
    bg(ctx, C.blue);
    ctx.fillStyle = C.ink;
    disc(ctx, CX, CY, DIAG * E.outCubic(prog(t, 5.5, 0.55)));
    for (const tl of TILES) if (!tl.center || t >= 5.75) drawTile(ctx, tileState(tl, t));
    ctx.globalAlpha = 1;
    if (t < 5.75) {
      // match-cut: the morphing square zooms out to become the centre tile of the grid
      const side = 2 * 1.16 * S3R * Math.SQRT1_2;
      const z = zoomEase(prog(t, 5.39, 0.36));
      s3Scene(ctx, t, lerp(1, BASE / side, z), 1 - prog(t, 5.39, 0.22), z);
    }
  }

  /* ═════════════════════ 05 · EMERGENCE ═════════════════════ */

  const PCOL = [C.paper, C.lime, C.red, rgba(C.paper, 0.35)];
  let PARTS = null;
  const convEase = bezier(0.6, 0, 0.2, 1);
  function sampleText(text, size, step) {
    const c = makeCanvas(), g = c.getContext('2d');
    font(g, 900, size, 'normal');
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.fillText(text, CX, CY + size * 0.36);
    const d = g.getImageData(0, 0, W, H).data;
    const pts = [], r = rng(42);
    for (let y = 0; y < H; y += step)
      for (let x = 0; x < W; x += step) {
        const jx = x + (r() - 0.5) * step * 0.6, jy = y + (r() - 0.5) * step * 0.6;
        const ix = Math.round(clamp(jx, 0, W - 1)), iy = Math.round(clamp(jy, 0, H - 1));
        if (d[(iy * W + ix) * 4] > 128) pts.push([jx, jy]);
      }
    return pts;
  }
  function buildParticles() {
    const targets = sampleText('ALIVE', 390, 6.6);
    const r = rng(2026);
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
    PARTS = targets.map(([tx, ty], i) => {
      const P = { tx, ty, n1: r() * 100, n2: r() * 100 + 200, swirl: 0.6 + r() * 0.9, d: r() * 0.07, d2: r() * 0.012, arc: (r() - 0.5) * 380, rad: 2.2 + r() * 1.3 };
      const q = r();
      P.c1 = q < 0.8 ? 0 : q < 0.9 ? 1 : 2;
      if (i < TILES.length) {
        // the tiles of scene 04 become the first particles
        const s = tileState(TILES[i], T[4]);
        const dx = s.x - CX, dy = s.y - CY, dist = Math.hypot(dx, dy) || 1;
        const sp = 500 + 900 * r() + dist * 0.8, ja = (r() - 0.5) * 0.5;
        const a = Math.atan2(dy, dx) + ja;
        Object.assign(P, { tile: true, x0: s.x, y0: s.y, size0: s.size, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
        P.c0 = s.col === C.lime ? 1 : s.alpha < 0.5 ? 3 : 0;
        P.cm = P.c0 === 3 ? 0 : P.c0;
      } else {
        const a = r() * TAU, sp = 800 + 1800 * r(), q2 = r();
        Object.assign(P, { tile: false, x0: CX + Math.cos(a) * 8, y0: CY + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
        P.c0 = P.cm = q2 < 0.45 ? 0 : q2 < 0.75 ? 1 : 2;
      }
      return P;
    });
  }
  function s5(ctx, t) {
    const tau = t - T[4];
    bg(ctx, C.ink);
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, 950);
    g.addColorStop(0, rgba(C.blue, 0.24));
    g.addColorStop(1, rgba(C.blue, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // shockwave
    const sp = prog(tau, 0, 0.7);
    if (sp < 1) {
      ctx.strokeStyle = rgba(C.lime, 1 - sp);
      ctx.lineWidth = 6 * (1 - sp) + 1;
      ctx.beginPath();
      ctx.arc(CX, CY, 40 + 1300 * E.outExpo(sp), 0, TAU);
      ctx.stroke();
    }

    const paths = PCOL.map(() => new Path2D());
    const k = 2.4;
    const pulse = t > b(19) ? 1 + 0.9 * Math.exp(-(t - b(19)) * 10) : 1;
    for (const P of PARTS) {
      const ex = (1 - Math.exp(-k * tau)) / k;
      let x = P.x0 + P.vx * ex, y = P.y0 + P.vy * ex;
      // swirl around the centre
      const sw = P.swirl * (1 - Math.exp(-1.2 * tau));
      const dx = x - CX, dy = y - CY, cs = Math.cos(sw), sn = Math.sin(sw);
      x = CX + dx * cs - dy * sn;
      y = CY + dx * sn + dy * cs;
      // drift through a smooth noise field
      const fl = E.inOutCubic(prog(tau, 0.05, 0.6));
      x += noise(P.n1 + tau * 1.4) * 110 * fl;
      y += noise(P.n2 + tau * 1.4) * 110 * fl;
      // converge on the word, travelling on an arc
      const e = convEase(prog(t, 8.34 + P.d, 0.5));
      if (e > 0) {
        const vx = P.tx - x, vy = P.ty - y, len = Math.hypot(vx, vy) || 1, arc = Math.sin(Math.PI * e) * P.arc;
        x = lerp(x, P.tx, e) - (vy / len) * arc;
        y = lerp(y, P.ty, e) + (vx / len) * arc;
      }
      if (t > 8.9) {
        x += noise(P.n1 + t * 9) * 1.2;
        y += noise(P.n2 + t * 9) * 1.2;
      }
      // collapse into the vanishing point of the next scene
      const e2 = E.inCubic(prog(t, 9.1 + P.d2, 0.26));
      let rad = P.rad * pulse;
      if (e2 > 0) {
        const a = 2.2 * e2, qx = x - CX, qy = y - CY, c2 = Math.cos(a), s2 = Math.sin(a);
        x = CX + (qx * c2 - qy * s2) * (1 - e2);
        y = CY + (qx * s2 + qy * c2) * (1 - e2);
        rad *= 1 - 0.7 * e2;
      }
      const ci = e > 0.5 ? P.c1 : tau < 0.35 ? P.c0 : P.cm;
      const path = paths[ci];
      if (P.tile && tau < 0.45) {
        const s = lerp(P.size0, rad * 2, E.outCubic(prog(tau, 0, 0.45)));
        path.rect(x - s / 2, y - s / 2, s, s);
      } else {
        path.moveTo(x + rad, y);
        path.arc(x, y, rad, 0, TAU);
      }
    }
    PCOL.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fill(paths[i]);
    });

    const fl = Math.exp(-tau * 16) * 0.55 + (t > b(19) ? Math.exp(-(t - b(19)) * 14) * 0.18 : 0);
    if (fl > 0.01) {
      ctx.fillStyle = rgba(C.paper, fl);
      ctx.fillRect(-100, -100, W + 200, H + 200);
    }
  }

  /* ═════════════════════ 06 · DEPTH ═════════════════════ */

  const S6 = { f: 760, gap: 420, pal: [C.paper, C.red, C.lime, C.blue] };
  // Camera z = ∫ v dt, where v surges on every beat — integrated in closed form.
  function camZ(t) {
    let z = 2600 * (t - T[5]);
    for (let k = 20; k <= 23; k++) {
      const d = t - b(k);
      if (d > 0) z += (1900 * (1 - Math.exp(-d * 5))) / 5;
    }
    return z;
  }
  const pathX = (z) => 480 * Math.sin(z * 0.00036) + 160 * Math.sin(z * 0.00097 + 1.3);
  const pathY = (z) => 260 * Math.sin(z * 0.00027 + 2.1);
  const Z_TEXT = camZ(10.93);
  const Z_EXIT = camZ(T[6]) + 170;

  function s6(ctx, t) {
    const cz = camZ(t);
    let bp = 0;
    for (let k = 20; k <= 23; k++) {
      const d = t - b(k);
      if (d >= 0) bp += Math.exp(-d * 9);
    }
    bg(ctx, mix(C.ink, '#161d55', clamp(bp * 0.55)));
    const grow = E.outExpo(prog(t, T[5], 0.45));
    const roll = 0.22 * Math.sin((t - T[5]) * 1.4) + (t - T[5]) * 0.18;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(roll);
    ctx.translate(-CX, -CY);
    const f = S6.f, px0 = pathX(cz), py0 = pathY(cz);
    const proj = (wx, wy, z) => {
      const s = (f / (z - cz)) * grow;
      return [CX + (wx + pathX(z) - px0) * s, CY + (wy + pathY(z) - py0) * s, s];
    };
    const fog = (zr) => Math.pow(clamp(1 - zr / 9400), 1.4);

    // star streaks
    const r = rng(606);
    ctx.strokeStyle = C.paper;
    ctx.lineCap = 'round';
    for (let i = 0; i < 170; i++) {
      const a = r() * TAU, rad = 260 + r() * 520, off = r() * 9000, lw = 1 + r() * 2;
      const z = cz + ((((off - cz) % 9000) + 9000) % 9000);
      const zr = z - cz;
      if (zr < 60) continue;
      const wx = Math.cos(a) * rad, wy = Math.sin(a) * rad;
      const p1 = proj(wx, wy, z), p2 = proj(wx, wy, z + 380);
      ctx.globalAlpha = 0.55 * fog(zr);
      ctx.lineWidth = lw * clamp(p1[2] * 2, 0.5, 4);
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
    }

    const items = [];
    const k0 = Math.floor(cz / S6.gap) + 1;
    for (let k = k0; k < k0 + 24; k++) if (k * S6.gap < Z_EXIT) items.push({ z: k * S6.gap, k });
    items.push({ z: Z_TEXT, text: true });
    items.push({ z: Z_EXIT, exit: true });
    items.sort((a, c) => c.z - a.z);
    for (const it of items) {
      const zr = it.z - cz;
      if (zr < 25 || zr > 9600) continue;
      const [x, y, s] = proj(0, 0, it.z);
      const rot = it.z * 0.0007 + t * 0.35;
      ctx.save();
      ctx.translate(x, y);
      if (it.exit) {
        ctx.rotate(rot);
        ctx.globalAlpha = fog(zr);
        ctx.fillStyle = C.paper;
        const half = 300 * s;
        ctx.beginPath();
        ctx.roundRect(-half, -half, half * 2, half * 2, half * 0.12);
        ctx.fill();
      } else if (it.text) {
        if (zr > 120) {
          ctx.globalAlpha = fog(zr) * clamp((zr - 120) / 300);
          ctx.scale(s * 2, s * 2);
          font(ctx, 900, 200, 'expanded');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = C.paper;
          ctx.fillText('DEPTH', 0, 0);
        }
      } else {
        ctx.rotate(rot);
        ctx.globalAlpha = fog(zr) * clamp((zr - 25) / 220);
        ctx.strokeStyle = S6.pal[it.k % 4];
        ctx.lineWidth = Math.max(1, 24 * s * (1 + 0.9 * bp));
        const half = 760 * s;
        ctx.beginPath();
        if (it.k % 3 === 0) ctx.arc(0, 0, half, 0, TAU);
        else ctx.roundRect(-half, -half, half * 2, half * 2, half * 0.18);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ═════════════════════ 07 · PRINCIPLES ═════════════════════ */

  const easeIn = bezier(0.7, 0, 0.84, 0);
  const antic = (p) => (p < 0.35 ? -0.18 * E.inOutCubic(p / 0.35) : lerp(-0.18, 1, E.outBack((p - 0.35) / 0.65, 2.2)));
  const CARDS = [
    { words: ['EASE IN'], bg: C.paper, fg: C.ink, size: 270, stretch: 'semi-condensed', dur: 0.3, vmin: -0.3, vmax: 1.45, label: 'cubic-bezier(0.70, 0.00, 0.84, 0.00)', curves: [easeIn] },
    { words: ['OVERSHOOT'], bg: C.lime, fg: C.ink, size: 250, stretch: 'semi-condensed', dur: 0.45, vmin: -0.3, vmax: 1.45, label: 'spring( f 2.6 Hz · ζ 0.24 )', curves: [(u) => spring(u * 0.45, 2.6, 0.24)] },
    { words: ['ANTICIPATION'], bg: C.blue, fg: C.paper, size: 196, stretch: 'semi-condensed', dur: 0.36, vmin: -0.3, vmax: 1.45, label: 'wind-up −18%  →  release  →  overshoot +12%', curves: [antic] },
    { words: ['FOLLOW', 'THROUGH'], bg: C.red, fg: C.ink, size: 205, stretch: 'condensed', dur: 0.45, vmin: -0.3, vmax: 1.45, label: 'overlapping action · 16 ms per letter', curves: [0, 1, 2, 3, 4].map((k) => (u) => spring(u * 0.45 - k * 0.05, 2.8, 0.3)) },
  ];

  function wordLayout(ctx, text, size, stretch, weight) {
    font(ctx, weight, size, stretch);
    const track = -size * 0.01;
    const adv = [...text].map((ch) => ctx.measureText(ch).width);
    const total = adv.reduce((a, v) => a + v, 0) + track * (text.length - 1);
    const xs = [];
    let x = -total / 2;
    for (let j = 0; j < text.length; j++) {
      xs.push(x + adv[j] / 2);
      x += adv[j] + track;
    }
    return { xs, adv, total };
  }
  // Paint a word centred on cx, each letter transformed about its own baseline-centre.
  function paintWord(ctx, text, cx, base, size, stretch, weight, color, xf, j0 = 0) {
    const lay = wordLayout(ctx, text, size, stretch, weight);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    for (let j = 0; j < text.length; j++) {
      if (text[j] === ' ') continue;
      const f = xf ? xf(j + j0) : {};
      ctx.save();
      ctx.translate(cx + lay.xs[j] + (f.dx || 0), base + (f.dy || 0));
      if (f.skew) ctx.transform(1, 0, f.skew, 1, 0, 0);
      ctx.scale(f.sx ?? 1, f.sy ?? 1);
      ctx.fillText(text[j], 0, 0);
      ctx.restore();
    }
    ctx.textAlign = 'left';
    return lay;
  }

  function drawCard(ctx, k, tau) {
    const cd = CARDS[k];
    bg(ctx, cd.bg);
    const u = clamp(tau / cd.dur);
    // the curve that drives the word, drawn as it plays
    const gx0 = 300, gw = 1320, gy0 = 190, gh = 700;
    const gy = (v) => gy0 + gh - ((v - cd.vmin) / (cd.vmax - cd.vmin)) * gh;
    ctx.fillStyle = rgba(cd.fg, 0.16);
    for (const v of [0, 1]) for (let x = gx0; x < gx0 + gw; x += 16) ctx.fillRect(x, gy(v), 8, 2);
    font(ctx, 500, 14, 'normal', MONO);
    ctx.fillStyle = rgba(cd.fg, 0.4);
    ctx.fillText('1.0', gx0 - 46, gy(1) + 5);
    ctx.fillText('0.0', gx0 - 46, gy(0) + 5);
    cd.curves.forEach((fn, i) => plot(ctx, fn, gx0, gy0, gw, gh, cd.vmin, cd.vmax, u, cd.fg, i ? 0.16 : 0.3, 3, i ? 5 : 9));

    const base = CY + cd.size * 0.36 - 10;
    ctx.save();
    if (k === 0) {
      const p = prog(tau, 0, cd.dur), dx = lerp(-1500, 0, easeIn(p));
      const v = (easeIn(prog(tau + 0.004, 0, cd.dur)) - easeIn(prog(tau - 0.004, 0, cd.dur))) / 0.008;
      let sx = 1 + Math.min(0.5, v / 9);
      if (tau > cd.dur) sx = 1 - 0.14 * Math.exp(-(tau - cd.dur) * 16) * Math.cos((tau - cd.dur) * 38);
      ctx.translate(CX + dx, CY);
      ctx.scale(sx, 1 / Math.sqrt(sx));
      ctx.translate(-CX, -CY);
      paintWord(ctx, cd.words[0], CX, base, cd.size, cd.stretch, 900, cd.fg);
    } else if (k === 1) {
      paintWord(ctx, cd.words[0], CX, base, cd.size, cd.stretch, 900, cd.fg, (j) => {
        const s = spring(tau - j * 0.024, 2.6, 0.24);
        return { sx: s, sy: s, dy: (1 - s) * 40 - cd.size * 0.36 * (1 - s) };
      });
    } else if (k === 2) {
      const p = prog(tau, 0, cd.dur), a = antic(p);
      const dx = lerp(-280, 0, a);
      const v = (antic(prog(tau + 0.004, 0, cd.dur)) - antic(prog(tau - 0.004, 0, cd.dur))) / 0.008;
      const sx = p < 0.35 ? 1 - 0.1 * E.inOutCubic(p / 0.35) : 1 + Math.min(0.35, Math.abs(v) / 18);
      ctx.translate(CX + dx, CY);
      ctx.scale(sx, 1 / Math.sqrt(sx));
      ctx.translate(-CX, -CY);
      paintWord(ctx, cd.words[0], CX, base, cd.size, cd.stretch, 900, cd.fg);
    } else {
      const lh = cd.size * 0.86;
      const lag = (j, tt) => (1 - spring(tt - j * 0.016, 2.8, 0.3)) * 1600;
      const xf = (j) => {
        const dx = lag(j, tau), v = (lag(j, tau + 0.004) - lag(j, tau - 0.004)) / 0.008;
        return { dx, skew: clamp(v / 9000, -0.45, 0.45) };
      };
      paintWord(ctx, cd.words[0], CX, base - lh / 2, cd.size, cd.stretch, 900, cd.fg, xf, 0);
      paintWord(ctx, cd.words[1], CX, base + lh / 2, cd.size, cd.stretch, 900, cd.fg, xf, 6);
    }
    ctx.restore();

    const al = E.outCubic(prog(tau, 0.06, 0.2));
    font(ctx, 500, 19, 'normal', MONO);
    ctx.letterSpacing = '1px';
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(cd.fg, 0.8 * al);
    ctx.fillText(cd.label, CX, 962);
    ctx.fillText(`07.${k + 1}`, CX, 150);
    ctx.textAlign = 'left';
    ctx.letterSpacing = '0px';

    const flash = 0.45 * (1 - prog(tau, 0, 0.05));
    if (flash > 0) {
      ctx.fillStyle = rgba(cd.fg, flash);
      ctx.fillRect(-100, -100, W + 200, H + 200);
    }
  }
  function s7(ctx, t) {
    const k = Math.min(3, Math.floor((t - T[6]) / BEAT));
    const tau = t - (T[6] + k * BEAT);
    if (k === 3 && t > 12.935) {
      // iris closes the card down into a single dot — the dot we started with
      const rr = lerp(DIAG, 46, E.inQuart(prog(t, 12.935, T[7] - 12.935)));
      bg(ctx, C.ink);
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, rr, 0, TAU);
      ctx.clip();
      drawCard(ctx, 3, tau);
      ctx.restore();
      ctx.strokeStyle = rgba(C.paper, 0.8);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(CX, CY, rr + 8, 0, TAU);
      ctx.stroke();
    } else drawCard(ctx, k, tau);
  }

  /* ═════════════════════ 08 · RESOLVE ═════════════════════ */

  const S8 = { word: 'motion', size: 300, rp: 30, gap: 16 };
  function buildS8(ctx) {
    font(ctx, 900, S8.size, 'normal');
    S8.adv = [...S8.word].map((ch) => ctx.measureText(ch).width);
    S8.ww = S8.adv.reduce((a, v) => a + v, 0);
    const total = S8.ww + S8.gap + S8.rp * 2;
    S8.x0 = CX - total / 2;
    S8.base = CY + 62;
    S8.px = S8.x0 + S8.ww + S8.gap + S8.rp;
    S8.py = S8.base - S8.rp;
    S8.lx = [];
    let x = S8.x0;
    for (const a of S8.adv) {
      S8.lx.push(x);
      x += a;
    }
  }
  const s8A = bezier(0.6, 0, 0.3, 1);
  const s8B = bezier(0.5, 0, 0.1, 1);
  function s8Dot(t) {
    const a = s8A(prog(t, 13.2, 0.22)), c = s8B(prog(t, 13.43, 0.4));
    const x = lerp(lerp(CX, S8.x0 - 40, a), S8.px, c);
    const y = lerp(lerp(CY, S8.py, a), S8.py, c);
    return { x, y, a, c, r: lerp(46, S8.rp, a) };
  }
  const GLYPHS = '#%&*+=<>/\\[]{}01?!';
  function scramble(text, t, t0, per) {
    let s = '';
    for (let j = 0; j < text.length; j++) {
      const tj = t0 + j * per;
      if (t < tj - 0.14) s += ' ';
      else if (t < tj && text[j] !== ' ') s += GLYPHS[Math.floor(hash(j * 7.3 + Math.floor(t * 30)) * GLYPHS.length)];
      else s += text[j];
    }
    return s;
  }
  function s8(ctx, t) {
    const tau = t - T[7];
    bg(ctx, C.ink);
    const out = E.inCubic(prog(t, 14.7, 0.18));
    dotGrid(ctx, 0.07 * E.outCubic(prog(tau, 0.1, 0.6)) * (1 - out), 0, t * 12);

    const shock = prog(tau, 0, 0.7);
    if (shock < 1) {
      ctx.strokeStyle = rgba(C.red, 1 - shock);
      ctx.lineWidth = 5 * (1 - shock) + 1;
      ctx.beginPath();
      ctx.arc(CX, CY, 54 + 560 * E.outExpo(shock), 0, TAU);
      ctx.stroke();
    }

    const d = s8Dot(t);
    const reveal = d.c <= 0 ? -1e9 : d.c < 1 ? d.x - d.r * 0.3 : S8.px + (t - 13.83) * 1500;

    // the word, revealed by the dot as it sweeps past, each letter inflating as it's uncovered
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.translate(0, out * 18);
    if (d.c < 1) {
      ctx.beginPath();
      ctx.rect(0, 0, Math.max(0, reveal), H);
      ctx.clip();
    }
    ctx.fillStyle = C.paper;
    ctx.textAlign = 'center';
    for (let j = 0; j < S8.word.length; j++) {
      const p = clamp((reveal - S8.lx[j]) / 300);
      if (p <= 0) continue;
      font(ctx, lerp(250, 900, E.outCubic(p)), S8.size, 'normal');
      ctx.fillText(S8.word[j], S8.lx[j] + S8.adv[j] / 2, S8.base + (1 - E.outBack(p, 1.6)) * 60);
    }
    ctx.restore();

    // rule + credits
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.translate(0, out * 18);
    const rl = (S8.ww / 2 + 40) * E.outExpo(prog(t, 13.8, 0.5));
    ctx.fillStyle = rgba(C.paper, 0.3);
    ctx.fillRect(CX - rl, S8.base + 58, rl * 2, 1.5);
    ctx.textAlign = 'center';
    font(ctx, 600, 26, 'normal', MONO);
    ctx.letterSpacing = '6px';
    ctx.fillStyle = C.paper;
    ctx.fillText(scramble('DESIGNED & CODED BY CLAUDE', t, 13.72, 0.014), CX, S8.base + 118);
    font(ctx, 400, 17, 'normal', MONO);
    ctx.letterSpacing = '3px';
    ctx.fillStyle = rgba(C.paper, 0.55);
    ctx.fillText(scramble('15 SEC · 900 FRAMES · ONE FUNCTION OF TIME', t, 13.86, 0.01), CX, S8.base + 162);
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'left';
    ctx.restore();

    // the dot: pop, wind-up, sweep, land as the full stop, heartbeat, vanish
    let r = d.r;
    if (tau < 0.3) r *= 1 + 0.3 * Math.exp(-tau * 14) * Math.cos(tau * 30);
    for (const tb of [b(30), b(31)]) {
      const q = t - tb;
      if (q > 0) r *= 1 + 0.38 * (1 - Math.exp(-q * 80)) * Math.exp(-q * 9);
    }
    r *= 1 - E.inBack(prog(t, 14.84, 0.14), 2.5);
    const v = (s8Dot(t + 0.004).x - s8Dot(t - 0.004).x) / 0.008;
    let sx = 1 + Math.min(0.9, Math.abs(v) / 5000), sy = 1 / Math.sqrt(sx);
    const land = t - 13.83;
    if (land > 0 && land < 0.6) {
      const q = 0.3 * Math.exp(-land * 12) * Math.cos(land * 34);
      sx *= 1 - q;
      sy *= 1 + q;
    }
    if (r > 0.2) {
      ctx.fillStyle = C.red;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, r * sx, r * sy, 0, 0, TAU);
      ctx.fill();
    }
  }

  /* ═════════════════════ edit ═════════════════════ */

  function renderScene(ctx, t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = '0px';
    const sh = shake(t);
    ctx.translate(sh.x, sh.y);
    if (t < T[1]) s1(ctx, t);
    else if (t < 3.52) s2(ctx, t);
    else if (t < 3.86) {
      s3(ctx, t);
      s2Slices(ctx, t);
    } else if (t < 5.39) s3(ctx, t);
    else if (t < T[4]) s4(ctx, t);
    else if (t < T[5]) s5(ctx, t);
    else if (t < T[6]) s6(ctx, t);
    else if (t < T[7]) s7(ctx, t);
    else s8(ctx, t);
  }

  /* ═════════════════════ HUD ═════════════════════ */

  const HUDCURVES = [
    ['spring( f 5 Hz · ζ 0.35 )', (u) => spring(u * 0.6, 5, 0.35)],
    ['cubic-bezier(.16, 1, .3, 1)', bezier(0.16, 1, 0.3, 1)],
    ['spring( f 2.5 Hz · ζ 0.36 )', (u) => spring(u * 0.9, 2.5, 0.36)],
    ['stagger 14ms · back(2.2)', (u) => E.outBack(u, 2.2)],
    ['cubic-bezier(.6, 0, .2, 1)', bezier(0.6, 0, 0.2, 1)],
    ['z(t) = ∫ v(t) dt', (u) => u * 0.55 + 0.45 * (1 - Math.exp(-u * 5))],
    null,
    ['—', (u) => u],
  ];
  function hudColor(t) {
    if (t < T[1]) return C.paper;
    if (t < 3.7) return C.ink;
    if (t < T[6]) return C.paper;
    if (t < T[7]) return CARDS[Math.min(3, Math.floor((t - T[6]) / BEAT))].fg;
    return C.paper;
  }
  function hud(ctx, t, frame) {
    const alpha = E.outCubic(prog(t, 0.15, 0.5)) * (1 - E.inOutCubic(prog(t, T[7], 0.2)));
    if (alpha <= 0.01) return;
    const si = Math.min(7, Math.floor(t / BAR));
    const col = hudColor(t);
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;

    // crop marks
    ctx.lineWidth = 2;
    const m = 30, l = 22;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * l);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * l, y);
      ctx.stroke();
    }

    ctx.letterSpacing = '2px';
    font(ctx, 800, 15, 'normal', MONO);
    ctx.fillText('CLAUDE', 64, 72);
    const cw = ctx.measureText('CLAUDE').width;
    font(ctx, 400, 15, 'normal', MONO);
    ctx.fillText('/ MOTION REEL', 64 + cw + 12, 72);

    // section label rolls like an odometer on each cut
    ctx.textAlign = 'right';
    const lt = t - si * BAR;
    ctx.save();
    ctx.beginPath();
    ctx.rect(W - 700, 48, 640, 34);
    ctx.clip();
    const drawLabel = (i, dy, a) => {
      if (i < 0) return;
      const s = TL.scenes[i];
      ctx.globalAlpha = alpha * 0.9 * a;
      font(ctx, 400, 15, 'normal', MONO);
      ctx.fillText(s.name, W - 64, 72 + dy);
      const nw = ctx.measureText(s.name).width;
      font(ctx, 800, 15, 'normal', MONO);
      ctx.fillText(`${s.id} —`, W - 64 - nw - 14, 72 + dy);
    };
    const e = E.outExpo(prog(lt, 0, 0.35));
    drawLabel(si - 1, -30 * e, 1 - e);
    drawLabel(si, 30 * (1 - e), si === 0 ? 1 : e);
    ctx.restore();
    ctx.globalAlpha = alpha * 0.9;

    // timecode
    ctx.textAlign = 'left';
    font(ctx, 500, 15, 'normal', MONO);
    const ss = Math.floor(frame / FPS), ff = frame % FPS;
    ctx.fillText(`TC 00:00:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`, 64, H - 60);
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillText(`FRAME ${String(frame).padStart(3, '0')} / 900`, 64, H - 84);
    ctx.globalAlpha = alpha * 0.9;

    // beat counter
    const beats = t / BEAT, bi = Math.floor(beats) % 4, bf = beats - Math.floor(beats);
    for (let k = 0; k < 4; k++) {
      const x = CX - 84 + k * 18, y = H - 72;
      if (k === bi) {
        ctx.globalAlpha = alpha * lerp(1, 0.5, bf);
        ctx.fillRect(x, y, 10, 10);
      } else {
        ctx.globalAlpha = alpha * 0.45;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, 8.5, 8.5);
      }
    }
    ctx.globalAlpha = alpha * 0.9;
    font(ctx, 500, 13, 'normal', MONO);
    ctx.fillText(`BAR ${si + 1}/8 · 128 BPM`, CX - 4, H - 62);

    // live easing graph
    let hc = HUDCURVES[si];
    if (si === 6) {
      const k = Math.min(3, Math.floor((t - T[6]) / BEAT));
      hc = [['ease-in', 'overshoot', 'anticipate', 'follow-through'][k], CARDS[k].curves[0]];
    }
    if (hc) {
      const gx = W - 64 - 120, gy = H - 118, gw = 120, gh = 56;
      ctx.globalAlpha = alpha * 0.35;
      ctx.lineWidth = 1;
      ctx.strokeRect(gx + 0.5, gy + 0.5, gw, gh);
      ctx.globalAlpha = alpha * 0.9;
      const u = clamp(frac(t / BEAT) / 0.8);
      plot(ctx, hc[1], gx, gy + 8, gw, gh - 16, -0.2, 1.4, u, col, 0.9, 2, 3.5, 40);
      ctx.textAlign = 'right';
      font(ctx, 500, 12, 'normal', MONO);
      ctx.fillStyle = col;
      ctx.fillText(hc[0], W - 64, H - 130);
    }
    ctx.restore();
  }

  /* ═════════════════════ lens + film ═════════════════════ */

  let out, outCtx, sceneC, sceneCtx, accC, accCtx, chC, chCtx, sm1, sm2, vignette, grains;

  function chromatic(o, src, amt) {
    o.fillStyle = '#000';
    o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'lighter';
    for (const [col, s] of [['#ff0000', 1 + (amt * 2) / W], ['#00ff00', 1 + amt / W], ['#0000ff', 1]]) {
      chCtx.globalCompositeOperation = 'source-over';
      chCtx.setTransform(s, 0, 0, s, CX * (1 - s), CY * (1 - s));
      chCtx.drawImage(src, 0, 0);
      chCtx.setTransform(1, 0, 0, 1, 0, 0);
      chCtx.globalCompositeOperation = 'multiply';
      chCtx.fillStyle = col;
      chCtx.fillRect(0, 0, W, H);
      o.drawImage(chC, 0, 0);
    }
    o.globalCompositeOperation = 'source-over';
  }
  function bloomAmt(t) {
    if (t < 1.55) return 0.35;
    if (t >= 5.9 && t < T[6]) return t < T[4] ? 0.3 : 0.55;
    if (t >= T[7]) return 0.4;
    return 0;
  }
  function bloom(o, src, amt) {
    const a = sm1.getContext('2d'), c = sm2.getContext('2d');
    a.filter = 'blur(3px)';
    a.drawImage(src, 0, 0, sm1.width, sm1.height);
    a.filter = 'none';
    c.filter = 'blur(3px)';
    c.drawImage(sm1, 0, 0, sm2.width, sm2.height);
    c.filter = 'none';
    o.globalCompositeOperation = 'screen';
    o.globalAlpha = amt * 0.5;
    o.drawImage(sm1, 0, 0, W, H);
    o.globalAlpha = amt * 0.7;
    o.drawImage(sm2, 0, 0, W, H);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
  }

  function drawTime(t, frame, opts = {}) {
    const sub = opts.subframes ?? 8, shutter = opts.shutter ?? 0.5;
    for (let k = 0; k < sub; k++) {
      const ts = sub === 1 ? t : t + ((k + 0.5) / sub - 0.5) * (shutter / FPS);
      sceneCtx.save();
      renderScene(sceneCtx, ts);
      sceneCtx.restore();
      accCtx.globalAlpha = 1 / (k + 1);
      accCtx.drawImage(sceneC, 0, 0);
    }
    accCtx.globalAlpha = 1;

    const o = outCtx;
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    const ca = aberration(t) * 10;
    if (ca > 0.35) chromatic(o, accC, ca);
    else o.drawImage(accC, 0, 0);
    const bl = bloomAmt(t);
    if (bl > 0) bloom(o, accC, bl);
    o.drawImage(vignette, 0, 0);
    o.globalCompositeOperation = 'overlay';
    o.globalAlpha = 0.07;
    o.drawImage(grains[frame % grains.length], 0, 0, W, H);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    hud(o, t, frame);
  }

  async function init(canvas) {
    await Promise.all([
      document.fonts.load(`900 100px ${FONT}`),
      document.fonts.load(`100 100px ${FONT}`),
      document.fonts.load(`400 20px ${MONO}`),
      document.fonts.load(`800 20px ${MONO}`),
    ]);
    await document.fonts.ready;
    out = canvas;
    outCtx = out.getContext('2d');
    sceneC = makeCanvas();
    sceneCtx = sceneC.getContext('2d');
    accC = makeCanvas();
    accCtx = accC.getContext('2d');
    chC = makeCanvas();
    chCtx = chC.getContext('2d');
    sm1 = makeCanvas(W / 4, H / 4);
    sm2 = makeCanvas(W / 16, H / 16);

    vignette = makeCanvas();
    const v = vignette.getContext('2d');
    const g = v.createRadialGradient(CX, CY, H * 0.35, CX, CY, DIAG);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.32)');
    v.fillStyle = g;
    v.fillRect(0, 0, W, H);

    grains = [0, 1, 2, 3].map((k) => {
      const c = makeCanvas(W / 2, H / 2), gc = c.getContext('2d');
      const id = gc.createImageData(W / 2, H / 2), r = rng(k * 99 + 1);
      for (let p = 0; p < id.data.length; p += 4) {
        const n = 128 + (r() + r() + r() - 1.5) * 150;
        id.data[p] = id.data[p + 1] = id.data[p + 2] = n;
        id.data[p + 3] = 255;
      }
      gc.putImageData(id, 0, 0);
      return c;
    });

    buildRingText();
    buildS8(sceneCtx);
    buildParticles();
  }

  root.REEL = {
    W, H, FPS, DURATION,
    FRAMES: Math.round(DURATION * FPS),
    init,
    drawFrame: (i, opts) => drawTime(i / FPS, i, opts),
    drawTime: (t, opts) => drawTime(t, Math.floor(t * FPS), opts),
    particleCount: () => PARTS.length,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
