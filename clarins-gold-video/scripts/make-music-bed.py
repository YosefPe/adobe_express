"""Synthesizes a soft, deterministic 26s music bed (placeholder until a licensed track is supplied).

    python scripts/make-music-bed.py assets/audio/music-bed.wav

Warm pad chords (Fmaj9, Dm9, Bbmaj9, Csus) with a gentle bell arpeggio. Needs numpy; ffmpeg adds
the room reverb and loudness normalization.
"""
import subprocess
import sys
import wave

import numpy as np

SR = 48000
TOTAL = 26.0
BAR = 6.5  # four chords across 26s

out = sys.argv[1] if len(sys.argv) > 1 else "assets/audio/music-bed.wav"
raw = out.replace(".wav", ".raw.wav")


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# Pad voicings and arpeggio pitches (MIDI).
chords = [
    ([41, 53, 57, 60, 64, 67], [65, 69, 72, 76, 79, 76, 72, 69]),  # Fmaj9
    ([38, 50, 53, 57, 60, 64], [62, 65, 69, 72, 76, 72, 69, 65]),  # Dm9
    ([34, 46, 50, 53, 57, 60], [58, 62, 65, 69, 72, 69, 65, 62]),  # Bbmaj9
    ([36, 48, 53, 55, 60, 62], [60, 65, 67, 72, 74, 72, 67, 65]),  # Csus
]

n = int(SR * TOTAL)
t = np.arange(n) / SR
mix = np.zeros(n)

for i, (pad, arp) in enumerate(chords):
    start = i * BAR
    s0, s1 = int(start * SR), min(n, int((start + BAR + 1.5) * SR))
    lt = t[s0:s1] - start
    env = np.clip(lt / 1.8, 0, 1) * np.clip((BAR + 1.5 - lt) / 2.0, 0, 1)
    for k, m in enumerate(pad):
        f = hz(m)
        detune = 1 + 0.0015 * (k % 3 - 1)
        tone = np.sin(2 * np.pi * f * detune * lt) + 0.25 * np.sin(2 * np.pi * 2 * f * lt)
        gain = 0.09 if m < 45 else 0.05
        mix[s0:s1] += gain * env * tone
    for j, m in enumerate(arp):
        ns = start + 0.4 + j * (BAR / len(arp))
        a0, a1 = int(ns * SR), min(n, int((ns + 2.5) * SR))
        at = t[a0:a1] - ns
        f = hz(m + 12)
        bell = np.sin(2 * np.pi * f * at) + 0.3 * np.sin(2 * np.pi * 2.01 * f * at) + 0.1 * np.sin(2 * np.pi * 3.0 * f * at)
        mix[a0:a1] += 0.035 * np.exp(-at * 2.2) * np.clip(at / 0.01, 0, 1) * bell

# Global fade in/out.
fade = np.clip(t / 1.5, 0, 1) * np.clip((TOTAL - t) / 2.5, 0, 1)
mix *= fade
mix /= np.max(np.abs(mix)) * 1.1

stereo = np.stack([mix, np.roll(mix, int(0.012 * SR))], axis=1)
pcm = (stereo * 32767).astype(np.int16)
with wave.open(raw, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

subprocess.run(
    [
        "ffmpeg", "-y", "-loglevel", "error", "-i", raw,
        "-af", f"lowpass=f=6000,aecho=0.8:0.7:60|120:0.25|0.15,atrim=0:{TOTAL},loudnorm=I=-20:TP=-2:LRA=7",
        "-ar", str(SR), out,
    ],
    check=True,
)
subprocess.run(["rm", "-f", raw], check=True)
print(f"Wrote {out}")
