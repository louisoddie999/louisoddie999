#!/usr/bin/env python3
"""Cinematic motion-design pass for the "David x Goliath" clip.

Pipeline: ffmpeg decodes + upscales (16-bit RGB) -> numpy/OpenCV applies
reframing, camera shake, grade, bloom, anamorphic streaks, grain, particles
and animated typography -> ffmpeg encodes H.264 with a sound-designed mix.

Usage:
    python3 render.py SRC.mp4 OUT.mp4 [--fonts DIR] [--preview SECONDS]
"""
import argparse
import math
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FPS = 24
W, H = 1920, 1080
OVER = 1.08                        # overscan so shake / punch-ins never show edges
SW, SH = int(W * OVER) // 2 * 2, int(H * OVER) // 2 * 2
ASPECT = 2.39
ACTIVE_H = int(round(W / ASPECT)) // 2 * 2
BAR = (H - ACTIVE_H) // 2

# Story beats (seconds), measured from the source picture + audio envelope.
T_RELEASE = 9.55                   # sling release
T_STRIKE = 19.0                    # stone hits the forehead
T_FALL = 21.45                     # Goliath hits the ground
T_END_TITLE = 27.4

GOLD = np.array([212, 175, 106], np.float32) / 255
GOLD_HI = np.array([246, 228, 184], np.float32) / 255
GOLD_LO = np.array([150, 112, 52], np.float32) / 255


# --------------------------------------------------------------------- easing
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out_cubic(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_out(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def ease_out_expo(t):
    t = clamp(t)
    return 1.0 if t >= 1 else 1 - 2 ** (-10 * t)


def window(t, t0, t1, fade_in=0.5, fade_out=0.5):
    """0..1 envelope that rises after t0 and falls before t1."""
    if t < t0 or t > t1:
        return 0.0
    return min(ease_in_out((t - t0) / fade_in), ease_in_out((t1 - t) / fade_out))


def keyframes(t, keys):
    """Smoothly interpolated value from [(time, value), ...]."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * ease_in_out((t - t0) / (t1 - t0))
    return keys[-1][1]


def decay(t, t0, rate):
    return math.exp(-(t - t0) * rate) if t >= t0 else 0.0


# ------------------------------------------------------------------ camera
REFRAME_Y = [(0, 0.46), (3.5, 0.50), (17.4, 0.50), (18.4, 0.40),
             (20.2, 0.40), (21.2, 0.52), (23.5, 0.55), (26.5, 0.50)]

rng_shake = np.random.default_rng(7)
SHAKE_NOISE = rng_shake.normal(size=(int(40 * FPS), 3))
SHAKE_NOISE = cv2.GaussianBlur(SHAKE_NOISE, (1, 5), 1.2)


def camera(t, fi):
    """Returns (zoom, dx, dy, rotation_deg) for this frame."""
    zoom = 1.0 + 0.035 * ease_in_out(t / 30.0)                     # slow push
    zoom += 0.07 * decay(t, T_STRIKE, 5.0)                         # impact punch
    zoom += 0.045 * decay(t, T_FALL, 4.0)
    zoom += 0.02 * window(t, T_RELEASE - 0.4, T_RELEASE + 0.9, 0.35, 0.6)
    amp = 26 * decay(t, T_STRIKE, 6.5) + 38 * decay(t, T_FALL, 4.5)
    amp += 2.0 * window(t, 5.2, 9.4, 0.6, 0.6)                      # run handheld
    n = SHAKE_NOISE[min(fi, len(SHAKE_NOISE) - 1)]
    return zoom, n[0] * amp, n[1] * amp, n[2] * amp * 0.03


def apply_camera(img, t, fi):
    zoom, dx, dy, rot = camera(t, fi)
    cy_src = keyframes(t, REFRAME_Y) * SH
    # Map output (W x H, active band centered) back into the oversized source.
    s = zoom * (W / SW) * OVER                    # output px per source px
    M = cv2.getRotationMatrix2D((SW / 2, cy_src), rot, s)
    M[0, 2] += W / 2 - SW / 2 + dx
    M[1, 2] += H / 2 - cy_src + dy
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REFLECT)


def radial_blur(img, strength, steps=6):
    if strength <= 0.002:
        return img
    acc = img.copy()
    for i in range(1, steps):
        s = 1 + strength * i / steps
        M = cv2.getRotationMatrix2D((W / 2, H * 0.45), 0, s)
        acc += cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_REFLECT)
    return acc / steps


def chromatic(img, k):
    if k < 0.0005:
        return img
    out = img.copy()
    for ch, s in ((0, 1 + k), (2, 1 - k)):
        M = cv2.getRotationMatrix2D((W / 2, H / 2), 0, s)
        out[..., ch] = cv2.warpAffine(img[..., ch], M, (W, H),
                                      flags=cv2.INTER_LINEAR,
                                      borderMode=cv2.BORDER_REFLECT)
    return out


# -------------------------------------------------------------------- grade
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
RR = np.sqrt(((XX - W / 2) / (W / 2)) ** 2 + ((YY - H / 2) / (ACTIVE_H / 2)) ** 2)
VIGNETTE = np.clip(1 - 0.42 * np.clip(RR - 0.35, 0, None) ** 1.6, 0, 1)[..., None]


def grade(img, t):
    # img: float32 RGB 0..1 (OpenCV order converted to RGB earlier)
    luma = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    sat = 0.86 + 0.06 * window(t, T_STRIKE - 0.5, 23, 0.3, 1.5)
    img = luma[..., None] + (img - luma[..., None]) * sat
    # split-tone: teal shadows, amber highlights
    l = np.clip(luma, 0, 1)[..., None]
    shadow_w = (1 - l) ** 2
    hi_w = l ** 2
    img = img + shadow_w * np.array([-0.030, 0.006, 0.030], np.float32) \
              + hi_w * np.array([0.045, 0.018, -0.040], np.float32)
    # filmic S-curve with lifted blacks and soft highlight roll-off
    x = np.clip(img, 0, 1.2)
    img = x * x * (3 - 2 * np.clip(x, 0, 1)) * 0.55 + x * 0.45
    img = 0.028 + img * 0.955
    return img


def bloom_and_streak(img, t):
    small = cv2.resize(img, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    hi = np.clip(small - 0.72, 0, None)
    bloom = cv2.GaussianBlur(hi, (0, 0), 9)
    streak = cv2.blur(hi, (181, 1))
    streak = streak * np.array([0.55, 0.75, 1.0], np.float32)   # cool anamorphic
    k_streak = 0.55 + 1.6 * window(t, 27.8, 30.2, 1.2, 0.1)
    add = bloom * 0.55 + streak * k_streak
    return img + cv2.resize(add, (W, H), interpolation=cv2.INTER_LINEAR)


rng_grain = np.random.default_rng(3)
GRAIN_BANK = [cv2.GaussianBlur(rng_grain.normal(0, 1, (H // 2, W // 2)).astype(np.float32),
                               (0, 0), 0.6) for _ in range(12)]


def grain(img, fi, amount):
    g = cv2.resize(GRAIN_BANK[fi % len(GRAIN_BANK)], (W, H), interpolation=cv2.INTER_LINEAR)
    l = np.clip(img.mean(axis=2, keepdims=True), 0, 1)
    return img + g[..., None] * amount * (0.35 + l * (1 - l) * 2.2)


# ---------------------------------------------------------------- particles
rng_p = np.random.default_rng(11)
N_P = 90
P_POS = rng_p.random((N_P, 2)) * [W, ACTIVE_H] + [0, BAR]
P_VEL = rng_p.normal(0, 1, (N_P, 2)) * [9, 5] + [14, -4]
P_SIZE = rng_p.uniform(1.2, 4.5, N_P)
P_PHASE = rng_p.random(N_P) * 6.28
P_DEPTH = rng_p.uniform(0.3, 1.0, N_P)


def particles(t):
    layer = np.zeros((H // 2, W // 2), np.float32)
    dens = 0.35 + 0.65 * window(t, T_FALL - 0.1, 31, 0.4, 0.1)
    n = int(N_P * dens)
    pos = P_POS + P_VEL * t * P_DEPTH[:, None]
    pos[:, 0] %= W
    pos[:, 1] = BAR + (pos[:, 1] - BAR) % ACTIVE_H
    for i in range(n):
        a = 0.5 + 0.5 * math.sin(t * 1.3 + P_PHASE[i])
        cv2.circle(layer, (int(pos[i, 0] / 2), int(pos[i, 1] / 2)),
                   max(1, int(P_SIZE[i] * P_DEPTH[i])), float(a * P_DEPTH[i]), -1,
                   lineType=cv2.LINE_AA)
    layer = cv2.GaussianBlur(layer, (0, 0), 1.4)
    layer = cv2.resize(layer, (W, H), interpolation=cv2.INTER_LINEAR)
    return layer[..., None] * np.array([1.0, 0.86, 0.62], np.float32) * 0.22


# --------------------------------------------------------------- typography
class Type:
    def __init__(self, font_dir):
        f = lambda n, s: ImageFont.truetype(os.path.join(font_dir, n), s)
        self.fonts = {
            "cinzel_s": f("Cinzel-Regular.ttf", 32),
            "cinzel_m": f("Cinzel-Regular.ttf", 44),
            "cinzel_b": f("Cinzel-Bold.ttf", 74),
            "cinzel_xl": f("Cinzel-Black.ttf", 132),
            "corm": f("Cormorant-Medium.ttf", 38),
            "corm_l": f("Cormorant-Medium.ttf", 70),
        }

    def text_mask(self, text, font, tracking=0.0, per_char=None):
        """Render text with letter tracking; per_char(i) -> (alpha, dy)."""
        font = self.fonts[font]
        widths = [font.getlength(c) for c in text]
        total = sum(widths) + tracking * (len(text) - 1)
        asc, desc = font.getmetrics()
        pad = 40
        m = Image.new("L", (int(total) + pad * 2, asc + desc + pad * 2), 0)
        d = ImageDraw.Draw(m)
        x = pad
        for i, c in enumerate(text):
            a, dy = per_char(i) if per_char else (1.0, 0)
            if a > 0.01 and c != " ":
                d.text((x, pad + dy), c, font=font, fill=int(255 * a))
            x += widths[i] + tracking
        return np.asarray(m, np.float32) / 255, pad


def blit(canvas_rgb, canvas_a, mask, cx, cy, color, opacity=1.0, blur=0.0,
         glow=0.0, gradient=True, anchor="c"):
    """Composite a text mask (with optional gold gradient + glow) onto overlay."""
    if opacity <= 0.003:
        return
    if blur > 0.3:
        mask = cv2.GaussianBlur(mask, (0, 0), blur)
    h, w = mask.shape
    x0 = int(cx - w / 2) if anchor == "c" else int(cx)
    y0 = int(cy - h / 2)
    x1, y1 = max(0, x0), max(0, y0)
    x2, y2 = min(W, x0 + w), min(H, y0 + h)
    if x2 <= x1 or y2 <= y1:
        return
    m = mask[y1 - y0:y2 - y0, x1 - x0:x2 - x0] * opacity
    if gradient:
        g = np.linspace(0, 1, h, dtype=np.float32)[y1 - y0:y2 - y0, None, None]
        col = GOLD_HI * (1 - g) + GOLD_LO * g
        col = col * 0.5 + color * 0.5
    else:
        col = np.broadcast_to(color, (1, 1, 3))
    if glow > 0:
        gl = cv2.GaussianBlur(mask, (0, 0), 14)[y1 - y0:y2 - y0, x1 - x0:x2 - x0]
        gl = gl * glow * opacity
        canvas_rgb[y1:y2, x1:x2] += gl[..., None] * GOLD * 0.9
    a = m[..., None]
    region = canvas_rgb[y1:y2, x1:x2]
    canvas_rgb[y1:y2, x1:x2] = region * (1 - a) + col * a
    canvas_a[y1:y2, x1:x2] = np.maximum(canvas_a[y1:y2, x1:x2], m)


def line(canvas_rgb, cx, cy, half_w, progress, opacity=1.0, thickness=2):
    if progress <= 0 or opacity <= 0:
        return
    hw = int(half_w * progress)
    x1, x2 = int(cx - hw), int(cx + hw)
    y1 = int(cy - thickness / 2)
    seg = canvas_rgb[y1:y1 + thickness, x1:x2]
    fade = np.minimum(1, np.minimum(np.arange(x2 - x1), np.arange(x2 - x1)[::-1]) / 60.0)
    a = (fade * opacity)[None, :, None]
    canvas_rgb[y1:y1 + thickness, x1:x2] = seg * (1 - a) + GOLD * a


def scrim(img, y_center, height, strength):
    if strength <= 0:
        return img
    prof = np.exp(-((np.arange(H) - y_center) / height) ** 2).astype(np.float32)
    return img * (1 - strength * prof)[:, None, None]


def draw_titles(img, t, ty):
    # 1) Opening: location card
    a = window(t, 0.9, 4.6, 0.8, 0.7)
    if a > 0:
        p = ease_out_expo((t - 0.9) / 2.2)
        cy = H / 2 - 10
        img[:] = scrim(img, cy, 190, 0.5 * a)
        m, _ = ty.text_mask("THE VALLEY OF ELAH", "cinzel_m", tracking=28 - 16 * p)
        blit(img, ALPHA, m, W / 2, cy - 28, GOLD_HI, a, blur=6 * (1 - p), glow=0.35)
        line(img, W / 2, cy + 22, 250, ease_out_cubic((t - 1.3) / 1.4), a)
        m, _ = ty.text_mask("1 SAMUEL  XVII", "cinzel_s", tracking=14)
        blit(img, ALPHA, m, W / 2, cy + 62, GOLD, a * ease_in_out((t - 1.8) / 0.8))

    # 2) Character callouts (lower-left name plate, staggered letters)
    for name, sub, t0, t1 in (("DAVID", "Son of Jesse  ·  Shepherd of Bethlehem", 5.3, 8.9),
                              ("GOLIATH", "Champion of Gath  ·  Six cubits and a span", 13.0, 16.9)):
        a = window(t, t0, t1, 0.4, 0.6)
        if a <= 0:
            continue
        x = 150
        y = H - BAR - 150
        img[:] = img * (1 - 0.5 * a * np.clip(1 - np.abs(np.arange(H) - y)[:, None, None] / 160.0, 0, 1)
                        * np.clip(1 - np.arange(W)[None, :, None] / 1100.0, 0, 1))
        # vertical gold rule that draws downward
        bar_h = int(114 * ease_out_expo((t - t0) / 0.7))
        if bar_h > 0:
            seg = img[int(y - 52):int(y - 52) + bar_h, x - 30:x - 27]
            img[int(y - 52):int(y - 52) + bar_h, x - 30:x - 27] = seg * (1 - a) + GOLD * a
        per = lambda i, t0=t0: (ease_out_cubic((t - t0 - 0.12 - i * 0.05) / 0.45),
                                int(30 * (1 - ease_out_expo((t - t0 - 0.12 - i * 0.05) / 0.6))))
        m, pad = ty.text_mask(name, "cinzel_b", tracking=10, per_char=per)
        blit(img, ALPHA, m, x - pad, y - 20, GOLD_HI, a, glow=0.25, anchor="l")
        sa = a * ease_in_out((t - t0 - 0.6) / 0.6)
        m, pad = ty.text_mask(sub, "corm", tracking=1.5)
        blit(img, ALPHA, m, x - pad + 8 * (1 - sa), y + 40, np.ones(3, np.float32) * 0.93,
             sa, gradient=False, anchor="l")

    # 3) Scripture after the fall
    a = window(t, 22.6, 26.6, 0.9, 0.8)
    if a > 0:
        p = ease_out_cubic((t - 22.6) / 2.4)
        img[:] = scrim(img, H / 2, 220, 0.55 * a)
        m, _ = ty.text_mask("“for the battle is the Lord’s”", "corm_l", tracking=2)
        blit(img, ALPHA, m, W / 2, H / 2 - 20 + 14 * (1 - p), np.ones(3, np.float32) * 0.96,
             a, blur=4 * (1 - p), gradient=False)
        m, _ = ty.text_mask("1 SAMUEL 17:47", "cinzel_s", tracking=12)
        blit(img, ALPHA, m, W / 2, H / 2 + 62, GOLD, a * ease_in_out((t - 23.4) / 0.8))

    # 4) End title over the sun flare, dipping to black
    if t >= T_END_TITLE:
        p = (t - T_END_TITLE)
        a = ease_in_out(p / 0.9) * (1 - ease_in_out((t - 29.45) / 0.55))
        title = "DAVID  ×  GOLIATH"
        per = lambda i: (ease_out_cubic((p - 0.15 - abs(i - len(title) / 2) * 0.06) / 0.9), 0)
        trk = 34 - 20 * ease_out_expo(p / 2.2)
        m, _ = ty.text_mask(title, "cinzel_xl", tracking=trk, per_char=per)
        blit(img, ALPHA, m, W / 2, H / 2 - 30, GOLD_HI, a, blur=10 * (1 - ease_out_cubic(p / 1.2)),
             glow=0.6)
        line(img, W / 2, H / 2 + 62, 360, ease_out_expo((p - 0.6) / 1.2), a)
        m, _ = ty.text_mask("GIANTS FALL", "cinzel_m", tracking=26)
        blit(img, ALPHA, m, W / 2, H / 2 + 128, GOLD, a * ease_in_out((p - 1.0) / 0.8))


ALPHA = np.zeros((H, W), np.float32)


# ------------------------------------------------------------------- frame
def render_frame(src16, t, fi, ty):
    img = src16.astype(np.float32) / 65535.0
    img = apply_camera(img, t, fi)

    strike = decay(t, T_STRIKE, 7.0)
    fall = decay(t, T_FALL, 5.0)
    img = radial_blur(img, 0.05 * strike + 0.035 * fall + 0.015 * window(t, T_RELEASE - 0.2, T_RELEASE + 0.5, 0.2, 0.3))
    img = chromatic(img, 0.0012 + 0.006 * strike + 0.005 * fall)

    img = grade(img, t)
    img = bloom_and_streak(img, t)
    img = img + particles(t)

    # exposure: flash on strike (white), warm dust flash on the fall
    img = img + decay(t, T_STRIKE, 14.0) * 0.9 + fall ** 2 * np.array([0.22, 0.16, 0.08], np.float32)
    img = img * VIGNETTE

    # dip to near-black under the end title, fade to black at the very end
    dim = 1 - 0.72 * ease_in_out((t - T_END_TITLE + 0.2) / 1.2)
    img = img * dim

    ALPHA[:] = 0
    draw_titles(img, t, ty)
    img = grain(img, fi, 0.028 + 0.02 * strike)

    # letterbox: bars open from a hairline at the start
    open_p = ease_out_expo((t - 0.1) / 1.4)
    band = int(ACTIVE_H / 2 * (0.02 + 0.98 * open_p))
    img[: H // 2 - band] = 0
    img[H // 2 + band:] = 0

    fade = ease_in_out(t / 0.8) * (1 - ease_in_out((t - 29.35) / 0.65))
    img = img * fade
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


# ------------------------------------------------------------------- audio
def build_audio(src, out_wav, duration):
    sr = 48000
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-ac", "2", "-ar", str(sr),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
    n = len(a)
    t = np.arange(n) / sr
    rng = np.random.default_rng(5)

    def boom(t0, f0, f1, dur, gain):
        m = (t >= t0) & (t < t0 + dur)
        tt = t[m] - t0
        freq = f1 + (f0 - f1) * np.exp(-tt * 9)
        phase = 2 * np.pi * np.cumsum(freq) / sr
        env = (1 - np.exp(-tt * 400)) * np.exp(-tt * 3.2)
        a[m] += (np.sin(phase) * env * gain)[:, None]

    def whoosh(t0, dur, gain, rise=True):
        m = (t >= t0) & (t < t0 + dur)
        k = m.sum()
        noise = rng.normal(0, 1, k).astype(np.float32)
        x = np.linspace(0, 1, k)
        env = (x ** 2.5 if rise else np.exp(-x * 5)) * (1 - x ** 12)
        # progressive low-pass sweep via one-pole filter
        out = np.zeros(k, np.float32)
        y = 0.0
        coef = 0.02 + 0.25 * (x if rise else 1 - x)
        for i in range(k):
            y += coef[i] * (noise[i] - y)
            out[i] = y
        a[m] += (out * env * gain)[:, None]

    whoosh(T_STRIKE - 1.6, 1.6, 0.35)                  # riser into the strike
    boom(T_STRIKE, 110, 38, 2.2, 0.55)
    boom(T_FALL, 90, 32, 3.0, 0.7)
    whoosh(T_END_TITLE - 0.3, 1.1, 0.25)
    boom(T_END_TITLE + 0.15, 70, 30, 3.0, 0.35)
    # gentle low drone that swells through the standoff
    drone = (np.sin(2 * np.pi * 55 * t) + 0.5 * np.sin(2 * np.pi * 82.5 * t)) * 0.035
    drone *= np.clip((t - 10) / 4, 0, 1) * np.clip((T_STRIKE - t) / 0.2, 0, 1)
    a += drone[:, None]
    # fade tail with the picture
    a *= np.clip((duration - t) / 0.65, 0, 1)[:, None]
    peak = np.abs(a).max()
    if peak > 0.98:
        a *= 0.98 / peak
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", "2",
                    "-i", "-", out_wav], input=a.astype(np.float32).tobytes(), check=True)


# -------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--fonts", default=os.path.join(os.path.dirname(__file__), "fonts"))
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--preview", type=float, default=0.0, help="render only N seconds")
    ap.add_argument("--stills", default="", help="comma list of times to dump as PNG")
    args = ap.parse_args()
    ty = Type(args.fonts)

    probe = subprocess.run(["ffmpeg", "-i", args.src], capture_output=True, text=True).stderr
    dur = [l for l in probe.splitlines() if "Duration" in l][0].split()[1].rstrip(",")
    h_, m_, s_ = dur.split(":")
    duration = int(h_) * 3600 + int(m_) * 60 + float(s_)

    if args.stills:
        for ts in [float(x) for x in args.stills.split(",")]:
            raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(ts), "-i", args.src,
                                  "-frames:v", "1", "-vf", f"scale={SW}:{SH}:flags=lanczos,unsharp=5:5:0.45",
                                  "-pix_fmt", "rgb48le", "-f", "rawvideo", "-"],
                                 capture_output=True, check=True).stdout
            fr = np.frombuffer(raw, np.uint16).reshape(SH, SW, 3)
            out = render_frame(fr, ts, int(ts * FPS), ty)
            Image.fromarray(out).save(f"{args.out}_{ts:05.2f}.png")
        return

    wav = args.out + ".mix.wav"
    build_audio(args.src, wav, duration)

    dec_cmd = ["ffmpeg", "-v", "error", "-ss", str(args.start), "-i", args.src]
    if args.preview:
        dec_cmd += ["-t", str(args.preview)]
    dec_cmd += ["-vf", f"scale={SW}:{SH}:flags=lanczos,unsharp=5:5:0.45",
                "-pix_fmt", "rgb48le", "-f", "rawvideo", "-"]
    dec = subprocess.Popen(dec_cmd, stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y",
                            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-",
                            "-ss", str(args.start), "-i", wav,
                            "-map", "0:v", "-map", "1:a", "-shortest",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "15",
                            "-tune", "film", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                            "-c:a", "aac", "-b:a", "256k", args.out], stdin=subprocess.PIPE)
    fsize = SW * SH * 3 * 2
    fi = int(round(args.start * FPS))
    while True:
        buf = dec.stdout.read(fsize)
        if len(buf) < fsize:
            break
        fr = np.frombuffer(buf, np.uint16).reshape(SH, SW, 3)
        enc.stdin.write(render_frame(fr, fi / FPS, fi, ty).tobytes())
        fi += 1
        if fi % 24 == 0:
            print(f"\r{fi / FPS:5.1f}s", end="", file=sys.stderr, flush=True)
    enc.stdin.close()
    enc.wait()
    dec.wait()
    os.remove(wav)
    print(f"\nwrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
