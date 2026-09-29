# David × Goliath: scroll-story website

A one-page scroll story of 1 Samuel 17, built with the `coded-motion` skill in Web mode.
See [BRIEF.md](BRIEF.md).

**The idea: "your scroll is the sling."** One real-time 3D stone travels the whole page:
- it is chosen from the brook
- it is weighed against the giant
- then it whirls in the sling and is thrown straight at the reader by the reader's own scroll, ending in a single flash.

## Chapters

| # | Chapter | Motion |
|---|---|---|
| 0 | Hero | Headline characters rise through masks from the centre, and the gold rule draws on. The stone turns in low desert light. |
| I | The Brook (17:40) | Four more procedural stones rise out of the brook beside the chosen one. The verse reveals line by line. |
| II | The Champion (17:4–7) | A gold ruler draws up to "six cubits and a span" as you scroll, and the armour weights count up once |
| III | The Answer (17:45) | Centred verse reveal over the stone hanging before the giant |
| IV | The Sling (17:48–49) | Pinned for 260% of the viewport height: the verse beats reveal in order while the stone whirls, then flies at the camera. The still swaps to the strike, with one flash (rate-limited to one per second) and a camera shake. |
| V | The Fall (17:49) | The dust particles thicken and burst after the strike |
| VI | The Battle (17:47) | Large gold title |
| VII | The Film | The 30s cinematic cut from `motion/davidxgoliath`, 720p, click to play |

## Stack

- **Vite 8** for the build.
- **Three.js 0.186** for the procedural river stones: Perlin-displaced icosahedra with quartz flecks, a clearcoat physical material, RoomEnvironment IBL, AgX tone mapping and a dust shader.
- **GSAP 3.15** (ScrollTrigger + SplitText) and **Lenis 1.3** for the scroll choreography.
- Self-hosted Cinzel and Cormorant Garamond via fontsource.
- The chapter stills are graded frames exported from the film pipeline.

## Budgets and fallbacks

- The hero headline and hero image paint first. The 3D chunk (138 KB gzipped) loads with `import()` after `load`, when the browser is idle.
- The pixel ratio is capped at 1.75. Rendering stops when the tab is hidden and once the film section is reached.
- Adaptive quality: sustained frames over 45 ms drop the pixel ratio to 1. If frames are still slow, the scene renders only when the scroll state changes.
- `prefers-reduced-motion`: no WebGL, no Lenis, no scrub and no flash; the page shows the static stills and the full text.
- Without JS, the whole story is readable, because the start states are applied by JS and a 3 s failsafe removes them.
- No WebGL2, or a lost context: the canvas hides and the stills remain.

Measured in the build sandbox, which has no GPU:

| Check | Result |
|---|---|
| Lighthouse mobile scores | Accessibility 100, Best practices 100, SEO 100, Performance 63 |
| LCP / CLS | 2.7 s / 0 |
| Console errors at 390, 768 and 1440 px | 0 |

The Performance score and total blocking time are dominated by WebGL rendering in software on the main thread, which a real GPU doesn't do. Re-measure on a real phone before shipping.

## Run

```bash
npm install
npm run dev                 # local dev
npm run build && npm run preview
node scripts/review.mjs     # screenshots at 390/768/1440 per chapter, reduced-motion + no-JS checks, fps
node scripts/capture.mjs    # scroll-through MP4 via window.__motion.seek(t)  (SIZE=1080x1920 for vertical)
```

`?capture&duration=36` makes the page deterministic. GSAP's ticker is detached, and
`window.__motion.seek(t)` sets the scroll position, advances GSAP and renders the 3D frame for
time `t`. That is the bridge the video engine uses to turn this site into promo videos.
