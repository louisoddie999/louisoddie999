import "./style.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, SplitText);

const params = new URLSearchParams(location.search);
const CAPTURE = params.has("capture");
const SCRUB = CAPTURE ? true : 1;

/** Shared story state read by the 3D scene every frame. */
export const state = {
  hero: 0.5, brook: 0, champion: 0, answer: 0, sling: 0, slingPresence: 0, fall: 0, battle: 0,
  strikeAt: -1e9, strikeClock: -1e9, clock: 0, running: true,
};

// ---------------------------------------------------------------- ruler
const CUBITS = 6.5; // six cubits and a span
const ticks = document.querySelector(".ruler__ticks");
if (ticks) {
  const ns = "http://www.w3.org/2000/svg";
  for (let i = 1; i <= 7; i++) {
    const c = Math.min(i, CUBITS);
    const y = 600 - (c / CUBITS) * 600;
    const l = document.createElementNS(ns, "line");
    Object.entries({ x1: 18, x2: 42, y1: y, y2: y }).forEach(([k, v]) => l.setAttribute(k, v));
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", 50);
    t.setAttribute("y", y + 5);
    t.textContent = i <= 6 ? String(i) : "+ span";
    ticks.append(l, t);
  }
}

// ---------------------------------------------------------------- helpers
function presence(sel, key) {
  ScrollTrigger.create({
    trigger: sel, start: "top bottom", end: "bottom top",
    onUpdate: (self) => { state[key] = self.progress; },
    onRefresh: (self) => { state[key] = self.progress; },
  });
}

function flash() {
  const now = performance.now();
  if (now - state.strikeAt < 1000) return; // never more than one flash per second
  state.strikeAt = now;
  state.strikeClock = state.clock;
  gsap.fromTo(".flash", { opacity: 0.85 }, { opacity: 0, duration: 0.45, ease: "power2.out", overwrite: true });
}

function counters() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const end = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.dec || "0", 10);
    const fmt = (v) => v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const o = { v: 0 };
    el.textContent = fmt(0);
    gsap.to(o, {
      v: end, duration: 1.6, ease: "expo.out",
      onUpdate: () => { el.textContent = fmt(o.v); },
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
    });
  });
}

// ---------------------------------------------------------------- motion
const mm = gsap.matchMedia();
mm.add({ motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
  if (ctx.conditions.reduce) {
    gsap.set("[data-hero]", { opacity: 1 });
    return; // static stills + text, no WebGL, no smooth scroll
  }

  let scene = null;

  // smooth scroll (not in capture mode, where seek() drives the scroll position)
  let lenis;
  if (!CAPTURE) {
    lenis = new Lenis({ lerp: 0.09 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // reading progress: the gold rule motif
  gsap.to(".progress span", { scaleX: 1, ease: "none",
    scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: SCRUB } });

  // hero intro
  const intro = gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.15 });
  intro.set("[data-hero]", { opacity: 1 })
    .from(".hero .eyebrow", { opacity: 0, letterSpacing: "0.9em", duration: 1.6 }, 0);
  SplitText.create(".hero h1", {
    type: "words,chars", mask: "chars", autoSplit: true,
    onSplit: (self) => intro.from(self.chars, { yPercent: 120, rotate: 6, duration: 1.3, stagger: { each: 0.045, from: "center" } }, 0.2),
  });
  intro.from(".hero .rule", { scaleX: 0, duration: 1.4 }, 0.7)
    .from(".hero .lede", { opacity: 0, y: 20, duration: 1.2 }, 0.9)
    .from(".cue", { opacity: 0, duration: 1 }, 1.4);

  // hero exit
  gsap.to(".copy--hero", { yPercent: -35, opacity: 0, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 30%", scrub: SCRUB } });

  // parallax stills
  gsap.utils.toArray(".chapter:not(.sling) .bg img").forEach((img) => {
    gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: "none",
      scrollTrigger: { trigger: img.closest(".chapter"), start: "top bottom", end: "bottom top", scrub: SCRUB } });
  });

  // chapter headings: rise through a mask; verses: line by line
  gsap.utils.toArray(".chapter h2[data-split]").forEach((el) => {
    SplitText.create(el, {
      type: "words", mask: "words", aria: "none", autoSplit: true,
      onSplit: (self) => gsap.from(self.words, { yPercent: 110, duration: 1.1, ease: "expo.out", stagger: 0.06,
        scrollTrigger: { trigger: el, start: "top 82%", toggleActions: "play none none reverse" } }),
    });
  });
  gsap.utils.toArray("[data-lines]").forEach((el) => {
    SplitText.create(el, {
      type: "lines", mask: "lines", aria: "none", autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, { yPercent: 105, duration: 1.1, ease: "expo.out", stagger: 0.08,
        scrollTrigger: { trigger: el, start: "top 85%", toggleActions: "play none none reverse" } }),
    });
  });
  gsap.utils.toArray(".chapter:not(.hero) .rule").forEach((el) => {
    gsap.from(el, { scaleX: 0, duration: 1.2, ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" } });
  });
  gsap.utils.toArray(".chapter:not(.hero) .num, .chapter cite").forEach((el) => {
    gsap.from(el, { opacity: 0, letterSpacing: "0.6em", duration: 1.2, ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 90%", toggleActions: "play none none reverse" } });
  });

  // II: the ruler draws up to six cubits and a span as you scroll; numbers count up once
  const spine = document.querySelector(".ruler__spine");
  if (spine) {
    gsap.fromTo(spine, { strokeDasharray: 600, strokeDashoffset: 600 }, { strokeDashoffset: 0, ease: "none",
      scrollTrigger: { trigger: ".champion", start: "top 70%", end: "center 40%", scrub: SCRUB } });
    gsap.from(".ruler__ticks > *", { opacity: 0, stagger: { each: 0.1, from: "start" }, ease: "none",
      scrollTrigger: { trigger: ".champion", start: "top 70%", end: "center 40%", scrub: SCRUB } });
  }
  counters();

  // IV: the pinned sling. The reader's scroll whirls and throws the stone.
  const beats = gsap.utils.toArray(".beats li");
  const sling = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: ".sling", pin: ".pin", start: "top top", end: "+=260%", scrub: SCRUB,
      onUpdate: (self) => {
        const prev = state.sling;
        state.sling = self.progress;
        if (prev < 0.9 && self.progress >= 0.9 && self.direction > 0) flash();
      },
    },
  });
  sling.from(beats[0], { opacity: 0.08, y: 24, duration: 0.1 }, 0.02)
    .from(beats[1], { opacity: 0.08, y: 24, duration: 0.1 }, 0.25)
    .from(beats[2], { opacity: 0.08, y: 24, duration: 0.08 }, 0.52)
    .from(beats[3], { opacity: 0.08, y: 24, duration: 0.08 }, 0.8)
    .fromTo(".bg--strike", { opacity: 0 }, { opacity: 1, duration: 0.05 }, 0.87)
    .fromTo(".sling .bg:not(.bg--strike) img", { scale: 1 }, { scale: 1.12, duration: 0.87 }, 0)
    .to({}, { duration: 0.05 }, 0.95);

  // V: dust takes over; the line settles in slow
  gsap.from(".fall .copy", { y: 60, ease: "none",
    scrollTrigger: { trigger: ".fall", start: "top bottom", end: "center center", scrub: SCRUB } });

  // presence of each chapter for the 3D scene
  presence(".hero", "hero");
  presence(".brook", "brook");
  presence(".champion", "champion");
  presence(".answer", "answer");
  presence(".sling", "slingPresence");
  presence(".fall", "fall");
  presence(".battle", "battle");

  // stop rendering 3D once the film is on screen
  ScrollTrigger.create({
    trigger: ".film", start: "top 60%",
    onEnter: () => { state.running = false; gsap.to(".stage", { opacity: 0, duration: 0.6 }); scene?.update(); },
    onLeaveBack: () => { state.running = true; gsap.to(".stage", { opacity: 1, duration: 0.6 }); scene?.update(); },
  });

  // 3D loads after the hero image (LCP) and when the browser is idle
  const boot = () => import("./scene.js").then((m) => {
    scene = m.start(document.querySelector(".stage"), state, { capture: CAPTURE });
    if (scene) gsap.from(".stage", { opacity: 0, duration: 1.2 });
  });
  if (document.readyState === "complete") (window.requestIdleCallback || setTimeout)(boot);
  else addEventListener("load", () => (window.requestIdleCallback || setTimeout)(boot), { once: true });

  // bridge to the video engine: deterministic seek for frame-by-frame capture
  if (CAPTURE) {
    gsap.ticker.remove(gsap.updateRoot);
    const DURATION = parseFloat(params.get("duration") || "40");
    window.__motion = {
      duration: DURATION,
      async ready() { await document.fonts.ready; while (!scene) await new Promise((r) => setTimeout(r, 50)); return true; },
      seek(t) {
        const max = ScrollTrigger.maxScroll(window);
        const u = Math.min(1, Math.max(0, t / DURATION));
        const eased = u < 0.04 ? 0 : (u - 0.04) / 0.96;       // hold on the hero for the intro
        window.scrollTo(0, eased * max);
        ScrollTrigger.update();
        gsap.updateRoot(t);
        scene?.renderAt(t);
      },
    };
  }

  return () => { lenis?.destroy(); };
});

window.__ready = true;
