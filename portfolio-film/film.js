/* LOUIS ODIATU — "PROMPT → PRODUCT"
   A 36-second cinematic portfolio film. One sentence becomes a 3D workflow, the workflow becomes
   a product, the product joins a body of work, and the work goes worldwide.
   Every pixel is a pure function of time, sampled 8× per frame for motion blur. */
(function (root) {
  'use strict';
  const TL = root.TL, LAND = root.LAND;
  const { FPS, DURATION, BEAT } = TL;
  const b = TL.b;
  const FMT = root.FORMAT || '4x5';
  const W = FMT === '16x9' ? 1920 : 1080;
  const H = { '16x9': 1080, '1x1': 1080, '4x5': 1350, '9x16': 1920 }[FMT];
  const pick = (land, square, portrait) => (FMT === '16x9' ? land : FMT === '1x1' ? square : portrait);
  const S = Math.min(W, H) / 1080;
  const TAU = Math.PI * 2, CX = W / 2, CY = H / 2, DIAG = Math.hypot(CX, CY);
  const FOC = 1000 * S * pick(1.05, 1, 1.08);

  const P = { bg: '#04060C', navy: '#0A1020', cyan: '#3DE8FF', violet: '#7B5CFF', amber: '#FFB547', green: '#3DFFA2', white: '#EAF2FF', dim: '#7F8BA8' };
  const SANS = 'Archivo', MONO = '"JetBrains Mono"';

  /* ─────────── math ─────────── */
  const clamp = (x, a = 0, c = 1) => (x < a ? a : x > c ? c : x);
  const lerp = (a, c, t) => a + (c - a) * t;
  const prog = (t, t0, d) => clamp((t - t0) / d);
  const frac = (x) => x - Math.floor(x);
  const E = {
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
    outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  };
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u) => ((ax * u + bx) * u + cx) * u, sy = (u) => ((ay * u + by) * u + cy) * u, dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(u) - x;
        if (Math.abs(e) < 1e-6) break;
        const d = dx(u);
        if (Math.abs(d) < 1e-6) break;
        u -= e / d;
      }
      return sy(clamp(u));
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
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const EZ = { snap: bezier(0.16, 1, 0.3, 1), swap: bezier(0.7, 0, 0.2, 1) };

  /* ─────────── colour + drawing ─────────── */
  const hexCache = new Map();
  const hex = (h) => {
    let v = hexCache.get(h);
    if (!v) hexCache.set(h, (v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))));
    return v;
  };
  const rgba = (h, a) => {
    const A = hex(h);
    return `rgba(${A[0]},${A[1]},${A[2]},${a})`;
  };
  const mix = (a, c, t) => {
    const A = hex(a), B = hex(c);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  };
  function makeCanvas(w = W, h = H) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  function disc(ctx, x, y, r) {
    if (r <= 0) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  function setFont(ctx, fam, weight, size, stretch = 'normal') {
    ctx.font = `${Math.round(clamp(weight, 100, 900))} ${size}px ${fam}`;
    ctx.fontStretch = stretch;
  }
  let GLOW = null; // pre-rendered soft glow sprite
  function glow(ctx, x, y, r, color, a) {
    if (a <= 0.003 || r <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(GLOW[color] || GLOW[P.cyan], x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  /* ─────────── camera ─────────── */
  const CAM = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  function project(p) {
    let x = p[0] - CAM.x, y = p[1] - CAM.y, z = p[2] - CAM.z;
    const cy = Math.cos(CAM.yaw), sy = Math.sin(CAM.yaw);
    [x, z] = [x * cy - z * sy, x * sy + z * cy];
    const cp = Math.cos(CAM.pitch), sp = Math.sin(CAM.pitch);
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    if (z < 20) return null;
    const s = FOC / z;
    return { x: CX + x * s, y: CY + y * s, s, z };
  }

  /* ─────────── impacts ─────────── */
  const IMPACTS = [[TL.shatter, 0.5], [TL.approve, 0.6], [TL.product, 0.5], [TL.globe, 0.6], [TL.end, 0.8]];
  function shake(t) {
    let x = 0, y = 0;
    for (const [ti, s] of IMPACTS) {
      const tau = t - ti;
      if (tau < 0 || tau > 0.5) continue;
      const e = s * Math.exp(-tau * 10);
      x += noise(tau * 30 + ti) * e * 10 * S;
      y += noise(tau * 30 + ti + 50) * e * 10 * S;
    }
    return [x, y];
  }
  function aberration(t) {
    let a = 0;
    for (const [ti, s] of IMPACTS) {
      const tau = t - ti;
      if (tau >= 0 && tau < 0.35) a += s * Math.exp(-tau * 14);
    }
    return a;
  }

  /* ─────────── atmosphere: dust + floor ─────────── */
  const DUST = (() => {
    const r = rng(77);
    return Array.from({ length: 520 }, () => [(r() - 0.5) * 4200, (r() - 0.5) * 2600, -2000 + r() * 10500, 0.6 + r() * 1.8]);
  })();
  function atmosphere(ctx, t, a = 1) {
    // floor grid
    ctx.strokeStyle = rgba(P.cyan, 0.09 * a);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = -2400; x <= 2400; x += 300) {
      let started = false;
      for (let z = -1500; z <= 8500; z += 250) {
        const p = project([x, 520, z]);
        if (!p) {
          started = false;
          continue;
        }
        started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        started = true;
      }
    }
    for (let z = -1500; z <= 8500; z += 300) {
      const p1 = project([-2400, 520, z]), p2 = project([2400, 520, z]);
      if (p1 && p2) {
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
    }
    ctx.stroke();
    // floating dust
    for (const [x, y, z, sz] of DUST) {
      const p = project([x + Math.sin(t * 0.3 + z) * 30, y + Math.cos(t * 0.25 + x) * 20, z]);
      if (!p || p.z > 7000) continue;
      const fade = clamp(1 - p.z / 7000) * clamp((p.z - 60) / 300);
      ctx.fillStyle = rgba(P.white, 0.5 * fade * a);
      disc(ctx, p.x, p.y, sz * p.s * 1.4);
    }
  }
  function backdrop(ctx) {
    ctx.fillStyle = P.bg;
    ctx.fillRect(-300, -300, W + 600, H + 600);
    const g = ctx.createRadialGradient(CX, CY * 0.9, 0, CX, CY, DIAG);
    g.addColorStop(0, 'rgba(40,60,120,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ─────────── captions (sound-off storytelling) ─────────── */
  function caption(ctx, t, t0, t1, num, text, color = P.white) {
    const a = EZ.snap(prog(t, t0, 0.45)), out = E.inCubic(prog(t, t1 - 0.25, 0.25));
    if (a <= 0 || out >= 1) return;
    const size = pick(46, 44, 48) * S, maxW = W * pick(0.7, 0.86, 0.86);
    const baseY = H - pick(150, 150, 200) * S;
    setFont(ctx, SANS, 700, size);
    const lines = wrap(ctx, text, maxW);
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.textAlign = 'center';
    const lh = size * 1.18, top = baseY - (lines.length - 1) * lh;
    if (num) {
      setFont(ctx, MONO, 600, 20 * S);
      ctx.letterSpacing = `${5 * S}px`;
      ctx.fillStyle = rgba(P.cyan, 0.9 * a);
      ctx.fillText(num, CX, top - size * 1.1 + (1 - a) * 12);
      ctx.letterSpacing = '0px';
    }
    setFont(ctx, SANS, 700, size);
    lines.forEach((ln, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top + i * lh - size * 1.05, W, size * 1.35);
      ctx.clip();
      ctx.fillStyle = color;
      const q = EZ.snap(prog(t, t0 + i * 0.08, 0.45));
      ctx.fillText(ln, CX, top + i * lh + (1 - q) * size * 1.2);
      ctx.restore();
    });
    ctx.restore();
  }

  /* ═════════ ACT 1 · ONE SENTENCE (0 – 6) ═════════ */
  const PROMPT = 'Automate our content pipeline.';
  function promptLayout(ctx) {
    const boxW = Math.min(W * 0.86, 1180 * S), size = Math.min(56 * S, (boxW - 90 * S) / (PROMPT.length * 0.6 + 1.2));
    setFont(ctx, MONO, 500, size);
    const tw = ctx.measureText(PROMPT).width;
    return { boxW, boxH: size * 2.3, size, x0: CX - tw / 2, y: CY + size * 0.35, tw };
  }
  function charPos(ctx, L, j) {
    setFont(ctx, MONO, 500, L.size);
    return L.x0 + ctx.measureText(PROMPT.slice(0, j)).width + ctx.measureText(PROMPT[j]).width / 2;
  }
  function s0(ctx, t) {
    backdrop(ctx);
    const L = promptLayout(ctx);
    const n = clamp(Math.floor((t - TL.typeStart) / TL.typePer), 0, PROMPT.length);
    const enter = t - TL.enter;
    const shat = prog(t, TL.shatter, 1.6);
    // hook line
    const hook = 'Watch one sentence become a product.';
    const ha = EZ.snap(prog(t, 0.15, 0.5)) * (1 - E.inCubic(prog(t, TL.shatter - 0.3, 0.4)));
    if (ha > 0) {
      setFont(ctx, SANS, 800, pick(58, 54, 60) * S);
      ctx.textAlign = 'center';
      const lines = wrap(ctx, hook, W * 0.84);
      lines.forEach((ln, i) => {
        ctx.fillStyle = rgba(P.white, ha);
        ctx.fillText(ln, CX, CY - L.boxH * 1.25 - (lines.length - 1 - i) * pick(58, 54, 60) * S * 1.15 + (1 - ha) * 20);
      });
      setFont(ctx, MONO, 500, 18 * S);
      ctx.letterSpacing = `${6 * S}px`;
      ctx.fillStyle = rgba(P.cyan, ha * 0.8);
      ctx.fillText('LOUIS ODIATU · AI AUTOMATION & PRODUCT ENGINEER', CX, pick(90, 90, 120) * S);
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'left';
    }
    // prompt box
    const boxA = EZ.snap(prog(t, 0.35, 0.5)) * (1 - E.outCubic(prog(t, TL.shatter, 0.35)));
    if (boxA > 0) {
      const pulse = enter > 0 ? Math.exp(-enter * 6) : 0;
      ctx.save();
      ctx.globalAlpha = boxA;
      ctx.fillStyle = rgba('#0C1428', 0.9);
      ctx.strokeStyle = rgba(P.cyan, 0.35 + 0.6 * pulse);
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.roundRect(CX - L.boxW / 2, CY - L.boxH / 2, L.boxW, L.boxH, L.boxH / 2);
      ctx.fill();
      ctx.stroke();
      glow(ctx, CX, CY, L.boxW * 0.7, P.cyan, 0.18 + 0.5 * pulse);
      ctx.restore();
    }
    // typed text → shatters into light
    for (let j = 0; j < n; j++) {
      const cx = charPos(ctx, L, j);
      if (shat <= 0) {
        setFont(ctx, MONO, 500, L.size);
        ctx.fillStyle = enter > 0 ? mix(P.white, P.cyan, Math.exp(-enter * 3)) : P.white;
        ctx.textAlign = 'center';
        ctx.fillText(PROMPT[j], cx, L.y);
        ctx.textAlign = 'left';
      } else {
        const r = rng(j * 31 + 7);
        for (let k = 0; k < 10; k++) {
          const a0 = r() * TAU, sp = 60 + r() * 260, dl = r() * 0.25;
          const q = clamp((t - TL.shatter - dl) / 1.4);
          if (q <= 0) continue;
          // burst, then stream towards the first node of the workflow
          const bx = cx + Math.cos(a0) * sp * S * E.outCubic(clamp(q * 2.2)), by = CY + Math.sin(a0) * sp * S * E.outCubic(clamp(q * 2.2));
          const tq = E.inOutCubic(clamp((q - 0.35) / 0.65));
          const x = lerp(bx, S1.n0x, tq), y = lerp(by, S1.n0y, tq);
          ctx.fillStyle = k % 3 ? P.cyan : P.white;
          ctx.globalAlpha = 1 - E.inCubic(clamp((q - 0.85) / 0.15));
          disc(ctx, x, y, (2.4 - tq * 1.2) * S);
          ctx.globalAlpha = 1;
        }
      }
    }
    if (shat <= 0 && frac(t * 1.6) < 0.55 && boxA > 0.5) {
      const cx = n < PROMPT.length ? charPos(ctx, L, Math.max(0, n)) - (n === 0 ? 0 : L.size * 0.3) : L.x0 + L.tw + 6 * S;
      ctx.fillStyle = P.cyan;
      ctx.fillRect(n === 0 ? L.x0 : cx, L.y - L.size * 0.85, 3 * S, L.size);
    }
    if (shat > 0) glow(ctx, CX, CY, 500 * S * E.outCubic(shat), P.cyan, 0.45 * (1 - shat));
  }

  /* ═════════ ACT 2 · THE SYSTEM BUILDS ITSELF (6 – 17) ═════════ */
  const NODES = [
    { p: [-260, -40, 0], title: 'TRIGGER', sub: 'New brief received', icon: '⚡' },
    { p: [260, 50, 1150], title: 'LLM · DRAFT', sub: 'Generate first draft', icon: '✦' },
    { p: [-240, -50, 2300], title: 'RAG · CONTEXT', sub: 'Ground in real sources', icon: '◎' },
    { p: [250, 40, 3450], title: 'DATA · SQL', sub: 'Store, score, route', icon: '▤' },
    { p: [0, 0, 4600], title: 'HUMAN REVIEW', sub: 'Approve before it ships', icon: '◉', gate: true },
    { p: [0, -20, 5750], title: 'PUBLISH', sub: 'Live, logged, measured', icon: '➜' },
  ];
  const S1 = { n0x: CX, n0y: CY };
  // camera: settles on each node on its beat, holds at the review gate until approval, then surges
  const CAMKEYS = [
    [4.6, -1500, 0], [6.7, -1000, -150], [8.5, 150, 150], [10.3, 1300, -140], [12.1, 2450, 140], [13.9, 3500, 0],
    [15.1, 3540, 0], [16.4, 4700, 0], [17.2, 5100, 0],
  ];
  function camAt(t) {
    let k = 0;
    while (k < CAMKEYS.length - 2 && t > CAMKEYS[k + 1][0]) k++;
    const [t0, z0, x0] = CAMKEYS[k], [t1, z1, x1] = CAMKEYS[k + 1];
    const u = prog(t, t0, t1 - t0);
    const e = k === CAMKEYS.length - 3 ? E.inCubic(u) : E.inOutSine(u);
    CAM.z = lerp(z0, z1, e);
    CAM.x = lerp(x0, x1, e) + Math.sin(t * 0.7) * 25;
    CAM.y = -60 + Math.sin(t * 0.5) * 18;
    CAM.yaw = -(CAM.x - lerp(x0, x1, e)) * 0.0002 + Math.sin(t * 0.35) * 0.02;
    CAM.pitch = 0.06;
  }
  let CARD = null; // node sprites
  const CW = 460, CH = 170;
  function buildCards() {
    CARD = NODES.map((N) => [N.gate ? P.amber : P.cyan, N.gate ? P.green : null].filter(Boolean).map((col) => {
      const c = makeCanvas(CW * 2, CH * 2), g = c.getContext('2d');
      g.scale(2, 2);
      g.fillStyle = 'rgba(10,18,36,0.92)';
      g.strokeStyle = col;
      g.lineWidth = 2.5;
      g.beginPath();
      g.roundRect(4, 4, CW - 8, CH - 8, 26);
      g.fill();
      g.stroke();
      g.fillStyle = rgba(col, 0.14);
      g.beginPath();
      g.roundRect(26, 34, 100, 100, 22);
      g.fill();
      setFont(g, SANS, 800, 52);
      g.fillStyle = col;
      g.textAlign = 'center';
      g.fillText(N.gate && col === P.green ? '✓' : N.icon, 76, 104);
      g.textAlign = 'left';
      setFont(g, MONO, 700, 28);
      g.fillStyle = P.white;
      g.fillText(N.title, 150, 78);
      setFont(g, SANS, 500, 22);
      g.fillStyle = P.dim;
      g.fillText(N.gate && col === P.green ? 'Approved by a human' : N.sub, 150, 114);
      return c;
    }));
  }
  function pipePts(i) {
    const A = NODES[i].p, B = NODES[i + 1].p, pts = [];
    const a = [A[0] + (B[0] > A[0] ? 1 : -1) * 150, A[1], A[2] + 40], c = [B[0], B[1], B[2] - 90];
    for (let k = 0; k <= 36; k++) {
      const u = k / 36, e = u * u * (3 - 2 * u);
      pts.push([lerp(a[0], c[0], e), lerp(a[1], c[1], u) - Math.sin(Math.PI * u) * 60, lerp(a[2], c[2], u)]);
    }
    return pts;
  }
  const PIPES = NODES.slice(0, -1).map((_, i) => pipePts(i));
  function s1(ctx, t, fadeIn = 1) {
    camAt(t);
    backdrop(ctx);
    atmosphere(ctx, t, fadeIn);
    const approved = t >= TL.approve;
    // pipes (far first)
    for (let i = PIPES.length - 1; i >= 0; i--) {
      const t0 = TL.nodes[i] + 0.3, draw = E.inOutCubic(prog(t, t0, i === 4 ? 0.9 : 1.3));
      if (i === 4 && !approved) continue;
      if (draw <= 0) continue;
      const pts = PIPES[i].map(project);
      const n = Math.floor(draw * (pts.length - 1));
      for (const [lw, col, al] of [[14, P.cyan, 0.08], [3.2, P.cyan, 0.9]]) {
        ctx.strokeStyle = rgba(i >= 4 ? P.green : col, al * fadeIn);
        ctx.beginPath();
        let started = false;
        for (let k = 0; k <= n; k++) {
          const p = pts[k];
          if (!p) {
            started = false;
            continue;
          }
          ctx.lineWidth = lw * p.s;
          started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
          started = true;
        }
        ctx.stroke();
      }
      // data pulses; the pipe into the gate queues up until a human approves
      if (draw >= 1) {
        for (let q = 0; q < 4; q++) {
          let u = frac((t - t0) * 0.55 + q / 4);
          if (i === 3 && !approved) u = Math.min(u, 0.93 - q * 0.05);
          const p = pts[Math.round(u * (pts.length - 1))];
          if (!p) continue;
          glow(ctx, p.x, p.y, 34 * p.s, i >= 4 ? P.green : P.cyan, 0.9 * fadeIn);
          ctx.fillStyle = P.white;
          disc(ctx, p.x, p.y, 5 * p.s);
        }
      }
    }
    // nodes, far → near, with depth-of-field
    const focusZ = 1000;
    NODES.map((N, i) => ({ N, i, pr: project(N.p) }))
      .filter((o) => o.pr)
      .sort((a, c) => c.pr.z - a.pr.z)
      .forEach(({ N, i, pr }) => {
        const pop = spring(t - TL.nodes[i] + 0.15, 2.2, 0.45);
        if (pop <= 0.001) return;
        const blur = clamp(Math.abs(pr.z - focusZ) / 1400) * 10 * S;
        const fade = clamp(1 - pr.z / 6500) * clamp((pr.z - 120) / 400) * fadeIn;
        const s = pr.s * pop * 1.4;
        glow(ctx, pr.x, pr.y, 560 * pr.s, N.gate ? (approved ? P.green : P.amber) : P.cyan, 0.35 * fade * pop);
        ctx.save();
        ctx.globalAlpha = fade;
        if (blur > 0.6) ctx.filter = `blur(${blur.toFixed(1)}px)`;
        ctx.translate(pr.x, pr.y);
        ctx.scale(s, s);
        ctx.drawImage(CARD[i][0], -CW / 2, -CH / 2, CW, CH);
        if (N.gate && approved) {
          ctx.globalAlpha = fade * EZ.snap(prog(t, TL.approve, 0.3));
          ctx.drawImage(CARD[i][1], -CW / 2, -CH / 2, CW, CH);
        }
        ctx.restore();
        if (i === 0) {
          S1.n0x = pr.x;
          S1.n0y = pr.y;
        }
        // the gate: a pulsing lock ring while waiting, a burst on approval
        if (N.gate) {
          const wait = prog(t, TL.nodes[4], 0.3) * (approved ? 0 : 1);
          for (let k = 0; k < 2; k++) {
            const f = frac(t * 1.2 + k / 2);
            ctx.strokeStyle = rgba(P.amber, (1 - f) * 0.6 * wait);
            ctx.lineWidth = 3 * pr.s;
            ctx.beginPath();
            ctx.roundRect(pr.x - (CW / 2 + 30 * f + 10) * pr.s, pr.y - (CH / 2 + 30 * f + 10) * pr.s, (CW + 60 * f + 20) * pr.s, (CH + 60 * f + 20) * pr.s, 34 * pr.s);
            ctx.stroke();
          }
          const ap = prog(t, TL.approve, 0.7);
          if (ap > 0 && ap < 1) {
            ctx.strokeStyle = rgba(P.green, 1 - ap);
            ctx.lineWidth = 6 * pr.s * (1 - ap);
            ctx.beginPath();
            ctx.arc(pr.x, pr.y, (200 + 900 * E.outExpo(ap)) * pr.s, 0, TAU);
            ctx.stroke();
          }
        }
      });
    const cap = [
      ['01', 'A brief comes in.'],
      ['02', 'An LLM drafts it.'],
      ['03', 'RAG grounds it in real sources.'],
      ['04', 'Data is stored, scored and routed.'],
      ['05', 'A human reviews it. Nothing ships unapproved.'],
      ['06', 'Approved. Published.'],
    ];
    cap.forEach(([num, text], i) => {
      const t0 = TL.nodes[i] + 0.1, t1 = i === 4 ? TL.approve + 0.9 : i === 5 ? TL.product + 0.2 : TL.nodes[i + 1] + 0.05;
      caption(ctx, t, t0, t1, `STEP ${num}`, text, i === 4 ? P.amber : P.white);
    });
  }

  /* ═════════ ACT 3 · IT BECOMES A PRODUCT (16.8 – 21.6) ═════════ */
  const UI = { w: 1000, h: 640 };
  function uiScale() {
    return Math.min((W * pick(0.62, 0.86, 0.88)) / UI.w, (H * 0.5) / UI.h);
  }
  const PANELS = [
    { id: 'frame', x: 0, y: 0, w: 1000, h: 640 },
    { id: 'side', x: 20, y: 64, w: 190, h: 556 },
    { id: 'row0', x: 230, y: 140, w: 480, h: 70 },
    { id: 'row1', x: 230, y: 222, w: 480, h: 70 },
    { id: 'row2', x: 230, y: 304, w: 480, h: 70 },
    { id: 'row3', x: 230, y: 386, w: 480, h: 70 },
    { id: 'chart', x: 730, y: 140, w: 250, h: 316 },
    { id: 'foot', x: 230, y: 476, w: 750, h: 144 },
  ];
  const STATUS = [['Drafted', P.violet], ['In review', P.amber], ['Approved', P.cyan], ['Published', P.green]];
  function drawPanel(g, id, t, local) {
    const r = (x, y, w, h, rad, fill, stroke) => {
      g.beginPath();
      g.roundRect(x, y, w, h, rad);
      if (fill) {
        g.fillStyle = fill;
        g.fill();
      }
      if (stroke) {
        g.strokeStyle = stroke;
        g.lineWidth = 1.5;
        g.stroke();
      }
    };
    if (id === 'frame') {
      r(0, 0, UI.w, UI.h, 24, 'rgba(8,14,30,0.94)', rgba(P.cyan, 0.4));
      ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => {
        g.fillStyle = c;
        disc(g, 30 + i * 22, 30, 7);
      });
      setFont(g, MONO, 600, 18);
      g.fillStyle = P.dim;
      g.fillText('content-ops · review queue', 110, 36);
      setFont(g, SANS, 800, 30);
      g.fillStyle = P.white;
      g.fillText('Review queue', 230, 112);
    } else if (id === 'side') {
      r(0, 0, 190, 556, 16, 'rgba(255,255,255,0.03)');
      ['Queue', 'Drafts', 'Approved', 'Published', 'Sources'].forEach((s, i) => {
        if (i === 0) r(10, 14, 170, 44, 10, rgba(P.cyan, 0.14));
        setFont(g, SANS, 600, 20);
        g.fillStyle = i === 0 ? P.cyan : P.dim;
        g.fillText(s, 28, 44 + i * 56);
      });
    } else if (id.startsWith('row')) {
      const k = +id[3];
      r(0, 0, 480, 70, 14, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.06)');
      g.fillStyle = 'rgba(234,242,255,0.75)';
      g.fillRect(20, 20, 150 + hash(k) * 110, 10);
      g.fillStyle = 'rgba(127,139,168,0.5)';
      g.fillRect(20, 42, 90 + hash(k + 9) * 90, 8);
      // status advances on the beat — the pipeline running live
      const steps = Math.floor(clamp((local - 0.9 - k * 0.15) / BEAT, 0, 3));
      const st = STATUS[Math.min(3, k === 0 ? 1 + steps : k === 1 ? steps : k === 2 ? Math.max(0, steps - 1) + 1 : 2 + Math.min(1, steps))];
      r(330, 20, 130, 32, 16, rgba(st[1], 0.18));
      setFont(g, SANS, 700, 17);
      g.fillStyle = st[1];
      g.textAlign = 'center';
      g.fillText(st[0], 395, 42);
      g.textAlign = 'left';
    } else if (id === 'chart') {
      r(0, 0, 250, 316, 16, 'rgba(255,255,255,0.04)');
      setFont(g, SANS, 700, 19);
      g.fillStyle = P.white;
      g.fillText('Throughput', 20, 36);
      const pts = [0.2, 0.26, 0.24, 0.38, 0.42, 0.55, 0.6, 0.74, 0.82];
      const d = E.inOutCubic(clamp((local - 0.6) / 1.6));
      g.strokeStyle = P.cyan;
      g.lineWidth = 4;
      g.lineJoin = 'round';
      g.beginPath();
      const n = Math.max(1, Math.floor(d * (pts.length - 1) * 10) / 10);
      for (let i = 0; i <= n * 10; i++) {
        const u = i / 10, a = Math.floor(u), v = lerp(pts[a], pts[Math.min(pts.length - 1, a + 1)], u - a);
        const x = 20 + (u / (pts.length - 1)) * 210, y = 290 - v * 230;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    } else if (id === 'foot') {
      r(0, 0, 750, 144, 16, 'rgba(255,255,255,0.03)');
      setFont(g, MONO, 500, 17);
      const logs = ['draft.generated  ✓', 'context.retrieved  ✓', 'review.requested  …', 'review.approved  ✓', 'post.published  ✓'];
      const shown = clamp(Math.floor((local - 0.8) / (BEAT / 2)), 0, logs.length);
      for (let i = 0; i < shown; i++) {
        g.fillStyle = i === shown - 1 ? P.cyan : P.dim;
        g.fillText('› ' + logs[i], 20, 32 + i * 24);
      }
    }
  }
  function uiGroup(ctx, t, cx, cy, sc, alpha = 1) {
    const local = t - TL.product;
    PANELS.forEach((pn, i) => {
      const e = spring(local - 0.05 - i * 0.07, 1.6, 0.55);
      if (e <= 0.001) return;
      const r = rng(i * 13 + 5);
      const ox = (r() - 0.5) * 1600, oy = (r() - 0.5) * 1200, rot = (r() - 0.5) * 1.2, zs = 1.8 + r();
      const s = lerp(zs, 1, e);
      ctx.save();
      ctx.globalAlpha = alpha * clamp(e * 2);
      ctx.translate(cx + ((pn.x + pn.w / 2 - UI.w / 2) + ox * (1 - e)) * sc, cy + ((pn.y + pn.h / 2 - UI.h / 2) + oy * (1 - e)) * sc);
      ctx.rotate(rot * (1 - e));
      ctx.scale(sc * s, sc * s);
      ctx.translate(-pn.w / 2, -pn.h / 2);
      drawPanel(ctx, pn.id, t, local);
      ctx.restore();
    });
  }
  function s2(ctx, t) {
    const x = prog(t, TL.product, 0.6);
    if (x < 1) {
      s1(ctx, t, 1 - E.inCubic(x));
      ctx.fillStyle = rgba(P.bg, E.inCubic(x) * 0.85);
      ctx.fillRect(0, 0, W, H);
      glow(ctx, CX, CY, 700 * S, P.green, 0.6 * (1 - x) * clamp(x * 4));
    } else {
      camAt(17.2);
      CAM.z = 5100 + (t - 17.2) * 60;
      backdrop(ctx);
      atmosphere(ctx, t, 0.6);
    }
    const out = E.inOutCubic(prog(t, TL.orbit, 0.6));
    const sc = uiScale() * lerp(1, 0.3, out);
    const cy = CY - pick(20, 30, 60) * S;
    glow(ctx, CX, cy, UI.w * sc * 0.9, P.cyan, 0.2);
    ctx.save();
    ctx.translate(CX, cy);
    ctx.rotate(Math.sin(t * 0.8) * 0.01);
    ctx.translate(-CX, -cy);
    uiGroup(ctx, t, CX, cy, sc);
    ctx.restore();
    caption(ctx, t, TL.product + 0.4, TL.orbit, 'STEP 07', 'It becomes a product a team can run.');
  }

  /* ═════════ ACT 4 · A BODY OF WORK (21.6 – 26.4) ═════════ */
  const WORK = [
    ['LinkedIn Content Operations', 'Human-in-the-loop drafting, review & publishing', P.cyan],
    ['ValueBot', 'Python · FastAPI · SQLite engine + Next.js dashboard', P.violet],
    ['Football Prediction Research', 'Probabilistic models, calibration & market analysis', P.green],
    ['Cinematic Web Experiments', 'Scroll storytelling, responsive canvas & motion', P.amber],
    ['AI Workflow Orchestration', 'LLMs · RAG · n8n · structured outputs · evals', P.cyan],
  ];
  let WCARD = null;
  const WW = 520, WH = 250;
  function buildWork() {
    WCARD = WORK.map(([title, sub, col], i) => {
      const c = makeCanvas(WW * 2, WH * 2), g = c.getContext('2d');
      g.scale(2, 2);
      const gr = g.createLinearGradient(0, 0, WW, WH);
      gr.addColorStop(0, 'rgba(16,26,52,0.97)');
      gr.addColorStop(1, 'rgba(8,12,26,0.97)');
      g.fillStyle = gr;
      g.strokeStyle = rgba(col, 0.7);
      g.lineWidth = 2.5;
      g.beginPath();
      g.roundRect(4, 4, WW - 8, WH - 8, 26);
      g.fill();
      g.stroke();
      setFont(g, MONO, 700, 18);
      g.fillStyle = col;
      g.fillText(`PROJECT 0${i + 1}`, 34, 50);
      setFont(g, SANS, 800, 34);
      g.fillStyle = P.white;
      wrap(g, title, WW - 68).forEach((ln, k) => g.fillText(ln, 34, 104 + k * 40));
      setFont(g, SANS, 500, 21);
      g.fillStyle = P.dim;
      wrap(g, sub, WW - 68).forEach((ln, k) => g.fillText(ln, 34, 190 + k * 28));
      return c;
    });
  }
  function orbitCards(t) {
    const local = t - TL.orbit;
    const R = pick(1500, 1150, 1050), spin = local * 0.42 + 0.35;
    const collapse = E.inCubic(prog(t, TL.globe - 0.75, 0.75));
    return WORK.map((_, i) => {
      const a = spin + (i / WORK.length) * TAU;
      const open = E.outCubic(prog(local, 0.2 + i * 0.06, 0.9));
      const rr = R * open * (1 - collapse);
      return { i, p: [Math.sin(a) * rr, -60 + Math.cos(a) * 60 * open, 2400 + Math.cos(a) * rr * 0.7], open, collapse };
    });
  }
  function s3(ctx, t) {
    CAM.x = 0;
    CAM.y = -40;
    CAM.z = 0;
    CAM.yaw = Math.sin(t * 0.3) * 0.03;
    CAM.pitch = 0.12;
    backdrop(ctx);
    atmosphere(ctx, t, 0.35);
    const cards = orbitCards(t).map((c) => ({ ...c, pr: project(c.p) })).filter((c) => c.pr).sort((a, c) => c.pr.z - a.pr.z);
    for (const c of cards) {
      const front = clamp(1 - (c.pr.z - 1400) / 2200);
      const s = c.pr.s * pick(1.9, 1.7, 1.75) * lerp(1, 0.05, c.collapse);
      const a = clamp(c.open * 1.5) * lerp(0.35, 1, front);
      glow(ctx, c.pr.x, c.pr.y, 500 * s, WORK[c.i][2], 0.25 * a);
      ctx.save();
      ctx.globalAlpha = a;
      if (front < 0.6) ctx.filter = `blur(${((0.6 - front) * 8 * S).toFixed(1)}px)`;
      ctx.translate(c.pr.x, c.pr.y);
      ctx.scale(s, s);
      ctx.drawImage(WCARD[c.i], -WW / 2, -WH / 2, WW, WH);
      ctx.restore();
    }
    // the product from act 3 shrinks into the first card
    const hand = 1 - prog(t, TL.orbit, 0.6);
    if (hand > 0) uiGroup(ctx, t, CX, CY - pick(20, 30, 60) * S, uiScale() * lerp(0.3, 1, E.inOutCubic(hand)) * 0.9, hand);
    caption(ctx, t, TL.orbit + 0.5, TL.globe - 0.1, 'THE WORK', 'Prompt → system → product. Again and again.');
  }

  /* ═════════ ACT 5 · BUILT IN NIGERIA, DEPLOYED WORLDWIDE (26.4 – 31.2) ═════════ */
  const CITIES = [
    ['LONDON', -0.13, 51.5], ['BERLIN', 13.4, 52.5], ['AMSTERDAM', 4.9, 52.4], ['TORONTO', -79.4, 43.7], ['NEW YORK', -74, 40.7],
    ['SAN FRANCISCO', -122.4, 37.8], ['DUBAI', 55.3, 25.2], ['NAIROBI', 36.8, -1.3], ['SINGAPORE', 103.8, 1.35],
  ];
  const LAGOS = [3.38, 6.52];
  const rad = Math.PI / 180;
  const sph = (lon, lat) => [Math.cos(lat * rad) * Math.sin(lon * rad), -Math.sin(lat * rad), Math.cos(lat * rad) * Math.cos(lon * rad)];
  function globeFrame(t) {
    const local = t - TL.globe;
    const R = pick(360, 330, 380) * S * lerp(0.2, 1, E.outCubic(prog(local, 0, 0.9)));
    const endT = prog(t, TL.end, 1.2);
    const lon0 = lerp(-70, -8, E.inOutCubic(prog(local, 0, 2.2))) - Math.max(0, local - 2.2) * 6;
    const cy = lerp(CY - pick(10, 20, 40) * S, CY - H * pick(0.2, 0.24, 0.24), E.inOutCubic(endT));
    const Rf = R * lerp(1, pick(0.6, 0.55, 0.62), E.inOutCubic(endT));
    return { R: Rf, lon0, tilt: -12 * rad, cx: CX, cy, local, endT };
  }
  function gproj(G, v) {
    const cl = Math.cos(G.lon0 * rad), sl = Math.sin(G.lon0 * rad);
    let x = v[0] * cl + v[2] * sl, z = -v[0] * sl + v[2] * cl, y = v[1];
    const ct = Math.cos(G.tilt), st = Math.sin(G.tilt);
    [y, z] = [y * ct - z * st, y * st + z * ct];
    return { x: G.cx + x * G.R, y: G.cy + y * G.R, z };
  }
  function s4(ctx, t, dimForEnd = 0) {
    backdrop(ctx);
    const G = globeFrame(t);
    glow(ctx, G.cx, G.cy, G.R * 1.9, P.cyan, 0.35);
    ctx.fillStyle = 'rgba(6,12,28,0.9)';
    disc(ctx, G.cx, G.cy, G.R);
    ctx.strokeStyle = rgba(P.cyan, 0.35);
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.arc(G.cx, G.cy, G.R, 0, TAU);
    ctx.stroke();
    // land dots — Nigeria lights up gold
    const reveal = E.outCubic(prog(G.local, 0.1, 1.2));
    for (let i = 0; i < LAND.length; i++) {
      const [lon, lat] = LAND[i];
      if (hash(i) > reveal) continue;
      const q = gproj(G, sph(lon, lat));
      if (q.z < -0.05) continue;
      const ng = lon > 2.7 && lon < 14.7 && lat > 4.2 && lat < 13.9;
      const a = clamp(q.z * 1.4 + 0.15);
      ctx.fillStyle = ng ? rgba(P.amber, a) : rgba(P.cyan, a * 0.7);
      const sz = (ng ? 3.4 : 2.2) * S * (ng ? 1 + 0.4 * Math.max(0, Math.sin(t * 6)) : 1);
      ctx.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz);
    }
    const L = gproj(G, sph(...LAGOS));
    if (L.z > 0) {
      glow(ctx, L.x, L.y, 90 * S, P.amber, 0.9);
      for (let k = 0; k < 2; k++) {
        const f = frac(t * 0.9 + k / 2);
        ctx.strokeStyle = rgba(P.amber, (1 - f) * 0.8);
        ctx.lineWidth = 2 * S;
        ctx.beginPath();
        ctx.arc(L.x, L.y, (8 + f * 60) * S, 0, TAU);
        ctx.stroke();
      }
    }
    // light arcs from Lagos to the world
    const A = sph(...LAGOS);
    CITIES.forEach(([name, lon, lat], i) => {
      const t0 = TL.globe + 1.9 + i * 0.26, p = E.inOutCubic(prog(t, t0, 0.9));
      if (p <= 0) return;
      const B = sph(lon, lat), pts = [];
      const dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2], om = Math.acos(clamp(dot, -1, 1));
      for (let k = 0; k <= 40; k++) {
        const u = (k / 40) * p, s0 = Math.sin((1 - u) * om) / Math.sin(om), s1 = Math.sin(u * om) / Math.sin(om);
        const h = 1 + 0.22 * Math.sin(Math.PI * (k / 40)) * om;
        pts.push(gproj(G, [(A[0] * s0 + B[0] * s1) * h, (A[1] * s0 + B[1] * s1) * h, (A[2] * s0 + B[2] * s1) * h]));
      }
      ctx.lineCap = 'round';
      for (const [lw, al] of [[7, 0.15], [2.4, 0.95]]) {
        ctx.strokeStyle = rgba(P.cyan, al);
        ctx.lineWidth = lw * S;
        ctx.beginPath();
        pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.stroke();
      }
      const hd = pts[pts.length - 1];
      glow(ctx, hd.x, hd.y, 40 * S, P.cyan, 0.9);
      if (p >= 1 && hd.z > 0) {
        const f = prog(t, t0 + 0.9, 0.8);
        ctx.strokeStyle = rgba(P.white, 1 - f);
        ctx.lineWidth = 2 * S;
        ctx.beginPath();
        ctx.arc(hd.x, hd.y, (6 + f * 30) * S, 0, TAU);
        ctx.stroke();
        setFont(ctx, MONO, 600, 14 * S);
        ctx.fillStyle = rgba(P.white, 0.8 * (1 - G.endT));
        ctx.fillText(name, hd.x + 10 * S, hd.y - 8 * S);
      }
    });
    // incoming project lights from act 4
    const inn = prog(t, TL.globe - 0.75, 0.9);
    if (inn < 1) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + t, r = (1 - E.inCubic(inn)) * 600 * S;
        glow(ctx, G.cx + Math.cos(a) * r, G.cy + Math.sin(a) * r * 0.5, 60 * S, WORK[i][2], 1 - inn);
      }
    }
    if (!dimForEnd) caption(ctx, t, TL.globe + 1.2, TL.end, 'BASED IN NIGERIA', 'Built in Nigeria. Deployed worldwide.');
  }

  /* ═════════ END CARD (31.2 – 36) ═════════ */
  function s5(ctx, t) {
    s4(ctx, t, 1);
    const local = t - TL.end;
    const name = 'LOUIS ODIATU';
    const size = pick(150, 128, 132) * S;
    const y = CY + pick(170, 150, 200) * S;
    setFont(ctx, SANS, 900, size, 'condensed');
    ctx.letterSpacing = `${size * 0.04}px`;
    const tw = ctx.measureText(name).width;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y - size, W, size * 1.2);
    ctx.clip();
    let x = CX - tw / 2;
    for (let j = 0; j < name.length; j++) {
      const q = EZ.snap(prog(local, 0.05 + j * 0.035, 0.6));
      const w = ctx.measureText(name[j]).width;
      ctx.fillStyle = P.white;
      ctx.fillText(name[j], x, y + (1 - q) * size * 1.1);
      x += w + size * 0.04;
    }
    ctx.restore();
    ctx.letterSpacing = '0px';
    const ln = E.outExpo(prog(local, 0.5, 0.8));
    ctx.fillStyle = rgba(P.cyan, 0.8);
    ctx.fillRect(CX - (tw / 2) * ln, y + 30 * S, tw * ln, 3 * S);
    const line = (txt, yy, t0, font, col) => {
      const a = EZ.snap(prog(local, t0, 0.5));
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
      font();
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.fillText(txt, CX, yy + (1 - a) * 16 * S);
      ctx.restore();
    };
    line('AI Automation & Product Engineer', y + 90 * S, 0.6, () => setFont(ctx, SANS, 600, pick(44, 40, 42) * S), P.white);
    line('Open to remote roles worldwide', y + 146 * S, 0.9, () => setFont(ctx, SANS, 500, pick(32, 30, 32) * S), P.cyan);
    // CTA pill
    const cp = E.outBack(prog(local, 1.2, 0.5), 1.8);
    if (cp > 0) {
      const txt = "Let's build  →  linkedin.com/in/louis-odiatu";
      setFont(ctx, SANS, 700, pick(28, 26, 28) * S);
      const pw = ctx.measureText(txt).width + 70 * S, ph = 70 * S, py = y + pick(230, 220, 240) * S;
      ctx.save();
      ctx.translate(CX, py);
      ctx.scale(cp, cp);
      ctx.fillStyle = P.cyan;
      ctx.beginPath();
      ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
      ctx.fill();
      ctx.fillStyle = P.bg;
      ctx.textAlign = 'center';
      ctx.fillText(txt, 0, 10 * S);
      ctx.restore();
      glow(ctx, CX, py, pw * 0.7, P.cyan, 0.25 * cp);
    }
    line('Made in code — every frame rendered from one function of time.', H - pick(50, 50, 70) * S, 1.6, () => {
      setFont(ctx, MONO, 500, 15 * S);
    }, rgba(P.dim, 0.9));
  }

  /* ═════════ edit ═════════ */
  function renderScene(ctx, t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = '0px';
    const [sx, sy] = shake(t);
    ctx.translate(sx, sy);
    if (t < 5.4) {
      camAt(5.9); // the first node's screen position, where the shattered prompt converges
      const pr = project(NODES[0].p);
      if (pr) {
        S1.n0x = pr.x;
        S1.n0y = pr.y;
      }
      if (t > 4.6) {
        s1(ctx, t, E.inOutCubic(prog(t, 4.6, 0.8)));
        ctx.save();
        ctx.globalAlpha = 1 - prog(t, 4.6, 0.8);
        s0(ctx, t);
        ctx.restore();
      } else s0(ctx, t);
    } else if (t < TL.product) s1(ctx, t);
    else if (t < TL.orbit) s2(ctx, t);
    else if (t < TL.globe) s3(ctx, t);
    else if (t < TL.end) s4(ctx, t);
    else s5(ctx, t);
  }

  /* ═════════ lens + film ═════════ */
  let outCtx, sceneC, sceneCtx, accC, accCtx, chC, chCtx, sm1, sm2, vignette, grains;
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
  function bloom(o, src, amt) {
    const a = sm1.getContext('2d'), c = sm2.getContext('2d');
    a.filter = 'blur(3px)';
    a.drawImage(src, 0, 0, sm1.width, sm1.height);
    a.filter = 'none';
    c.filter = 'blur(3px)';
    c.drawImage(sm1, 0, 0, sm2.width, sm2.height);
    c.filter = 'none';
    o.globalCompositeOperation = 'screen';
    o.globalAlpha = amt * 0.55;
    o.drawImage(sm1, 0, 0, W, H);
    o.globalAlpha = amt * 0.75;
    o.drawImage(sm2, 0, 0, W, H);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
  }
  // thin cinematic bars top and bottom
  function letterbox(o) {
    const k = pick(0.03, 0.02, 0.018) * H;
    o.fillStyle = '#000';
    o.fillRect(0, 0, W, k);
    o.fillRect(0, H - k, W, k);
  }
  function drawTime(t, frame, opts = {}) {
    const sub = opts.subframes ?? 8, shutter = opts.shutter ?? 0.5;
    for (let k = 0; k < sub; k++) {
      const ts = sub === 1 ? t : t + ((k + 0.5) / sub - 0.5) * (shutter / FPS);
      sceneCtx.save();
      renderScene(sceneCtx, clamp(ts, 0, DURATION - 0.001));
      sceneCtx.restore();
      accCtx.globalAlpha = 1 / (k + 1);
      accCtx.drawImage(sceneC, 0, 0);
    }
    accCtx.globalAlpha = 1;
    const o = outCtx;
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    const ca = aberration(t) * 9 * S;
    if (ca > 0.35) chromatic(o, accC, ca);
    else o.drawImage(accC, 0, 0);
    bloom(o, accC, 0.6);
    o.drawImage(vignette, 0, 0);
    o.globalCompositeOperation = 'overlay';
    o.globalAlpha = 0.07;
    o.drawImage(grains[frame % grains.length], 0, 0, W, H);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    letterbox(o);
    // fade in from black, fade to black at the very end
    const fb = Math.max(1 - prog(t, 0, 0.35), prog(t, DURATION - 0.3, 0.3));
    if (fb > 0) {
      o.fillStyle = `rgba(0,0,0,${fb})`;
      o.fillRect(0, 0, W, H);
    }
  }

  async function init(canvas) {
    await Promise.all(['900 100px Archivo', '800 100px Archivo', '700 100px Archivo', '500 100px Archivo', `500 20px ${MONO}`, `700 20px ${MONO}`].map((f) => document.fonts.load(f, 'A→✓·')));
    await document.fonts.ready;
    outCtx = canvas.getContext('2d');
    sceneC = makeCanvas();
    sceneCtx = sceneC.getContext('2d');
    accC = makeCanvas();
    accCtx = accC.getContext('2d');
    chC = makeCanvas();
    chCtx = chC.getContext('2d');
    sm1 = makeCanvas(W / 4, H / 4);
    sm2 = makeCanvas(W / 16, H / 16);
    vignette = makeCanvas();
    const v = vignette.getContext('2d'), g = v.createRadialGradient(CX, CY, Math.min(W, H) * 0.35, CX, CY, DIAG);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    v.fillStyle = g;
    v.fillRect(0, 0, W, H);
    grains = [0, 1, 2, 3].map((k) => {
      const c = makeCanvas(W / 2, H / 2), gc = c.getContext('2d'), id = gc.createImageData(c.width, c.height), r = rng(k * 99 + 1);
      for (let p = 0; p < id.data.length; p += 4) {
        const n = 128 + (r() + r() + r() - 1.5) * 150;
        id.data[p] = id.data[p + 1] = id.data[p + 2] = n;
        id.data[p + 3] = 255;
      }
      gc.putImageData(id, 0, 0);
      return c;
    });
    GLOW = {};
    for (const col of [P.cyan, P.amber, P.green, P.violet, P.white]) {
      const c = makeCanvas(256, 256), gc = c.getContext('2d'), gr = gc.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, rgba(col, 0.9));
      gr.addColorStop(0.25, rgba(col, 0.35));
      gr.addColorStop(1, rgba(col, 0));
      gc.fillStyle = gr;
      gc.fillRect(0, 0, 256, 256);
      GLOW[col] = c;
    }
    buildCards();
    buildWork();
  }

  root.FILM = {
    W, H, FPS, DURATION,
    FRAMES: Math.round(DURATION * FPS),
    init,
    drawFrame: (i, opts) => drawTime(i / FPS, i, opts),
    drawTime: (t, opts) => drawTime(t, Math.floor(t * FPS), opts),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
