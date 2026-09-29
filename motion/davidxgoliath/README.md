# David × Goliath: cinematic motion pass

A code-only motion-design pipeline (Python + OpenCV + ffmpeg, following the
`coded-motion` skill in footage mode). It turns a raw 30s 480p AI-generated clip
into graded, scored 1080p deliverables in three formats. See [BRIEF.md](BRIEF.md).

**The idea: "the silence before the stone."** The score builds through the run,
cuts out completely for the 0.3s before the strike, and then the strike and
Goliath's fall hit as the two heaviest downbeats.

## Acts (97.96 BPM, beat = 0.6125s, so the strike and the fall land on bar downbeats)

| Act | Time | Motion design | Score |
|---|---|---|---|
| I. The stream | 0–4.3 | Fade up; picture window opens from a hairline; "THE VALLEY OF ELAH" location card (tracking collapses, blur resolves, gold rule draws on) | D-minor drone |
| II. The run | 4.3–9.2 | DAVID plate: letters rise with overshoot, staggered; handheld shake | Taiko groove, 16th hats, pluck ostinato |
| III. The flight | 9.2–16.55 | Push-in and radial blur on the release; GOLIATH plate | Half-time toms, pad swell, whoosh |
| IV. The silence | 16.55–19.0 | Stone reaches the forehead | Accelerating roll and riser, then a full cut-out (the original sound ducks too) |
| V. The strike | 19.0 | White flash, zoom punch, decaying shake, radial blur, chromatic split | Impact + sub drop, heartbeat kick |
| VI. The fall | 21.45–27.6 | Heavier shake, warm dust flash, dust thickens; scripture card | Biggest impact, D-major resolution: pads, FM Rhodes, bells, Karplus–Strong guitar |
| VII. Title | 27.6–30 | Picture dips to black under DAVID × GOLIATH / GIANTS FALL (stacked in 9:16) | Final hit, bell, reverb tail |

Throughout: a teal/amber split-tone grade, filmic curve, bloom, cool anamorphic
streaks, vignette, grain and sunlit dust. Every camera move and every title is
averaged over **8 sub-frames of a 180° shutter** for true motion blur.

## Formats (re-laid out, not cropped)

| Format | Canvas | Picture window | Layout |
|---|---|---|---|
| `16x9` | 1920×1080 | 2.39:1 letterbox, reframed vertically per shot | Plates lower-left, cards centred |
| `1x1` | 1080×1080 | 4:3, subject-tracked horizontally | Same layout at a smaller type scale |
| `9x16` | 1080×1920 | 4:5, subject-tracked horizontally | Location card and a running wordmark in the top band; plates and scripture in the bottom band; stacked end title |

## Audio

`score.py` is a sample-free synthesizer: taiko/kick/tom with pitch drops, clap,
hats and shaker, PolyBLEP saw pads, a pluck, a Karplus–Strong guitar, FM Rhodes
and bells, swept-filter whooshes, a riser and impacts. The mix uses sidechain
ducking, a Schroeder reverb and a tanh soft-clip. The score sits under the
original production sound, and the result is mastered with two-pass EBU R128
`loudnorm` to **−14 LUFS / −1 dBTP**. Measured result: −13.8 LUFS integrated,
−0.9 dBFS true peak.

## Rebuild

```bash
pip install numpy scipy opencv-python-headless pillow fonttools brotli imageio-ffmpeg
# fonts (OFL): Cinzel + Cormorant Garamond via fontsource; convert the latin woff2
# files to ./fonts/{Cinzel-Regular,Cinzel-Bold,Cinzel-Black,Cormorant-Medium}.ttf
npm pack @fontsource/cinzel @fontsource/cormorant-garamond

# review stills (2 sub-frames), then the full render (8 sub-frames)
python3 render.py input.mp4 stills/s --format 9x16 --sub 2 --stills 2.5,14,19.05,28.9
python3 render.py input.mp4 out/davidxgoliath_9x16.mp4 --format 9x16 --sub 8 --workers 4
python3 render.py input.mp4 out/mix.wav --audio-only      # just the mastered mix
```

Beat times live in `score.py` (`BEAT`, `T_STRIKE`, `T_SILENCE`, …) and are
shared with the picture. The per-shot reframing keyframes (`REFRAME_Y` and
`REFRAME_X`) are at the top of `render.py`. Both were measured from this
clip's picture and audio envelope.
