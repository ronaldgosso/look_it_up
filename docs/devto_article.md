---
title: "Look It Up: Multi-Bit LLM Watermarking via 256-Bit Myers Search in Rust & WebAssembly"
published: false
description: "Turning arXiv:2611.16890 into a 56x faster Rust engine and a 64 KB WebAssembly browser lab, complete with deletion frameshift alignment diffs and BCH error-correction."
tags: rust, webassembly, llm, cryptography
cover_image: https://raw.githubusercontent.com/ronaldgosso/look_it_up/main/docs/assets/devto/cover.png
canonical_url: https://github.com/ronaldgosso/look_it_up
---

Short LLM outputs around 127 tokens break most multi-bit watermarks. Position-allocation schemes decode almost instantly, right up until someone deletes one word and shifts every bit index after it. Exhaustive codebook lookup fixes those frameshifts through edit distance, but Python loops grind to a halt the second a payload reaches tens of thousands of codewords.

After implementing "Look It Up: Multi-bit LLM Watermarking via Codebook Search" ([arXiv:2611.16890](https://arxiv.org/abs/2611.16890)) from scratch, I put all the cryptography and nearest-neighbor math into a zero-dependency Rust crate and shipped two targets from the same code. Multi-threaded native FFI gives Python a 55.94x speedup on Levenshtein search and checks 1,048,576 codewords in 609 ms via `llmw-bench`. Meanwhile, compiling the exact same crate to `wasm32-unknown-unknown` drops a `64,001`-byte binary into GitHub Pages so anyone can torture-test attacks in the browser at zero server cost.

Live browser client ($0 backend): [Look It Up Interactive WASM Studio](https://ronaldgosso.github.io/look_it_up/)

{% github ronaldgosso/look_it_up %}

## Codebook Watermarking in Four Steps

Instead of packing raw watermark bits one by one into sequential token positions, you map an `n`-bit payload ID `W` (`0` to `2^n - 1`) to a stretched `u`-bit binary codeword `L_W` (for instance `n = 12` bits across `u = 127` tokens). At generation time you derive `L_W` with a secret affine linear code over GF(2), `L_W = W * G xor r`, which guarantees uniform minimum distance between every pair of IDs.

For each generated token `t`, hashing the secret key concatenated with the previous token ID (`SHA-256(secret_key || prev_token_id)`) seeds a balanced split of the vocabulary into `V0` and `V1`. When codeword bit `L_W[t]` equals `1`, every token in `V1` picks up a `+delta` logit boost. When it equals `0`, `V0` receives the boost. Right before accepting token `t`, Appendix F's Tokenization-Invariance check re-tokenizes the decoded UTF-8 string to verify it maps back to the exact same token IDs, preventing subtle prefix merges from throwing off the verifier later.

Extraction reverses that process. The verifier tokenizes the suspect text, reads back a noisy bitstream `y`, and returns `argmin_W d(y, L_W)` using Hamming popcount, Myers bit-parallel Levenshtein edit distance, or shortened GF(2^m) BCH decoding.

![Playground Stage 1 showing live WASM generation, token-level V1/V0 ribbon, and Logit-Bias Step Inspector](https://raw.githubusercontent.com/ronaldgosso/look_it_up/main/docs/assets/devto/01-playground-logit-inspector.png)

In the Logit-Bias Step Inspector above (`n = 12`, `u = 127`, `delta = 3.5`), stepping to `t = 2 / 127` reveals the bias decision live. Candidate token `" compact"` in `V1` started behind `" and"` in `V0` at `-4.62` vs. `-4.30`. Adding `+3.5` lifted `V1` to `-1.12` (`BIAS FLIPPED`) while holding the vocabulary split at `50.0% V1`.

## Interactive Challenge 1: Deleting 10% of the Words

Say you embed `ID = 1337` into 127 tokens and then delete 10% of the words (around 12 tokens). Before opening the toggle below, predict which decoders survive and which return noise.

{% details Reveal Live WASM Frameshift Showdown (10% Word Deletion) %}

Removing a few words pulls every downstream bit index left (`t` becomes `t - 1`, then `t - 2`, and so on), cutting our 127-bit sequence down to 114 extracted bits.

Positional decoders collapse immediately. Hamming (`d_H`) picks wrong `ID 2073` at distance `44` (`margin +1`), and shortened BCH (`GF(2^7)`) picks wrong `ID 2967` at distance `58` because fixed index alignment died on the first deleted token. Myers Levenshtein (`d_L`) inserts 13 cyan `+` gap slots in the Two-Track Edit Alignment strip (`104` matches, `10` substitutions, `13` gap insertions), snapping every shifted bit back onto track and locking onto `ID 1337` at `d_L = 23` with a `+8` margin over the runner-up (`31`). Across the automated Appendix B 10% deletion suite (`n = 12`, `u = 127`), Levenshtein hits `100.0%` match rate while Hamming and BCH both sit at `0.0%`.

![Word Deletion 10% attack showing Hamming failing at ID 2073 while Levenshtein recovers ID 1337 via Two-Track Sequence Edit Alignment](https://raw.githubusercontent.com/ronaldgosso/look_it_up/main/docs/assets/devto/02-playground-frameshift-recovery.png)

{% enddetails %}

## Cutting Lookup Latency by 55.94x in Rust

Exhaustive edit-distance lookup works in real time only if you throw out byte-by-byte DP tables. Inside `crates/llmw-core`, each codeword sits packed into `u128` (`u <= 128`) or four `u64` limbs (`u <= 256`) so Myers bit-parallel Levenshtein evaluates whole vectors in bitwise operations. Before running DP on a candidate, an early popcount check (`|wt(c_i) - wt(y)|`) skips any codeword that already violates the triangle inequality for the best distance seen so far.

On native hosts, `std::thread::scope` splits the codebook across all CPU cores for Python `ctypes` callers and the `llmw-bench` binary. On the web, the exact single-threaded core compiles cleanly into `llmw_wasm.wasm` at `64,001` bytes.

| Benchmark (`u = 127`) | Python / NumPy | Rust Native (8 threads) | Result |
| --- | ---: | ---: | --- |
| Hamming (`n = 15`, 32,768 codewords) | 9.35 ms | 2.37 ms | 3.94x speedup |
| Myers Levenshtein (`n = 15`, 32,768 codewords) | 756.14 ms | 13.52 ms | 55.94x speedup |
| 1M sweep (`n = 20`, 1,048,576 entries) | n/a | 3.73 ms Hamming, 609.09 ms Levenshtein, 0.096 ms BCH | Exact recovery (`llmw-bench`) |

![Benchmarks view showing 55.9x Rust speedup and Appendix B attack recovery matrix](https://raw.githubusercontent.com/ronaldgosso/look_it_up/main/docs/assets/devto/03-benchmarks-speedup.png)

## Interactive Challenge 2: Linear GF(2) vs. RNG Codebooks

If you need `2^12 = 4,096` codewords of length `127`, why multiply through an affine GF(2) generator matrix `W * G xor r` instead of just hashing `SHA-256(key || W)` once per ID?

{% details Reveal Codebook Distance Spectrum and Zero-Spread Invariance %}

Seeding RNG independently per ID creates random clustering. Some unlucky codewords end up much closer to neighbors than others, dropping the nearest-neighbor range to `[38 .. 47]` bits at `n = 12`, `u = 127` (a 9-bit spread where outliers fall under the Gilbert-Varshamov line).

An affine Linear GF(2) codebook gives every codeword identical local geometry. Its nearest-neighbor distance sits locked at `[43 .. 43]` bits (`ZERO SPREAD`) across all 4,096 IDs, beating the `d_GV = 40` reference threshold everywhere without weak IDs.

![Codebook Inspector showing Linear GF(2) Zero Spread vs RNG distance spectrum histogram](https://raw.githubusercontent.com/ronaldgosso/look_it_up/main/docs/assets/devto/04-codebook-zero-spread.png)

{% enddetails %}

## Interactive Challenge 3: Shortened BCH vs. Unaligned Deletions

Brute-force search breaks down once `n` climbs toward 24 or 32 bits (over four billion IDs). Shortened binary BCH codes over GF(2^m) sidestep exhaustive scans with algebraic Berlekamp-Massey and Chien search, decoding 20-bit payloads in `0.096 ms`. At `n = 12, u = 127`, shortened GF(2^7) BCH is guaranteed to fix up to `t = 27` arbitrary bit flips (`21.3%` bit corruption).

Compare two stress cases in the Codebook Inspector sandbox. In Condition A, you flip `27` scattered bits across the codeword. In Condition B, you flip `0` bits and delete `1` bit in the middle.

{% details Reveal BCH Syndrome Result (27 Bit Flips vs. 1 Deletion Frameshift) %}

Under Condition A (`27` bit flips), Berlekamp-Massey reconstructs the error-locator polynomial in microseconds and prints `DECODED ID 1337 (27 fixed)`. Under Condition B (`1` middle deletion), finite-field syndromes lose index correspondence across exponents `alpha^0` through `alpha^(u-1)` and return garbage. Algebraic BCH solves large bit-flip noise fast, while word-deletion channels demand sequence alignment from Levenshtein search.

![Shortened BCH Error-Correction Frontier curves and interactive Berlekamp-Massey sandbox decoding 27 bit flips](https://raw.githubusercontent.com/ronaldgosso/look_it_up/main/docs/assets/devto/05-bch-analyzer-sandbox.png)

{% enddetails %}

## Running It Locally

Everything in the repository is licensed under GNU GPLv3. You can build the native library, benchmark the 1M-codeword sweep, run parity tests, or launch the local Vite client with these commands:

```bash
git clone https://github.com/ronaldgosso/look_it_up.git
cd look_it_up

cargo test --workspace
cargo build --release -p llmw-native
./target/release/llmw-bench

pip install -e ".[dev,api]"
pytest -v

cd web
npm install
npm run test
npm run dev
```

You can also run the static WASM studio without installing anything at [ronaldgosso.github.io/look_it_up](https://ronaldgosso.github.io/look_it_up/).
