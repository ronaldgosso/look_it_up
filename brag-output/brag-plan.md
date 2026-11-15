# Brag Plan: Look It Up — Tutorial Video

## Summary
- **Product:** Look It Up (`arXiv:2611.16890`) — Multi-bit LLM watermarking engine written in Rust (`55.94x` speedup, `64 KB` browser WASM) paired with an interactive dark Studio web lab.
- **Format & Tone:** `landscape` (`1920x1080`, `30fps`), **`polished` tutorial cadence** (`5` clean scenes, `24.0s` total, generous settled reading holds, calm soft cross-dissolves dipped gently through the dark slate surface).
- **Creative Hook:** Show a stranger how invisible multi-bit watermarks survive edited text in 4 clear steps — pairing **ian-xiaohei-illustrations** hand-drawn ink metaphors with the live **Look It Up Studio** dark interface.
- **Visual Identity (from `web/src/index.css` & `HeaderBar.tsx`):**
  - Canvas dark slate `#0b1120`, Surface `#131b2e`, Inset `#090e1a`, Border `#253149`, Ink `#f8fafc`, Muted `#94a3b8`, Emerald `#22c55e`, Warning `#f59e0b`, Danger `#ef4444`, Sky `#38bdf8`.
  - Pure matte `#ffffff` rounded cards for the 4 hand-drawn Xiaohei concept sketches beside the live dark Studio components.
  - Fonts: `Fira Sans` (UI display/prose) + `Fira Code` (code, tokens, telemetry).
  - Logo: Inline SVG `Codex Aperture` emblem (`HeaderBar.tsx`).
- **Music & Sound Architecture:**
  - Original soothing ambient lo-fi / chamber-Rhodes tutorial score composed specifically for this timeline at **75 BPM** (`0.800s` per beat, `3.200s` per bar, key of **C major / Fmaj9**) in warm felt electric piano, bowed analog string pad, soft sub-bass, and subtle felt pulse — mastered cleanly around `-16.5 LUFS` with stereo hall reverb and zero harsh highs.
  - Paired with restrained low-HF Kenney SFX (`interface/click_003.ogg` and `impact/impactSoft_medium_001.ogg`) normalized well under the music (`0.14–0.20`) and placed on exact musical beats for cursor actions and state flips.
- **Security / Privacy Audit:** No API keys, tokens, emails, customer PII, or internal URLs anywhere; uses paper sample prompt presets (`"Language model watermarking embeds an undetectable"`, watermark ID `1337`, `n=12`, `u=127`, `delta=2.0`) verified in source.

## Beat-Synchronized Storyboard (24.0s @ 75 BPM)

1. **Scene 1 — Hook & Identity (`0.0s – 3.2s`, 3.2s)**
   - **Visual:** Deep obsidian `#0b1120` aperture glow. Codex Aperture icon draws open cleanly, followed by crisp editorial typography: `"Hide a verifiable ID inside AI text."` + `"Zero visible trace. Verified in milliseconds."`
   - **Motion:** Aperture petals unfold `0.0s–0.75s`; headline settles by `0.80s`; subline settles by `1.20s` (settled readable window `1.20s–3.10s` = `1.9s` for short hook).
   - **Beat Cue:** `0.00s` Fmaj9 chord bloom; `0.80s` gentle chime `E5`.

2. **Scene 2 — Step 01: Logit Partition & `+δ` Nudge (`3.2s – 8.8s`, 5.6s)**
   - **Step Header:** `STEP 01 · PARTITION & NUDGE +δ` — `"Bias green V1 tokens lightly while prose stays natural."`
   - **Left Stage:** Pure white matte card displaying Xiaohei Illustration `01-logit-bias.png` (Xiaohei slipping a tiny orange `+δ` shim under the `V1` balance pebble).
   - **Right Stage:** Recreated live `Look It Up Studio` **Token Logit Inspector** widget (`V1` vs `V0` candidate race).
   - **Simulated Interaction:** At `4.80s` (beat 7), animated pointer presses `Next Flip`, elevating `V1` bar past `V0` (`+2.0 -> BIAS FLIPPED`, emerald badge lights up). Settled readable hold `5.20s–8.60s` (`3.4s`).

3. **Scene 3 — Step 02: Delete Words -> Still Recovers (`8.8s – 15.2s`, 6.4s)**
   - **Step Header:** `STEP 02 · SURVIVE WORD DELETION` — `"Edit away 10% of words. Myers alignment snaps back."`
   - **Left Stage:** Pure white matte card displaying Xiaohei Illustration `02-frameshift-recovery.png` (top fixed ruler breaks on snipped tape; bottom Xiaohei bridges the gap with an orange elastic wire).
   - **Right Stage:** Recreated live `Look It Up Studio` **Dual-Decoder Comparison** panel (`AlignmentFrameshiftPanel.tsx`).
   - **Simulated Interaction:** At `9.60s` (Bar 4 downbeat), animated click triggers `Word Deletion 10%`; at `10.40s`, Hamming flips red (`0.0% · Desynced`); at `11.20s` (beat 15), Myers Levenshtein snaps emerald (`100.0% · ID 1337 · FRAMESHIFT RECOVERED`) alongside the `-` gap alignment column. Settled readable hold `11.40s–14.90s` (`3.5s`).

4. **Scene 4 — Step 03: Linear GF(2) Lattice & Rust Core (`15.2s – 20.0s`, 4.8s)**
   - **Step Header:** `STEP 03 · ALGEBRAIC CODEBOOK + 55.9x RUST` — `"Uniform Linear GF(2) spacing. Benchmarked in Rust."`
   - **Left Stage:** Pure white matte card displaying Xiaohei Illustration `03-linear-gf2-lattice.png` (Xiaohei slotting pebbles evenly with a notched spacing comb vs random clustering).
   - **Right Stage:** Recreated `DistanceSpectrumChart` SVG (`ZERO SPREAD [43..43]` emerald spike vs scattered RNG `[38..47]`) + verified benchmark cards (`55.94x Rust Parallel · 13.52 ms / 32K`, `BCH t = 27`). Reveal lands on `16.00s` Bar 6 downbeat; settled hold `16.40s–19.70s` (`3.3s`).

5. **Scene 5 — Step 04: Run Locally + Outro CTA (`20.0s – 24.0s`, 4.0s)**
   - **Visual:** Clean split/editorial closure over obsidian studio dark `#0b1120` with subtle emerald rim glow. Left card showcases a live **Local Studio & Quickstart Terminal** (`cargo build --release -p llmw-native`, `cd web && npm run dev`, `llmw_wasm.wasm · 64,001 B`, `Offline Zero-Cloud Mode` pill). Right side centers the crisp **Codex Aperture** brand emblem, `"Look It Up"`, `"Multi-bit LLM Watermarking Studio"`, `arXiv:2611.16890`, and `GPL-3.0 License`.
   - **Timing:** Lands gently on Bar 7 (`20.80s` Cmaj9 resolution), holds settled until `23.40s`, and fades out peacefully to silence at `24.00s`.

## Verified Project Metrics Used (Zero Invention)
- `n = 12, u = 127, delta = 2.0`, Target ID `1337` (`web/src/App.tsx`, `README.md`)
- `100.0%` Levenshtein match rate vs `0.0%` Hamming/BCH under 10% word deletion (`README.md`, `docs/devto_article.md`)
- `55.94x` Rust `std::thread::scope` parallel speedup across 32,768 codewords (`756.14 ms -> 13.52 ms`) (`README.md`, `web/src/engine/modelData.json`)
- `64,001 bytes` (`62.5 KB` / ~`64 KB`) compiled WASM browser verifier (`README.md`, `HeaderBar.tsx`)
- `Zero spread [43..43]` Linear GF(2) vs RNG `[38..47]`, Shortened BCH guaranteed `t = 27` (`README.md`, `DistanceSpectrumChart.tsx`)
