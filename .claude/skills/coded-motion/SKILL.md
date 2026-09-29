---
name: coded-motion
description: Build motion-design videos (brand spots, promos, sponsorship pitches, logo reveals, kinetic type, reels) entirely in code as a deterministic canvas renderer, with 8-sample motion blur, a synthesized beat-locked score, and MP4 output in 16:9, 9:16 and 1:1. Use whenever the user asks for motion design, a motion graphics video, an animated ad or promo, a brand spot, or says "/coded-motion", unless they explicitly want AI video generation (Higgsfield or Seedance).
---

# Coded motion design

Make the video yourself, in code. Use AI image models only when the brief needs illustrated or photographic frames, and animate those frames with this engine.

## 1. Improve the brief first
Before building anything, rewrite the request as a tight brief and show it to the user:
- objective, audience, insight, and **one big idea**
- verified facts only; web-search every brand claim, cite the sources, and invent no statistics
- acts or bars, design system (palette, 2–3 open-licence fonts, one recurring visual motif), sound direction, deliverables
- guardrails: label spec or pitch work as such, and use correct diacritics for any language

## 2. Set up the project
`npm i ffmpeg-static playwright-core`. Run `npx playwright install chromium` once per machine, unless Chromium is already installed.

Files:
- `timeline.js`: the shared clock. Pick a BPM so a whole number of bars equals the duration (for example 128 BPM gives 8 bars in 15 s; 112 BPM gives 14 bars in 30 s). Shared hits such as drum phrases go here too.
- `spot.js`: `render(t)`, a **pure function of time** with no hidden state. Scenes are functions dispatched by time. Transitions are drawn by the outgoing scene so they match the incoming scene's first frame.
- `index.html?capture&format=16x9|1x1|9x16`: sets `window.FORMAT` and the canvas size. Without `?capture` it plays the video live in the browser.
- `render.js`: serves the folder over local HTTP. Three Playwright workers render interleaved frames, and the frames are piped in order to ffmpeg as PNGs:
  `-vf scale=out_color_matrix=bt709:out_range=tv,format=yuv420p -c:v libx264 -preset slow -crf 21`, plus AAC audio at 256k and `+faststart`. Flags: `--stills t1,t2 --sub 2` for review frames, `--format`, `--workers`.
- `audio.js`: a synthesizer with no samples. It needs:
  - drums and instruments: kick (sine with a pitch drop), clap (bandpassed noise bursts), hats and shaker, PolyBLEP saw pads, a pluck, a Karplus–Strong guitar, an FM Rhodes and bells
  - effects: whooshes (a swept filter), risers and impacts
  - mix: sidechain ducking, a Schroeder reverb, tanh soft-clip, and about −14 LUFS
  - timing: every effect lands on the exact beat of its visual event
  - clamp `tau >= 0` everywhere, because negative time produces NaN

## 3. Craft standards
- Easing: CSS-style `bezier()`, physical `spring()`, anticipation, overshoot, follow-through, and stagger.
- Every output frame averages 8 sub-frames over a 180° shutter (half the frame interval) for true motion blur.
- Lens and film pass: camera shake and radial chromatic aberration on impacts, bloom on dark scenes, a vignette, and subtle grain.
- Type: variable-font weight animation, reveals that rise through masks, and correct kerning. Measure prefix widths when you animate per character.
- Use match-cuts between scenes rather than hard cuts wherever possible.
- Use `pick(land, square, tall)` layout values so each format is **re-laid out**, not cropped.

## 4. Brand assets and AI imagery
When the brief calls for real logos or illustrated or photographic frames:
- Use the latest GPT Image model (OpenAI API via `OPENAI_API_KEY`, or the Higgsfield `gpt_image_2` model).
- Pass the **official logo files as reference images**. In the prompt, name each logo and give its placement, colour and exact wording.
- Build a character reference sheet first and reuse it so characters stay consistent across frames.
- Compare every output against the references, and regenerate any frame where a logo, spelling or face drifts.
- Show the frame-by-frame prompts for approval **before** spending credits.
- Animate the approved frames in the engine with parallax layers, panel wipes and kinetic type.

## 5. Review loop, then deliver
1. Render review stills at `--sub 2` for every scene. Build contact sheets with ffmpeg `tile` and actually look at them. Fix layout, overlap and timing, then check again.
2. Check the audio with an ebur128 loudness reading and a spectrogram or waveform image. Say plainly that you can't listen to it.
3. Do the full render at `--sub 8`. Verify duration, resolution and fps with ffprobe, and review a filmstrip of the final MP4.
4. Deliver the MP4s, a README (the idea, the acts table, how to rebuild), and the brief. Commit everything except `node_modules/` and `out/`.
