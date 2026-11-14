# Engineering Roadmap

Five build phases took this project from the paper equations in arXiv:2611.16890 to a compiled Rust, WebAssembly, and Python workspace. A sixth pass added the Dev.to walkthrough, live browser screenshots, and layout fixes.

| Phase | Scope Delivered | Status |
| --- | --- | --- |
| Phase 1 | Linear and RNG codebooks, shortened GF(2^m) BCH over Table V, Hamming and Levenshtein distance with edit alignment, Algorithm 2 and 3 embedder/extractor, Appendix F stepwise tokenization invariance checks, N-gram and optional HuggingFace backends, CLI, and unit tests. | Merged in PR #1 |
| Phase 2 | Zero-dependency `llmw-core` Rust crate (SHA-256, SplitMix64, 256-bit Myers bit-parallel Levenshtein, GF(2^m) BCH), multi-threaded `llmw-native` C-ABI (`55.94x` speedup on Levenshtein search) plus `llmw-bench`, `llmw-wasm` (`64,001`-byte release binary in `web/public/llmw_wasm.wasm`), Appendix B attack suite, and Appendix G quality and AUROC benchmarks. | Merged in PR #2 |
| Phase 3 | Interactive browser client built with Vite, React, TypeScript, and Tailwind v4 calling `llmw_wasm.wasm` directly client-side, backed by an optional local FastAPI bridge in `src/llmw_codebook/api.py` for real HuggingFace models. | Merged in PR #3 |
| Phase 4 | Token-level `V0`/`V1` logit-bias stepper (`TokenLogitInspector`), dual-decoder frameshift vs. edit-alignment diff (`AlignmentFrameshiftPanel`), Linear vs. RNG Hamming distance spectrum charts (`DistanceSpectrumChart`), and interactive BCH bounds and Berlekamp-Massey sandbox (`BchAnalyzerPanel`). | Merged in PR #4 |
| Phase 5 | GitHub Actions CI across Cargo, pytest, and Vitest (`.github/workflows/ci.yml`), automated GitHub Pages deployment (`.github/workflows/pages.yml`), updated `README.md`, and portfolio showcase material in `docs/PORTFOLIO_SHOWCASE.md`. | Merged in PR #5 |
| Dev.to Kit | Interactive Dev.to article (`docs/devto_article.md`), 1000x420 banner and five Studio screenshots (`docs/assets/devto/`), flex overflow fix in `web/src/App.tsx`, and SVG label offset fix in `web/src/components/BchAnalyzerPanel.tsx`. | Open in PR #6 |
