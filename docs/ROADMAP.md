# Engineering Roadmap

This repository is built cleanly in five milestone phases, each reviewed via Pull Request.

| Phase | Scope | Status |
| --- | --- | --- |
| **Phase 1** | **Core Cryptographic Watermarking Engine** — Linear & RNG codebooks, BCH over $GF(2^m)$ with code shortening, Hamming & Levenshtein distance + alignment, Algorithm 2 & 3 embedder/extractor, Appendix F stepwise tokenization-inconsistency correction, built-in zero-cost N-gram & optional HuggingFace backends, CLI, and unit tests. | **In Progress** |
| **Phase 2** | **Attack Suite, Quality Metrics & Reproducible Benchmarks** — Appendix B adversarial attacks (word deletion, insertion, synonym swap, region paraphrase), Appendix G quality evaluation (Distinct-1/2, trigram repetition, perplexity, AUROC @ 1% FPR), and automated benchmark runner. | Planned |
| **Phase 3** | **Interactive Web Studio Core & Zero-Cost Client-Side Engine** — TypeScript/WebCrypto port of the codebook & extraction algorithms (bit-exact with Python), FastAPI local bridge for optional live LLM inference, and Vite + React Studio scaffold. | Planned |
| **Phase 4** | **Visualizers, Attack Playground & Codebook Geometry Explorer** — Token-level $V_0/V_1$ logit-bias inspector, live edit-alignment diff showing Hamming frameshift vs. Levenshtein recovery, Linear vs. RNG spread curves, and BCH shortening analyzer. | Planned |
| **Phase 5** | **CI/CD, Live GitHub Pages Deployment & Portfolio Showcase Kit** — GitHub Actions CI (Python + TypeScript tests), automated static Studio deploy to GitHub Pages, polished README with architecture diagrams & empirical charts, and LinkedIn showcase pack. | Planned |
