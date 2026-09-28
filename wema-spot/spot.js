/* WEMA BANK — "FIRST IS A HABIT."  ·  30-second spec spot
   One purple line runs from a 1945 ledger to a 2026 phone.
   Every pixel is a pure function of time: render(t) has no hidden state, so frames render
   in any order, in parallel, and are sampled 8× per frame for true motion blur. */
(function (root) {
  'use strict';

  const TL = root.TL;
  const NIGERIA = root.NIGERIA;
  const { FPS, DURATION, BEAT, BAR } = TL;
  // Three deliverables from one function: 16:9 (TV/YouTube), 1:1 (feed), 9:16 (Reels/TikTok/Status).
  const FMT = root.FORMAT || '16x9';
  const W = FMT === '16x9' ? 1920 : 1080;
  const H = FMT === '9x16' ? 1920 : 1080;
  const pick = (land, square, tall) => (FMT === '16x9' ? land : FMT === '1x1' ? square : tall);
  const b = TL.b;
  const BR = TL.bar;
  const TAU = Math.PI * 2;
  const CX = W / 2;
  const CY = H / 2;
  const DIAG = Math.hypot(CX, CY) + 80;

  const P = {
    purple: '#AE328E',
    deep: '#5A1052',
    plum: '#1C0620',
    night: '#12031A',
    orchid: '#E9A6D7',
    cream: '#FFF4E6',
    gold: '#FFB23F',
    white: '#FFFFFF',
    ink: '#2A1420',
    paper: '#FFFDF8',
  };
  const SANS = 'Archivo';
  const SERIF = 'Fraunces';
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
    inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
    inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  };
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
  function spring(tau, freq, zeta) {
    if (tau <= 0) return 0;
    const w = TAU * freq, wd = w * Math.sqrt(1 - zeta * zeta);
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
  const EZ = {
    snap: bezier(0.16, 1, 0.3, 1),
    swap: bezier(0.7, 0, 0.2, 1),
    whip: bezier(0.8, 0, 0.1, 1),
    spin: bezier(0.15, 0.8, 0.2, 1),
  };

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

  /* ─────────────────────────── drawing helpers ─────────────────────────── */

  function makeCanvas(w = W, h = H) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function bg(ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(-400, -400, W + 800, H + 800);
  }
  function disc(ctx, x, y, r) {
    if (r <= 0) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  function ring(ctx, x, y, r, lw, color) {
    if (r <= 0 || lw <= 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
  }
  function setFont(ctx, fam, weight, size, stretch = 'normal') {
    ctx.font = `${Math.round(clamp(weight, 100, 900))} ${size}px ${fam}`;
    ctx.fontStretch = stretch;
  }
  function textW(ctx, s, fam, weight, size, stretch) {
    setFont(ctx, fam, weight, size, stretch);
    return ctx.measureText(s).width;
  }
  function glow(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Text that rises into view through a mask. p is an eased 0→1 (may overshoot).
  function riseText(ctx, s, x, y, p, o) {
    if (p <= 0.001) return 0;
    setFont(ctx, o.fam || SANS, o.weight ?? 900, o.size, o.stretch || 'normal');
    const w = ctx.measureText(s).width;
    const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - 40, y - o.size * 1.02, w + 80, o.size * 1.34);
    ctx.clip();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.fillStyle = o.color;
    ctx.textAlign = 'left';
    ctx.fillText(s, x0, y + (1 - p) * o.size * 1.2);
    ctx.restore();
    return w;
  }
  // Characters appear one by one, positioned by prefix width so kerning survives.
  function typeOn(ctx, s, x, y, t, t0, per, o) {
    const k = (t - t0) / per;
    if (k <= 0) return;
    setFont(ctx, o.fam || SANS, o.weight ?? 400, o.size, o.stretch || 'normal');
    ctx.fillStyle = o.color;
    ctx.textAlign = 'left';
    const base = ctx.globalAlpha;
    const total = ctx.measureText(s).width;
    const x0 = o.align === 'center' ? x - total / 2 : x;
    for (let j = 0; j < s.length; j++) {
      const a = clamp(k - j);
      if (a <= 0) break;
      const px = ctx.measureText(s.slice(0, j)).width;
      ctx.globalAlpha = base * a;
      ctx.fillText(s[j], x0 + px, y + (1 - E.outCubic(a)) * o.size * 0.3);
    }
    ctx.globalAlpha = base;
  }
  function pathLen(pts, closed) {
    let L = 0;
    const n = pts.length - (closed ? 0 : 1);
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      L += Math.hypot(c[0] - a[0], c[1] - a[1]);
    }
    return L;
  }
  // Stroke the first p of a polyline — the "line drawing itself".
  function drawPath(ctx, pts, p = 1, closed = false) {
    if (p <= 0 || pts.length < 2) return;
    const n = pts.length - (closed ? 0 : 1);
    let rem = pathLen(pts, closed) * clamp(p);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n && rem > 0; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (rem >= l) ctx.lineTo(c[0], c[1]);
      else ctx.lineTo(a[0] + ((c[0] - a[0]) * rem) / l, a[1] + ((c[1] - a[1]) * rem) / l);
      rem -= l;
    }
    ctx.stroke();
  }
  function pointAt(pts, s) {
    let rem = pathLen(pts, false) * clamp(s);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (rem <= l) return [a[0] + ((c[0] - a[0]) * rem) / l, a[1] + ((c[1] - a[1]) * rem) / l];
      rem -= l;
    }
    return pts[pts.length - 1];
  }
  function checkPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x - 0.45 * s, y + 0.02 * s);
    ctx.lineTo(x - 0.12 * s, y + 0.32 * s);
    ctx.lineTo(x + 0.48 * s, y - 0.32 * s);
  }
  function drawCheck(ctx, x, y, s, color, lw, p = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawPath(ctx, [[x - 0.45 * s, y + 0.02 * s], [x - 0.12 * s, y + 0.32 * s], [x + 0.48 * s, y - 0.32 * s]], p);
  }
  function coin(ctx, x, y, r, a = 1) {
    ctx.globalAlpha *= a;
    ctx.fillStyle = P.gold;
    disc(ctx, x, y, r);
    ctx.fillStyle = '#E08A12';
    disc(ctx, x, y, r * 0.78);
    ctx.fillStyle = P.gold;
    disc(ctx, x - r * 0.06, y - r * 0.06, r * 0.72);
    setFont(ctx, SANS, 900, r * 1.05);
    ctx.fillStyle = P.deep;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('₦', x, y + r * 0.04);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha /= a;
  }

  /* ─────────────────────────── camera energy ─────────────────────────── */

  const IMPACTS = [
    [BR(3), 1], [b(19), 0.3], [BR(5), 0.3], [BR(6), 0.3], [b(30), 0.3], [BR(8), 0.35],
    [b(40), 0.35], [b(41), 0.35], [b(42), 0.35], [b(43), 0.35], [b(47), 0.45], [BR(12), 0.8], [b(55), 0.25],
  ];
  function shake(t) {
    let x = 0, y = 0;
    for (const [ti, s] of IMPACTS) {
      const tau = t - ti;
      if (tau < 0 || tau > 0.5) continue;
      const env = s * Math.exp(-tau * 11);
      x += noise(tau * 36 + ti * 10) * env * 14;
      y += noise(tau * 36 + ti * 10 + 77) * env * 14;
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
  // Envelope of the talking drum — makes the thread vibrate on every hit.
  function drum(t) {
    let e = 0;
    for (const h of TL.talk) {
      const tau = t - h.t;
      if (tau >= 0 && tau < 0.6) e += Math.exp(-tau * 9) * (1 - Math.exp(-tau * 120));
    }
    return e;
  }

  /* ═════════════════════ ACT 1 · HERITAGE (bars 0–2) ═════════════════════ */

  const S1 = { margin: pick(250, 110, 90), rows: [], slot: pick(232, 192, 200), size: pick(360, 300, 310) };
  for (let y = 128; y < H - 40; y += 64) S1.rows.push(y);
  S1.baseRow = pick(5, 4, 9);
  S1.base = S1.rows[S1.baseRow];
  S1.digitX = pick(292, (W - 4 * 192) / 2, 150);
  S1.entryRow = pick(11, 11, 20);
  S1.stamp = pick([1480, 330, 1], [880, 610, 0.62], [560, 1200, 0.85]);
  S1.cols = [W - 420, W - 280, W - 160];
  S1.jogs = S1.rows.map((y, k) => {
    const r = rng(100 + k);
    const n = 2 + Math.floor(r() * 3);
    const xs = [];
    for (let i = 0; i < n; i++) xs.push(W * 0.19 + r() * W * 0.73);
    xs.sort((a, c) => a - c);
    let dir = r() < 0.5 ? -1 : 1;
    return xs.map((x) => ({ x, dir: (dir = -dir) }));
  });
  // A ruled ledger line that can bend into a circuit trace (m = 0 → 1).
  function rowPts(k, m, x1 = W + 40) {
    const pts = [[-40, S1.rows[k]]];
    let y = S1.rows[k];
    for (const j of S1.jogs[k]) {
      if (j.x > x1) break;
      pts.push([j.x, y]);
      y += j.dir * 32 * m;
      pts.push([j.x + 32 * m, y]);
    }
    pts.push([x1, y]);
    return pts;
  }
  const ENTRIES = [
    ['2 May', 'Opening deposit', '12', '10', '0'],
    ['2 May', "Trader's advance", '40', '0', '0'],
    ['3 May', 'Savings — Mrs. A.', '3', '6', '8'],
  ];
  const ROLL1 = [0, 0, 12, 14]; // 1945 → 1969
  const ROLL2 = [11, 11, 15, 18]; // 1969 → 2017
  function digitValue(j, t) {
    const start = [1, 9, 4, 5][j];
    const e1 = E.outBack(prog(t, b(8) + j * 0.04, 0.42), 1.3);
    const e2 = E.outBack(prog(t, b(9.5) + j * 0.04, 0.42), 1.3);
    return { v: start + ROLL1[j] * e1 + ROLL2[j] * e2, sans: e2 > 0.45 };
  }
  let paperTex = null, stampTex = null, stamp2Tex = null;

  function s1(ctx, t) {
    const dk = E.inOutCubic(prog(t, b(9), 0.6)); // paper → digital night
    const m = E.inOutCubic(prog(t, 4.95, 0.65)); // ledger → circuit
    const zoom = E.inExpo(prog(t, 5.93, BR(3) - 5.93));
    const zc = [S1.digitX + S1.slot * 1.5, S1.base - S1.size * 0.36];

    bg(ctx, P.plum);
    ctx.save();
    // camera: slow push through bars 0–1, then the dive through the "0" of 2017
    const push = 1 + 0.05 * E.inOutCubic(prog(t, 0, BR(2)));
    const zs = push * (1 + zoom * 70);
    ctx.translate(zc[0], zc[1]);
    ctx.scale(zs, zs);
    ctx.translate(-zc[0], -zc[1]);

    // paper, revealed away by a circle of night that opens on the year
    if (dk < 1) {
      ctx.drawImage(paperTex, 0, 0);
      if (dk > 0) {
        ctx.fillStyle = P.plum;
        disc(ctx, zc[0], zc[1], DIAG * 1.6 * dk);
      }
    }

    const vib = drum(t) * 7;
    const rowCol = mix(P.purple, P.orchid, dk);
    const rowA = lerp(0.26, 0.55, dk) * (1 - zoom);
    // header rules + ruled lines draw in, then bend into traces
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(P.purple, 0.8 * (1 - dk));
    ctx.lineWidth = 2;
    for (const y of [92, 100]) drawPath(ctx, [[0, y], [W, y]], E.outExpo(prog(t, 0.1, 0.7)));
    ctx.lineWidth = lerp(1.6, 2.4, dk);
    ctx.globalAlpha = rowA;
    ctx.strokeStyle = rowCol;
    S1.rows.forEach((y, k) => drawPath(ctx, rowPts(k, m), E.outExpo(prog(t, 0.2 + k * 0.035, 0.7))));
    // nodes on the traces
    if (m > 0) {
      ctx.fillStyle = P.plum;
      S1.rows.forEach((y, k) => {
        const pts = rowPts(k, m);
        for (let i = 2; i < pts.length - 1; i += 2) {
          ctx.globalAlpha = rowA * m;
          disc(ctx, pts[i][0], pts[i][1], 6 * m);
          ctx.strokeStyle = rowCol;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
      // data pulses racing along the traces
      ctx.fillStyle = P.gold;
      S1.rows.forEach((y, k) => {
        const pts = rowPts(k, m);
        for (let q = 0; q < 2; q++) {
          const s = frac(t * 0.55 + k * 0.137 + q * 0.5);
          const [px, py] = pointAt(pts, s);
          ctx.globalAlpha = m * (1 - zoom) * 0.9;
          disc(ctx, px, py, 4);
          glow(ctx, px, py, 22, P.gold, 0.45 * m);
        }
      });
    }
    ctx.globalAlpha = 1;

    // the thread: the ledger's margin line — it vibrates with the talking drum
    const mg = E.outExpo(prog(t, 0.02, 0.55));
    ctx.strokeStyle = mix(P.purple, '#D94AAE', dk);
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let y = 0; y <= H * mg; y += 12) {
      const x = S1.margin + Math.sin(y * 0.05 - t * 40) * vib * Math.sin((Math.PI * y) / H);
      y === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // £ s d columns
    const colA = (1 - E.inOutCubic(prog(t, BR(2), 0.3))) * E.outCubic(prog(t, 0.4, 0.5));
    if (colA > 0) {
      ctx.globalAlpha = colA;
      ctx.fillStyle = rgba(P.purple, 0.22);
      for (const x of S1.cols) ctx.fillRect(x, 108, 1.5, H);
      setFont(ctx, SERIF, 600, 30);
      ctx.fillStyle = P.ink;
      ctx.textAlign = 'center';
      ['£', 's.', 'd.'].forEach((s, i) => ctx.fillText(s, S1.cols[i] + 70, 84));
      ctx.textAlign = 'left';
      // handwritten-ish entries, one per eighth note
      ENTRIES.forEach((e, i) => {
        const t0 = b(1.5) + i * b(0.5), y = S1.rows[S1.entryRow + i] - 12;
        ctx.save();
        ctx.translate(0, y);
        ctx.rotate((hash(i + 3) - 0.5) * 0.012);
        typeOn(ctx, e[0], S1.margin + 30, 0, t, t0, 0.02, { fam: SERIF, weight: 400, size: 30, color: P.ink });
        typeOn(ctx, e[1], S1.margin + pick(220, 180, 180), 0, t, t0 + 0.05, 0.015, { fam: SERIF, weight: 400, size: 30, color: P.ink });
        [e[2], e[3], e[4]].forEach((v, c) => typeOn(ctx, v, S1.cols[c] + 60, 0, t, t0 + 0.2 + c * 0.03, 0.03, { fam: SERIF, weight: 500, size: 30, color: P.ink }));
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    }

    // stamp: slams on beat 2
    const st = prog(t, b(2) - 0.12, 0.12);
    const stOut = E.inCubic(prog(t, BR(2), 0.3));
    if (st > 0 && stOut < 1) {
      const land = t - b(2);
      let s = lerp(2.4, 1, E.inQuad(st));
      if (land > 0) s = 1 + 0.06 * Math.exp(-land * 14) * Math.cos(land * 40);
      ctx.save();
      ctx.translate(S1.stamp[0], S1.stamp[1]);
      ctx.rotate(-0.2);
      ctx.scale(s * (1 - stOut) * S1.stamp[2], s * (1 - stOut) * S1.stamp[2]);
      ctx.globalAlpha = st * (1 - stOut) * 0.92;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(stampTex, -200, -200);
      ctx.restore();
    }

    // copy, written on the ruled lines
    const cpA = 1 - E.inCubic(prog(t, BR(2), 0.3));
    if (cpA > 0) {
      ctx.globalAlpha = cpA;
      ctx.save();
      ctx.translate(0, -60 * E.inCubic(prog(t, BR(2), 0.3)));
      const o = { fam: SERIF, weight: 400, size: 54, color: P.ink };
      const cx0 = S1.digitX, cr = S1.baseRow + 2;
      typeOn(ctx, 'Two rooms.', cx0, S1.rows[cr] - 10, t, b(3), 0.025, o);
      typeOn(ctx, 'One radical idea:', cx0, S1.rows[cr + 1] - 10, t, b(4), 0.022, o);
      typeOn(ctx, 'a bank for Nigerians.', cx0, S1.rows[cr + 2] - 10, t, b(5), 0.022, { ...o, weight: 600 });
      // hand-drawn underline under "Nigerians"
      const u0 = cx0 + textW(ctx, 'a bank for ', SERIF, 600, 54), u1 = cx0 + textW(ctx, 'a bank for Nigerians', SERIF, 600, 54);
      ctx.strokeStyle = P.purple;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      const up = [];
      for (let i = 0; i <= 24; i++) up.push([lerp(u0, u1, i / 24), S1.rows[cr + 2] + 6 + Math.sin(i * 0.9) * 2.5]);
      drawPath(ctx, up, E.outCubic(prog(t, b(6), 0.3)));
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // the year — an odometer that rolls 1945 → 1969 → 2017 while serif becomes sans
    const inkCol = mix(P.ink, P.white, dk);
    for (let j = 0; j < 4; j++) {
      const land = prog(t, b(1) + j * 0.134 - 0.1, 0.1);
      if (land <= 0) continue;
      const { v, sans } = digitValue(j, t);
      const x = S1.digitX + j * S1.slot + S1.slot / 2;
      const lh = S1.size * 1.05;
      const d = t - (b(1) + j * 0.134);
      const sq = d > 0 ? 0.12 * Math.exp(-d * 16) * Math.cos(d * 38) : 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - S1.slot / 2 - 10, S1.base - S1.size * 0.86, S1.slot + 20, S1.size * 1.02);
      ctx.clip();
      ctx.translate(x, S1.base - (1 - land) * 80);
      ctx.scale(1 + sq * 0.5, 1 - sq);
      ctx.fillStyle = inkCol;
      ctx.globalAlpha = land;
      ctx.textAlign = 'center';
      const fl = Math.floor(v), fr = v - fl;
      for (const [dv, dy] of [[fl, -fr * lh], [fl + 1, (1 - fr) * lh]]) {
        if (Math.abs(dy) > lh) continue;
        if (sans) setFont(ctx, SANS, 900, S1.size * 0.92);
        else setFont(ctx, SERIF, 800, S1.size);
        ctx.fillText(String(((dv % 10) + 10) % 10), 0, dy);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // era captions under the year
    setFont(ctx, MONO, 500, 20);
    ctx.letterSpacing = '4px';
    const cap = (s, t0, t1) => {
      const a = E.outCubic(prog(t, t0, 0.2)) * (1 - E.inCubic(prog(t, t1, 0.15)));
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = mix(P.purple, P.gold, dk);
      ctx.fillText(s, S1.digitX + 8, S1.base + 58 + (1 - a) * 10);
      ctx.globalAlpha = 1;
    };
    cap('AGBONMAGBE BANK · EST. 2 MAY 1945', b(2.2), b(8));
    cap('1969 · AGBONMAGBE BECOMES WEMA BANK', b(8.4), b(9.4));
    cap('2017 · WEMA LAUNCHES ALAT', b(10), 5.9);
    ctx.letterSpacing = '0px';
    ctx.restore();

    // light spilling from inside the zero as we dive
    if (zoom > 0.3) {
      ctx.fillStyle = rgba(P.purple, E.inCubic(prog(zoom, 0.3, 0.7)) * 0.9);
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ═════════════════════ ACT 2 · THE DROP (bars 3–4) ═════════════════════ */

  const PH = { w: 400, h: 820, r: 64 };
  const A2 = pick(
    { p0: [960, 560, 1], p1: [560, 560, 1], X: 880, y17: 300, s17: 170, ls: 128, ly: [450, 580, 710], sy: [380, 520, 660], ss: 140, cap: [800, 36] },
    { p0: [540, 560, 0.8], p1: [290, 560, 0.7], X: 510, y17: 330, s17: 96, ls: 72, ly: [420, 495, 570], sy: [420, 500, 580], ss: 76, cap: [650, 21] },
    { p0: [540, 1000, 1.05], p1: [540, 1330, 0.85], X: 90, y17: 270, s17: 150, ls: 118, ly: [400, 520, 640], sy: [330, 460, 590], ss: 130, cap: [690, 34] }
  );
  function phoneScreen(ctx, t, w, h) {
    // ALAT splash for bar 3, onboarding for bar 4
    if (t < BR(4) + 0.02) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#C23A9E');
      g.addColorStop(1, '#5A1052');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < 3; k++) {
        const f = frac((t - BR(3)) / BEAT + k / 3);
        ring(ctx, w / 2, h * 0.44, 60 + f * 220, 2, rgba(P.white, 0.35 * (1 - f)));
      }
      const pop = spring(t - BR(3) - 0.05, 3, 0.45);
      ctx.save();
      ctx.translate(w / 2, h * 0.44);
      ctx.scale(pop, pop);
      setFont(ctx, SANS, 900, 118);
      ctx.fillStyle = P.white;
      ctx.textAlign = 'center';
      ctx.fillText('ALAT', 0, 40);
      setFont(ctx, SANS, 500, 30);
      ctx.fillStyle = P.orchid;
      ctx.fillText('by Wema', 0, 92);
      ctx.restore();
      ctx.textAlign = 'left';
      return;
    }
    ctx.fillStyle = '#FFF7FC';
    ctx.fillRect(0, 0, w, h);
    setFont(ctx, SANS, 800, 38);
    ctx.fillStyle = P.plum;
    ctx.fillText('Open an account', 30, 120);
    setFont(ctx, SANS, 500, 21);
    ctx.fillStyle = '#8B6E86';
    ctx.fillText('No branch visit needed.', 30, 154);
    const field = (label, value, y, t0, per) => {
      const on = t >= t0 - 0.1;
      ctx.strokeStyle = on ? P.purple : '#E7D6E3';
      ctx.lineWidth = on ? 3 : 2;
      ctx.fillStyle = P.white;
      ctx.beginPath();
      ctx.roundRect(30, y, w - 60, 84, 18);
      ctx.fill();
      ctx.stroke();
      setFont(ctx, SANS, 600, 18);
      ctx.fillStyle = '#8B6E86';
      ctx.fillText(label, 50, y + 30);
      const n = clamp(Math.floor((t - t0) / per), 0, value.length);
      setFont(ctx, MONO, 600, 26);
      ctx.fillStyle = P.plum;
      ctx.fillText(value.slice(0, n), 50, y + 66);
      if (on && n < value.length && frac(t * 3) < 0.5) ctx.fillRect(50 + ctx.measureText(value.slice(0, n)).width + 2, y + 44, 3, 28);
    };
    field('Phone number', '080 •••• ••••', 196, b(16) + 0.05, 0.03);
    field('BVN', '•••••••••••', 300, b(17) + 0.05, 0.03);
    // selfie scan
    const sa = prog(t, b(18) - 0.05, 0.15);
    if (sa > 0) {
      ctx.globalAlpha = sa;
      ctx.fillStyle = '#F3E4EF';
      disc(ctx, w / 2, 520, 86);
      ctx.fillStyle = '#D9B9D2';
      disc(ctx, w / 2, 500, 32);
      ctx.beginPath();
      ctx.ellipse(w / 2, 590, 56, 40, 0, Math.PI, 0);
      ctx.fill();
      ring(ctx, w / 2, 520, 92, 4, P.purple);
      const sy = 520 + Math.sin((t - b(18)) * 12) * 70;
      ctx.fillStyle = rgba(P.purple, 0.8);
      ctx.fillRect(w / 2 - 80, sy, 160, 3);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = P.purple;
    ctx.beginPath();
    ctx.roundRect(30, h - 120, w - 60, 72, 36);
    ctx.fill();
    setFont(ctx, SANS, 700, 24);
    ctx.fillStyle = P.white;
    ctx.textAlign = 'center';
    ctx.fillText('Continue', w / 2, h - 75);
    ctx.textAlign = 'left';
    // success
    const ok = prog(t, b(19) - 0.06, 0.18);
    if (ok > 0) {
      ctx.fillStyle = P.purple;
      disc(ctx, w / 2, h / 2, Math.hypot(w, h) * E.outCubic(ok));
      const c = spring(t - b(19), 3.2, 0.4);
      ctx.fillStyle = P.gold;
      disc(ctx, w / 2, h * 0.42, 74 * c);
      drawCheck(ctx, w / 2, h * 0.42, 80, P.plum, 12, E.outCubic(prog(t, b(19) + 0.05, 0.2)));
      const a = E.outCubic(prog(t, b(19) + 0.1, 0.2));
      ctx.globalAlpha = a;
      setFont(ctx, SANS, 800, 38);
      ctx.fillStyle = P.white;
      ctx.textAlign = 'center';
      ctx.fillText('Account opened', w / 2, h * 0.42 + 150);
      setFont(ctx, SANS, 500, 22);
      ctx.fillStyle = P.orchid;
      ctx.fillText('Welcome to ALAT', w / 2, h * 0.42 + 190);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }
  function drawPhone(ctx, t, x, y, s, rot, sx = 1, sy = 1) {
    const { w, h, r } = PH;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s * sx, s * sy);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 18, -h / 2 + 30, w, h, r);
    ctx.fill();
    ctx.fillStyle = '#0E0210';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#2A0A2E';
    ctx.fillRect(w / 2 - 1, -h / 2 + 170, 6, 90);
    const ins = 14;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-w / 2 + ins, -h / 2 + ins, w - ins * 2, h - ins * 2, r - ins);
    ctx.clip();
    ctx.translate(-w / 2 + ins, -h / 2 + ins);
    phoneScreen(ctx, t, w - ins * 2, h - ins * 2);
    ctx.restore();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(-58, -h / 2 + 28, 116, 32, 16);
    ctx.fill();
    // glass sheen
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + ins, -h / 2 + ins, w - ins * 2, h - ins * 2, r - ins);
    ctx.fill();
    ctx.restore();
  }
  // map geometry (needed by the phone → Lagos match-cut)
  const MAP = { lon0: 8.66, lat0: 9.08, ...pick({ cx: 1260, cy: 560, k: 86 }, { cx: 600, cy: 640, k: 62 }, { cx: 540, cy: 1180, k: 80 }) };
  const proj = (lon, lat) => [MAP.cx + (lon - MAP.lon0) * MAP.k * Math.cos((9 * Math.PI) / 180), MAP.cy - (lat - MAP.lat0) * MAP.k];
  const CITIES = {
    Lagos: [3.38, 6.52], Ibadan: [3.93, 7.38], Abuja: [7.49, 9.06], Kano: [8.52, 12.0], Kaduna: [7.44, 10.52],
    'Port Harcourt': [7.03, 4.82], Enugu: [7.51, 6.45], 'Benin City': [5.63, 6.34], Jos: [8.89, 9.93],
    Maiduguri: [13.16, 11.85], Sokoto: [5.24, 13.06], Calabar: [8.32, 4.95], Ilorin: [4.54, 8.5],
  };
  function phoneState(t) {
    const slam = prog(t, BR(3) - 0.14, 0.14);
    const d = t - BR(3);
    let s = lerp(3.2, 1, E.inQuad(slam)), sx = 1, sy = 1, rot = lerp(-0.3, 0, E.inQuad(slam));
    if (d > 0) {
      const q = 0.14 * Math.exp(-d * 9) * Math.cos(d * 30);
      sx = 1 + q;
      sy = 1 - q;
      rot = 0.05 * Math.exp(-d * 6) * Math.sin(d * 20);
    }
    const mv = EZ.swap(prog(t, b(13), 0.45));
    let x = lerp(A2.p0[0], A2.p1[0], mv), y = lerp(A2.p0[1], A2.p1[1], mv) + Math.sin(t * 2.2) * 8;
    s *= lerp(A2.p0[2], A2.p1[2], mv);
    rot += (EZ.swap(prog(t, b(13) + 0.01, 0.45)) - mv) * -3;
    const sh = E.inCubic(prog(t, 10.4, BR(5) - 10.4));
    const L = proj(...CITIES.Lagos);
    x = lerp(x, L[0], sh);
    y = lerp(y, L[1], sh);
    s *= lerp(1, 0.035, sh);
    return { x, y, s, sx, sy, rot };
  }
  const BURST = Array.from({ length: 46 }, (_, i) => {
    const r = rng(900 + i);
    return { a: r() * TAU, v: 500 + r() * 1300, s: 8 + r() * 16, c: [P.gold, P.purple, P.orchid, P.white][i % 4], spin: (r() - 0.5) * 20 };
  });
  function s2(ctx, t) {
    bg(ctx, P.plum);
    const ph = phoneState(t);
    glow(ctx, ph.x, ph.y, 900, P.purple, 0.38);
    // faint circuit traces drifting behind (continuity from act 1)
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = P.orchid;
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(-((t - BR(3)) * 60) % 400, 0);
    S1.rows.forEach((y, k) => drawPath(ctx, rowPts(k, 1, W + 440), 1));
    ctx.restore();
    ctx.globalAlpha = 1;

    // drop: shock rings + confetti
    const d = t - BR(3);
    if (d > 0 && d < 1.2) {
      for (const [col, dl] of [[P.gold, 0], [P.orchid, 0.06], [P.purple, 0.12]]) {
        const p = prog(d, dl, 0.7);
        if (p > 0 && p < 1) ring(ctx, A2.p0[0], A2.p0[1], 120 + 1100 * E.outExpo(p), 10 * (1 - p), rgba(col, 1 - p));
      }
      for (const c of BURST) {
        const ex = (1 - Math.exp(-3 * d)) / 3;
        const x = A2.p0[0] + Math.cos(c.a) * c.v * ex, y = A2.p0[1] + Math.sin(c.a) * c.v * ex + 500 * d * d;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(c.spin * d);
        ctx.globalAlpha = clamp(1.2 - d);
        ctx.fillStyle = c.c;
        ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    drawPhone(ctx, t, ph.x, ph.y, ph.s, ph.rot, ph.sx, ph.sy);

    // bar 3 lockup
    const out3 = E.inCubic(prog(t, BR(4) - 0.02, 0.2));
    if (out3 < 1) {
      ctx.save();
      ctx.translate(0, -120 * out3);
      ctx.globalAlpha = 1 - out3;
      const X = A2.X, ls = A2.ls;
      riseText(ctx, '2017.', X, A2.y17, EZ.snap(prog(t, b(13), 0.45)), { size: A2.s17, color: P.gold });
      riseText(ctx, "NIGERIA'S FIRST", X, A2.ly[0], EZ.snap(prog(t, b(14), 0.45)), { size: ls, stretch: 'condensed', color: P.white });
      riseText(ctx, 'FULLY DIGITAL', X, A2.ly[1], EZ.snap(prog(t, b(14.5), 0.45)), { size: ls, stretch: 'condensed', color: P.white });
      const bw = riseText(ctx, 'BANK.', X, A2.ly[2], EZ.snap(prog(t, b(15), 0.45)), { size: ls, stretch: 'condensed', color: P.white });
      ctx.fillStyle = P.purple;
      ctx.fillRect(X, A2.ly[2] + ls * 0.22, (bw + 10) * EZ.swap(prog(t, b(15.5), 0.25)), ls * 0.11);
      ctx.restore();
    }
    // bar 4 stack — each noun struck through by the thread on the off-beat
    const out4 = E.inCubic(prog(t, 10.42, 0.25));
    if (t > BR(4) && out4 < 1) {
      ctx.save();
      ctx.translate(-260 * out4, 0);
      ctx.globalAlpha = 1 - out4;
      const X = A2.X, ss = A2.ss;
      [['NO ', 'BRANCH.', P.orchid, 16], ['NO ', 'PAPER.', P.orchid, 17], ['NO ', 'WAHALA.', P.gold, 18]].forEach(([a, n, col, beat], i) => {
        const y = A2.sy[i], p = EZ.snap(prog(t, b(beat), 0.4));
        const wa = riseText(ctx, a, X, y, p, { size: ss, stretch: 'condensed', color: P.white });
        // WAHALA jitters like trouble before it gets struck out
        const jit = beat === 18 ? Math.exp(-(t - b(18)) * 5) * 6 : 0;
        const wn = riseText(ctx, n, X + wa + noise(t * 40) * jit, y + noise(t * 40 + 9) * jit, p, { size: ss, stretch: 'condensed', color: col });
        const sp = EZ.swap(prog(t, b(beat + 0.5), 0.18));
        if (sp > 0) {
          ctx.fillStyle = P.purple;
          ctx.fillRect(X + wa - 8, y - ss * 0.41, (wn + 16) * sp, ss * 0.114);
        }
      });
      riseText(ctx, 'Phone number + BVN. Account open in minutes.', X, A2.cap[0], EZ.snap(prog(t, b(19), 0.4)), { size: A2.cap[1], weight: 500, color: P.orchid });
      ctx.restore();
    }

    const fl = d > 0 ? 0.85 * Math.exp(-d * 14) : 0;
    if (fl > 0.01) {
      ctx.fillStyle = rgba('#F4C6E6', fl);
      ctx.fillRect(-100, -100, W + 200, H + 200);
    }
  }

  /* ═════════════════════ ACT 3 · MONEY IN MOTION (bars 5–8) ═════════════════════ */

  let MAPPTS = null, MAPDOTS = null, MAPCEN = null, MAPPOLAR = null;
  const NP = 240;
  function buildMap() {
    MAPPTS = NIGERIA.map(([lon, lat]) => proj(lon, lat));
    const path = new Path2D();
    MAPPTS.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
    const c = makeCanvas(8, 8).getContext('2d');
    MAPDOTS = [];
    const xs = MAPPTS.map((p) => p[0]), ys = MAPPTS.map((p) => p[1]);
    for (let y = Math.min(...ys); y < Math.max(...ys); y += 22) for (let x = Math.min(...xs); x < Math.max(...xs); x += 22) if (c.isPointInPath(path, x, y)) MAPDOTS.push([x, y]);
    let sx = 0, sy = 0;
    for (const [x, y] of MAPDOTS) {
      sx += x;
      sy += y;
    }
    MAPCEN = [sx / MAPDOTS.length, sy / MAPDOTS.length];
    // polar radius table about the centroid — lets the country morph into a savings ring
    MAPPOLAR = new Float32Array(NP);
    for (let k = 0; k < NP; k++) {
      const a = (k / NP) * TAU, dx = Math.cos(a), dy = Math.sin(a);
      let best = 0;
      for (let i = 0; i < MAPPTS.length; i++) {
        const A = MAPPTS[i], B = MAPPTS[(i + 1) % MAPPTS.length];
        const ax = A[0] - MAPCEN[0], ay = A[1] - MAPCEN[1], ex = B[0] - A[0], ey = B[1] - A[1];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const r = (ax * ey - ay * ex) / den, s = (ax * dy - ay * dx) / den;
        if (r > 0 && s >= 0 && s <= 1 && r > best) best = r;
      }
      MAPPOLAR[k] = best;
    }
  }
  const ARCS = [
    ['Lagos', 'Abuja'], ['Lagos', 'Kano'], ['Lagos', 'Port Harcourt'], ['Lagos', 'Enugu'],
    ['Abuja', 'Maiduguri'], ['Kano', 'Sokoto'], ['Port Harcourt', 'Calabar'], ['Ibadan', 'Jos'], ['Lagos', 'Ilorin'],
  ].map(([a, c], i) => ({ a, c, t0: b(20.5) + i * b(0.5) }));
  function arcPts(A, B, n = 40) {
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    const cx = mx + (dy / L) * L * 0.32, cy = my - (dx / L) * L * 0.32 * Math.sign(dx || 1);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push([(1 - u) * (1 - u) * A[0] + 2 * u * (1 - u) * cx + u * u * B[0], (1 - u) * (1 - u) * A[1] + 2 * u * (1 - u) * cy + u * u * B[1]]);
    }
    return pts;
  }
  const RPOS = pick([[470, 640], [960, 640], [1450, 640]], [[200, 640], [540, 640], [880, 640]], [[540, 820], [540, 1210], [540, 1600]]);
  const RINGS = [
    { name: 'Owambe fit', goal: 120000 },
    { name: 'New laptop', goal: 450000 },
    { name: "Mama's birthday", goal: 80000 },
  ].map((r, i) => ({ ...r, x: RPOS[i][0], y: RPOS[i][1] }));
  const RR = 150; // rings are drawn in 150-unit space and scaled to fit the frame
  const RS = pick(1, 0.7, 0.87);

  const VB = pick([110, 250, 200, 330, 38], [70, 190, 150, 250, 30], [90, 330, 210, 420, 40]);
  function verb(ctx, t, word, t0, color, cap, capColor) {
    riseText(ctx, word, VB[0], VB[1], EZ.snap(prog(t, t0, 0.45)), { size: VB[2], color });
    if (cap) riseText(ctx, cap, VB[0] + 6, VB[3], EZ.snap(prog(t, t0 + BEAT, 0.4)), { size: VB[4], weight: 500, color: capColor });
  }

  function s3send(ctx, t) {
    bg(ctx, P.plum);
    const me = EZ.swap(prog(t, 12.5, BR(6) - 12.5)); // map → savings ring
    glow(ctx, MAPCEN[0], MAPCEN[1], 800, P.purple, 0.3 * (1 - me));
    // purple wipe that becomes SAVE's background
    const wp = E.inCubic(prog(t, 12.6, BR(6) - 12.6));
    if (wp > 0) {
      ctx.fillStyle = P.purple;
      disc(ctx, lerp(MAPCEN[0], RINGS[1].x, me), lerp(MAPCEN[1], RINGS[1].y, me), DIAG * 1.4 * wp);
    }
    const fade = 1 - E.outCubic(prog(t, 12.45, 0.25));

    // halftone country, rippling out from Lagos on every beat
    const L = proj(...CITIES.Lagos);
    const din = E.outCubic(prog(t, BR(5) + 0.15, 0.5));
    ctx.fillStyle = P.orchid;
    for (const [x, y] of MAPDOTS) {
      const dd = Math.hypot(x - L[0], y - L[1]);
      const wave = Math.max(0, Math.sin(dd / 60 - (t - BR(5)) * 9));
      ctx.globalAlpha = (0.18 + 0.35 * wave * wave) * din * fade;
      disc(ctx, x, y, 2.2 + 1.8 * wave);
    }
    ctx.globalAlpha = 1;

    // outline draws itself, then morphs into a circle
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (me <= 0) {
      ctx.strokeStyle = P.orchid;
      ctx.lineWidth = 3;
      drawPath(ctx, MAPPTS, E.outCubic(prog(t, BR(5), 0.6)), true);
    } else {
      const cx = lerp(MAPCEN[0], RINGS[1].x, me), cy = lerp(MAPCEN[1], RINGS[1].y, me);
      ctx.strokeStyle = mix(P.orchid, P.plum, me);
      ctx.globalAlpha = lerp(1, 0.35, me);
      ctx.lineWidth = lerp(3, 22 * RS, me);
      ctx.beginPath();
      for (let k = 0; k <= NP; k++) {
        const a = (k / NP) * TAU, r = lerp(MAPPOLAR[k % NP], RR * RS, me);
        k ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // cities
    Object.entries(CITIES).forEach(([name, ll], i) => {
      const [x, y] = proj(...ll);
      const a = E.outBack(prog(t, BR(5) + 0.25 + i * 0.03, 0.3), 2) * fade;
      if (a <= 0) return;
      ctx.fillStyle = name === 'Lagos' ? P.gold : P.white;
      disc(ctx, x, y, (name === 'Lagos' ? 9 : 5) * a);
      const lit = ARCS.some((r) => r.c === name && t > r.t0 + 0.42);
      if (lit || name === 'Lagos') {
        setFont(ctx, MONO, 500, 17);
        ctx.fillStyle = rgba(P.white, 0.85 * fade);
        ctx.fillText(name.toUpperCase(), x + 14, y + 6);
      }
    });
    // Lagos heartbeat
    for (let k = 0; k < 2; k++) {
      const f = frac((t - BR(5)) / BEAT + k / 2);
      ring(ctx, L[0], L[1], 10 + f * 70, 2.5, rgba(P.gold, (1 - f) * 0.8 * fade));
    }

    // transfers: a naira coin rides each arc, trailing the thread
    for (const A of ARCS) {
      const p = EZ.swap(prog(t, A.t0, 0.42));
      if (p <= 0) continue;
      const pts = arcPts(proj(...CITIES[A.a]), proj(...CITIES[A.c]));
      const tail = clamp(p - 0.45);
      const seg = pts.filter((_, i) => i / (pts.length - 1) >= tail && i / (pts.length - 1) <= p);
      seg.unshift(pointAt(pts, tail));
      seg.push(pointAt(pts, p));
      const age = t - A.t0;
      ctx.strokeStyle = rgba(P.purple, fade * clamp(1.6 - age));
      ctx.lineWidth = 5;
      drawPath(ctx, seg, 1);
      ctx.strokeStyle = rgba(P.orchid, 0.25 * fade);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 8]);
      drawPath(ctx, pts, p);
      ctx.setLineDash([]);
      if (p < 1) {
        const [hx, hy] = pointAt(pts, p);
        glow(ctx, hx, hy, 40, P.gold, 0.5);
        coin(ctx, hx, hy, 15, fade);
      } else {
        const [ex, ey] = pts[pts.length - 1];
        const q = prog(t, A.t0 + 0.42, 0.5);
        if (q < 1) ring(ctx, ex, ey, 8 + 50 * E.outCubic(q), 3, rgba(P.gold, (1 - q) * fade));
      }
    }

    ctx.globalAlpha = fade;
    verb(ctx, t, 'SEND.', BR(5) + 0.02, P.white, 'Transfers in a tap.', P.orchid);
    ctx.globalAlpha = 1;
  }

  function s4save(ctx, t) {
    bg(ctx, P.purple);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(28,6,32,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let k = 1; k <= 6; k++) ring(ctx, CX, RINGS[1].y, 180 + k * 120, 1.5, rgba(P.white, 0.05));

    RINGS.forEach((R, i) => {
      const pop = i === 1 ? 1 : E.outBack(prog(t, BR(6) + (i === 0 ? 0 : 0.09), 0.35), 1.8);
      if (pop <= 0) return;
      const t0 = b(24.5) + i * b(0.5);
      const p = E.inOutCubic(prog(t, t0, 0.9));
      const done = t - (t0 + 0.9);
      ctx.save();
      ctx.translate(R.x, R.y);
      ctx.scale(pop * RS, pop * RS);
      ring(ctx, 0, 0, RR, 22, rgba(P.plum, 0.35));
      if (p > 0) {
        ctx.strokeStyle = P.gold;
        ctx.lineWidth = 22 + (done > 0 ? 10 * Math.exp(-done * 10) : 0);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, RR, -Math.PI / 2, -Math.PI / 2 + TAU * p);
        ctx.stroke();
        const ha = -Math.PI / 2 + TAU * p;
        glow(ctx, Math.cos(ha) * RR, Math.sin(ha) * RR, 50, P.gold, 0.6 * (1 - p * p));
      }
      // coins drop in
      for (let j = 0; j < 4; j++) {
        const q = prog(t, t0 + j * 0.2 - 0.3, 0.3);
        if (q <= 0 || q >= 1) continue;
        coin(ctx, (j - 1.5) * 18, lerp(-560, 0, E.inQuad(q)), 16, 1 - E.inQuad(prog(q, 0.8, 0.2)));
      }
      setFont(ctx, MONO, 500, 16);
      ctx.letterSpacing = '3px';
      ctx.fillStyle = rgba(P.white, 0.7);
      ctx.textAlign = 'center';
      ctx.fillText('SAVED', 0, -38);
      ctx.letterSpacing = '0px';
      setFont(ctx, SANS, 800, 46);
      ctx.fillStyle = P.white;
      ctx.fillText('₦' + (Math.round((R.goal * p) / 100) * 100).toLocaleString('en-US'), 0, 22);
      setFont(ctx, SANS, 700, 32);
      ctx.fillText(R.name, 0, RR + 72);
      ctx.textAlign = 'left';
      if (done > 0) {
        const c = spring(done, 3, 0.4);
        ctx.fillStyle = P.gold;
        disc(ctx, RR * 0.72, -RR * 0.72, 30 * c);
        drawCheck(ctx, RR * 0.72, -RR * 0.72, 34 * c, P.plum, 6, 1);
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU, dd = E.outExpo(prog(done, 0, 0.5)) * 90;
          ctx.globalAlpha = 1 - prog(done, 0.1, 0.4);
          ctx.fillStyle = k % 2 ? P.gold : P.white;
          disc(ctx, Math.cos(a) * (RR + dd), Math.sin(a) * (RR + dd), 5);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    });
    verb(ctx, t, 'SAVE.', BR(6), P.white, 'Towards anything that matters.', '#F6D3EC');

    // diagonal cream wipe into PAY, led by a plum thread
    const wp = E.inOutCubic(prog(t, 14.72, BR(7) - 14.72));
    if (wp > 0) {
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(-0.5);
      const edge = lerp(-1400, 1400, wp);
      ctx.fillStyle = P.cream;
      ctx.fillRect(-1600, -1600, edge + 1600, 3200);
      ctx.fillStyle = P.plum;
      ctx.fillRect(edge - 6, -1600, 12, 3200);
      ctx.restore();
    }
  }

  function card(ctx, t, x, y, theta, s) {
    const w = 640, h = 404, c = Math.cos(theta);
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, Math.sin(theta) * 0.14, 0, 1, 0, 0);
    ctx.scale(s * Math.max(0.02, Math.abs(c)), s);
    ctx.fillStyle = 'rgba(28,6,32,0.25)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 16, -h / 2 + 28, w, h, 30);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 30);
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, '#C23A9E');
    g.addColorStop(1, '#4A0D44');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    if (c >= 0) {
      // the thread as guilloché
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 9; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const px = -w / 2 + (i / 40) * w;
          const py = -60 + k * 22 + Math.sin(i * 0.35 + k * 0.6) * 26;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      ctx.fillStyle = P.gold;
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 56, -52, 86, 66, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,40,0,0.45)';
      ctx.lineWidth = 2;
      for (const yy of [-30, -8]) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 56, yy);
        ctx.lineTo(-w / 2 + 142, yy);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(-w / 2 + 170, -19, 10 + k * 9, -0.7, 0.7);
        ctx.stroke();
      }
      setFont(ctx, SANS, 900, 50);
      ctx.fillStyle = P.white;
      ctx.textAlign = 'right';
      ctx.fillText('ALAT', w / 2 - 44, -h / 2 + 76);
      setFont(ctx, MONO, 500, 34);
      ctx.textAlign = 'left';
      ctx.fillText('••••  ••••  ••••  1945', -w / 2 + 56, 84);
      setFont(ctx, MONO, 500, 20);
      ctx.fillStyle = rgba(P.white, 0.8);
      ctx.fillText('YOUR NAME HERE', -w / 2 + 56, h / 2 - 44);
      ctx.textAlign = 'right';
      setFont(ctx, SANS, 800, 24);
      ctx.fillText('DEBIT', w / 2 - 44, h / 2 - 44);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = '#12031A';
      ctx.fillRect(-w / 2, -h / 2 + 50, w, 76);
      ctx.fillStyle = '#F4EAF1';
      ctx.fillRect(-w / 2 + 40, -h / 2 + 170, 380, 60);
    }
    ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - Math.abs(c))})`;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.restore();
  }
  const CD = pick([1150, 600, 1], [540, 690, 0.72], [540, 1150, 1]);
  function s5pay(ctx, t) {
    bg(ctx, P.cream);
    ctx.fillStyle = rgba(P.purple, 0.08);
    for (let y = 30; y < H; y += 40) for (let x = 30 + ((y / 40) % 2) * 20; x < W; x += 40) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    verb(ctx, t, 'PAY.', BR(7), P.plum, 'Tap. Done.', P.purple);

    const e = EZ.spin(prog(t, BR(7), 0.95));
    const theta = lerp(-3 * Math.PI, 0, e);
    const tap = t - b(30);
    let s = 1 + (tap > 0 ? 0.08 * Math.exp(-tap * 9) * Math.sin(Math.min(tap * 26, Math.PI)) : 0);
    const exit = E.inBack(prog(t, 16.8, 0.3), 1.6);
    const cs = CD[2];
    const x = lerp(W + 500, CD[0], e) - exit * 200, y = CD[1] + Math.sin(t * 2) * 6 + exit * 900;
    // contactless waves
    if (tap > 0) {
      for (let k = 0; k < 3; k++) {
        const q = prog(tap, k * 0.08, 0.5);
        if (q <= 0 || q >= 1) continue;
        ctx.strokeStyle = rgba(P.purple, 1 - q);
        ctx.lineWidth = 8 * (1 - q) + 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x - 150 * cs, y - 19 * cs, (60 + q * 260) * cs, -0.8, 0.8);
        ctx.stroke();
      }
    }
    card(ctx, t, x, y, theta + exit * 1.2, s * cs);
    // paid pill
    const pp = E.outBack(prog(t, b(30) + 0.08, 0.35), 2);
    if (pp > 0) {
      ctx.save();
      ctx.translate(CD[0] - exit * 200, CD[1] - 270 * cs + exit * 900);
      ctx.scale(pp * cs, pp * cs);
      ctx.fillStyle = P.plum;
      ctx.beginPath();
      ctx.roundRect(-270, -44, 540, 88, 44);
      ctx.fill();
      ctx.fillStyle = P.gold;
      disc(ctx, -222, 0, 28);
      drawCheck(ctx, -222, 0, 32, P.plum, 6, E.outCubic(prog(t, b(30) + 0.15, 0.2)));
      setFont(ctx, SANS, 700, 32);
      ctx.fillStyle = P.white;
      ctx.fillText('Paid ₦4,500 · Suya spot', -176, 11);
      ctx.restore();
    }
    // plum bars rise to wipe into GROW — they become the skyline
    const bars = SKY.length;
    for (let i = 0; i < bars; i++) {
      const q = E.inCubic(prog(t, 16.86 + i * 0.008, BR(8) - 16.86 - 0.19));
      if (q <= 0) continue;
      const B = SKY[i];
      ctx.fillStyle = P.night;
      ctx.fillRect(B.x - 1, H - (H + 40) * q, B.w + 2, (H + 40) * q);
    }
  }

  // skyline: buildings, windows, bridge — shared by GROW and FOR THE
  const SKY = [];
  {
    const r = rng(1945);
    let x = 0, i = 0;
    while (x < W) {
      const w = 60 + Math.floor(r() * 60);
      const tall = r() < 0.15;
      const h = (150 + (x / W) * 330 + r() * 120 + (tall ? 180 : 0)) * pick(1, 0.85, 1.7);
      const wins = [];
      for (let wy = 26; wy < h - 20; wy += 26) for (let wx = 12; wx < w - 14; wx += 18) wins.push({ x: wx, y: wy, t: r(), on: r() < 0.55 });
      SKY.push({ x, w, h, i, spire: r() < 0.3, wins });
      x += w + 4;
      i++;
    }
  }
  const HOR = H - pick(140, 140, 330);
  const SUNX = W * 0.703;
  function skyline(ctx, t, night) {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, HOR);
    g.addColorStop(0, P.plum);
    g.addColorStop(0.45, mix('#5A1052', '#2A0830', night));
    g.addColorStop(0.8, mix('#E0567A', '#5A1052', night));
    g.addColorStop(1, mix(P.gold, '#8A2A70', night));
    ctx.fillStyle = g;
    ctx.fillRect(-100, -100, W + 200, HOR + 100);
    // stars
    if (night > 0) {
      const r = rng(77);
      for (let i = 0; i < 90; i++) {
        const x = r() * W, y = r() * HOR * 0.55, tw = 0.5 + 0.5 * Math.sin(t * 6 + i);
        ctx.fillStyle = rgba(P.white, night * 0.7 * tw);
        disc(ctx, x, y, 1.2 + r() * 1.2);
      }
    }
    // sun
    const sunY = lerp(HOR - 120, HOR + 140, night);
    glow(ctx, SUNX, sunY, 420, P.gold, 0.55 * (1 - night * 0.8));
    ctx.fillStyle = mix(P.gold, '#FF8A3D', night);
    disc(ctx, SUNX, sunY, 130);
    // buildings rise from the wipe bars to their heights, staggered
    const grow = (B) => spring(t - BR(8) - B.i * 0.018, 2.2, 0.55);
    const tops = [];
    for (const B of SKY) {
      const gh = lerp(H + 40, B.h, clamp(grow(B), 0, 1.3));
      const top = HOR - gh;
      tops.push([B.x + B.w / 2, top]);
      ctx.fillStyle = P.night;
      ctx.fillRect(B.x, top, B.w, HOR - top + 200);
      if (B.spire) ctx.fillRect(B.x + B.w / 2 - 2, top - 40, 4, 40);
      // windows light up on sixteenths
      for (const wn of B.wins) {
        if (!wn.on) continue;
        const lt = BR(8) + 0.5 + wn.t * 1.5;
        if (t < lt) continue;
        const fl = t < BR(9) ? 1 : 0.7 + 0.3 * Math.sin(t * 3 + wn.t * 20);
        ctx.fillStyle = rgba(P.gold, 0.85 * fl);
        ctx.fillRect(B.x + wn.x, top + wn.y, 7, 11);
      }
    }
    // water + bridge
    const wg = ctx.createLinearGradient(0, HOR, 0, H);
    wg.addColorStop(0, '#2A0830');
    wg.addColorStop(1, P.plum);
    ctx.fillStyle = wg;
    ctx.fillRect(-100, HOR, W + 200, H - HOR + 100);
    ctx.fillStyle = rgba(P.gold, 0.4 * (1 - night * 0.7));
    for (let i = 0; i < 26; i++) {
      const y = HOR + 30 + i * 5, w = (140 - i * 4) * (0.6 + 0.4 * Math.sin(t * 4 + i));
      ctx.fillRect(SUNX - w / 2, y, w, 2);
    }
    const deck = HOR + 25;
    const bp = E.outCubic(prog(t, BR(8) + 0.3, 0.8));
    ctx.fillStyle = '#0B0110';
    ctx.fillRect(0, deck, W * bp, 14);
    for (let x = 40; x < W * bp; x += 96) ctx.fillRect(x, deck + 14, 8, H - deck);
    // headlights
    for (let i = 0; i < 28; i++) {
      const dir = i % 2 ? 1 : -1, sp = 260 + hash(i) * 200;
      const x = (((hash(i + 50) * W + dir * t * sp) % W) + W) % W;
      if (x > W * bp) continue;
      ctx.fillStyle = dir > 0 ? '#FFF1C9' : '#FF4A6A';
      ctx.fillRect(x, deck + (dir > 0 ? 3 : 8), 14, 3);
    }
    return tops;
  }
  function s6grow(ctx, t) {
    bg(ctx, P.plum);
    const night = E.inOutCubic(prog(t, 18.9, 0.8));
    const tops = skyline(ctx, t, night);
    // growth line across the rooftops — the thread becomes a chart
    const lp = E.inOutCubic(prog(t, BR(8) + 0.35, 1.2));
    if (lp > 0 && t < BR(9) + 0.3) {
      const pts = tops.map(([x, y]) => [x, y - 40]);
      ctx.globalAlpha = 1 - E.inCubic(prog(t, BR(9) - 0.1, 0.4));
      ctx.strokeStyle = P.white;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      drawPath(ctx, pts, lp);
      const [hx, hy] = pointAt(pts, lp);
      glow(ctx, hx, hy, 60, P.gold, 0.8);
      ctx.fillStyle = P.gold;
      disc(ctx, hx, hy, 11);
      ctx.globalAlpha = 1;
    }
    verb(ctx, t, 'GROW.', BR(8) + 0.05, P.white, 'Build what lasts.', '#F6D3EC');
  }
  const WORDS = [['HUSTLERS.', P.white], ['BUILDERS.', P.orchid], ['DREAMERS.', P.gold], ['FIRST-TIMERS.', P.white]];
  const FT = pick({ y: 300, ls: 54, wy: 505, ws: 190 }, { y: 250, ls: 40, wy: 410, ws: 120 }, { y: 640, ls: 50, wy: 840, ws: 150 });
  function s7for(ctx, t) {
    bg(ctx, P.plum);
    skyline(ctx, t, 1);
    ctx.fillStyle = 'rgba(18,3,26,0.35)';
    ctx.fillRect(0, 0, W, H);
    const a = EZ.snap(prog(t, BR(9), 0.4));
    setFont(ctx, SANS, 700, FT.ls);
    ctx.letterSpacing = '18px';
    ctx.textAlign = 'center';
    ctx.globalAlpha = a;
    ctx.fillStyle = P.orchid;
    ctx.fillText('FOR THE', CX + 9, FT.y - (1 - a) * 30);
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'left';
    // slot-machine roll between the four words
    ctx.save();
    ctx.beginPath();
    const kf = FT.ws / 190;
    ctx.rect(0, FT.wy - 175 * kf, W, 230 * kf);
    ctx.clip();
    WORDS.forEach(([wd, col], i) => {
      const tin = b(36 + i), tout = b(37 + i);
      const pin = i === 0 ? EZ.snap(prog(t, tin, 0.35)) : spring(t - tin + 0.02, 3.2, 0.5);
      const pout = i === 3 ? 0 : EZ.swap(prog(t, tout - 0.02, 0.2));
      if (pin <= 0 || pout >= 1) return;
      const y = FT.wy + ((1 - pin) * 230 - pout * 230) * kf;
      setFont(ctx, SANS, 900, FT.ws, 'condensed');
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.fillText(wd, CX, y);
      if (i === 3) {
        const w = ctx.measureText(wd).width;
        ctx.fillStyle = P.purple;
        ctx.fillRect(CX - w / 2, y + 16 * kf, w * EZ.swap(prog(t, b(39.5), 0.25)), 14 * kf);
      }
    });
    ctx.restore();
    ctx.textAlign = 'left';
  }

  /* ═════════════════════ ACT 4 · FOR EVERY NIGERIAN (bars 9–11) ═════════════════════ */

  const GREET = [
    { word: 'Ẹ kú iṣẹ́', lang: 'YORÙBÁ', mean: '“well done”', bg: P.purple, fg: P.white, edge: P.gold },
    { word: 'Nnọọ', lang: 'IGBO', mean: '“welcome”', bg: P.gold, fg: P.plum, edge: P.purple },
    { word: 'Sannu', lang: 'HAUSA', mean: '“hello”', bg: P.cream, fg: P.purple, edge: P.plum },
    { word: 'How far?', lang: 'PIDGIN', mean: '“what’s up?”', bg: P.plum, fg: P.gold, edge: P.purple },
  ];
  const GL = pick({ w: 600, s: 250, l: 330, m: 760 }, { w: 590, s: 170, l: 360, m: 730 }, { w: 1010, s: 190, l: 740, m: 1170 });
  function greetCard(ctx, t, i) {
    const G = GREET[i], d = t - b(40 + i);
    bg(ctx, G.bg);
    const s = 1 + 0.18 * Math.exp(-Math.max(0, d) * 9);
    ctx.save();
    ctx.translate(CX, GL.w);
    ctx.scale(s, s);
    ctx.rotate(0.05 * Math.exp(-Math.max(0, d) * 9));
    setFont(ctx, SANS, 900, GL.s);
    ctx.fillStyle = G.fg;
    ctx.textAlign = 'center';
    ctx.fillText(G.word, 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    const la = EZ.snap(prog(d, 0.05, 0.3));
    setFont(ctx, MONO, 600, 24);
    ctx.letterSpacing = '8px';
    ctx.globalAlpha = la;
    ctx.fillStyle = G.fg;
    ctx.fillText(G.lang, CX + 4, GL.l - (1 - la) * 20);
    ctx.letterSpacing = '0px';
    setFont(ctx, SERIF, 500, 54);
    ctx.fillText(G.mean, CX, GL.m + (1 - la) * 20);
    setFont(ctx, MONO, 500, 18);
    ctx.globalAlpha = la * 0.6;
    ctx.fillText(`0${i + 1} / 04`, CX, H - 80);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
  function s8greet(ctx, t) {
    let k = -1;
    for (let i = 0; i < 4; i++) if (t >= b(40 + i) - 0.1) k = i;
    if (k < 0) return s7for(ctx, t);
    const p = EZ.swap(prog(t, b(40 + k) - 0.1, 0.24));
    if (p >= 1) return greetCard(ctx, t, k);
    // the previous card sits underneath; the new one slashes across it on the beat
    if (k === 0) s7for(ctx, t);
    else greetCard(ctx, t, k - 1);
    const dir = k % 2 ? -1 : 1;
    const edge = lerp(-1500, 1500, p);
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(0.32 * dir);
    ctx.scale(dir, 1);
    ctx.beginPath();
    ctx.rect(-1700, -1700, edge + 1700, 3400);
    ctx.scale(dir, 1);
    ctx.rotate(-0.32 * dir);
    ctx.translate(-CX, -CY);
    ctx.clip();
    greetCard(ctx, t, k);
    ctx.restore();
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(0.32 * dir);
    ctx.scale(dir, 1);
    ctx.fillStyle = GREET[k].edge;
    ctx.fillRect(edge - 10, -1700, 20, 3400);
    ctx.restore();
  }

  const RECEIPT = [
    ['c', 'WEMA BANK', 34, 800],
    ['c', 'RECEIPT OF FIRSTS', 20, 500],
    ['-'],
    ['r', '1945', 'BUILT FOR NIGERIANS'],
    ['r', '1969', 'RENAMED WEMA BANK'],
    ['r', '2017', '1ST FULLY DIGITAL BANK'],
    ['r', 'XPLORE', '1ST TEEN BANKING APP'],
    ['-'],
    ['r', 'YEARS MOVING FIRST', '81'],
    ['r', 'NEXT FIRST', 'YOU'],
    ['-'],
    ['c', 'THANK YOU FOR BANKING FIRST', 18, 500],
  ];
  const RC = { x: CX, w: 620, lh: 46, pad: 36, zoom: pick(1.3, 1.05, 1.45), zy: pick(1000, 1010, 1560) };
  RC.slot = RC.zy - 40;
  const rcZoom = (ctx) => {
    ctx.translate(RC.x, RC.zy);
    ctx.scale(RC.zoom, RC.zoom);
    ctx.translate(-RC.x, -RC.zy);
  };
  function receiptLayout(t) {
    const f = (t - b(44)) / 0.134;
    const n = clamp(f, 0, RECEIPT.length);
    const fl = Math.floor(n);
    const feed = (fl + E.outCubic(frac(n))) * RC.lh;
    return { n, feed: n >= RECEIPT.length ? RECEIPT.length * RC.lh : feed };
  }
  function receiptLines(t) {
    const { feed } = receiptLayout(t);
    const top = RC.slot - RC.pad - feed; // paper top rises as lines print
    return RECEIPT.map((L, k) => ({ L, y: top + RC.pad + (k + 0.72) * RC.lh }));
  }
  function s9receipt(ctx, t, collapse = 0) {
    bg(ctx, P.plum);
    glow(ctx, CX, 600, 800, P.purple, 0.3);
    const { n, feed } = receiptLayout(t);
    const x0 = RC.x - RC.w / 2, x1 = RC.x + RC.w / 2;
    const top = RC.slot - RC.pad - feed;
    ctx.save();
    rcZoom(ctx);
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(-0.02 * (1 - collapse));
    ctx.translate(-CX, -CY);
    ctx.globalAlpha = 1 - collapse;
    // paper with a torn zigzag top
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x0 + 14, top + 14, RC.w, RC.slot - top);
    ctx.fillStyle = P.paper;
    ctx.beginPath();
    ctx.moveTo(x0, RC.slot);
    ctx.lineTo(x0, top);
    for (let x = x0, i = 0; x <= x1; x += 15, i++) ctx.lineTo(x, top + (i % 2 ? 9 : 0));
    ctx.lineTo(x1, RC.slot);
    ctx.fill();
    ctx.globalAlpha = 1;
    receiptLines(t).forEach(({ L, y }, k) => {
      if (k >= n) return;
      const a = clamp(n - k) * (1 - collapse);
      ctx.globalAlpha = a;
      ctx.fillStyle = P.plum;
      if (L[0] === '-') {
        setFont(ctx, MONO, 500, 22);
        ctx.fillText('- '.repeat(22), x0 + 34, y);
      } else if (L[0] === 'c') {
        setFont(ctx, MONO, L[3], L[2]);
        ctx.textAlign = 'center';
        ctx.fillText(L[1], RC.x, y);
        ctx.textAlign = 'left';
      } else {
        setFont(ctx, MONO, 700, 22);
        ctx.fillText(L[1], x0 + 34, y);
        setFont(ctx, MONO, 500, 22);
        ctx.textAlign = 'right';
        const hi = L[2] === 'YOU';
        if (hi) {
          const w = ctx.measureText('YOU').width + 20;
          ctx.fillStyle = P.purple;
          ctx.fillRect(x1 - 34 - w + 10, y - 26, w * EZ.swap(prog(t, b(46.5), 0.2)), 36);
          ctx.fillStyle = prog(t, b(46.5) + 0.1, 0.01) > 0 ? P.white : P.plum;
          setFont(ctx, MONO, 800, 22);
        }
        ctx.fillText(L[2], x1 - 34, y);
        ctx.textAlign = 'left';
        if (!hi && L[1].length < 7) {
          ctx.fillStyle = rgba(P.plum, 0.3);
          const wl = textW(ctx, L[1], MONO, 700, 22), wr = textW(ctx, L[2], MONO, 500, 22);
          for (let x = x0 + 34 + wl + 12; x < x1 - 34 - wr - 10; x += 10) ctx.fillRect(x, y - 6, 3, 3);
        }
      }
      ctx.globalAlpha = 1;
    });
    // the 1945 stamp comes back to sign it off
    const st = prog(t, b(47) - 0.1, 0.1);
    if (st > 0) {
      const land = t - b(47);
      const s = land > 0 ? 1 + 0.06 * Math.exp(-land * 14) * Math.cos(land * 40) : lerp(2.2, 1, E.inQuad(st));
      ctx.save();
      ctx.translate(RC.x + 290, top + 540);
      ctx.rotate(0.22);
      ctx.scale(s * 0.72, s * 0.72);
      ctx.globalAlpha = st * 0.9 * (1 - collapse);
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(stamp2Tex, -200, -200);
      ctx.restore();
    }
    ctx.restore();
    // printer mouth
    ctx.globalAlpha = 1 - collapse;
    ctx.fillStyle = '#0B0110';
    ctx.beginPath();
    ctx.roundRect(RC.x - 400, RC.slot - 6, 800, 90, 26);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(RC.x - 330, RC.slot - 2, 660, 8);
    ctx.fillStyle = frac(t * 4) < 0.5 || n >= RECEIPT.length ? '#7CFFB2' : '#1F5A3A';
    disc(ctx, RC.x + 360, RC.slot + 40, 6);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ═════════════════════ ACT 5 · RESOLVE (bars 12–13) ═════════════════════ */

  const WPTS = [[-1, -0.8], [-0.52, 0.8], [0, -0.25], [0.52, 0.8], [1, -0.8]];
  const LOCK = {
    wm: 'Wema Bank',
    ...pick(
      { v: false, size: 160, markS: 150, gap: 60, my: 450, tagY: 690, tagS: 96, ctaY: 820, ctaS: 44, btnY: 910, btnW: 660, btnH: 80, btnF: 30, fineY: 1040, fineS: 15 },
      { v: false, size: 104, markS: 96, gap: 40, my: 380, tagY: 560, tagS: 66, ctaY: 690, ctaS: 32, btnY: 780, btnW: 540, btnH: 64, btnF: 23, fineY: 1045, fineS: 11 },
      { v: true, size: 150, markS: 150, my: 620, wy: 930, tagY: 1110, tagS: 92, ctaY: 1330, ctaS: 44, btnY: 1430, btnW: 760, btnH: 84, btnF: 30, fineY: 1860, fineS: 14 }
    ),
  };
  function buildLock(ctx) {
    LOCK.ww = textW(ctx, LOCK.wm, SANS, 800, LOCK.size);
    if (LOCK.v) {
      // tall frame: mark above, wordmark centred beneath it
      LOCK.mx = CX;
      LOCK.wx = CX - LOCK.ww / 2;
      LOCK.start = [CX, 860];
    } else {
      const markW = LOCK.markS * 2, total = markW + LOCK.gap + LOCK.ww;
      LOCK.mx = CX - total / 2 + markW / 2;
      LOCK.wx = CX - total / 2 + markW + LOCK.gap;
      LOCK.wy = LOCK.my + LOCK.size * 0.36;
      LOCK.start = [CX, LOCK.my];
    }
  }
  function wMark(ctx, x, y, s, p, t) {
    const pts = WPTS.map(([u, v]) => [x + u * s, y + v * s]);
    const pts2 = WPTS.map(([u, v]) => [x + u * s + s * 0.16, y + v * s + s * 0.02]);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const g = ctx.createLinearGradient(x - s, y, x + s, y);
    g.addColorStop(0, '#D94AAE');
    g.addColorStop(1, P.purple);
    ctx.strokeStyle = g;
    ctx.lineWidth = s * 0.21;
    drawPath(ctx, pts, p);
    ctx.strokeStyle = P.orchid;
    ctx.lineWidth = s * 0.06;
    drawPath(ctx, pts2, clamp((p - 0.12) / 0.88));
    // shimmer
    const sh = prog(t, b(51), 0.45);
    if (sh > 0 && sh < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gx = lerp(x - s * 1.4, x + s * 1.4, sh);
      const sg = ctx.createLinearGradient(gx - 60, 0, gx + 60, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.7)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = sg;
      ctx.lineWidth = s * 0.21;
      drawPath(ctx, pts, 1);
      ctx.restore();
    }
  }
  function s10resolve(ctx, t) {
    const c = E.inOutCubic(prog(t, BR(12), 0.3));
    if (c < 1) s9receipt(ctx, t, c);
    else bg(ctx, P.plum);
    glow(ctx, CX, LOCK.my, 900, P.purple, 0.35 * c);
    // both eras whisper in the background: ledger rules and circuit traces
    ctx.globalAlpha = 0.06 * c;
    ctx.strokeStyle = P.orchid;
    ctx.lineWidth = 2;
    S1.rows.forEach((y, k) => drawPath(ctx, rowPts(k, k % 2), 1));
    ctx.globalAlpha = 1;

    // receipt lines collapse into bars, bars into one thread
    if (c > 0 && t < BR(12) + 0.45) {
      receiptLines(t).forEach(({ y }, k) => {
        const q = E.inOutCubic(prog(t, BR(12) + k * 0.008, 0.3));
        const w = lerp(RC.w - 68, 0, E.inCubic(prog(t, BR(12) + 0.2, 0.25)));
        const yz = RC.zy + (y - RC.zy) * RC.zoom, wz = w * lerp(RC.zoom, 1, q);
        ctx.fillStyle = P.purple;
        ctx.fillRect(CX - wz / 2, lerp(yz, LOCK.start[1], q) - 5, wz, 10);
      });
    }
    // the W draws itself, then slides into the lockup
    const wp = E.inOutCubic(prog(t, BR(12) + 0.35, 0.5));
    const mv = EZ.swap(prog(t, b(49), 0.45));
    const mx = lerp(LOCK.start[0], LOCK.mx, mv), my = lerp(LOCK.start[1], LOCK.my, mv), ms = lerp(LOCK.markS * 1.35, LOCK.markS, mv);
    let pulse = 1;
    for (const tp of [b(55)]) if (t > tp) pulse += 0.06 * Math.exp(-(t - tp) * 8) * Math.sin(Math.min((t - tp) * 20, Math.PI));
    if (wp > 0) wMark(ctx, mx, my, ms * pulse, wp, t);

    // wordmark wipes in behind the moving mark
    if (mv > 0) {
      const rev = lerp(LOCK.wx - 40, LOCK.wx + LOCK.ww + 40, EZ.swap(prog(t, b(49) + 0.1, 0.5)));
      ctx.save();
      ctx.beginPath();
      ctx.rect(LOCK.wx - 20, 0, rev - LOCK.wx + 20, H);
      ctx.clip();
      setFont(ctx, SANS, 800, LOCK.size);
      ctx.fillStyle = P.white;
      ctx.fillText(LOCK.wm, LOCK.wx, LOCK.wy);
      ctx.restore();
    }
    // tagline in the 1945 serif — the loop closes
    const tg = 'First is a habit.';
    const L = LOCK;
    typeOn(ctx, tg, CX, L.tagY, t, b(50), 0.035, { fam: SERIF, weight: 500, size: L.tagS, color: P.gold, align: 'center' });
    // the underline is the thread — the talking drum makes it speak
    const tw = textW(ctx, tg, SERIF, 500, L.tagS);
    const u0 = CX - tw / 2 + textW(ctx, 'First is a ', SERIF, 500, L.tagS), u1 = CX + tw / 2 - textW(ctx, '.', SERIF, 500, L.tagS);
    const up = E.outCubic(prog(t, b(50.8), 0.3));
    if (up > 0) {
      const amp = drum(t) * 10;
      const pts = [];
      for (let i = 0; i <= 60; i++) pts.push([lerp(u0, u1, i / 60), L.tagY + L.tagS * 0.27 + Math.sin(i * 0.9 - t * 30) * amp * Math.sin((Math.PI * i) / 60)]);
      ctx.strokeStyle = P.purple;
      ctx.lineWidth = L.tagS * 0.083;
      ctx.lineCap = 'round';
      drawPath(ctx, pts, up);
    }
    // CTA
    riseText(ctx, 'Oya, move first.', CX, L.ctaY, EZ.snap(prog(t, b(52), 0.4)), { size: L.ctaS, weight: 700, color: P.white, align: 'center' });
    const bp = E.outBack(prog(t, b(52.5), 0.35), 1.8);
    if (bp > 0) {
      const press = t > b(53) ? 1 - 0.05 * Math.exp(-(t - b(53)) * 10) * Math.sin(Math.min((t - b(53)) * 25, Math.PI)) : 1;
      ctx.save();
      ctx.translate(CX, L.btnY);
      ctx.scale(bp * press, bp * press);
      ctx.fillStyle = P.purple;
      ctx.beginPath();
      ctx.roundRect(-L.btnW / 2, -L.btnH / 2, L.btnW, L.btnH, L.btnH / 2);
      ctx.fill();
      setFont(ctx, SANS, 700, L.btnF);
      ctx.fillStyle = P.white;
      ctx.textAlign = 'center';
      ctx.fillText('Open an ALAT account in minutes  →', 0, L.btnF * 0.36);
      ctx.textAlign = 'left';
      ctx.restore();
      const rq = prog(t, b(53), 0.5);
      if (rq > 0 && rq < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(CX - L.btnW / 2, L.btnY - L.btnH / 2, L.btnW, L.btnH, L.btnH / 2);
        ctx.clip();
        ctx.fillStyle = rgba(P.white, 0.3 * (1 - rq));
        disc(ctx, CX + L.btnW * 0.3, L.btnY, 600 * E.outCubic(rq));
        ctx.restore();
      }
    }
    const fp = E.outCubic(prog(t, b(52.5), 0.4));
    if (fp > 0) {
      setFont(ctx, MONO, 500, L.fineS);
      ctx.letterSpacing = '3px';
      ctx.fillStyle = rgba(P.white, 0.45 * fp);
      ctx.textAlign = 'center';
      ctx.fillText('SPEC CONCEPT · NOT AN OFFICIAL WEMA BANK ADVERTISEMENT', CX, L.fineY);
      ctx.textAlign = 'left';
      ctx.letterSpacing = '0px';
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
    ctx.setLineDash([]);
    const sh = shake(t);
    ctx.translate(sh.x, sh.y);
    if (t < BR(3)) s1(ctx, t);
    else if (t < BR(5)) s2(ctx, t);
    else if (t < BR(6)) s3send(ctx, t);
    else if (t < BR(7)) s4save(ctx, t);
    else if (t < BR(8)) s5pay(ctx, t);
    else if (t < BR(9)) s6grow(ctx, t);
    else if (t < BR(10) - 0.12) s7for(ctx, t);
    else if (t < BR(11)) s8greet(ctx, t);
    else if (t < BR(12)) s9receipt(ctx, t);
    else s10resolve(ctx, t);
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
    if (t < b(9)) return 0;
    if (t < BR(6)) return 0.45;
    if (t >= BR(8) && t < BR(10)) return 0.4;
    if (t >= BR(11)) return 0.4;
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
    o.globalAlpha = amt * 0.45;
    o.drawImage(sm1, 0, 0, W, H);
    o.globalAlpha = amt * 0.6;
    o.drawImage(sm2, 0, 0, W, H);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
  }
  function drawTime(t, frame, opts = {}) {
    const sub = opts.subframes ?? 8, shutter = opts.shutter ?? 0.5;
    for (let k = 0; k < sub; k++) {
      const ts = sub === 1 ? t : t + ((k + 0.5) / sub - 0.5) * (shutter / FPS);
      sceneCtx.save();
      renderScene(sceneCtx, Math.max(0, ts));
      sceneCtx.restore();
      accCtx.globalAlpha = 1 / (k + 1);
      accCtx.drawImage(sceneC, 0, 0);
    }
    accCtx.globalAlpha = 1;
    const o = outCtx;
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    const ca = aberration(t) * 9;
    if (ca > 0.35) chromatic(o, accC, ca);
    else o.drawImage(accC, 0, 0);
    const bl = bloomAmt(t);
    if (bl > 0) bloom(o, accC, bl);
    o.drawImage(vignette, 0, 0);
    o.globalCompositeOperation = 'overlay';
    o.globalAlpha = 0.06;
    o.drawImage(grains[frame % grains.length], 0, 0, W, H);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
  }

  function buildPaper() {
    paperTex = makeCanvas();
    const g = paperTex.getContext('2d');
    g.fillStyle = P.cream;
    g.fillRect(0, 0, W, H);
    const r = rng(8);
    for (let i = 0; i < 2600; i++) {
      g.strokeStyle = `rgba(120,80,60,${0.03 + r() * 0.05})`;
      g.lineWidth = 0.6 + r();
      const x = r() * W, y = r() * H, a = r() * TAU, l = 4 + r() * 16;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    const v = g.createRadialGradient(CX, CY, H * 0.3, CX, CY, DIAG);
    v.addColorStop(0, 'rgba(160,110,70,0)');
    v.addColorStop(1, 'rgba(160,110,70,0.28)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }
  function buildStamp(top, bottom, center, sub, seed) {
    const c = makeCanvas(400, 400), g = c.getContext('2d');
    g.translate(200, 200);
    g.strokeStyle = P.purple;
    g.fillStyle = P.purple;
    g.lineWidth = 8;
    g.beginPath();
    g.arc(0, 0, 186, 0, TAU);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 124, 0, TAU);
    g.stroke();
    // curved type: the top arc reads clockwise, the bottom arc reads left→right and stays upright
    const arcText = (s, rad, onTop) => {
      setFont(g, SANS, 800, 30, 'condensed');
      g.letterSpacing = '3px';
      const tot = g.measureText(s).width / rad;
      let a = onTop ? -tot / 2 : tot / 2;
      for (const ch of s) {
        const w = g.measureText(ch).width / rad;
        g.save();
        if (onTop) {
          g.rotate(a + w / 2);
          g.translate(0, -rad);
          a += w;
        } else {
          g.rotate(a - w / 2);
          g.translate(0, rad + 22);
          a -= w;
        }
        g.textAlign = 'center';
        g.fillText(ch, 0, 0);
        g.restore();
      }
      g.letterSpacing = '0px';
    };
    arcText(top, 142, true);
    arcText(bottom, 142, false);
    g.textAlign = 'center';
    setFont(g, SERIF, 800, center.length > 5 ? 52 : 70);
    g.fillText(center, 0, 22);
    setFont(g, SANS, 700, 20);
    g.fillText(sub, 0, 60);
    g.fillText('★', -150, 8);
    g.fillText('★', 150, 8);
    // worn ink
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-out';
    const r = rng(seed);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.6})`;
      g.fillRect(r() * 400, r() * 400, 1 + r() * 3, 1 + r() * 3);
    }
    return c;
  }

  async function init(canvas) {
    const need = ['900 100px Archivo', '500 100px Archivo', '400 100px Fraunces', '800 100px Fraunces', `500 20px ${MONO}`, `800 20px ${MONO}`];
    await Promise.all(need.map((f) => document.fonts.load(f, 'AẸkúiṣẹ́Nnọọ₦ÙÁ“”’')));
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
    const g = v.createRadialGradient(CX, CY, H * 0.38, CX, CY, DIAG);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
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
    buildPaper();
    stampTex = buildStamp('AGBONMAGBE BANK', 'EST. 2 MAY 1945', 'LAGOS', 'NIGERIA', 11);
    stamp2Tex = buildStamp('FIRST IS A HABIT', 'SINCE 1945', 'WEMA', '81 YEARS', 12);
    buildMap();
    buildLock(sceneCtx);
  }

  root.SPOT = {
    W, H, FPS, DURATION,
    FRAMES: Math.round(DURATION * FPS),
    init,
    drawFrame: (i, opts) => drawTime(i / FPS, i, opts),
    drawTime: (t, opts) => drawTime(t, Math.floor(t * FPS), opts),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
