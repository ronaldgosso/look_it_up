# Engineering Roadmap

This repository is built cleanly in five milestone phases, each reviewed via Pull Request.

| Phase | Scope | Status |
| --- | --- | --- |
| **Phase 1** | **Core Cryptographic Watermarking Engine** — Linear & RNG codebooks, BCH over $\mathrm{GF}(2^m)$ with code shortening, Hamming & Levenshtein distance + alignment, Algorithm 2 & 3 embedder/extractor, Appendix F stepwise TI correction, zero-cost N-gram & optional HuggingFace backends, CLI, and unit tests. | **Completed (PR #1)** |
| **Phase 2** | **Rust + WASM Core Engine, Attack Suite & Reproducible Benchmarks** — Zero-dependency `llmw-core` Rust crate (SHA-256, SplitMix64, 256-bit Myers bit-parallel Levenshtein, GF($2^m$) BCH), multi-threaded `llmw-native` FFI (`55.9x` Levenshtein speedup) + `llmw-bench`, `llmw-wasm` (`58.9 KB` WebAssembly build), Appendix B attack suite, Appendix G quality & ROC/AUROC metrics. | **Completed (PR #2)** |
| **Phase 3** | **Interactive Web Studio Core & Zero-Cost WASM Runtime** — Vite + React + TypeScript Interactive Studio powered directly in-browser by `llmw_wasm.wasm` (zero server cost, deployable to GitHub Pages) plus optional FastAPI local bridge (`src/llmw_codebook/api.py`) for real HuggingFace LLMs. | **Completed (PR #3)** |
| **Phase 4** | **Visualizers, Attack Playground & Codebook Geometry Explorer** — Token-level $V_0/V_1$ logit-bias inspector (`TokenLogitInspector`), live two-track edit-alignment diff showing Hamming frameshift vs. Levenshtein recovery (`AlignmentFrameshiftPanel`), Linear vs. RNG distance spectrum & zero-spread curves (`DistanceSpectrumChart`), and BCH shortening & error-injection analyzer (`BchAnalyzerPanel`). | **Completed (PR #4)** |
| **Phase 5** | **CI/CD, Live GitHub Pages Deployment & Portfolio Showcase Kit** — GitHub Actions CI (Rust + Python + Web tests in `.github/workflows/ci.yml`), automated static Studio deploy to GitHub Pages (`.github/workflows/pages.yml`), polished architecture & benchmark `README.md`, and LinkedIn/interview showcase kit (`docs/PORTFOLIO_SHOWCASE.md`). | **Completed (PR #5)** |
