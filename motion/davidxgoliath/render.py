#!/usr/bin/env python3
"""Cinematic motion-design pass for the "David x Goliath" clip (coded-motion, footage mode).

ffmpeg decodes + upscales the footage (16-bit RGB) -> each output frame is a pure
function of (source frame, t): reframing, camera shake, grade, bloom, anamorphic
streaks, grain, particles and animated typography, with every moving element
averaged over N sub-frames of a 180 degree shutter -> ffmpeg encodes H.264 with the
beat-locked score from score.py mastered to -14 LUFS / -1 dBTP.

Usage:
    python3 render.py SRC.mp4 OUT.mp4 --format 16x9|1x1|9x16 [--sub 8] [--workers 4]
    python3 render.py SRC.mp4 stills/prefix --format 9x16 --stills 2.2,19.1 --sub 2
"""
import argparse
import json
import math
import multiprocessing as mp
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import score

FPS = 24
OVER = 1.08                           # overscan so shake / punch-ins never show edges
SRC_AR = 854 / 480

# ------------------------------------------------------------------ formats
FORMATS = {
    # W, H, footage rect (x, y, w, h), visible mask rect
    "16x9": dict(W=1920, H=1080, foot=(0, 0, 1920, 1080), mask=(0, 138, 1920, 804)),
    "1x1": dict(W=1080, H=1080, foot=(0, 135, 1080, 810), mask=(0, 135, 1080, 810)),
    "9x16": dict(W=1080, H=1920, foot=(0, 285, 1080, 1350), mask=(0, 285, 1080, 1350)),
}
FMT = "16x9"
F = FORMATS[FMT]


def pick(land, square, tall):
    return {"16x9": land, "1x1": square, "9x16": tall}[FMT]


def set_format(name):
    global FMT, F, W, H, FX, FY, FW, FH, MX, MY, MW, MH, DW, DH, VIGNETTE
    FMT, F = name, FORMATS[name]
    W, H = F["W"], F["H"]
    FX, FY, FW, FH = F["foot"]
    MX, MY, MW, MH = F["mask"]
    DH = int(round(FH * OVER / 2)) * 2
    DW = int(round(DH * SRC_AR / 2)) * 2
    yy, xx = np.mgrid[0:FH, 0:FW].astype(np.float32)
    cy = MY - FY + MH / 2
    rr = np.sqrt(((xx - FW / 2) / (FW / 2)) ** 2 + ((yy - cy) / (MH / 2)) ** 2)
    VIGNETTE = np.clip(1 - 0.42 * np.clip(rr - 0.35, 0, None) ** 1.6, 0, 1)[..., None]


set_format("16x9")

# Story beats (seconds): shared clock with the score.
BEAT = score.BEAT
T_RELEASE = score.T_RELEASE
T_STRIKE = score.T_STRIKE
T_FALL = score.T_FALL
T_TITLE = score.T_TITLE
beat = score.beat
T_LOC = beat(-29)          # 1.24
T_DAVID = beat(-22)        # 5.53
T_GOLIATH = beat(-10)      # 12.88
T_SCRIPT = beat(6)         # 22.68

GOLD = np.array([212, 175, 106], np.float32) / 255
GOLD_HI = np.array([246, 228, 184], np.float32) / 255
GOLD_LO = np.array([150, 112, 52], np.float32) / 255
WHITE = np.ones(3, np.float32) * 0.95


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


def ease_out_back(t, s=1.7):
    t = clamp(t)
    return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2


def window(t, t0, t1, fade_in=0.5, fade_out=0.5):
    if t < t0 or t > t1:
        return 0.0
    return min(ease_in_out((t - t0) / fade_in), ease_in_out((t1 - t) / fade_out))


def keyframes(t, keys):
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * ease_in_out((t - t0) / (t1 - t0))
    return keys[-1][1]


def decay(t, t0, rate):
    return math.exp(-(t - t0) * rate) if t >= t0 else 0.0


# ------------------------------------------------------------------ camera
# Where the subject sits in the source (normalised), measured from a gridded
# contact sheet.  16x9 only needs vertical reframing; 1x1 / 9x16 track in x.
REFRAME_Y = [(0, 0.46), (3.5, 0.50), (17.4, 0.50), (18.4, 0.40),
             (20.2, 0.40), (21.2, 0.52), (23.5, 0.55), (26.5, 0.50)]
REFRAME_X = [(0, 0.52), (2.0, 0.52), (2.7, 0.62), (3.4, 0.45), (4.0, 0.36),
             (5.5, 0.62), (6.3, 0.42), (7.3, 0.42), (9.0, 0.47), (10.5, 0.55),
             (11.5, 0.42), (13.5, 0.46), (16.0, 0.52), (19.5, 0.52), (20.2, 0.44),
             (21.3, 0.44), (22.0, 0.54), (24.5, 0.52), (25.3, 0.47), (26.2, 0.52),
             (27.3, 0.45), (28.3, 0.36), (29.2, 0.55)]

_rng = np.random.default_rng(7)
SHAKE_NOISE = cv2.GaussianBlur(_rng.normal(size=(int(40 * FPS), 3)), (1, 5), 1.2)


def shake_noise(t):
    x = t * FPS
    i = int(math.floor(x))
    f = x - i
    i = max(0, min(len(SHAKE_NOISE) - 2, i))
    return SHAKE_NOISE[i] * (1 - f) + SHAKE_NOISE[i + 1] * f


def camera(t):
    zoom = 1.0 + 0.035 * ease_in_out(t / 30.0)
    zoom += 0.07 * decay(t, T_STRIKE, 5.0)
    zoom += 0.045 * decay(t, T_FALL, 4.0)
    zoom += 0.02 * window(t, T_RELEASE - 0.4, T_RELEASE + 0.9, 0.35, 0.6)
    amp = 26 * decay(t, T_STRIKE, 6.5) + 38 * decay(t, T_FALL, 4.5)
    amp += 2.0 * window(t, 5.2, 9.4, 0.6, 0.6)
    amp *= FH / 1080 * pick(1.0, 1.1, 1.2)
    n = shake_noise(t)
    return zoom, n[0] * amp, n[1] * amp, n[2] * amp * 0.03 * 1080 / FH


def warp(src, t):
    zoom, dx, dy, rot = camera(t)
    s = zoom / OVER
    hx = FW / 2 / (s * DW)
    hy = FH / 2 / (s * DH)
    if FMT == "16x9":
        cx, cy = 0.5, keyframes(t, REFRAME_Y)
    else:
        cx, cy = keyframes(t, REFRAME_X), 0.5
    cx = clamp(cx, hx, 1 - hx)
    cy = clamp(cy, hy, 1 - hy)
    px, py = cx * DW, cy * DH
    M = cv2.getRotationMatrix2D((px, py), rot, s)
    M[0, 2] += FW / 2 - px + dx
    M[1, 2] += FH / 2 - py + dy
    return cv2.warpAffine(src, M, (FW, FH), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def radial_blur(img, strength, steps=6):
    if strength <= 0.002:
        return img
    acc = img.copy()
    c = (FW / 2, (MY - FY) + MH * 0.45)
    for i in range(1, steps):
        M = cv2.getRotationMatrix2D(c, 0, 1 + strength * i / steps)
        acc += cv2.warpAffine(img, M, (FW, FH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return acc / steps


def chromatic(img, k):
    if k < 0.0005:
        return img
    out = img.copy()
    c = (FW / 2, (MY - FY) + MH / 2)
    for ch, s in ((0, 1 + k), (2, 1 - k)):
        M = cv2.getRotationMatrix2D(c, 0, s)
        out[..., ch] = cv2.warpAffine(img[..., ch], M, (FW, FH), flags=cv2.INTER_LINEAR,
                                      borderMode=cv2.BORDER_REFLECT)
    return out


# -------------------------------------------------------------------- grade
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def grade(img, t):
    luma = img @ LUMA
    sat = 0.86 + 0.06 * window(t, T_STRIKE - 0.5, 23, 0.3, 1.5)
    img = luma[..., None] + (img - luma[..., None]) * sat
    l = np.clip(luma, 0, 1)[..., None]
    img = img + (1 - l) ** 2 * np.array([-0.030, 0.006, 0.030], np.float32) \
              + l ** 2 * np.array([0.045, 0.018, -0.040], np.float32)
    x = np.clip(img, 0, 1.2)
    img = x * x * (3 - 2 * np.clip(x, 0, 1)) * 0.55 + x * 0.45
    return 0.028 + img * 0.955


def bloom_and_streak(img, t):
    small = cv2.resize(img, (FW // 4, FH // 4), interpolation=cv2.INTER_AREA)
    hi = np.clip(small - 0.72, 0, None)
    bloom = cv2.GaussianBlur(hi, (0, 0), 9)
    streak = cv2.blur(hi, (int(FW / 4 * 0.38) | 1, 1)) * np.array([0.55, 0.75, 1.0], np.float32)
    k_streak = 0.55 + 1.6 * window(t, 27.8, 30.2, 1.2, 0.1)
    return img + cv2.resize(bloom * 0.55 + streak * k_streak, (FW, FH), interpolation=cv2.INTER_LINEAR)


_rng_g = np.random.default_rng(3)
GRAIN_BANK = [cv2.GaussianBlur(_rng_g.normal(0, 1, (960, 960)).astype(np.float32), (0, 0), 0.6)
              for _ in range(12)]


def grain(fi, h, w):
    return cv2.resize(GRAIN_BANK[fi % len(GRAIN_BANK)], (w, h), interpolation=cv2.INTER_LINEAR)


# ---------------------------------------------------------------- particles
_rng_p = np.random.default_rng(11)
N_P = 90
P_POS = _rng_p.random((N_P, 2))
P_VEL = _rng_p.normal(0, 1, (N_P, 2)) * [0.0047, 0.006] + [0.0073, -0.005]
P_SIZE = _rng_p.uniform(1.2, 4.5, N_P)
P_PHASE = _rng_p.random(N_P) * 6.28
P_DEPTH = _rng_p.uniform(0.3, 1.0, N_P)


def particles(t):
    layer = np.zeros((FH // 2, FW // 2), np.float32)
    dens = 0.35 + 0.65 * window(t, T_FALL - 0.1, 31, 0.4, 0.1)
    pos = (P_POS + P_VEL * t * P_DEPTH[:, None]) % 1.0
    oy = (MY - FY) / 2
    for i in range(int(N_P * dens)):
        a = 0.5 + 0.5 * math.sin(t * 1.3 + P_PHASE[i])
        cv2.circle(layer, (int(pos[i, 0] * FW / 2), int(oy + pos[i, 1] * MH / 2)),
                   max(1, int(P_SIZE[i] * P_DEPTH[i] * FH / 1080)), float(a * P_DEPTH[i]), -1,
                   lineType=cv2.LINE_AA)
    layer = cv2.resize(cv2.GaussianBlur(layer, (0, 0), 1.4), (FW, FH), interpolation=cv2.INTER_LINEAR)
    return layer[..., None] * np.array([1.0, 0.86, 0.62], np.float32) * 0.22


# --------------------------------------------------------------- typography
FONT_FILES = {"cinzel": "Cinzel-Regular.ttf", "cinzel_b": "Cinzel-Bold.ttf",
              "cinzel_k": "Cinzel-Black.ttf", "corm": "Cormorant-Medium.ttf"}
FONT_DIR = "fonts"
_font_cache = {}


def font(name, size):
    key = (name, int(size))
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(os.path.join(FONT_DIR, FONT_FILES[name]), int(size))
    return _font_cache[key]


def text_mask(text, name, size, tracking=0.0, per_char=None):
    """Tracked text; per_char(i) -> (alpha, dy).  Advance uses prefix widths so
    kerning survives per-character animation."""
    f = font(name, size)
    prefix = [f.getlength(text[:i]) for i in range(len(text) + 1)]
    total = prefix[-1] + tracking * (len(text) - 1)
    asc, desc = f.getmetrics()
    pad = 40
    m = Image.new("L", (int(total) + pad * 2, asc + desc + pad * 2), 0)
    d = ImageDraw.Draw(m)
    for i, c in enumerate(text):
        a, dy = per_char(i) if per_char else (1.0, 0)
        if a > 0.01 and c != " ":
            d.text((pad + prefix[i] + tracking * i, pad + dy), c, font=f, fill=int(255 * a))
    return np.asarray(m, np.float32) / 255, pad


class Layer:
    """Premultiplied overlay: out = picture * dark * (1 - a) + col + add."""

    def __init__(self):
        self.dark = np.ones((H, W), np.float32)
        self.col = np.zeros((H, W, 3), np.float32)
        self.a = np.zeros((H, W), np.float32)
        self.add = np.zeros((H, W, 3), np.float32)

    def over(self, x1, y1, m, col):
        x2, y2 = min(W, x1 + m.shape[1]), min(H, y1 + m.shape[0])
        m = m[: y2 - y1, : x2 - x1]
        mm = m[..., None]
        self.col[y1:y2, x1:x2] = self.col[y1:y2, x1:x2] * (1 - mm) + col * mm
        self.a[y1:y2, x1:x2] = self.a[y1:y2, x1:x2] * (1 - m) + m

    def scrim(self, cy, height, strength, x_fade=None):
        if strength <= 0:
            return
        prof = np.exp(-((np.arange(H, dtype=np.float32) - cy) / height) ** 2)
        d = strength * prof[:, None]
        if x_fade is not None:
            d = d * np.clip(1 - np.arange(W, dtype=np.float32)[None, :] / x_fade, 0, 1)
        self.dark *= 1 - d

    def text(self, mask, cx, cy, color, opacity=1.0, blur=0.0, glow=0.0, gradient=True, anchor="c"):
        if opacity <= 0.003:
            return
        if blur > 0.3:
            mask = cv2.GaussianBlur(mask, (0, 0), blur)
        h, w = mask.shape
        x0 = int(cx - w / 2) if anchor == "c" else int(cx)
        y0 = int(cy - h / 2)
        x1, y1, x2, y2 = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
        if x2 <= x1 or y2 <= y1:
            return
        m = mask[y1 - y0:y2 - y0, x1 - x0:x2 - x0] * opacity
        if gradient:
            g = np.linspace(0, 1, h, dtype=np.float32)[y1 - y0:y2 - y0, None, None]
            col = (GOLD_HI * (1 - g) + GOLD_LO * g) * 0.5 + color * 0.5
        else:
            col = color
        if glow > 0:
            gl = cv2.GaussianBlur(mask, (0, 0), 14)[y1 - y0:y2 - y0, x1 - x0:x2 - x0] * glow * opacity
            self.add[y1:y2, x1:x2] += gl[..., None] * GOLD * 0.9
        self.over(x1, y1, m, col)

    def rule(self, cx, cy, half_w, progress, opacity=1.0, thickness=2, vertical=False):
        if progress <= 0 or opacity <= 0:
            return
        n = int(half_w * 2 * progress)
        if n < 2:
            return
        fade = np.minimum(1, np.minimum(np.arange(n), np.arange(n)[::-1]) / 60.0).astype(np.float32) * opacity
        if vertical:
            self.over(int(cx), int(cy), np.repeat(fade[:, None], thickness, 1), GOLD)
        else:
            self.over(int(cx - n / 2), int(cy), np.repeat(fade[None, :], thickness, 0), GOLD)

    def accumulate(self, other, w):
        self.dark += other.dark * w
        self.col += other.col * w
        self.a += other.a * w
        self.add += other.add * w


def titles_active(t):
    return (window(t, T_LOC, 4.75, 0.8, 0.7) > 0 or window(t, T_DAVID, 9.0, 0.4, 0.6) > 0
            or window(t, T_GOLIATH, 16.8, 0.4, 0.6) > 0 or window(t, T_SCRIPT, 26.6, 0.9, 0.8) > 0
            or t >= T_TITLE or (FMT == "9x16" and window(t, T_DAVID, T_TITLE - 0.3, 0.8, 0.6) > 0))


def draw_titles(L, t):
    band_top = MY / 2
    band_bot = MY + MH + (H - MY - MH) / 2

    # 1) location card: tracking collapses, blur resolves, gold rule draws on
    a = window(t, T_LOC, 4.75, 0.8, 0.7)
    if a > 0:
        p = ease_out_expo((t - T_LOC) / 2.2)
        cy = pick(H / 2 - 10, MY + MH / 2 - 10, band_top - 18)
        if FMT != "9x16":
            L.scrim(cy, pick(190, 150, 1), 0.5 * a)
        size = pick(44, 34, 40)
        m, _ = text_mask("THE VALLEY OF ELAH", "cinzel", size, tracking=(28 - 16 * p) * size / 44)
        L.text(m, W / 2, cy - size * 0.64, GOLD_HI, a, blur=6 * (1 - p), glow=0.35)
        L.rule(W / 2, cy + size * 0.5, pick(250, 190, 200), ease_out_cubic((t - T_LOC - 0.4) / 1.4), a)
        m, _ = text_mask("1 SAMUEL  XVII", "cinzel", pick(32, 24, 26), tracking=pick(14, 10, 11))
        L.text(m, W / 2, cy + size * 1.4, GOLD, a * ease_in_out((t - T_LOC - 0.9) / 0.8))

    # 2) persistent wordmark in the vertical top band
    if FMT == "9x16":
        a = window(t, T_DAVID, T_TITLE - 0.3, 0.8, 0.6)
        if a > 0:
            m, _ = text_mask("DAVID  ×  GOLIATH", "cinzel", 30, tracking=14)
            L.text(m, W / 2, band_top - 12, GOLD_HI, a * 0.8)
            L.rule(W / 2, band_top + 26, 70, ease_out_cubic((t - T_DAVID) / 1.2), a * 0.8)

    # 3) character plates: letters rise with overshoot, staggered
    for name, sub, t0, t1 in (("DAVID", "Son of Jesse  ·  Shepherd of Bethlehem", T_DAVID, 9.0),
                              ("GOLIATH", "Champion of Gath  ·  Six cubits and a span", T_GOLIATH, 16.8)):
        a = window(t, t0, t1, 0.4, 0.6)
        if a <= 0:
            continue
        nsize, ssize = pick(74, 56, 72), pick(38, 29, 34)

        def per(i, t0=t0, nsize=nsize):
            q = t - t0 - 0.12 - i * 0.05
            return ease_out_cubic(q / 0.35), int(nsize * 0.45 * (1 - ease_out_back(q / 0.6)))

        m, pad = text_mask(name, "cinzel_b", nsize, tracking=nsize * 0.14, per_char=per)
        sa = a * ease_in_out((t - t0 - 0.6) / 0.6)
        s_m, s_pad = text_mask(sub, "corm", ssize, tracking=1.5)
        if FMT == "9x16":
            y = band_bot - 16
            L.rule(W / 2, y - nsize * 0.95, 120, ease_out_expo((t - t0) / 0.8), a)
            L.text(m, W / 2, y, GOLD_HI, a, glow=0.25)
            L.text(s_m, W / 2 + 8 * (1 - sa), y + nsize * 0.85, WHITE, sa, gradient=False)
        else:
            x = pick(150, 80, 0)
            y = MY + MH - pick(150, 110, 0)
            L.scrim(y, pick(160, 120, 1), 0.5 * a, x_fade=pick(1100, 800, 1))
            L.rule(x - 28, y - nsize * 0.7, nsize * 0.77, ease_out_expo((t - t0) / 0.7), a, 3, vertical=True)
            L.text(m, x - pad, y - nsize * 0.27, GOLD_HI, a, glow=0.25, anchor="l")
            L.text(s_m, x - s_pad + 8 * (1 - sa), y + nsize * 0.54, WHITE, sa, gradient=False, anchor="l")

    # 4) scripture after the fall
    a = window(t, T_SCRIPT, 26.6, 0.9, 0.8)
    if a > 0:
        p = ease_out_cubic((t - T_SCRIPT) / 2.4)
        qsize = pick(70, 54, 56)
        cy = pick(H / 2, MY + MH / 2, band_bot - 22)
        if FMT != "9x16":
            L.scrim(cy, pick(220, 170, 1), 0.55 * a)
        m, _ = text_mask("“for the battle is the Lord’s”", "corm", qsize, tracking=2)
        L.text(m, W / 2, cy - 20 + 14 * (1 - p), WHITE, a, blur=4 * (1 - p), gradient=False)
        m, _ = text_mask("1 SAMUEL 17:47", "cinzel", pick(32, 24, 26), tracking=12)
        L.text(m, W / 2, cy + qsize * 0.88, GOLD, a * ease_in_out((t - T_SCRIPT - 0.8) / 0.8))

    # 5) end title (stacked in 9x16), glow + tracking settle, dip to black
    if t >= T_TITLE:
        p = t - T_TITLE
        a = ease_in_out(p / 0.9) * (1 - ease_in_out((t - 29.45) / 0.55))
        blur = 10 * (1 - ease_out_cubic(p / 1.2))
        if FMT == "9x16":
            base = H / 2 - 40
            for txt, sz, dy, delay in (("DAVID", 150, -250, 0.0), ("×", 96, -100, 0.25),
                                       ("GOLIATH", 150, 50, 0.4)):
                per = lambda i, delay=delay, n=len(txt): (
                    ease_out_cubic((p - 0.15 - delay - abs(i - n / 2) * 0.06) / 0.9), 0)
                trk = (30 - 20 * ease_out_expo(p / 2.2)) * sz / 132
                m, _ = text_mask(txt, "cinzel_k", sz, tracking=trk, per_char=per)
                L.text(m, W / 2, base + dy, GOLD_HI, a, blur=blur, glow=0.6)
            rule_y, tag_y = base + 170, base + 230
        else:
            title = "DAVID  ×  GOLIATH"
            sz = pick(132, 84, 0)
            per = lambda i: (ease_out_cubic((p - 0.15 - abs(i - len(title) / 2) * 0.06) / 0.9), 0)
            trk = (34 - 20 * ease_out_expo(p / 2.2)) * sz / 132
            m, _ = text_mask(title, "cinzel_k", sz, tracking=trk, per_char=per)
            cy = H / 2 - 30 * sz / 132
            L.text(m, W / 2, cy, GOLD_HI, a, blur=blur, glow=0.6)
            rule_y, tag_y = cy + sz * 0.7, cy + sz * 1.08
        L.rule(W / 2, rule_y, pick(360, 240, 260), ease_out_expo((p - 0.6) / 1.2), a)
        m, _ = text_mask("GIANTS FALL", "cinzel", pick(44, 32, 40), tracking=pick(26, 18, 22))
        L.text(m, W / 2, tag_y, GOLD, a * ease_in_out((p - 1.0) / 0.8))


# ------------------------------------------------------------------- frame
SUB = 8


def sub_times(t, n):
    """n sample times across a 180 degree shutter centred on t."""
    if n <= 1:
        return [t]
    shutter = 0.5 / FPS
    return [t + shutter * ((k + 0.5) / n - 0.5) for k in range(n)]


def render_frame(src16, t, fi):
    src = src16.astype(np.float32) / 65535.0
    ts = sub_times(t, SUB)

    # motion blur on the camera move: average the warp over the shutter
    img = np.zeros((FH, FW, 3), np.float32)
    for tk in ts:
        img += warp(src, tk)
    img /= len(ts)

    strike = decay(t, T_STRIKE, 7.0)
    fall = decay(t, T_FALL, 5.0)
    img = radial_blur(img, 0.05 * strike + 0.035 * fall
                      + 0.015 * window(t, T_RELEASE - 0.2, T_RELEASE + 0.5, 0.2, 0.3))
    img = chromatic(img, 0.0012 + 0.006 * strike + 0.005 * fall)
    img = grade(img, t)
    img = bloom_and_streak(img, t)
    img = img + particles(t)
    img = img + decay(t, T_STRIKE, 14.0) * 0.9 + fall ** 2 * np.array([0.22, 0.16, 0.08], np.float32)
    img = img * VIGNETTE
    img = img * (1 - 0.72 * ease_in_out((t - T_TITLE + 0.2) / 1.2))
    l = np.clip(img.mean(axis=2, keepdims=True), 0, 1)
    img = img + grain(fi, FH, FW)[..., None] * (0.028 + 0.02 * strike) * (0.35 + l * (1 - l) * 2.2)

    canvas = np.zeros((H, W, 3), np.float32)
    canvas[FY:FY + FH, FX:FX + FW] = img
    # bands: the picture window opens from a hairline at the start
    half = int(MH / 2 * (0.02 + 0.98 * ease_out_expo((t - 0.1) / 1.4)))
    cy = MY + MH // 2
    canvas[:cy - half] = 0
    canvas[cy + half:] = 0
    canvas[:, :MX] = 0
    canvas[:, MX + MW:] = 0

    # typography, motion-blurred over the same shutter
    if any(titles_active(tk) for tk in ts):
        acc = Layer()
        acc.dark[:] = 0
        for tk in ts:
            one = Layer()
            draw_titles(one, tk)
            acc.accumulate(one, 1 / len(ts))
        canvas = canvas * acc.dark[..., None] * (1 - acc.a[..., None]) + acc.col + acc.add

    canvas *= ease_in_out(t / 0.8) * (1 - ease_in_out((t - 29.35) / 0.65))
    return (np.clip(canvas, 0, 1) * 255 + 0.5).astype(np.uint8)


# --------------------------------------------------------------- workers
def _init_worker(fmt, sub, font_dir):
    global SUB, FONT_DIR
    cv2.setNumThreads(1)
    set_format(fmt)
    SUB, FONT_DIR = sub, font_dir


def _job(args):
    fi, buf = args
    fr = np.frombuffer(buf, np.uint16).reshape(DH, DW, 3)
    return render_frame(fr, fi / FPS, fi).tobytes()


def decode_cmd(src, pre=()):
    return ["ffmpeg", "-v", "error", *pre, "-i", src,
            "-vf", f"scale={DW}:{DH}:flags=lanczos,unsharp=5:5:0.45",
            "-pix_fmt", "rgb48le", "-f", "rawvideo"]


# ------------------------------------------------------------------- audio
def build_audio(src, out_wav, duration):
    sr = score.SR
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-ac", "2", "-ar", str(sr),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    orig = np.frombuffer(raw, np.float32).reshape(-1, 2)
    mix = score.master(orig, score.build_score(duration), duration)
    pre = out_wav + ".pre.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", "2",
                    "-i", "-", pre], input=mix.tobytes(), check=True)
    # two-pass EBU R128 loudness normalisation to -14 LUFS, -1 dBTP
    target = "I=-14:TP=-1:LRA=11"
    js = subprocess.run(["ffmpeg", "-hide_banner", "-i", pre, "-af", f"loudnorm={target}:print_format=json",
                         "-f", "null", "-"], capture_output=True, text=True).stderr
    m = json.loads(js[js.rindex("{"):js.rindex("}") + 1])
    af = (f"loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
          f"offset={m['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", pre, "-af", af, "-ar", str(sr), out_wav], check=True)
    os.remove(pre)


# -------------------------------------------------------------------- main
def main():
    global SUB, FONT_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--format", default="16x9", choices=list(FORMATS))
    ap.add_argument("--fonts", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts"))
    ap.add_argument("--sub", type=int, default=8, help="motion-blur sub-frames per frame")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--stills", default="", help="comma list of times to dump as PNG")
    ap.add_argument("--audio-only", action="store_true", help="write the mastered mix to OUT (.wav)")
    args = ap.parse_args()
    set_format(args.format)
    SUB, FONT_DIR = args.sub, args.fonts

    probe = subprocess.run(["ffmpeg", "-i", args.src], capture_output=True, text=True).stderr
    dur = [l for l in probe.splitlines() if "Duration" in l][0].split()[1].rstrip(",")
    h_, m_, s_ = dur.split(":")
    duration = int(h_) * 3600 + int(m_) * 60 + float(s_)

    if args.audio_only:
        build_audio(args.src, args.out, duration)
        return

    if args.stills:
        for ts in [float(x) for x in args.stills.split(",")]:
            raw = subprocess.run(decode_cmd(args.src, ["-ss", str(ts)]) + ["-frames:v", "1", "-"],
                                 capture_output=True, check=True).stdout
            fr = np.frombuffer(raw, np.uint16).reshape(DH, DW, 3)
            Image.fromarray(render_frame(fr, ts, int(ts * FPS))).save(f"{args.out}_{FMT}_{ts:05.2f}.png")
        return

    wav = args.out + ".mix.wav"
    build_audio(args.src, wav, duration)

    dec = subprocess.Popen(decode_cmd(args.src) + ["-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y",
                            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-i", wav,
                            "-map", "0:v", "-map", "1:a", "-shortest",
                            "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-tune", "film",
                            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                            "-movflags", "+faststart", "-c:a", "aac", "-b:a", "256k", args.out],
                           stdin=subprocess.PIPE)
    fsize = DW * DH * 6
    fi = 0
    with mp.get_context("fork").Pool(args.workers, _init_worker, (FMT, SUB, FONT_DIR)) as pool:
        done = False
        while not done:
            jobs = []
            for _ in range(args.workers * 3):
                buf = dec.stdout.read(fsize)
                if len(buf) < fsize:
                    done = True
                    break
                jobs.append((fi, buf))
                fi += 1
            for frame in pool.map(_job, jobs):
                enc.stdin.write(frame)
            print(f"\r[{FMT}] {fi / FPS:5.1f}s", end="", file=sys.stderr, flush=True)
    enc.stdin.close()
    enc.wait()
    dec.wait()
    os.remove(wav)
    print(f"\nwrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
