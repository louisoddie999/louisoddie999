---
name: coded-motion
description: Build motion design entirely in code, both videos and websites. Videos (brand spots, promos, sponsorship pitches, logo reveals, kinetic type, reels) are made with a deterministic canvas renderer, with 8-sample motion blur, a synthesized beat-locked score, and MP4 output in 16:9, 9:16 and 1:1. Use whenever the user asks for motion design, a motion graphics video, an animated ad or promo, a brand spot, or says "/coded-motion". Also use it to finish footage the user supplies, for example "add motion design to this video", "make it premium or cinematic", a grade, titles, an end card or re-formatting to 9:16 (see Footage mode). Also use it for motion on websites (see Web mode): an animated hero, scroll storytelling, Three.js, WebGL or shaders, React Three Fiber, GSAP or ScrollTrigger, Lenis smooth scroll, page transitions, animated landing pages, and 3D product or logo scenes. Do not use it when the user explicitly wants AI video generation (Higgsfield or Seedance).
---

# Coded motion design

Make the motion yourself, in code, whether it is a rendered video or live on a website. Use AI image models only when the brief needs illustrated or photographic frames, and animate those frames with this engine.

## 1. Improve the brief first
Before building anything, rewrite the request as a tight brief, save it as `BRIEF.md` and show it to the user. Wait for approval, unless the user has already said to go ahead; in that case, show the brief and proceed, and say that they can redirect you:
- objective, audience, insight, and **one big idea**
- verified facts only; web-search every brand claim, cite the sources, and invent no statistics
- acts or bars, design system (palette, 2–3 open-licence fonts, one recurring visual motif), sound direction, deliverables
- guardrails: label spec or pitch work as such, and use correct diacritics for any language

## 2. Set up the project
`npm i ffmpeg-static playwright-core`. Run `npx playwright install chromium` once per machine, unless Chromium is already installed.
Sandbox fallbacks:
- If there's no system ffmpeg, use `pip install imageio-ffmpeg` or `ffmpeg-static` and check which filters it has, for example `drawtext` may be missing, so draw the type yourself.
- If Google Fonts or GitHub downloads are blocked, get the fonts with `npm pack @fontsource/<font>`. Pillow needs TTF files, so convert the woff2 files with `fontTools` (`flavor=None`).

Files:
- `timeline.js`: the shared clock. Pick a BPM so a whole number of bars equals the duration (for example 128 BPM gives 8 bars in 15 s; 112 BPM gives 14 bars in 30 s). Shared hits such as drum phrases go here too.
- `spot.js`: `render(t)`, a **pure function of time** with no hidden state. Scenes are functions dispatched by time. Transitions are drawn by the outgoing scene so they match the incoming scene's first frame.
- `index.html?capture&format=16x9|1x1|9x16`: sets `window.FORMAT` and the canvas size. Without `?capture` it plays the video live in the browser.
- `render.js`: serves the folder over local HTTP. Three Playwright workers render interleaved frames, and the frames are piped in order to ffmpeg as PNGs:
  `-vf scale=out_color_matrix=bt709:out_range=tv,format=yuv420p -c:v libx264 -preset slow -crf 21`, plus AAC audio at 256k and `+faststart`. Flags: `--stills t1,t2 --sub 2` for review frames, `--format`, `--workers`.
- `audio.js`: a synthesizer with no samples. It needs:
  - drums and instruments: kick (sine with a pitch drop), clap (bandpassed noise bursts), hats and shaker, PolyBLEP saw pads, a pluck, a Karplus–Strong guitar, an FM Rhodes and bells
  - effects: whooshes (a swept filter), risers and impacts
  - mix: sidechain ducking, a Schroeder reverb, tanh soft-clip, then two-pass ffmpeg `loudnorm` to −14 LUFS integrated and −1 dBTP true peak
  - timing: every effect lands on the exact beat of its visual event
  - clamp `tau >= 0` everywhere, because negative time produces NaN

## 3. Craft standards
- Determinism: seed every random source (grain, shake, particles, noise) or use hash noise of `(i, t)`, so re-renders and parallel workers match frame for frame.
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

## 5. Footage mode (the user supplies video)
When the job is to finish existing footage rather than build graphics from scratch, keep the craft standards and change the engine:
- **Engine.** Don't seek a `<video>` in the browser, because it isn't frame-accurate. Decode with ffmpeg to 16-bit RGB (`rgb48le`, lanczos upscale with about 8% overscan for shake and punch-ins). Render each frame in Python with numpy and OpenCV as a pure function of `(source frame, t)`, then pipe it to ffmpeg. Run the same `--stills`, `--sub`, `--format` and `--workers` flags.
- **Beats come from the picture.** Find the story beats from contact sheets and the audio RMS envelope, for example the loudest transient is the impact. Then choose the BPM so the key events land on downbeats; whole bars filling the duration comes second. Snap title in-points to beats.
- **Grade.** Apply saturation, a teal-shadow and amber-highlight split-tone and a filmic S-curve with lifted blacks, then bloom, anamorphic streaks, vignette and luma-weighted grain. Do motion blur by averaging the camera warp over the shutter, before the grade.
- **Reframe, don't crop.** Measure where the subject sits (x and y) from a gridded contact sheet. Keyframe the window per shot and clamp it inside the source. Letterbox 16:9 at 2.39:1, and give 1:1 a 4:3 window and 9:16 a 4:5 window, putting type into the bands.
- **Sound.** Keep the production sound and mix the synthesized score under it at about equal RMS. Duck the production sound too wherever the score goes silent for effect.
- **Honesty.** Label AI-generated footage as such, and quote scripture or brand copy verbatim with its source.

## 6. Web mode (motion on websites)
For interactive motion that runs live on a site, **read `references/web-motion.md` before building.** It covers stack choice, craft rules, budgets and fallbacks, tested GSAP, Lenis and Three.js skeletons, and a separate web review loop. In short:
- **Stack.** Pick the lightest stack that does the job: CSS or the Web Animations API, then GSAP with ScrollTrigger and SplitText, then Three.js or React Three Fiber only when the idea needs 3D. Check the current library versions at build time.
- **Same design language.** The brief, design system, easing and one big idea carry over from video, so the site and its promo videos move the same way.
- **Performance, access and SEO are part of the craft.**
  - Core Web Vitals: LCP < 2.5 s, CLS < 0.1, INP < 200 ms; 60 fps on a mid-range phone.
  - Show a poster image first and lazy-load WebGL; pause the render when it is offscreen.
  - Respect `prefers-reduced-motion`, keep copy as real DOM text, and never flash more than 3 times per second.
- **Bridge to video.** Every web scene exposes `window.__motion.seek(t)` and renders deterministically with `?capture`, so `render.js` can turn the same scene into 16:9, 9:16 and 1:1 MP4s.

## 7. Review loop, then deliver
For web jobs, follow the review loop in `references/web-motion.md` instead of this one.
1. Render review stills at `--sub 2` for every scene. Build contact sheets with ffmpeg `tile` and actually look at them. Fix layout, overlap and timing, then check again.
2. Check the audio with an ebur128 loudness reading (both integrated and true peak) and a spectrogram with the beat times drawn over it. Read the RMS at each hit and each intentional silence to confirm the timing. Say plainly that you can't listen to it.
3. Do the full render at `--sub 8`. It costs about 8 times as much as `--sub 1`, so run it in the background with workers, report progress, and time a few frames first to give an estimate. Verify duration, resolution and fps with ffprobe, and review a filmstrip of the final MP4.
4. Deliver the MP4s, a README (the idea, the acts table, how to rebuild), and the brief. Commit everything except `node_modules/`, `out/`, fonts and rendered media.
5. If the delivery channel has a size cap (for example 30 MB for chat uploads), send two-pass, bitrate-targeted share copies and keep the masters. Tell the user where the masters are, and warn them if that location is temporary.
