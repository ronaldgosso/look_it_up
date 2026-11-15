# Portfolio and Showcase Kit

Deployment steps, resume copy, LinkedIn drafts, a 45-second walkthrough script, interview answers, and Dev.to publishing instructions for "Look It Up: Multi-bit LLM Watermarking via Codebook Search" ([arXiv:2611.16890](https://arxiv.org/abs/2611.16890)).

## GitHub Pages Activation

Static deployment runs automatically from [the Pages workflow](../.github/workflows/pages.yml) whenever `main` changes. Merge PR #6 (and PR #7 if syncing documentation) into `main`, then open repository Settings on GitHub and click Pages. Under Build and deployment Source, pick GitHub Actions, run Deploy Web Studio to GitHub Pages once from the Actions tab, and wait for the site to publish at `https://ronaldgosso.github.io/look_it_up/`.

## Resume Project Copy

Built a zero-dependency Rust cryptography and error-correction core (`llmw-core`) implementing FIPS 180-4 SHA-256, SplitMix64, affine GF(2) and RNG codebooks, 256-bit Myers bit-parallel Levenshtein distance (`u128` plus `[u64; 4]`), and shortened GF(2^m) BCH decoding, compiled to multi-threaded C-ABI FFI for Python (`ctypes`) and a `64.0 KB` (`64,001`-byte) WebAssembly binary.

Cut Levenshtein codebook extraction latency by `55.94x` against Python/NumPy across 32,768 codewords (`756.14 ms` down to `13.52 ms` on 8 threads), and scaled multi-threaded native lookup to 1,048,576 codewords (`n=20`, `u=127`) in `3.73 ms` (Hamming), `609.09 ms` (Levenshtein), and `0.096 ms` (BCH) via `llmw-bench`.

Shipped an offline React, TypeScript, and WebAssembly browser studio at zero hosting cost with a step-by-step `V0`/`V1` logit-bias inspector, live Appendix B attack suite (word deletion, insertion, synonym swap, paraphrase), two-track edit-alignment diffs, codebook distance spectrum histograms, and BCH capacity curves.

## LinkedIn Posts

### Version A: Technical Walkthrough

Most multi-bit LLM watermarks break down on short 127-token outputs. Position-allocation schemes decode in microseconds, then fall apart completely as soon as someone deletes a single word and shifts every bit index downstream. Exhaustive codebook lookup survives deletions via edit distance, but pure Python search loops stall as soon as payloads grow beyond a tiny ID table.

I implemented "Look It Up: Multi-bit LLM Watermarking via Codebook Search" (arXiv:2611.16890) from scratch in Rust, WebAssembly, and Python. All math lives in one zero-dependency Rust crate (`llmw-core`) covering SHA-256 keying, balanced `V0`/`V1` vocabulary splits, bit-packed codebooks, 256-bit Myers bit-parallel Levenshtein distance, and shortened GF(2^m) BCH decoding.

Compiling the same crate twice gave me both ends at once. Multi-threaded native FFI gives Python a `55.94x` speedup on Levenshtein lookup (13.52 ms vs. 756.14 ms for 32,768 codewords) and searches 1,048,576 codewords in 609 ms (`llmw-bench`). Compiling to `wasm32-unknown-unknown` drops into GitHub Pages as a 64 KB binary so anyone can run attacks in the browser for $0 server cost.

The sharpest contrast sits in the Appendix B 10% word-deletion benchmark (`n=12`, `u=127`). Hamming drops to 0.0% recovery and BCH drops to 0.0% recovery because fixed positional indexing loses sync after the first deleted token. Myers Levenshtein realigns the gaps and hits 100.0% recovery.

Inside the static Studio you can scrub token-by-token through `+delta` logit flips and Appendix F tokenization-invariance retries, trigger 5% to 30% adversarial edits while watching Levenshtein insert gap slots against Hamming failures, and inspect why linear affine GF(2) codebooks eliminate weak outlier pairs compared to hashed RNG tables.

Repo: https://github.com/ronaldgosso/look_it_up
Live Studio: https://ronaldgosso.github.io/look_it_up/
Paper: https://arxiv.org/abs/2611.16890

#Rust #WebAssembly #AppliedCryptography #LLM #AISecurity #OpenSource #Python

### Version B: Short Post

Finished an open-source Rust, WebAssembly, and Python implementation of Codebook LLM Watermarking (arXiv:2611.16890) with a browser lab hosted purely on GitHub Pages. A single zero-dependency Rust crate handles multi-threaded Python acceleration (`55.94x` speedup on 256-bit Myers bit-parallel Levenshtein), Appendix B robustness evaluation, Appendix F tokenization-invariance checks, shortened GF(2^m) BCH decoding, and a 64 KB `.wasm` build for live in-browser frameshift inspection.

Code: https://github.com/ronaldgosso/look_it_up
Demo: https://ronaldgosso.github.io/look_it_up/

#SystemsEngineering #RustLang #WASM #MachineLearning #Portfolio

## 45-Second Demo Script

Start at 0:00 to 0:10 in Playground with `n=12`, `u=127`, Linear GF(2), and Levenshtein selected. Click Embed & Generate so the colored `V1`/`V0` token stream fills in, then advance Logit-Bias Step Inspector with Next Flip to show candidate token competition.

From 0:10 to 0:25, trigger Word Deletion (10%). Keep both decoder verdicts visible side by side so viewers see Hamming fail on `WRONG (...)` due to frameshift while Levenshtein reports `FRAMESHIFT RECOVERED`, then pan across the cyan `+` gap markers in the Two-Track Edit Alignment ribbon.

From 0:25 to 0:35, switch to Benchmarks and highlight the `55.94x` Rust speedup bar beside the Appendix B attack matrix.

From 0:35 to 0:45, open Codebook Inspector. Show ZERO SPREAD on the Linear GF(2) distance histogram against the scattered RNG spread, then click Max Guarantee: Inject t Flips and Inject 1 Deletion Frameshift in the BCH sandbox to contrast instant Berlekamp-Massey correction against syndrome collapse on unaligned deletions.

## Engineering Interview Notes

### Why Myers Bit-Parallel Levenshtein in Rust

Standard Wagner-Fischer edit distance burns `O(u^2)` inner loops per candidate codeword. Packing each codeword into `u128` (`u <= 128`) or four `u64` limbs (`u <= 256`) reduces each Myers step to fixed bitwise shifts, masks, and additions, paired with triangle-inequality popcount pruning (`|wt(c_i) - wt(y)| > best_dist`) so distant candidates drop out before even entering DP. That combination reaches `55.94x` faster parallel execution at `n=15` against Python/NumPy (`13.52 ms` vs. `756.14 ms`).

### Why Linear Affine GF(2) Over Seeded RNG Codebooks

Hashing each ID independently gives random minimum separations, leaving weak outlier pairs where two IDs collide prematurely under moderate token edits. Affine linear codes (`W * G xor r`) over GF(2) force identical weight and distance neighborhoods around every codeword, yielding zero spread across all 4,096 IDs at `n=12, u=127` (`[43..43]` min nearest-neighbor distance vs. `[38..47]` for RNG).

### Why Tokenization Invariance Matters (Appendix F)

Decoding never sees raw token IDs. It sees UTF-8 text and runs the tokenizer again. If committing candidate token `t` causes `encode(decode(tokens))` to merge tokens `t - 1` and `t`, the extractor hashes the wrong previous token and desynchronizes downstream `V0`/`V1` splits. Checking round-trip re-tokenization before accepting a token and falling back to the next highest biased candidate avoids that silent channel drift.

### Shortened GF(2^m) BCH vs. Exhaustive Codebook Lookup

Brute-force search stalls past roughly 20 to 24 payload bits because `2^n` grows exponentially, whereas algebraic Berlekamp-Massey plus Chien search decodes 20-bit payloads in `0.096 ms` and scales straight to 24 or 32 bits (`t` guaranteed bit flips corrected). The catch is alignment. BCH evaluates syndromes over fixed finite-field exponents, so one unaligned word deletion scrambles every bit index downstream unless an edit-distance layer or exhaustive codebook absorbs the gap.

### Keeping `llmw-core` Free of External Dependencies

Quarantining all hashing, PRNG, codebook math, Myers bit-parallel DP, and BCH finite-field arithmetic inside zero-dependency `llmw-core` lets Cargo emit identical machine semantics across three hosts: multi-threaded `llmw-native` loaded over `ctypes` in pytest, the standalone `llmw-bench` CLI, and the `64,001`-byte `llmw_wasm.wasm` binary shipped in GitHub Pages.

## Dev.to Article and Screenshots

The draft post lives at [devto_article.md](devto_article.md) alongside its `1000x420` banner and five screenshots captured from the compiled WASM Studio in [assets/devto/](assets/devto/).

| File | Subject |
| --- | --- |
| `cover.png` | `1000x420` Dev.to banner image |
| `01-playground-logit-inspector.png` | Playground token stream and Logit-Bias Step Inspector |
| `02-playground-frameshift-recovery.png` | 10% word deletion failure in Hamming and BCH vs. Levenshtein alignment recovery |
| `03-benchmarks-speedup.png` | `55.9x` Rust speedup bars and Appendix B recovery table |
| `04-codebook-zero-spread.png` | Linear GF(2) zero spread (`[43..43]`) vs. RNG histogram |
| `05-bch-analyzer-sandbox.png` | Shortened BCH error curves and `t=27` Berlekamp-Massey sandbox |

Before publishing on Dev.to, merge PR #6 (and PR #7 if updating docs) into `main` so the `raw.githubusercontent.com/.../main/...` image links resolve. Paste the contents of [devto_article.md](devto_article.md) into `dev.to/new`, inspect the draft preview, change `published: false` to `published: true` in the front matter, and hit Publish.
