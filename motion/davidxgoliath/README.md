# David × Goliath: cinematic motion pass

A code-only motion design pipeline (Python + OpenCV + ffmpeg) that turns a raw
30s 480p clip into a graded 1080p piece with a 2.39:1 letterbox.

## What it adds

| Beat | Time | Motion design |
|---|---|---|
| Open | 0–1.5s | Fade up from black, letterbox opens from a hairline |
| Location card | 0.9–4.6s | "THE VALLEY OF ELAH": tracking collapses, blur resolves to sharp, gold rule draws on |
| David plate | 5.3–8.9s | Lower-third, staggered letter rise, vertical gold rule, subtle handheld shake on the run |
| Sling release | ~9.5s | Push-in and a light radial blur |
| Goliath plate | 13.0–16.9s | Matching lower-third |
| Strike | 19.0s | White flash, zoom punch, decaying camera shake, radial blur, chromatic split, riser + sub boom |
| Fall | 21.45s | Heavier shake, warm dust flash, dust particles thicken, deep boom |
| Scripture | 22.6–26.6s | "for the battle is the Lord's" (1 Samuel 17:47) |
| End title | 27.4–30s | Picture dips to black under "DAVID × GOLIATH / GIANTS FALL" with glow and anamorphic flare |

The whole piece also gets a teal/amber split-tone grade, a filmic S-curve, bloom,
cool anamorphic highlight streaks, a vignette, animated film grain and drifting
sunlit dust. The picture is reframed per shot inside the letterbox so heads and
the stone stay in frame.

## Run

```bash
pip install numpy opencv-python-headless pillow fonttools brotli imageio-ffmpeg
# fonts (OFL): Cinzel + Cormorant Garamond, via fontsource
npm pack @fontsource/cinzel @fontsource/cormorant-garamond
# convert the latin woff2 files to TTF into ./fonts as
#   Cinzel-Regular.ttf, Cinzel-Bold.ttf, Cinzel-Black.ttf, Cormorant-Medium.ttf
python3 render.py input.mp4 output.mp4 --fonts ./fonts
# quick look at a few frames:
python3 render.py input.mp4 stills/s --fonts ./fonts --stills 2.2,14.2,19.1,28.8
```

Beat times (`T_STRIKE`, `T_FALL`, …) and the reframing keyframes (`REFRAME_Y`)
sit at the top of `render.py`. They were measured from this clip's picture and
audio envelope, so retime them for a different edit.
