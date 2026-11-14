# Look It Up: Multi-bit LLM Watermarking via Codebook Search

> Faithful **Rust + WebAssembly + Python** implementation, adversarial benchmark suite, and zero-cost interactive Web Studio for **"Look It Up: Multi-bit LLM Watermarking via Codebook Search"** ([arXiv:2611.16890](https://arxiv.org/abs/2611.16890)) by Jarosław Janas, Paweł Morawiecki, and Josef Pieprzyk.

[![CI](https://github.com/ronaldgosso/look_it_up/actions/workflows/ci.yml/badge.svg)](https://github.com/ronaldgosso/look_it_up/actions/workflows/ci.yml)
[![Deploy Studio](https://github.com/ronaldgosso/look_it_up/actions/workflows/pages.yml/badge.svg)](https://github.com/ronaldgosso/look_it_up/actions/workflows/pages.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Zero-Cost WASM Studio](https://img.shields.io/badge/Live%20Studio-GitHub%20Pages%20WASM-22c55e.svg)](https://ronaldgosso.github.io/look_it_up/)

---

## Overview

Existing multi-bit LLM watermarks force an uncomfortable trade-off on short texts (127–200 tokens): exhaustive search approaches achieve high accuracy but stall in pure-Python loops, whereas fast position-allocation schemes break on single-word deletions (positional frameshift). **Codebook watermarking** bridges both worlds by mapping an $n$-bit payload $W$ to a well-separated $u$-bit codeword $L_W$ via a secret affine linear code over $\mathrm{GF}(2)$, embedding it with token-level logit biasing ($+\delta$), and recovering it via fast nearest-neighbor lookup in Hamming or Levenshtein space — plus shortened algebraic $\mathrm{GF}(2^m)$ BCH decoding for large payload capacities.

---

## System Architecture

```mermaid
flowchart LR
  Core["crates/llmw-core (Zero-Dep Rust)<br/>SHA-256 · SplitMix64 · Myers 256-bit<br/>PackedCodebook · GF(2^m) BCH"]
  Native["crates/llmw-native<br/>C-ABI FFI + std::thread::scope<br/>llmw-bench CLI"]
  Wasm["crates/llmw-wasm<br/>wasm32-unknown-unknown (64 KB)"]
  Py["src/llmw_codebook (Python)<br/>Appendix B Attacks · Appendix F TI<br/>AUROC · Quality · FastAPI Bridge"]
  Web["web/ (React + Vite + Tailwind)<br/>Playground · Logit Stepper<br/>Frameshift Diff · Geometry Explorer"]

  Core --> Native --> Py
  Core --> Wasm --> Web
  Py -. "Optional Local :8000 API" .-> Web
```

- **`crates/llmw-core`**: Pure Rust SHA-256 + SplitMix64 balanced $V_0/V_1$ splitter, hardware `popcnt` Hamming & **256-bit Myers bit-parallel Levenshtein** (`u128` fast path for $u \le 128$, `[u64; 4]` for $u \le 256$), bit-packed `PackedCodebook` with spread geometry metrics, and narrow-sense $\mathrm{GF}(2^m)$ BCH over Table V parameters.
- **`crates/llmw-native`**: Multi-threaded shared library automatically loaded via `ctypes` (`src/llmw_codebook/_rust_accel.py`) + standalone `llmw-bench` CLI binary.
- **`crates/llmw-wasm`**: Zero-dependency `wasm32-unknown-unknown` binary (`64,001` bytes) executing cryptography, codebook lookup, BCH decoding, and distance spectra directly in the browser ($0 server cost).
- **`web/`**: Interactive OLED Dark Studio featuring:
  1. **Playground**: Token-level $V_0/V_1$ logit-bias race stepper (`TokenLogitInspector`), Appendix B attack simulator (`5%–30%` budget slider), and dual-decoder Hamming frameshift vs. Levenshtein edit-alignment diff (`AlignmentFrameshiftPanel`).
  2. **Benchmarks**: Reproducible Rust vs. Python speedups, Appendix B attack recovery matrix, Detection AUROC & TPR@1%FPR, entropy regimes, and Appendix G lexical diversity.
  3. **Codebook Inspector**: Overlaid SVG Linear vs. RNG Hamming distance histograms with zero-spread invariance cards (`DistanceSpectrumChart`) and shortened BCH capacity curves + Berlekamp–Massey bit-flip/frameshift sandbox (`BchAnalyzerPanel`).

---

## Measured Empirical Highlights

From [benchmarks/SUMMARY.md](benchmarks/SUMMARY.md) (`n=12, u=127, delta=6.0, budget=10%, samples=16`) and native `llmw-bench` on an 8-thread CPU:

| Benchmark | Result |
| --- | --- |
| **Myers Levenshtein (`n=15`, 32,768 codewords, `u=127`)** | **756.14 ms (Python) $\to$ 13.52 ms (Rust)** (**55.94x speedup**) |
| **Hamming Search (`n=15`, 32,768 codewords, `u=127`)** | **9.35 ms (Python) $\to$ 2.37 ms (Rust)** (**3.94x speedup**) |
| **1,048,576-Codeword Search (`n=20, u=127` in `llmw-bench`)** | **2.55 ms** Hamming · **358.85 ms** Levenshtein · **0.027 ms** BCH |
| **Appendix B 10% Deletion Recovery** | **100.0% (Levenshtein)** vs. **0.0% (Hamming & BCH frameshift)** |
| **Appendix B Synonym / Paraphrase / Insertion (Levenshtein)** | **100.0% (Synonym)** · **100.0% (Paraphrase)** · **56.2% (Insertion)** |
| **Zero-Bit Detection AUROC** | **1.0000** (100.0% TPR at $\le 1\%$ FPR) |

---

## Quickstart

```bash
# 1. Build & test Rust core, multi-threaded native FFI, and 1M-codeword benchmark
cargo test --workspace
cargo build --release -p llmw-native
./target/release/llmw-bench

# 2. Build release WebAssembly target
cargo build --target wasm32-unknown-unknown --release -p llmw-wasm

# 3. Install Python package & run full Python + Rust parity + FastAPI test suite
pip install -e ".[dev,api]"
pytest -v

# 4. Run full attack, quality & speed benchmark suite
python scripts/run_benchmarks.py -n 12 -u 127 --samples-per-prompt 2

# 5. Export static assets & run Interactive WASM Web Studio locally
python scripts/export_web_assets.py
cd web && npm install && npm run test && npm run build && npm run dev

# 6. (Optional) Start the Local Python + Multi-Threaded Rust API bridge
uvicorn llmw_codebook.api:app --port 8000 --reload
```

---

## Project Structure

```text
├── .github/workflows/
│   ├── ci.yml                     # Rust, Python + Rust FFI, and Web CI pipeline
│   └── pages.yml                  # Automated static WASM Studio deploy to GitHub Pages
├── Cargo.toml                     # Rust workspace (llmw-core, llmw-native, llmw-wasm)
├── crates/
│   ├── llmw-core/                 # Pure Rust SHA-256, SplitMix64, Myers Levenshtein, PackedCodebook, BCH
│   ├── llmw-native/               # Multi-threaded C-ABI cdylib + `llmw-bench` CLI
│   └── llmw-wasm/                 # Zero-dep WebAssembly target (`wasm32-unknown-unknown`)
├── web/                           # Vite + React + TypeScript + Tailwind v4 WASM Interactive Studio
├── benchmarks/                    # Reproducible JSON results & Markdown summary
├── docs/
│   ├── ROADMAP.md                 # Completed 5-phase engineering roadmap
│   └── PORTFOLIO_SHOWCASE.md      # Resume bullets, LinkedIn posts, demo script & interview Q&A
├── papers/README.md               # Reference paper metadata & download instructions
├── scripts/                       # Benchmark runner & web asset exporter
├── src/llmw_codebook/             # Python package + FastAPI bridge + Rust ctypes accelerator
└── tests/                         # Python unit, parity & FastAPI tests + Rust & Vitest suites
```

---

## Roadmap & Portfolio Kit

- Full milestone history: [docs/ROADMAP.md](docs/ROADMAP.md) (Phases 1–5 completed)
- Recruiter bullets, GitHub Pages activation guide & LinkedIn posts: [docs/PORTFOLIO_SHOWCASE.md](docs/PORTFOLIO_SHOWCASE.md)
- Reference paper license: GNU GPLv3 ([LICENSE](LICENSE))
