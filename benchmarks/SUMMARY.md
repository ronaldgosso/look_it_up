# Phase 2 Benchmark Summary

- **Active Acceleration:** `rust-native` (threads: `8`)
- **Benchmark Config:** `n=12`, `u=127`, `delta=6.0`, `attack_budget=0.1`, `samples=16`

## 1. Python/NumPy vs. Multi-Threaded Rust Speed (`n=15` -> 32,768 codewords, `u=127`)

| Metric | Python/NumPy (ms) | Rust Native (ms) | Speedup |
| --- | ---: | ---: | ---: |
| Hamming | 9.347 | 2.371 | 3.94x |
| Levenshtein (Myers bit-parallel) | 756.137 | 13.516 | 55.94x |

## 2. Attack Robustness Matrix (Appendix B, 10% Token Budget)

| Method | Clean | Word Deletion | Word Insertion | Synonym Swap | Paraphrase |
| --- | ---: | ---: | ---: | ---: | ---: |
| **levenshtein** | 100.0% | 100.0% | 56.2% | 100.0% | 100.0% |
| **hamming** | 100.0% | 0.0% | 0.0% | 18.8% | 12.5% |
| **bch** | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% |

## 3. ROC / AUROC & Entropy Regimes

| Method | AUROC | TPR @ 1% FPR | Base Match | Instruct Match |
| --- | ---: | ---: | ---: | ---: |
| **levenshtein** | 1.0000 | 100.0% | 100.0% | 37.5% |
| **hamming** | 1.0000 | 100.0% | 100.0% | 100.0% |
| **bch** | 1.0000 | 100.0% | 100.0% | 25.0% |

## 4. Text Quality (Appendix G)

| Condition | Distinct-1 | Distinct-2 | Trigram Repetition | Perplexity |
| --- | ---: | ---: | ---: | ---: |
| Watermarked | 0.3560 | 0.5975 | 0.2218 | 27.78 |
| Non-Watermarked | 0.1305 | 0.1342 | 0.8644 | 6.57 |
