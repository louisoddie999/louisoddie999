# Motion Reel

A 15-second, 1080p60 motion study. Every frame is drawn by one pure function of time, `render(t)`, with no keyframes, timeline or After Effects. The soundtrack is synthesized from the same clock, so each cut, hit and sweep lands on its beat.

**▶ [`motion-reel.mp4`](motion-reel.mp4)**

| Bar | Scene | What it shows |
| --- | --- | --- |
| 1 | Squash & Stretch | A dot with anticipation, velocity-based stretch, a membrane-like ground that dents and ripples, and a staggered ring burst |
| 2 | Kinetic Type | Variable-font letters that swell from weight 140 to 900 as they rise through masks, then slice apart |
| 3 | Morph | Shapes stored as polar radius tables and blended by superposed springs, with echo trails |
| 4 | Stagger | A match-cut zoom-out into a 943-tile grid with a radial pop, a ripple, a pixel-type sweep and a card-flip wave |
| 5 | Emergence | The tiles explode into 4.5k particles that swirl through a noise field and converge on the word *ALIVE* |
| 6 | Depth | A curving 3D tunnel whose camera position is ∫v dt, with speed surges on every beat |
| 7 | Principles | *Ease in*, *overshoot*, *anticipation* and *follow-through*, each driven by the curve plotted behind it |
| 8 | Resolve | An iris closes back to the opening dot, which wipes in the title and lands as its full stop |

## How it's made

- **Deterministic renderer** (`reel.js`): `render(t)` has no hidden state, so frames can render in any order and in parallel.
- **Real motion blur**: each output frame averages 8 sub-frame samples across a 180° shutter.
- **Lens and film pass**: camera shake and radial chromatic aberration on impacts, bloom on dark scenes, a vignette and animated grain.
- **Music-locked timeline** (`timeline.js`): 128 BPM, one scene per bar, 8 bars = exactly 15 s.
- **Synthesized score** (`audio.js`): kick, clap, hats, bass, pads, plucks, risers, whooshes and impacts, all built from oscillators, noise, filters and a Schroeder reverb, with sidechain ducking. No samples.

## Build

```bash
npm install
npm run build        # synthesize out/reel.wav, then render + encode out/motion-reel.mp4
npx serve .          # open index.html for a real-time, in-browser version
```

`node render.js --stills 2.9,8.95 --sub 2` renders quick review stills. Render with `--workers N` to parallelize.

Fonts: [Archivo](https://github.com/Omnibus-Type/Archivo) and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), both under the SIL Open Font License (see `fonts/`).
