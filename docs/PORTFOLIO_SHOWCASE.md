# Portfolio & LinkedIn Showcase Kit

This guide packages the verified engineering outcomes, resume bullets, interview talking points, live demo script, and ready-to-publish LinkedIn posts for **Look It Up: Multi-bit LLM Watermarking via Codebook Search** ([arXiv:2611.16890](https://arxiv.org/abs/2611.16890)).

---

## 1. One-Time GitHub Pages Activation ($0 Static Hosting)

The deployment workflow in [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) compiles `llmw_wasm.wasm`, runs Vitest + TypeScript/Vite builds, and publishes `web/dist` automatically whenever `main` updates:

1. Merge PR #4 and PR #5 into `main`.
2. In the GitHub repository, open **Settings -> Pages**.
3. Under **Build and deployment -> Source**, select **GitHub Actions**.
4. Trigger **Deploy Web Studio to GitHub Pages** manually under the **Actions** tab (or push to `main`).
5. Your interactive Studio goes live at: `https://ronaldgosso.github.io/look_it_up/`.

---

## 2. Resume / CV Bullet Points

- **Built a zero-dependency Rust cryptography & coding-theory core (`llmw-core`)** implementing FIPS 180-4 SHA-256, SplitMix64, affine linear $\mathrm{GF}(2)$ / RNG codebooks, 256-bit Myers bit-parallel Levenshtein distance (`u128` + `[u64; 4]`), and shortened $\mathrm{GF}(2^m)$ BCH error correction; compiled to both multi-threaded C-ABI native (`ctypes`) and `64.0 KB` WebAssembly (`wasm32-unknown-unknown`).
- **Achieved a `55.94x` Levenshtein codebook search speedup** (`756.1 ms` Python $\to$ `13.5 ms` multi-threaded Rust across 32,768 codewords) and scaled native search to **1,048,576 codewords ($n=20$ bits)** in `2.55 ms` (Hamming), `358.85 ms` (Levenshtein), and `0.027 ms` (BCH).
- **Engineered an interactive React + TypeScript + WASM research studio** running 100% client-side with $0 hosting cost, featuring a token-level $V_0/V_1$ logit-bias stepper, live Appendix B attack simulator (`Word Deletion`, `Insertion`, `Synonym Swap`, `Paraphrase`), two-track edit-alignment frameshift visualizer, and SVG distance-spectrum & BCH capacity curves.

---

## 3. Ready-to-Post LinkedIn Showcase Copy

### Version A — Engineering Storytelling Post (Recommended)

> Most AI text watermarks force a painful tradeoff on short generations (~127 tokens):
> - Fast position-allocation watermarks shatter the moment someone deletes a single word (positional frameshift).
> - Exhaustive codebook search survives deletions via edit distance — but pure Python loops stall once payload capacity scales.
>
> I implemented **"Look It Up: Multi-bit LLM Watermarking via Codebook Search" (arXiv:2611.16890)** as an open-source **Rust + WebAssembly + Python** system — including a 100% client-side interactive lab that runs directly in your browser at **$0 server cost**.
>
> **How it works under the hood:**
> - **Pure Rust core (`llmw-core`)**: 256-bit bit-parallel Myers Levenshtein DP (`u128` fast path), `popcnt` Hamming search across bit-packed codebooks, and algebraic $\mathrm{GF}(2^m)$ shortened BCH decoding (Berlekamp–Massey + Chien search).
> - **Dual compile targets**: Compiles once to multi-threaded native FFI for Python (`55.94x` faster Levenshtein search vs. Python, scaling to 1,048,576 codewords in 359 ms) AND to a **64 KB `.wasm` module** running inside the browser.
> - **Why Levenshtein beats Hamming & BCH under deletion**: Under a 10% word-deletion attack, Hamming & BCH drop to **0.0%** recovery due to index frameshift — while Myers Levenshtein re-synchronizes gaps and maintains **100.0%** recovery in benchmark evaluations.
>
> **Inside the interactive Web Studio:**
> 1. Scrub token-by-token through $V_0 / V_1$ logit biasing ($+\delta$) and Appendix F Tokenization-Invariance checks.
> 2. Inject deletion/insertion/paraphrase attacks (5%–30% token budget) and compare Hamming frameshift failure vs. Levenshtein alignment live.
> 3. Explore Linear $\mathrm{GF}(2)$ **zero-spread invariance** vs. RNG codebooks and interactive BCH syndrome decoding.
>
> Repo: https://github.com/ronaldgosso/look_it_up  
> Live WASM Studio: https://ronaldgosso.github.io/look_it_up/  
> Paper: https://arxiv.org/abs/2611.16890
>
> #Rust #WebAssembly #AppliedCryptography #LLM #AISecurity #OpenSource #Python

### Version B — Short Portfolio Highlight Post

> Shipped my full-stack **Rust + WASM + Python** implementation & browser visualizer for **Codebook LLM Watermarking (arXiv:2611.16890)**!
>
> - Zero-dep Rust core $\to$ Multi-threaded Python FFI (**55.94x** speedup on Myers bit-parallel Levenshtein) & **64 KB WebAssembly**
> - Full **Appendix B** adversarial attack suite + **Appendix F** Tokenization-Invariance protection + **Table V** shortened $\mathrm{GF}(2^m)$ BCH codec
> - Runs 100% client-side on static GitHub Pages ($0 backend cost) with optional local FastAPI + HuggingFace LLM bridge
>
> Explore the code & live Studio: https://github.com/ronaldgosso/look_it_up  
> Demo: https://ronaldgosso.github.io/look_it_up/
>
> #SystemsEngineering #RustLang #WASM #MachineLearning #Portfolio

---

## 4. 45-Second Demo Video / GIF Script (For LinkedIn Upload)

1. **0:00–0:10 (Playground Embed):** Click **Embed & Generate** with default `n=12, u=127, Linear GF(2), Levenshtein`. Show the $V_1/V_0$ token ribbon turning green/red and step through **Logit-Bias Step Inspector** with `Next Flip`.
2. **0:10–0:25 (Frameshift Showdown):** Click **Word Deletion (10%)**. Highlight the side-by-side verdict: **Hamming fails with `WRONG (...)`** due to frameshift while **Levenshtein shows `FRAMESHIFT RECOVERED`** and trace the red `-` deletion gap in the Two-Track Edit Alignment ribbon.
3. **0:25–0:35 (Benchmarks Tab):** Switch to **Benchmarks** to show `55.94x` Rust speedup bars and the Appendix B attack matrix.
4. **0:35–0:45 (Codebook Inspector Tab):** Switch to **Codebook Inspector**, pan across the Linear **ZERO SPREAD** vs. RNG distance spectrum histogram, and click `Max Guarantee: Inject t Flips` in the BCH sandbox to show Berlekamp–Massey instant correction vs. `Inject 1 Deletion Frameshift`.

---

## 5. Engineering Interview Talking Points

1. **Why Myers Bit-Parallel Levenshtein in Rust?**
   Classical Wagner–Fischer DP is $O(u^2)$ per codeword. Bit-packing codewords into `[u64; 4]` / `u128` words reduces each row transition to constant bitwise additions/XORs, yielding exact Levenshtein distance (`55.94x` faster than Python in parallel `n=15` benchmarks) plus triangle-inequality weight pruning.
2. **Why Linear Affine $\mathrm{GF}(2)$ over Naive RNG Codebooks?**
   Linear affine codes ($W \cdot G \oplus r$) guarantee **zero nearest-neighbor spread** across codewords ($\min_{j \neq i} d_H(c_i, c_j) = d_{\min}$ identically for every ID $i$), eliminating weak outlier codewords common in unstructured random codebooks.
3. **Tokenization Invariance (Appendix F):**
   Decoding re-tokenizes generated UTF-8 text. If token `t` merges with `t-1` when decoded back to IDs, the verifier computes the wrong `prev_token` seed and loses synchronization. Retrying sub-optimal biased candidates when `encode(decode(tokens)) != tokens` preserves bit alignment across the channel.
4. **Shortened $\mathrm{GF}(2^m)$ BCH vs. Exhaustive Codebook Search:**
   Algebraic BCH decoding scales to huge payload spaces (e.g., $n=24$ or $32$ bits in `0.027 ms`) and guarantees fixing up to $t$ bit flips, whereas exhaustive Levenshtein handles token deletions/insertions at the cost of $O(2^n)$ lookup — both are exposed cleanly in the same unified interface.
5. **Dual-Target Architecture (`llmw-core`):**
   Isolating zero-dependency Rust math into `llmw-core` allowed identical bit-exact verification across three environments: Python unit tests (`pytest` via `ctypes`), native multi-threaded CLI benchmarks (`llmw-bench`), and a zero-server WebAssembly browser frontend (`llmw_wasm.wasm`).
