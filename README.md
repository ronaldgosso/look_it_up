# Look It Up: Multi-bit LLM Watermarking via Codebook Search

> Faithful open-source implementation, benchmark suite, and interactive zero-cost studio for **"Look It Up: Multi-bit LLM Watermarking via Codebook Search"** ([arXiv:2611.16890](https://arxiv.org/abs/2611.16890)) by Jarosław Janas, Paweł Morawiecki, and Josef Pieprzyk.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Phase 1: Core Engine](https://img.shields.io/badge/Phase%201-Core%20Engine-emerald.svg)](docs/ROADMAP.md)

## Overview

Existing multi-bit LLM watermarks force an uncomfortable trade-off on short texts (127–200 tokens): exhaustive search approaches achieve high accuracy but take hours to decode, whereas fast position-allocation schemes fail frequently as payload size grows. **Codebook watermarking** bridges both worlds by mapping an $n$-bit payload $W$ to a well-separated $u$-bit codeword $L_W$ via a secret affine linear code over $\mathrm{GF}(2)$, embedding it with token-level logit biasing ($+\delta$), and recovering it via fast nearest-neighbor lookup in Hamming or Levenshtein space (plus an algebraic BCH variant for larger payload spaces).

### Current Milestone: Phase 1 — Core Cryptographic Watermarking Engine

- **Affine Linear & RNG Codebooks (`src/llmw_codebook/codebook.py`):**
  - Exact Appendix C construction: $L_W = \mathrm{bits}(W) \cdot G \bmod 2 \oplus r$ seeded via $\mathrm{SHA\text{-}256}(K \parallel \text{"linear-G"})[:64]$ and $\mathrm{SHA\text{-}256}(K \parallel \text{"linear-r"})[:64]$.
  - Collision bound $\Pr[\text{collision}] \le 2^{2n-u-1}$ (Eq. 1), Gilbert–Varshamov bound solver, and Appendix E nearest-neighbor spread analyzer proving zero Hamming spread for linear codes vs. positive spread for independent RNG codewords.
- **Exact Bit-Parallel Distances & Alignment (`src/llmw_codebook/distances.py`):**
  - Vectorized Hamming search, Myers' bit-parallel Levenshtein distance, exact weight-difference branch-and-bound codebook search, and full edit-alignment backtracing.
- **Algebraic BCH Variant with Code Shortening (`src/llmw_codebook/bch.py`):**
  - Native $\mathrm{GF}(2^m)$ narrow-sense primitive binary BCH encoder + Berlekamp–Massey & Chien search decoder matching Table V / Appendix D configurations (e.g., $\mathrm{BCH}(127, 29, t=21)$ and 55-bit shortened $\mathrm{BCH}(255, 79, t=27)$ at $u=200$).
- **Token-Level Embedder & Extractor (`src/llmw_codebook/watermark.py`):**
  - Implements Algorithm 2 (logit biasing $+\delta$ over balanced $V_0 / V_1$ partitions) and Algorithm 3 (bit recovery & thresholded verification $d_{\min} \le \eta$), including **Appendix F stepwise tokenization-inconsistency (TI) correction** with zero extra LM forward passes.
- **Zero-Cost Language Model Backends (`src/llmw_codebook/models.py`):**
  - Offline `BuiltinNGramModel` with `base` and `instruct` entropy profiles plus greedy BPE-style tokenization (runs anywhere at $0 cost), alongside an optional `HuggingFaceBackend` for local open-weights models.

See [docs/ROADMAP.md](docs/ROADMAP.md) for Phases 2–5 (Attack Suite & Benchmarks, TypeScript/WebCrypto Port, Interactive Attack & Geometry Studio UI, and GitHub Pages Portfolio Deployment).

## Quickstart

```bash
# Editable install with dev tools (uses only NumPy + pytest for core engine)
pip install -e ".[dev]"

# Run the full test suite
pytest -v

# Inspect theoretical bounds, Hamming spread, and BCH parameters
python -m llmw_codebook.cli info -n 12 -u 127

# Run an end-to-end text watermark embedding & extraction roundtrip
python -m llmw_codebook.cli roundtrip -n 12 -u 127 --watermark 2749 --method levenshtein
```

## Project Structure

```text
├── docs/ROADMAP.md          # 5-phase engineering & portfolio plan
├── papers/README.md         # Reference paper metadata & download instructions
├── pyproject.toml           # Package configuration & optional extras
├── src/llmw_codebook/
│   ├── _prng.py             # SHA-256 seed derivation, SplitMix64, balanced V0/V1 split
│   ├── bch.py               # GF(2^m) BCH encoder, Berlekamp-Massey + Chien decoder
│   ├── cli.py               # CLI entry points (`info`, `roundtrip`)
│   ├── codebook.py          # Linear/RNG codebooks, GV & collision bounds, spread analyzer
│   ├── distances.py         # Vectorized Hamming, Myers Levenshtein, edit alignment
│   ├── models.py            # Offline BuiltinNGramModel & optional HuggingFaceBackend
│   └── watermark.py         # Algorithm 2 & 3 embedder/extractor + Appendix F TI check
└── tests/                   # Comprehensive unit & end-to-end verification tests
```
