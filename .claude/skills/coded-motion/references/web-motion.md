# Web mode: motion design on websites

Load this for any interactive, on-site motion job: a hero, scroll storytelling, 3D/WebGL, page
transitions, animated type or micro-interactions. The brief, design system, easing and review
discipline from `SKILL.md` all still apply. The differences are that the output runs live on
every visitor's device, and that performance, accessibility and SEO become part of the craft.

## 1. Pick the lightest stack that does the job
Check versions at build time (`npm view <pkg> version`); the ones in brackets were current when
this was written.

| Job | Use |
|---|---|
| Hover, focus, toggles, small UI state | CSS transitions / Web Animations API. No library. |
| Timelines, staggered reveals, scroll storytelling, pinning, scrubbing | GSAP (3.15) + ScrollTrigger + SplitText. All plugins ship in the free `gsap` package. |
| Smooth scrolling that keeps native scroll semantics | Lenis (1.3), driven from GSAP's ticker |
| React / Next.js component motion, layout and exit animation | Motion (13), imported from `motion/react` |
| 3D, shaders, particles, product or logo scenes | Three.js (0.186), or React Three Fiber (9) + drei (10) in React; `postprocessing` (6) for bloom, depth of field and grain |
| Scroll-linked effects with no JS | CSS `animation-timeline: view()` / `scroll()`, guarded by `@supports` because browser support varies |
| Page and route transitions | View Transitions API: `document.startViewTransition()`, or cross-document `@view-transition { navigation: auto; }` |
| Designer-made vector animation | dotLottie for After Effects exports; Rive when it needs interactive state machines |
| Hand-keyframed 3D camera paths | Theatre.js (0.7), optional |

Use `WebGLRenderer` by default. Choose `WebGPURenderer` from `three/webgpu` only when you need TSL
node materials or compute; it falls back to WebGL2 automatically, and you must
`await renderer.init()` first.

## 2. Craft rules on the web
- **One big idea.** Build one signature moment, such as the hero or one scroll chapter, instead of animating everything. Motion should guide the reader toward the next thing to read or click.
- **Timing.** UI feedback takes 150–300 ms, and hover responses start in under 100 ms. Hero reveals take 0.8–1.4 s, and staggers are 30–80 ms per item. Reuse the `bezier()` and `spring()` curves from the video engine so the site and its promo videos move the same way.
- **Compositor only.** Animate `transform`, `opacity` and `filter`, never layout properties. Use `will-change` only while an element is animating.
- **Content never waits.** The page must be readable before any JS runs. Set the start states from JS, for example with a `.js` class on `<html>`, so a script failure never leaves text invisible.
- **Type.** Use SplitText with `mask: "lines"` for line reveals. Keep the text as real DOM text; never paint copy into a canvas.
- **Scroll.** Pin and scrub, but never hijack native scrolling. The scrollbar, keyboard, find-in-page and anchor links must all keep working.
- **3D look.**
  - Colour: set `outputColorSpace = SRGBColorSpace`, use AgX or ACES tone mapping, and light with an HDRI environment plus one key light.
  - Postprocessing: add bloom, grain and vignette to match the video grade.
  - Many copies: draw them with `InstancedMesh` or `Points`, never thousands of separate meshes.

## 3. Budgets and fallbacks (all required)
- **Core Web Vitals:** LCP < 2.5 s, CLS < 0.1, INP < 200 ms. Show a poster image first, and lazy-load the 3D chunk with `import()` after LCP.
- **Frame rate:** 60 fps on a mid-range Android phone, tested with 4× CPU throttling. Cap `setPixelRatio(Math.min(devicePixelRatio, 1.75))`.
- **Pause when not visible:** stop rendering when the canvas is offscreen (IntersectionObserver) or the tab is hidden (`visibilitychange`).
- **3D assets:** compress them, for example `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp`, and load them with `GLTFLoader.setMeshoptDecoder()`.
- **No WebGL2 or lost context:** handle a failed `getContext('webgl2')` and the `webglcontextlost` event by keeping the poster image in place.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, drop smooth scroll, parallax, scrubbing and autoplay loops. Show the final state with a short fade instead.
- **Flashes:** never more than 3 per second (WCAG 2.3.1). This covers impact flashes too, in video as well as on the web.

## 4. Skeletons

GSAP + Lenis + SplitText, with reduced motion handled in one place:
```js
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
gsap.registerPlugin(ScrollTrigger, SplitText);

const mm = gsap.matchMedia();
mm.add({ motion: "(prefers-reduced-motion: no-preference)",
         reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
  if (ctx.conditions.reduce) {                       // final state, gentle fade only
    gsap.from(".reveal", { opacity: 0, duration: 0.4 });
    return;
  }
  const lenis = new Lenis();
  lenis.on("scroll", ScrollTrigger.update);
  const raf = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);

  SplitText.create(".hero h1", {
    type: "lines", mask: "lines", autoSplit: true,
    onSplit: (self) => gsap.from(self.lines, {
      yPercent: 110, duration: 1.1, stagger: 0.06, ease: "expo.out" }),
  });
  gsap.timeline({ scrollTrigger: { trigger: ".chapter", pin: true, scrub: 1, end: "+=150%" } })
      .to(".chapter .stone", { scale: 0.2, rotate: 540, ease: "none" });

  return () => { gsap.ticker.remove(raf); lenis.destroy(); };
});
```

Three.js hero with a shared clock, pausing and a capture hook:
```js
import * as THREE from "three";
const capture = new URLSearchParams(location.search).has("capture");
const canvas = document.querySelector("canvas.hero");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true,
  powerPreference: "high-performance", preserveDrawingBuffer: capture });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.AgXToneMapping;

const clock = { t: 0, last: performance.now() };
function render(t) { /* pure function of t: camera path, uniforms, particles */ }
function loop(now) { clock.t += (now - clock.last) / 1000; clock.last = now; render(clock.t); }

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let onScreen = true, seeking = capture;
const update = () => {
  clock.last = performance.now();
  const on = onScreen && !document.hidden && !reduce && !seeking;
  renderer.setAnimationLoop(on ? loop : null);
};
new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; update(); }).observe(canvas);
document.addEventListener("visibilitychange", update);
if (reduce) render(2.0);                            // one designed still frame
update();

// the bridge to video: the MP4 engine seeks the same scene frame by frame
window.__motion = { seek(t) { seeking = true; update(); clock.t = t; render(t); } };
```

## 5. Bridge to the video engine
Every web scene exposes `window.__motion.seek(t)` and renders deterministically when the page is
loaded with `?capture`. `render.js` can then drive it with Playwright: for each sub-frame it calls
`seek`, screenshots the canvas, and ffmpeg encodes the result. One piece of work ships as both the
live site hero and 16:9 / 9:16 / 1:1 promo videos, with the synthesized score laid under the
video versions.

## 6. Review loop for web
1. Serve a production build (`vite build && vite preview`) and open it in Playwright. Screenshot it at 390×844, 768×1024 and 1440×900, at the top of the page and at each scroll chapter. Build a contact sheet and actually look at it.
2. Repeat with `page.emulateMedia({ reducedMotion: "reduce" })` and confirm that everything is readable and static.
3. Throttle the CPU 4× through CDP (`Emulation.setCPUThrottlingRate`), count `requestAnimationFrame` calls over 3 s while scrolling, and report the fps.
4. Run Lighthouse in mobile mode. Report LCP, CLS, INP and TBT, and fix anything that is over budget.
5. Fail the review on any console error or unhandled promise rejection. Also check that the page still works with JS disabled and after a forced `webglcontextlost`.
6. Deliver the static build and a README (the idea, the stack and why, budgets met, how to run and deploy), plus preview captures (a scroll-through MP4 and stills). Publish a preview link when the environment can.
