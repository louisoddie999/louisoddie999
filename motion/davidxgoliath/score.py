"""Sample-free synthesized score for David x Goliath, beat-locked to the picture.

97.96 BPM (one beat = 0.6125 s) is chosen so that the stone strike (19.0 s) and
Goliath hitting the ground (21.45 s) both land on bar downbeats.
"""
import numpy as np
from scipy.signal import butter, lfilter, sosfilt

SR = 48000
BEAT = 0.6125
T_STRIKE = 19.0
T_FALL = T_STRIKE + 4 * BEAT            # 21.45
T_RELEASE = 9.55
T_SILENCE = 18.70                       # music cuts out: "the silence before the stone"
T_TITLE = T_STRIKE + 14 * BEAT          # 27.575


def beat(n):
    return T_STRIKE + n * BEAT


def bar(n):
    return T_STRIKE + 4 * n * BEAT


def hz(note):
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3,
             "G": -2, "G#": -1, "A": 0, "A#": 1, "Bb": 1, "B": 2}
    name, octave = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[name] + 12 * (octave - 4)) / 12)


class Bus:
    def __init__(self, n):
        self.buf = np.zeros((n, 2), np.float32)

    def add(self, t0, sig, gain=1.0, pan=0.0):
        i0 = int(round(t0 * SR))
        if i0 >= len(self.buf):
            return
        if i0 < 0:
            sig, i0 = sig[-i0:], 0
        sig = sig[: len(self.buf) - i0] * gain
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.buf[i0:i0 + len(sig), 0] += sig * l * 1.4142
        self.buf[i0:i0 + len(sig), 1] += sig * r * 1.4142


def tau(dur):
    return np.arange(int(dur * SR), dtype=np.float32) / SR     # always >= 0


RNG = np.random.default_rng(17)


def noise(n):
    return RNG.normal(0, 1, n).astype(np.float32)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x).astype(np.float32)


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, "lowpass", fs=SR, output="sos"), x).astype(np.float32)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "highpass", fs=SR, output="sos"), x).astype(np.float32)


# ------------------------------------------------------------- instruments
def kick(dur=0.7, f_hi=120, f_lo=44, drop=26, dec=6.0):
    t = tau(dur)
    f = f_lo + (f_hi - f_lo) * np.exp(-t * drop)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * dec)
    click = hp(noise(len(t)), 2000) * np.exp(-t * 300) * 0.25
    return s + click


def taiko(f=68, dur=1.2):
    t = tau(dur)
    body = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.6 * np.exp(-t * 18))) / SR) * np.exp(-t * 4.5)
    skin = bp(noise(len(t)), 90, 900) * np.exp(-t * 14) * 0.6
    return body + skin


def tom(f=110, dur=0.5):
    t = tau(dur)
    return np.sin(2 * np.pi * np.cumsum(f * (1 + 0.4 * np.exp(-t * 25))) / SR) * np.exp(-t * 9) \
        + bp(noise(len(t)), 200, 2500) * np.exp(-t * 30) * 0.3


def hat(dur=0.08, dec=70):
    t = tau(dur)
    return hp(noise(len(t)), 7000) * np.exp(-t * dec)


def shaker(dur=0.09):
    t = tau(dur)
    env = (1 - np.exp(-t * 200)) * np.exp(-t * 45)
    return bp(noise(len(t)), 4500, 11000) * env


def clap(dur=0.35):
    t = tau(dur)
    env = sum(np.exp(-np.clip(t - d, 0, None) * 120) * (t >= d) for d in (0, 0.011, 0.023))
    env = env + np.exp(-t * 16) * 0.4
    return bp(noise(len(t)), 900, 3200) * env


def polyblep_saw(f, dur):
    t = tau(dur)
    phase = (np.cumsum(np.full(len(t), f / SR)) % 1.0).astype(np.float32)
    dt = f / SR
    s = 2 * phase - 1
    m1 = phase < dt
    x = phase[m1] / dt
    s[m1] -= x + x - x * x - 1
    m2 = phase > 1 - dt
    x = (phase[m2] - 1) / dt
    s[m2] -= x * x + x + x + 1
    return s


def pad(notes, dur, attack=1.2, release=1.5, cutoff=900):
    t = tau(dur)
    s = np.zeros(len(t), np.float32)
    for n in notes:
        for det in (-0.08, 0.0, 0.07):
            s += polyblep_saw(hz(n) * 2 ** (det / 12), dur)
    s = lp(s / (3 * len(notes)), cutoff, 2)
    env = np.clip(t / attack, 0, 1) * np.clip((dur - t) / release, 0, 1)
    return s * env


def pluck(note, dur=0.45, bright=2400):
    t = tau(dur)
    s = polyblep_saw(hz(note), dur) * np.exp(-t * 9)
    return lp(s, bright, 2)


def ks_guitar(note, dur=2.0, damp=0.996):
    n = int(dur * SR)
    period = int(SR / hz(note))
    buf = noise(period) * 0.5
    out = np.zeros(n, np.float32)
    for i in range(n):
        j = i % period
        out[i] = buf[j]
        buf[j] = damp * 0.5 * (buf[j] + buf[(j + 1) % period])
    return lp(out, 3500)


def fm(note, dur, ratio, index, idec, adec):
    t = tau(dur)
    f = hz(note)
    mod = np.sin(2 * np.pi * f * ratio * t) * index * np.exp(-t * idec)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * adec) * np.clip(t / 0.004, 0, 1)


def bell(note, dur=3.0):
    return fm(note, dur, 3.5, 2.4, 1.8, 1.3)


def rhodes(note, dur=2.2):
    return fm(note, dur, 1.0, 1.6, 4.0, 1.4) + fm(note, dur, 14.0, 0.25, 30, 9) * 0.15


def swept_noise(dur, f0, f1, env):
    """Noise through a band sweeping f0 -> f1 (crossfaded filter bank)."""
    t = tau(dur)
    x = noise(len(t))
    centers = np.geomspace(min(f0, f1), max(f0, f1), 7)
    track = np.geomspace(f0, f1, len(t))
    out = np.zeros(len(t), np.float32)
    for c in centers:
        w = np.exp(-(np.log(track / c) / 0.35) ** 2)
        out += bp(x, c / 1.6, min(c * 1.6, SR / 2 - 100)) * w
    return out * env


def whoosh(dur=0.9, rise=True):
    t = tau(dur)
    x = t / dur
    env = (np.sin(np.pi * x) ** 2) if rise else np.exp(-x * 5)
    return swept_noise(dur, 250, 5000, env) if rise else swept_noise(dur, 4000, 300, env)


def riser(dur):
    t = tau(dur)
    x = t / dur
    s = swept_noise(dur, 200, 7000, x ** 2.2)
    f = 110 * 2 ** (x * 2.0)
    s += np.sin(2 * np.pi * np.cumsum(f) / SR) * x ** 3 * 0.25
    return s


def impact(size=1.0, dur=4.0):
    t = tau(dur)
    f = 30 + 70 * np.exp(-t * 7)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - np.exp(-t * 500)) * np.exp(-t * 1.6)
    crack = bp(noise(len(t)), 800, 6000) * np.exp(-t * 35)
    rumble = lp(noise(len(t)), 180) * np.exp(-t * 2.2) * 1.6
    return (sub * 1.1 + crack * 0.5 + rumble) * size


# -------------------------------------------------------------------- mix
def reverb(x, wet=0.35):
    """Schroeder: 4 parallel combs + 2 series all-passes, per channel."""
    out = np.zeros_like(x)
    for ch in range(2):
        s = x[:, ch]
        acc = np.zeros_like(s)
        for d, g in ((1557, 0.84), (1617, 0.83), (1491, 0.85), (1422, 0.86)):
            d += 23 * ch
            a = np.zeros(d + 1, np.float32)
            a[0], a[d] = 1, -g
            acc += lfilter([1.0], a, s).astype(np.float32)
        acc /= 4
        for d, g in ((225, 0.7), (556, 0.7)):
            b = np.zeros(d + 1, np.float32)
            a = np.zeros(d + 1, np.float32)
            b[0], b[d] = -g, 1
            a[0], a[d] = 1, -g
            acc = lfilter(b, a, acc).astype(np.float32)
        out[:, ch] = lp(acc, 6000)
    return x * (1 - wet) + out * wet * 2.2


def sidechain(n, triggers, depth=0.6, rel=7.0):
    t = np.arange(n, dtype=np.float32) / SR
    g = np.ones(n, np.float32)
    for tt, d in triggers:
        dt = np.clip(t - tt, 0, None)
        g = np.minimum(g, np.where(t >= tt, 1 - depth * d * np.exp(-dt * rel), 1))
    return g[:, None]


def build_score(duration):
    n = int(duration * SR) + SR
    drums, music, fx, verb_send = Bus(n), Bus(n), Bus(n), Bus(n)
    duck = []

    # I. The stream: low D-minor drone fades up
    music.add(0.0, pad(["D2", "A2", "D3"], bar(-6) + 0.4, attack=3.0, release=0.6, cutoff=500), 0.55)
    fx.add(beat(-29) - 0.45, whoosh(0.9), 0.18, -0.3)            # into the location card

    # II. The run (bars -6 .. -4): taiko groove, 16th hats, pluck ostinato
    for b in (-6, -5, -4):
        b0 = bar(b)
        chord = ["D3", "F3", "A3"] if b != -5 else ["Bb2", "D3", "F3"]
        music.add(b0, pad(chord, 4 * BEAT + 0.3, attack=0.4, release=0.3, cutoff=1100), 0.4)
        for step in range(16):
            ts = b0 + step * BEAT / 4
            if ts >= T_RELEASE - 0.05 and b == -4:
                break
            if step in (0, 6, 8, 11):
                drums.add(ts, taiko(64 if step in (0, 8) else 82), 0.9 if step in (0, 8) else 0.55)
                duck.append((ts, 1.0 if step in (0, 8) else 0.5))
            if step in (4, 12):
                drums.add(ts, clap(), 0.35, 0.1)
            drums.add(ts, hat(), 0.10 + 0.08 * (step % 4 == 2), 0.35)
            drums.add(ts + 0.01, shaker(), 0.07, -0.35)
            if step % 2 == 0:
                notes = ["D3", "A3", "D4", "A3", "F3", "A3", "D4", "E4"]
                music.add(ts, pluck(notes[(step // 2) % 8]), 0.16, 0.25 * ((step // 2) % 2 * 2 - 1))
    fx.add(T_RELEASE - 0.25, whoosh(0.8), 0.45, 0.4)             # sling release

    # III. The flight (bars -4 .. -1): half-time toms, pad swell, ticking pluck
    for b in (-4, -3, -2):
        b0 = bar(b)
        chord = ["D3", "F3", "A3"] if b % 2 == 0 else ["Bb2", "D3", "F3"]
        music.add(b0, pad(chord, 4 * BEAT + 0.4, attack=1.0, release=0.4, cutoff=700 + 250 * (b + 4)), 0.45)
        if b0 > T_RELEASE:
            drums.add(b0, taiko(58, 1.8), 1.0)
            duck.append((b0, 1.0))
            drums.add(b0 + 2 * BEAT, taiko(76), 0.5)
        for e in range(8):
            ts = b0 + e * BEAT / 2
            if ts > T_RELEASE + 0.3:
                music.add(ts, pluck("D4" if e % 2 == 0 else "A3", 0.25, 1800), 0.09, 0.4)
                drums.add(ts, hat(0.05, 90), 0.05, -0.4)
    fx.add(beat(-10) - 0.4, whoosh(0.8), 0.14, 0.2)              # GOLIATH plate

    # IV. The silence: roll + riser, then a hard cut-out before the strike
    t, gap = bar(-1), BEAT / 2
    while t < T_SILENCE - 0.02:
        drums.add(t, tom(96, 0.3), 0.25 + 0.55 * (t - bar(-1)) / (T_SILENCE - bar(-1)))
        t += gap
        gap = max(BEAT / 8, gap * 0.9)
    music.add(bar(-1), pad(["D3", "G3", "Bb3"], T_SILENCE - bar(-1), attack=1.5, release=0.02, cutoff=1400), 0.4)
    fx.add(bar(-1), riser(T_SILENCE - bar(-1)), 0.5)

    # V. The strike
    fx.add(T_STRIKE, impact(1.0), 0.95)
    verb_send.add(T_STRIKE, impact(0.6, 2.0), 0.5)
    duck.append((T_STRIKE, 1.0))
    music.add(T_STRIKE, pad(["D2", "A2"], T_FALL - T_STRIKE + 0.2, attack=0.6, release=0.2, cutoff=400), 0.5)
    for k in range(4):                                           # heartbeat
        drums.add(beat(k) + 0.6 * BEAT * (k == 0), kick(0.4, 90, 40, 30, 10), 0.35)
        drums.add(beat(k) + 0.18 + 0.6 * BEAT * (k == 0), kick(0.4, 80, 38, 30, 12), 0.22)

    # VI. The fall: the biggest hit, then the D-major resolution
    fx.add(T_FALL, impact(1.35, 5.0), 1.0)
    verb_send.add(T_FALL, impact(0.8, 2.0), 0.55)
    duck.append((T_FALL, 1.0))
    fx.add(T_FALL - 0.35, whoosh(0.5, rise=True), 0.3)
    prog = [["D3", "F#3", "A3", "D4"], ["G2", "B3", "D4", "G3"], ["D3", "F#3", "A3", "D4"]]
    for i, chord in enumerate(prog):
        b0 = T_FALL + i * 4 * BEAT
        dur = 4 * BEAT + 0.5 if i < 2 else duration - b0
        music.add(b0, pad(chord, dur, attack=1.4, release=1.2, cutoff=1500), 0.45)
        verb_send.add(b0, pad(chord, dur, attack=1.4, release=1.2, cutoff=1500), 0.25)
        for k in range(4):
            if i == 2 and k >= 2:
                break
            for note in chord[1:]:
                verb_send.add(b0 + k * BEAT, rhodes(note, 1.8), 0.08, 0.2)
        if i > 0:
            drums.add(b0, kick(0.8, 110, 42), 0.55)
            duck.append((b0, 0.6))
        arp = ["D5", "F#5", "A5", "D6"] if i != 1 else ["D5", "G5", "B5", "D6"]
        for e in range(8):
            ts = b0 + e * BEAT / 2 + BEAT * 2
            if ts < T_TITLE - 0.05:
                verb_send.add(ts, bell(arp[e % 4], 2.2), 0.05, (e % 2) * 0.8 - 0.4)
    music.add(T_FALL + 0.6, ks_guitar("D3", 3.0), 0.18, -0.3)
    music.add(T_FALL + 0.6 + BEAT, ks_guitar("A3", 3.0), 0.14, 0.3)

    # VII. Title
    fx.add(T_TITLE - 0.6, whoosh(0.7), 0.3)
    fx.add(T_TITLE, impact(0.8, 3.5), 0.7)
    verb_send.add(T_TITLE, bell("D5", 4.0), 0.22)
    verb_send.add(T_TITLE, bell("A4", 4.0), 0.12, -0.3)
    drums.add(T_TITLE, taiko(52, 2.5), 0.8)
    duck.append((T_TITLE, 1.0))

    music.buf *= sidechain(n, duck, 0.55)
    verb = reverb(verb_send.buf, wet=0.55)
    mix = drums.buf * 0.8 + music.buf + fx.buf * 0.9 + verb + reverb(music.buf * 0.3, 0.6) * 0.5

    # the silence before the stone: hard cut of everything musical
    t = np.arange(n) / SR
    gate = np.where((t >= T_SILENCE) & (t < T_STRIKE), 0.0, 1.0)
    gate = np.convolve(gate, np.ones(96) / 96, mode="same")      # 2 ms de-click
    mix *= gate[:, None].astype(np.float32)
    # the tail of the strike/fall is allowed through the gate (starts at T_STRIKE)
    return mix[: int(duration * SR)]


def master(original, score, duration):
    """Mix the score under the original sound, soft-clip."""
    n = int(duration * SR)
    orig = np.zeros((n, 2), np.float32)
    orig[: min(n, len(original))] = original[:n]
    rms_o = np.sqrt(np.mean(orig ** 2)) + 1e-9
    rms_s = np.sqrt(np.mean(score ** 2)) + 1e-9
    t = np.arange(n) / SR
    # the silence before the stone: duck the production sound as well
    duck = 1 - 0.8 * np.clip(np.minimum((t - (T_SILENCE - 0.12)) / 0.12, (T_STRIKE - t) / 0.01), 0, 1)
    mix = orig * duck[:, None] + score * (1.25 * rms_o / rms_s)
    mix *= np.clip((duration - t) / 0.65, 0, 1)[:, None]
    mix *= np.clip(t / 0.3, 0, 1)[:, None]
    peak = np.abs(mix).max()
    mix = np.tanh(mix / peak * 1.6) / np.tanh(1.6)
    return mix.astype(np.float32)
