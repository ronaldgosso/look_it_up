# Composition Brief: Look It Up Tutorial Video

## Project Settings
- **Title:** Look It Up — Multi-bit LLM Watermarking Tutorial
- **Format:** Landscape `1920x1080`, `30fps`, `24.0s` duration (`720` frames)
- **Tone:** `polished` (calm editorial tutorial pacing, clean spatial cards, warm contrast between `#0b1120` dark studio UI and pure `#ffffff` hand-drawn Xiaohei paper panels)
- **Entry HTML:** `brag-output/composition/index.html`

## Palette & Typography
- `--bg-canvas`: `#0b1120`
- `--bg-surface`: `#131b2e`
- `--bg-inset`: `#090e1a`
- `--border`: `#253149`
- `--ink`: `#f8fafc`
- `--ink-secondary`: `#cbd5e1`
- `--ink-muted`: `#94a3b8`
- `--accent`: `#22c55e` (Emerald V1 / Recovery)
- `--danger`: `#ef4444` (Frameshift / Desync)
- `--sky`: `#38bdf8` (RNG / Reference)
- `--amber`: `#f59e0b` (Gilbert-Varshamov / Substitution)
- Fonts: `Fira Sans` (UI display/body) & `Fira Code` (tokens, metrics, CLI), bundled via `@fontsource` / Google Fonts stylesheet link with verified load check.

## Assets Referenced Relative to Composition
- Music: `assets/music/lookitup-soothing-ambient.mp3` (75 BPM Cmaj9/Fmaj9 warm felt-piano + pad studio composition, `0.0s–24.0s`, `data-volume="0.88"`, `data-fade-out="1.6"`)
- SFX (Kenney low-HF subtle accents merged in audio track or `<audio>` clips):
  - `assets/sfx/click_003.ogg` (at `4.80s` and `9.60s` simulated clicks)
  - `assets/sfx/impactSoft_medium_001.ogg` (subtle damped cue at `11.20s` and `16.00s` state confirmations)
- Xiaohei Illustrations (copied after QA verification from `assets/look-it-up-tutorial-illustrations/`):
  - `assets/illustrations/01-logit-bias.png`
  - `assets/illustrations/02-frameshift-recovery.png`
  - `assets/illustrations/03-linear-gf2-lattice.png`

## GSAP Timeline Synchronization (Exact 75 BPM Grid, `0.800s` beats)
- `0.00s`: Scene 1 aperture SVG bloom + headline stagger
- `0.80s`: Hook subtitle + badge settle
- `3.05s – 3.35s`: Dip crossfade from Scene 1 to Scene 2
- `3.20s`: Scene 2 header + matte `01-logit-bias.png` card + Studio Logit Inspector slide-up
- `4.80s`: Animated cursor click `Next Flip` -> `V1` bar smooth grow & `BIAS FLIPPED` badge
- `8.60s – 9.00s`: Staggered dip transition from Scene 2 to Scene 3
- `8.80s`: Scene 3 header + `02-frameshift-recovery.png` card + Dual-Decoder panel entrance
- `9.60s`: Animated cursor click `Word Deletion 10%`
- `10.40s`: Hamming card pulses red `0.0% · Desynced`
- `11.20s`: Levenshtein card snaps emerald `100.0% · ID 1337` + `FRAMESHIFT RECOVERED` banner + gap alignment strip
- `15.00s – 15.40s`: Staggered transition from Scene 3 to Scene 4
- `15.20s`: Scene 4 header + `03-linear-gf2-lattice.png` card + DistanceSpectrumChart SVG bars animate upward
- `16.00s`: `ZERO SPREAD [43..43]` callout & `55.94x Rust Parallel` stat cards settle
- `19.80s – 20.20s`: Staggered crossfade from Scene 4 to Scene 5
- `20.00s`: Scene 5 Live Quickstart Terminal card (`cargo build --release -p llmw-native`, `cd web && npm run dev`, `llmw_wasm.wasm · 64,001 B`) + Codex Aperture closure emblem + `Look It Up · arXiv:2611.16890 · GPL-3.0 License`
- `23.40s – 24.00s`: Gentle fade down to end hold / silence
