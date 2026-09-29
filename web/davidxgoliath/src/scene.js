import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

// ------------------------------------------------------------ seeded noise
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i).sort(() => rnd() - 0.5);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y, z) => {
    const u = (h & 15) < 8 ? x : y, v = (h & 15) < 4 ? y : (h & 15) === 12 || (h & 15) === 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const noise = (x, y, z) => {                       // classic Perlin, -1..1
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z, B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
      lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  };
  return (x, y, z, oct = 4) => {
    let a = 0.5, f = 1, s = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
    return s;
  };
}

// ------------------------------------------------------------ a smooth stone
function makeStone(seed, detail) {
  const fbm = makeNoise(seed);
  const rnd = mulberry32(seed * 7 + 1);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const squash = [1.28 + rnd() * 0.15, 0.82 + rnd() * 0.08, 1.0 + rnd() * 0.1];
  const v = new THREE.Vector3();
  const basalt = new THREE.Color("#0f0f10"), grey = new THREE.Color("#262523"), fleck = new THREE.Color("#b9b2a4"), gold = new THREE.Color("#c9a45e");
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.x * 1.1, v.y * 1.1, v.z * 1.1, 3);         // gentle, river-worn shape
    const r = 1 + 0.1 * n + 0.004 * fbm(v.x * 7, v.y * 7, v.z * 7, 2);
    v.multiplyScalar(r).multiply(new THREE.Vector3(...squash));
    pos.setXYZ(i, v.x, v.y, v.z);
    const m = fbm(v.x * 3 + 11, v.y * 3, v.z * 3, 3);
    const sp = fbm(v.x * 26, v.y * 26, v.z * 26, 1);             // quartz / mica flecks
    const c = basalt.clone().lerp(grey, THREE.MathUtils.clamp(m * 1.2 + 0.35, 0, 1));
    if (sp > 0.36) c.lerp(fleck, 0.8);
    else if (sp < -0.42) c.lerp(gold, 0.55);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ dust
function makeDust(count) {
  const rnd = mulberry32(99);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(rnd() - 0.5) * 16, (rnd() - 0.5) * 10, (rnd() - 0.5) * 8 - 1], i * 3);
    seed[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uDensity: { value: 0.4 }, uBurst: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime, uBurst, uPixel;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += uTime * (0.10 + 0.25 * seed) + sin(uTime * 0.4 + seed * 40.0) * 0.3;
        p.y += sin(uTime * 0.3 + seed * 17.0) * 0.25 + uTime * 0.03;
        p.xy += normalize(p.xy + 0.001) * uBurst * (1.5 + 3.0 * seed);
        p.x = mod(p.x + 8.0, 16.0) - 8.0;
        p.y = mod(p.y + 5.0, 10.0) - 5.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPixel * (2.0 + 5.0 * seed) * (6.0 / -mv.z);
        vA = 0.35 + 0.65 * fract(seed * 13.7);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uDensity;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a * vA * uDensity, a * vA * uDensity);
      }`,
  });
  return new THREE.Points(g, m);
}

// ------------------------------------------------------------ easing
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIn = (t) => t * t * t;
const presenceW = (p) => smooth(0, 0.5, p) * (1 - smooth(0.5, 1, p)); // bell over a section's pass

// ------------------------------------------------------------ start
export function start(canvas, state, { capture = false } = {}) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, preserveDrawingBuffer: capture });
  if (!gl) return null;                                            // stills stay as the fallback

  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const key = new THREE.DirectionalLight("#ffd7a1", 4.2);        // low desert sun
  key.position.set(4, 5, 3);
  const rim = new THREE.DirectionalLight("#9fc4ff", 2.2);          // cool sky rim
  rim.position.set(-5, 2, -4);
  scene.add(key, rim, new THREE.AmbientLight("#3a2f24", 0.6));

  const small = matchMedia("(max-width: 760px)").matches;
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.0, clearcoat: 0.3, clearcoatRoughness: 0.45, envMapIntensity: 0.45 });
  const stone = new THREE.Mesh(makeStone(7, small ? 24 : 40), mat);
  scene.add(stone);
  const companions = [11, 23, 31, 47].map((s) => {
    const m = new THREE.Mesh(makeStone(s, small ? 10 : 16), mat);
    scene.add(m);
    return m;
  });
  const dust = makeDust(small ? 450 : 900);
  scene.add(dust);

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dust.material.uniforms.uPixel.value = renderer.getPixelRatio() * (h / 900);
  }
  addEventListener("resize", resize);
  resize();

  const P = new THREE.Vector3();
  function pose(t) {
    const tall = camera.aspect < 0.8;
    const pk = (land, portrait) => (tall ? portrait : land);
    const s = state;

    // weighted blend of where the stone wants to be in each chapter
    const ws = {
      hero: 1 - smooth(0.5, 1, s.hero),
      brook: presenceW(s.brook),
      champion: presenceW(s.champion),
      sling: s.sling > 0 && s.sling < 0.905 ? 1 : 0,
    };
    const poses = {
      hero: [pk(2.35, 0), pk(0.3, 1.35), 0, pk(1.2, 0.5)],
      brook: [pk(2.0, 0.25), pk(-0.2, 1.45) + 0.25 * smooth(0.3, 0.55, s.brook), 0.6, pk(0.95, 0.45)],
      champion: [pk(-2.9, -0.9), pk(-2.2, 2.3), 0, pk(0.38, 0.3)],
    };
    // IV: whirl in the sling, then the throw straight at the reader
    const sl = s.sling;
    const whirlC = [pk(2.4, 0.4), pk(1.2, 1.6), 0];
    const spinA = sl * sl * 90;
    const whirl = [whirlC[0] + Math.cos(spinA) * 0.55, whirlC[1] + Math.sin(spinA) * 0.35, whirlC[2]];
    const fly = easeIn(smooth(0.42, 0.9, sl));
    poses.sling = [
      THREE.MathUtils.lerp(whirl[0], 0, fly),
      THREE.MathUtils.lerp(whirl[1], 0.05, fly) + Math.sin(fly * Math.PI) * 0.6,
      THREE.MathUtils.lerp(whirl[2], 7.0, fly),
      THREE.MathUtils.lerp(pk(0.42, 0.38), 0.55, fly),
    ];
    if (ws.sling) { ws.hero = ws.brook = ws.champion = 0; }

    let wsum = 0; P.set(0, 0, 0); let scale = 0;
    for (const k of Object.keys(ws)) {
      const w = ws[k]; if (!w) continue;
      P.x += poses[k][0] * w; P.y += poses[k][1] * w; P.z += poses[k][2] * w; scale += poses[k][3] * w; wsum += w;
    }
    if (wsum > 0) { P.divideScalar(Math.max(1, wsum)); scale /= Math.max(1, wsum); }
    // anything not covered by a pose shrinks the stone away (answer, fall, battle)
    scale *= Math.min(1, wsum);
    return { scale, spin: spinA * (ws.sling ? 1 : 0) + fly * 30, tall };
  }

  const shake = new THREE.Vector3();
  function renderAt(t) {
    state.clock = t;
    const { scale, spin, tall } = pose(t);
    stone.position.copy(P).add(new THREE.Vector3(0, Math.sin(t * 0.8) * 0.06, 0));
    stone.scale.setScalar(Math.max(scale, 1e-4));
    stone.visible = scale > 0.01;
    stone.rotation.set(0.35 + Math.sin(t * 0.21) * 0.25 + spin * 0.6, t * 0.25 + spin, 0.2 + Math.sin(t * 0.17) * 0.15);

    // I: four more stones rise out of the brook; the chosen one stays lit
    const b = state.brook;
    companions.forEach((m, i) => {
      const rise = smooth(0.18 + i * 0.05, 0.42 + i * 0.05, b) * (1 - smooth(0.62, 0.8, b));
      const ang = -0.9 + i * 0.6;
      m.position.set(
        (tall ? 0 : 2.0) + Math.cos(ang) * (tall ? 1.5 : 2.1),
        (tall ? 1.45 : -0.2) - 1.3 + Math.sin(ang) * 0.35 - (1 - rise) * 2.5,
        -0.8 - i * 0.2);
      m.scale.setScalar((tall ? 0.34 : 0.5) * rise + 1e-4);
      m.visible = rise > 0.01;
      m.rotation.set(t * 0.2 + i, t * 0.3 + i * 2, i);
    });

    // dust: always drifting, heavier after the strike and the fall
    const u = dust.material.uniforms;
    u.uTime.value = t;
    const sinceStrike = t - state.strikeClock;
    u.uBurst.value = sinceStrike >= 0 ? Math.exp(-sinceStrike * 1.5) * (1 - Math.exp(-sinceStrike * 12)) : 0;
    u.uDensity.value = 0.35 + 0.9 * presenceW(state.fall) + 0.6 * u.uBurst.value;

    // camera: gentle drift + decaying shake on the strike
    const k = sinceStrike >= 0 ? Math.exp(-sinceStrike * 5) : 0;
    shake.set(Math.sin(t * 83) * k * 0.25, Math.cos(t * 71) * k * 0.2, 0);
    camera.position.set(Math.sin(t * 0.13) * 0.12 + shake.x, Math.cos(t * 0.11) * 0.08 + shake.y, 9);
    camera.lookAt(shake.x * 0.5, shake.y * 0.5, 0);
    renderer.render(scene, camera);
  }

  // live loop: a pure function of time, paused when hidden or past the story
  // adaptive quality: slow devices drop to DPR 1, then to rendering only when the story moves
  let t0 = performance.now(), last = t0, frames = 0, slow = 0, lite = false, lastKey = "";
  const loop = (now) => {
    const dt = now - last; last = now; frames++;
    if (frames > 20 && !lite) {
      slow = dt > 45 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 20) {
        if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); slow = 0; }
        else lite = true;
      }
    }
    if (lite) {
      const key = [state.hero, state.brook, state.champion, state.sling, state.fall].map((v) => v.toFixed(3)).join();
      if (key === lastKey && frames % 8) return;
      lastKey = key;
    }
    renderAt((now - t0) / 1000);
  };
  const update = () => {
    const on = !capture && state.running && !document.hidden;
    renderer.setAnimationLoop(on ? loop : null);
  };
  document.addEventListener("visibilitychange", update);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); renderer.setAnimationLoop(null); canvas.style.display = "none"; });
  update();
  if (capture) renderAt(0);

  return { renderAt, update };
}
