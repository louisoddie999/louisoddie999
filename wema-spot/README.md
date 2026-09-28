# Wema Bank — "First is a habit."

A 30-second spec spot for Wema Bank, delivered in **16:9** (TV/YouTube), **9:16** (Reels/TikTok/Status) and **1:1** (feed). Each format is laid out separately for its frame, not cropped from the others.

Final renders: [`renders/`](renders/)

> Spec concept. It is not an official Wema Bank advertisement and uses no official logo files.

**Idea:** one purple line runs from a 1945 ledger to a 2026 phone. The oldest surviving indigenous bank in Nigeria also built the country's first fully digital bank, because *first is a habit.* See [`BRIEF.md`](BRIEF.md) for the full creative brief and sources.

| Bars | Act | Beats |
| --- | --- | --- |
| 0–2 | Heritage | Ledger, Agbonmagbe stamp, "a bank for Nigerians." The year rolls 1945 → 1969 → 2017, the serif turns sans, and ledger lines become circuits. The camera dives through the "0". |
| 3–4 | The drop | A phone slams in on an amapiano drop: "Nigeria's first fully digital bank." "No branch. No paper. No wahala." The phone shows onboarding with phone number + BVN → ✓. |
| 5–8 | Money in motion | **Send** (₦ coins arc across a map of Nigeria) · **Save** (the country morphs into goal rings) · **Pay** (card spin, contactless tap) · **Grow** (bars rise into the Lagos skyline) |
| 9–11 | For every Nigerian | Hustlers / builders / dreamers / first-timers · *Ẹ kú iṣẹ́ · Nnọọ · Sannu · How far?* · a printed receipt of firsts |
| 12–13 | Resolve | The receipt collapses into one thread that draws a W. **Wema Bank. First is a habit.** Then "Oya, move first." The talking drum speaks the tagline. |

## How it's built
- `spot.js` holds a deterministic renderer, `render(t)`, that draws Canvas 2D frames at 60 fps and averages 8 sub-frames per frame for motion blur. It also applies grain, bloom, and camera shake with chromatic aberration on the hits. `?format=16x9|1x1|9x16` selects the layout.
- `timeline.js` holds the shared clock (112 BPM, 14 bars = exactly 30 s) and the talking-drum hits. The drum hits make the purple line vibrate on screen.
- `audio.js` synthesizes the original score with no samples: a Karplus–Strong highlife guitar, talking drum, FM Rhodes, agogô bell, shaker, amapiano log drum, pads and every sound effect.
- `nigeria.js` is the map outline from Natural Earth (public domain).

```bash
npm install
npm run build          # out/reel.wav, then out/wema-first-is-a-habit-{16x9,9x16,1x1}.mp4
node render.js --format 9x16 --stills 7.2,28.9 --sub 2   # quick review stills
```

Fonts: Archivo, Fraunces and JetBrains Mono, all under the SIL Open Font License (see `fonts/`).
