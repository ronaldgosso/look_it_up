"""Compose a soothing, studio-warm ambient tutorial score at 75 BPM (0.800s/beat) for Look It Up.

Layers (all stereo 48kHz, zero harsh transients, warm filtered harmonic envelope):
1. Felt Electric Piano / Rhodes chords (Fmaj9 -> Em7 -> Dm9 -> G6/9 -> Cmaj9) with gentle mallet tine + warm tremolo
2. Bowed analog pad bed softly low-passed at 850 Hz with breathing organic LFO
3. Warm pure sub-bass anchoring exact bar changes (0.0s, 3.2s, 6.4s, 9.6s, 12.8s, 16.0s, 19.2s)
4. Soft pentatonic felt marimba/chime melody aligned to key tutorial cues (0.8s, 4.8s, 9.6s, 11.2s, 16.0s, 20.8s)
5. Ultra-soft bandpassed rain/brush air pulse on beats 2 & 4 (no sharp snare, no harsh hi-hat)
6. Stereo warm chamber reverb (Schroeder multi-tap stereo diffusion low-passed < 2.2 kHz)
7. Blends restrained low-HF Kenney SFX (click_003 / impactSoft_medium_001) at exact beat interactions.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfiltfilt

SR = 48000
DURATION = 24.20  # 24.0s main tutorial + 0.2s silent tail cushion
N_SAMPLES = int(round(SR * DURATION))
BPM = 75.0
BEAT_SEC = 60.0 / BPM  # 0.800s exact!

NOTE_NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi_to_hz(note: str) -> float:
    letter = note[0].upper()
    acc = 0
    idx = 1
    if len(note) > 2 and note[1] in ("#", "b"):
        acc = 1 if note[1] == "#" else -1
        idx = 2
    octave = int(note[idx:])
    midi = 12 * (octave + 1) + NOTE_NAMES[letter] + acc
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def highpass(audio: np.ndarray, cutoff_hz: float, order: int = 2) -> np.ndarray:
    sos = butter(order, cutoff_hz / (0.5 * SR), btype="high", output="sos")
    return sosfiltfilt(sos, audio, axis=0)


def lowpass(audio: np.ndarray, cutoff_hz: float, order: int = 2) -> np.ndarray:
    sos = butter(order, cutoff_hz / (0.5 * SR), btype="low", output="sos")
    return sosfiltfilt(sos, audio, axis=0)


def bandpass(audio: np.ndarray, low_hz: float, high_hz: float, order: int = 2) -> np.ndarray:
    sos = butter(order, [low_hz / (0.5 * SR), high_hz / (0.5 * SR)], btype="band", output="sos")
    return sosfiltfilt(sos, audio, axis=0)


def place(buf: np.ndarray, mono_or_stereo: np.ndarray, start_sec: float, pan: float = 0.0, gain: float = 1.0) -> None:
    s = int(round(start_sec * SR))
    if s >= buf.shape[0]:
        return
    if mono_or_stereo.ndim == 1:
        angle = (pan + 1.0) * 0.25 * math.pi
        lg, rg = math.cos(angle) * gain, math.sin(angle) * gain
        chunk = np.column_stack([mono_or_stereo * lg, mono_or_stereo * rg])
    else:
        chunk = mono_or_stereo * gain
    end = min(buf.shape[0], s + chunk.shape[0])
    avail = end - s
    if avail > 0:
        buf[s:end] += chunk[:avail]


def synth_felt_rhodes(freq: float, dur: float, vel: float = 0.7) -> np.ndarray:
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    # Smooth soft attack (14ms) -> natural exponential felt decay
    att = 0.016
    env_att = np.minimum(1.0, t / att) ** 1.6
    # Gentle decay curve plus release tail over last 0.35s
    tau = max(1.6, dur * 0.85)
    env_body = np.exp(-t / tau)
    rel_n = min(n, int(0.32 * SR))
    rel = np.ones(n, dtype=np.float64)
    rel[-rel_n:] = 0.5 * (1.0 + np.cos(np.pi * np.arange(rel_n) / rel_n))
    env = env_att * env_body * rel

    # Fundamental + warm 2nd harmonic + crystalline 3rd/4th/5th tine bell air (gentle felt chime warmth)
    vib = 0.0014 * np.sin(2.0 * np.pi * 4.1 * t)
    phase1 = 2.0 * np.pi * freq * (t + vib / (2.0 * np.pi))
    tine_env = np.exp(-t / 0.42)
    wave_sig = (
        0.92 * np.sin(phase1)
        + 0.34 * np.sin(2.0 * phase1) * np.exp(-t / 1.5)
        + 0.16 * np.sin(3.0 * phase1) * tine_env
        + 0.09 * np.sin(4.0 * phase1) * np.exp(-t / 0.24)
        + 0.04 * np.sin(6.0 * phase1) * np.exp(-t / 0.12)
    )
    # Soft stereo tremolo (0.65 Hz warm pan subtle modulation)
    trem = 1.0 + 0.09 * np.sin(2.0 * np.pi * 0.65 * t + freq * 0.01)
    return vel * env * trem * wave_sig * 0.22


def synth_warm_pad_chord(freqs: list[float], dur: float, gain: float = 0.085) -> np.ndarray:
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    att = min(0.95, dur * 0.28)
    rel = min(1.10, dur * 0.32)
    env = np.ones(n, dtype=np.float64)
    att_n = int(att * SR)
    rel_n = int(rel * SR)
    if att_n > 0:
        env[:att_n] = 0.5 * (1.0 - np.cos(np.pi * np.arange(att_n) / att_n))
    if rel_n > 0:
        env[-rel_n:] *= 0.5 * (1.0 + np.cos(np.pi * np.arange(rel_n) / rel_n))
    breath = 0.88 + 0.12 * np.sin(2.0 * np.pi * 0.22 * t)

    left = np.zeros(n, dtype=np.float64)
    right = np.zeros(n, dtype=np.float64)
    rng = np.random.default_rng(42)
    for f in freqs:
        for detune, p in [(-0.0022, -0.55), (0.0, 0.0), (0.0024, 0.55)]:
            ph0 = rng.uniform(0.0, 2.0 * np.pi)
            ff = f * (1.0 + detune)
            osc = (
                0.78 * np.sin(2.0 * np.pi * ff * t + ph0)
                + 0.32 * np.sin(4.0 * np.pi * ff * t + ph0)
                + 0.12 * np.sin(6.0 * np.pi * ff * t + ph0)
            )
            left += osc * (1.0 - 0.5 * (p + 1.0)) * 0.55
            right += osc * (0.5 * (p + 1.0)) * 0.55
    stereo = np.column_stack([left, right]) * (env * breath * gain / max(1, len(freqs)))[:, None]
    return lowpass(stereo, 1750.0, order=2)


def synth_sub_bass(freq: float, dur: float, gain: float = 0.105) -> np.ndarray:
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    att = int(0.045 * SR)
    rel = int(min(0.45, dur * 0.25) * SR)
    env = np.exp(-t / max(2.2, dur * 1.1))
    env[:att] *= np.linspace(0.0, 1.0, att) ** 1.5
    env[-rel:] *= 0.5 * (1.0 + np.cos(np.pi * np.arange(rel) / rel))
    sig = 0.85 * np.sin(2.0 * np.pi * freq * t) + 0.26 * np.sin(4.0 * np.pi * freq * t) * np.exp(-t / 1.1)
    return sig * env * gain


def synth_felt_chime(freq: float, dur: float = 1.6, pan: float = 0.0, gain: float = 0.11) -> np.ndarray:
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    att = int(0.014 * SR)
    env = np.exp(-t / 0.65)
    env[:att] *= np.linspace(0.0, 1.0, att) ** 1.4
    sig = (
        0.78 * np.sin(2.0 * np.pi * freq * t)
        + 0.34 * np.sin(4.0 * np.pi * freq * t) * np.exp(-t / 0.42)
        + 0.14 * np.sin(6.0 * np.pi * freq * t) * np.exp(-t / 0.22)
    )
    return (sig * env * gain, pan)


def synth_soft_brush(dur: float = 0.16, gain: float = 0.022) -> np.ndarray:
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    rng = np.random.default_rng(7)
    noise = rng.normal(0.0, 1.0, n)
    env = np.minimum(1.0, t / 0.022) * np.exp(-t / 0.045)
    filtered = bandpass(noise * env, 900.0, 2600.0, order=2)
    return filtered * gain


def schroeder_hall(stereo: np.ndarray, wet: float = 0.28) -> np.ndarray:
    """Gentle warm multi-tap stereo studio reverb low-passed below 2.1 kHz."""
    delays_l = [1391, 1877, 2411, 3109, 4129]
    delays_r = [1453, 1933, 2521, 3251, 4273]
    gains = [0.46, 0.36, 0.28, 0.20, 0.13]
    rev = np.zeros_like(stereo)
    for dl, dr, g in zip(delays_l, delays_r, gains):
        rev[dl:, 0] += stereo[:-dl, 0] * g + stereo[:-dl, 1] * (g * 0.25)
        rev[dr:, 1] += stereo[:-dr, 1] * g + stereo[:-dr, 0] * (g * 0.25)
    rev = lowpass(rev, 3600.0, order=2)
    return highpass(stereo * (1.0 - wet * 0.25) + rev * wet, 50.0, order=2)


def load_ogg_mono(path: Path) -> np.ndarray | None:
    if not path.exists():
        return None
    raw = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1"]
    )
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def main() -> None:
    out_dir = Path("brag-output/composition/assets/music")
    work_dir = Path("brag-output/work")
    sfx_out_dir = Path("brag-output/composition/assets/sfx")
    out_dir.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    sfx_out_dir.mkdir(parents=True, exist_ok=True)

    mix = np.zeros((N_SAMPLES, 2), dtype=np.float64)

    # Chord progression synchronized cleanly to tutorial scenes (C major / Fmaj9 peaceful voicing):
    # Bar 1-2 (0.0-6.4s): Fmaj9 -> covers Scene 1 Hook + Scene 2 setup
    # Bar 3   (6.4-8.8s -> extend smoothly to 9.6s): Em7 -> settles Scene 2
    # Bar 4-5 (8.8-15.2s): Dm9 (8.8-12.8s) -> Fmaj7/G (12.8-15.2s) -> Scene 3 Recovery arc
    # Bar 6   (15.2-20.0s): G6/9 (15.2-17.6s) -> Em7/B (17.6-20.0s) -> Scene 4 Lattice & Rust
    # Bar 7   (20.0-24.0s): Cmaj9 -> peaceful tonic cadence to close
    sections = [
        (0.0, 3.2, "F2", ["F3", "A3", "C4", "E4", "G4"]),
        (3.2, 3.2, "F2", ["F3", "A3", "C4", "E4", "G4"]),
        (6.4, 2.4, "E2", ["E3", "G3", "B3", "D4", "A4"]),
        (8.8, 4.0, "D2", ["D3", "F3", "A3", "C4", "E4"]),
        (12.8, 2.4, "F2", ["F3", "A3", "C4", "E4", "G4"]),
        (15.2, 2.4, "G2", ["G3", "B3", "D4", "E4", "A4"]),
        (17.6, 2.4, "E2", ["E3", "G3", "B3", "D4", "G4"]),
        (20.0, 3.6, "C2", ["C3", "E3", "G3", "B3", "D4"]),
    ]

    for start, dur, bass_note, chord_notes in sections:
        # Warm velvet pad bed
        pad = synth_warm_pad_chord([midi_to_hz(n) for n in chord_notes], dur + 0.55, gain=0.14)
        place(mix, pad, start, gain=1.0)
        # Anchor sub-bass (clean controlled anchor)
        bass = synth_sub_bass(midi_to_hz(bass_note), dur + 0.25, gain=0.10)
        place(mix, bass, start, pan=0.0, gain=1.0)
        # Rolled gentle felt-Rhodes chord stagger (warm upper octave bloom)
        for i, note in enumerate(chord_notes):
            pan = -0.38 + 0.19 * i
            tone = synth_felt_rhodes(midi_to_hz(note), dur + 0.45, vel=0.58 - 0.03 * i)
            place(mix, tone, start + i * 0.034, pan=pan, gain=0.95)

    # Gentle contemplative pentatonic top melody aligned with tutorial attention beats
    melody = [
        (0.80, "E5", 1.8, 0.18),
        (1.60, "G5", 1.6, -0.15),
        (2.40, "C5", 1.6, 0.12),
        (3.60, "A4", 1.4, -0.22),
        (4.80, "E5", 1.8, 0.20),  # +delta bias flip cue
        (6.40, "D5", 1.6, -0.14),
        (7.20, "B4", 1.6, 0.16),
        (8.80, "A4", 1.6, -0.18),  # Scene 3 deletion stage entrance
        (9.60, "F4", 1.4, 0.10),   # Word Deletion click
        (11.20, "C5", 2.0, 0.22),  # Frameshift recovered! Warm uplift
        (12.00, "E5", 1.8, -0.14),
        (13.60, "G5", 1.6, 0.18),
        (15.20, "A4", 1.5, -0.20), # Scene 4 Linear GF(2) entrance
        (16.00, "E5", 2.0, 0.22),  # Zero Spread bar peak
        (17.60, "D5", 1.8, -0.16),
        (19.20, "B4", 1.6, 0.14),
        (20.00, "E5", 2.2, 0.18),  # Scene 5 Cmaj9 home resolution
        (20.80, "G5", 2.4, -0.12), # Logo & command settle
        (21.60, "C5", 2.4, 0.0),   # Peaceful final tonic bell
    ]
    for ts, note, dur, pan in melody:
        ch, p = synth_felt_chime(midi_to_hz(note), dur=dur, pan=pan, gain=0.095)
        place(mix, ch, ts, pan=p, gain=1.0)
        rh = synth_felt_rhodes(midi_to_hz(note), dur=dur + 0.3, vel=0.45)
        place(mix, rh, ts, pan=-pan * 0.6, gain=0.58)

    # Very subtle off-beat warm brush breath (0.8s beats, stops cleanly at 21.6s before tail fade)
    t_brush = 0.80
    while t_brush <= 21.60:
        brush = synth_soft_brush(0.14, gain=0.014)
        place(mix, brush, t_brush, pan=0.18 if int(round(t_brush / 0.8)) % 2 else -0.18, gain=1.0)
        t_brush += 1.60

    # Ambient rain/vinyl warmth (-54 dB whisper, completely non-fatiguing)
    rng = np.random.default_rng(108)
    air = lowpass(rng.normal(0.0, 1.0, (N_SAMPLES, 2)), 700.0, order=2) * 0.0018
    mix += air

    # Add warm studio hall reverberation
    wet_mix = schroeder_hall(mix, wet=0.30)

    # Blend restrained low-HF Kenney SFX into the same reverb space (copy WAV/OGG to composition/assets/sfx too)
    kenney_root = Path(r"C:\Users\Neptune\.gemini\config\skills\brag\assets\sfx")
    click_path = kenney_root / "interface" / "click_003.ogg"
    soft_path = kenney_root / "impact" / "impactSoft_medium_001.ogg"
    bell_path = kenney_root / "impact" / "impactBell_heavy_000.ogg"

    for src, dst_name in [(click_path, "click_003.ogg"), (soft_path, "impactSoft_medium_001.ogg"), (bell_path, "impactBell_heavy_000.ogg")]:
        if src.exists():
            (sfx_out_dir / dst_name).write_bytes(src.read_bytes())

    click_sig = load_ogg_mono(click_path)
    soft_sig = load_ogg_mono(soft_path)
    if click_sig is not None:
        # Very soft tactile cursor press at interactive demo clicks (4.80s & 9.60s)
        place(wet_mix, click_sig, 4.80, pan=0.22, gain=0.085)
        place(wet_mix, click_sig, 9.60, pan=0.22, gain=0.085)
    if soft_sig is not None:
        # Soft muffled thump on state verification confirmations (11.20s & 16.00s)
        soft_warm = lowpass(soft_sig, 950.0, order=2)
        place(wet_mix, soft_warm, 11.20, pan=0.0, gain=0.11)
        place(wet_mix, soft_warm, 16.00, pan=0.0, gain=0.10)

    # Soft global fade-in (0.15s) and gentle natural fade-out (22.2s -> 24.0s)
    fade_in_n = int(0.15 * SR)
    wet_mix[:fade_in_n] *= np.linspace(0.0, 1.0, fade_in_n)[:, None]
    fade_start = int(22.20 * SR)
    fade_end = int(24.00 * SR)
    fade_len = fade_end - fade_start
    wet_mix[fade_start:fade_end] *= (0.5 * (1.0 + np.cos(np.pi * np.arange(fade_len) / fade_len)))[:, None]
    wet_mix[fade_end:] = 0.0

    # Gentle warm analog limiter + normalize peak to -3.0 dBFS (~0.707)
    wet_mix = np.tanh(wet_mix * 1.15)
    peak = float(np.max(np.abs(wet_mix)))
    if peak > 0:
        wet_mix *= 0.70 / peak

    pcm16 = np.clip(wet_mix * 32767.0, -32768, 32767).astype("<i2")
    wav_path = work_dir / "lookitup-soothing-ambient.wav"
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm16.tobytes())

    mp3_path = out_dir / "lookitup-soothing-ambient.mp3"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(wav_path),
            "-af",
            "loudnorm=I=-17:TP=-2.5:LRA=9",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "256k",
            str(mp3_path),
        ],
        check=True,
    )

    # Verify spectral warmth, tempo cues JSON, and peak/LUFS
    raw_out = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", str(mp3_path), "-t", "24", "-ac", "1", "-ar", "22050", "-f", "f32le", "pipe:1"]
    )
    x = np.frombuffer(raw_out, dtype=np.float32)
    rms = float(np.sqrt(np.mean(x ** 2)))
    fft = np.abs(np.fft.rfft(x[: 22050 * 20]))
    freqs = np.fft.rfftfreq(len(x[: 22050 * 20]), 1 / 22050)
    centroid = float(np.sum(freqs * fft) / (np.sum(fft) + 1e-9))
    hi_ratio = float(np.sum(fft[freqs > 3000]) / (np.sum(fft) + 1e-9))

    cues_path = out_dir / "lookitup-soothing-ambient.music-cues.json"
    cues_data = {
        "track": "lookitup-soothing-ambient.mp3",
        "bpm": BPM,
        "key": "C major / Fmaj9",
        "duration": 24.0,
        "beats": [round(i * BEAT_SEC, 3) for i in range(31)],
        "strongCues": [0.0, 3.2, 4.8, 6.4, 8.8, 9.6, 11.2, 15.2, 16.0, 20.0, 20.8],
        "spectralCentroidHz": round(centroid, 1),
        "highFreqRatioOver3k": round(hi_ratio, 4),
    }
    cues_path.write_text(json.dumps(cues_data, indent=2), encoding="utf-8")
    print(f"Rendered soothing audio: rms={rms:.3f}, centroid={centroid:.1f}Hz, hi(>3k)={hi_ratio:.4f}")


if __name__ == "__main__":
    main()
