"""Reproducible Phase 2 benchmark suite: Rust acceleration, attack robustness, and quality."""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np

from llmw_codebook._rust_accel import backend_info, is_native_available
from llmw_codebook.attacks import (
    paraphrase_attack,
    synonym_replacement_attack,
    word_deletion_attack,
    word_insertion_attack,
)
from llmw_codebook.bch import BCHCodec
from llmw_codebook.codebook import LinearCodebook
from llmw_codebook.metrics import compute_roc_auroc, evaluate_quality
from llmw_codebook.models import BuiltinNGramModel
from llmw_codebook.watermark import WatermarkEmbedder, WatermarkExtractor

_PROMPTS: tuple[str, ...] = (
    "This compact wireless charger delivers fast power for laptops, tablets, and phones while",
    "For daily commuting, active noise cancellation softens subway rumble without making voices",
    "Battery life easily lasts through a full workday of video calls, document editing, and",
    "Historically, port cities adapted rapidly when steam navigation shortened transatlantic crossing",
    "Cryptographic watermarks embed identifying signals directly into token choices while",
    "Modern verification pipelines balance false positive thresholds against extraction latency",
    "Reviewers praised the compact wireless charger because the aluminum housing prevents",
    "Independent security audits confirm that affine linear codebooks guarantee uniform minimum",
)


@dataclass(frozen=True)
class AttackBenchmarkRow:
    method: str
    attack: str
    match_rate: float
    mean_distance: float
    samples: int


def benchmark_rust_vs_python(n: int = 14, u: int = 127) -> dict[str, Any]:
    """Compare search latency between Python/NumPy and multi-threaded Rust FFI."""
    key = "bench-speed-key"
    cb_py = LinearCodebook(key, n=n, u=u, use_native=False)
    _ = cb_py.table  # warm materialization before timing search
    target_w = (1 << (n - 1)) + min(73, (1 << (n - 1)) - 1)
    cand = cb_py.encode(target_w).copy()
    flip_positions = sorted({pos % u for pos in (3, 19, 44, u - 10)})
    cand[flip_positions] ^= 1
    del_positions = sorted({pos % len(cand) for pos in (12, len(cand) - 7)})
    cand_del = np.delete(cand, del_positions)

    t0 = time.perf_counter()
    py_ham = cb_py.search(cand, metric="hamming")
    py_ham_ms = (time.perf_counter() - t0) * 1000.0

    t0 = time.perf_counter()
    py_lev = cb_py.search(cand_del, metric="levenshtein")
    py_lev_ms = (time.perf_counter() - t0) * 1000.0

    out: dict[str, Any] = {
        "n": n,
        "u": u,
        "entries": 1 << n,
        "python_hamming_ms": round(py_ham_ms, 3),
        "python_levenshtein_ms": round(py_lev_ms, 3),
        "rust_available": is_native_available(),
    }

    if is_native_available():
        cb_rs = LinearCodebook(key, n=n, u=u, use_native=True)
        _ = cb_rs._get_native_handle()  # warm packed codebook

        t0 = time.perf_counter()
        rs_ham = cb_rs.search(cand, metric="hamming")
        rs_ham_ms = (time.perf_counter() - t0) * 1000.0

        t0 = time.perf_counter()
        rs_lev = cb_rs.search(cand_del, metric="levenshtein")
        rs_lev_ms = (time.perf_counter() - t0) * 1000.0

        assert rs_ham.watermark == py_ham.watermark == target_w
        assert rs_lev.watermark == py_lev.watermark == target_w
        out.update(
            {
                "rust_hamming_ms": round(rs_ham_ms, 3),
                "rust_levenshtein_ms": round(rs_lev_ms, 3),
                "hamming_speedup": round(py_ham_ms / max(rs_ham_ms, 1e-6), 2),
                "levenshtein_speedup": round(py_lev_ms / max(rs_lev_ms, 1e-6), 2),
            }
        )
    return out


def run_attack_and_quality_suite(
    n: int = 12,
    u: int = 127,
    samples_per_prompt: int = 2,
    attack_budget: float = 0.1,
    delta: float = 6.0,
) -> dict[str, Any]:
    """Run Appendix B robustness, Appendix A ROC/AUROC, and Appendix G quality suite."""
    key = "phase2-benchmark-key"
    model_base = BuiltinNGramModel(entropy_mode="base")
    model_inst = BuiltinNGramModel(entropy_mode="instruct")

    cb = LinearCodebook(key, n=n, u=u)
    bch = BCHCodec(watermark_bits=n, codeword_length=u)

    embedder = WatermarkEmbedder(model_base, secret_key=key, delta=delta)
    extractor = WatermarkExtractor(model_base, secret_key=key)

    unwm_embedder = WatermarkEmbedder(model_base, secret_key="other-key-unwm", delta=0.0)
    wrong_cb = LinearCodebook("attacker-wrong-key", n=n, u=u)
    wrong_extractor = WatermarkExtractor(model_base, secret_key="attacker-wrong-key")

    attack_fns = {
        "clean": lambda txt, s: txt,
        "word_deletion": lambda txt, s: word_deletion_attack(txt, model_base, attack_budget, seed=s).attacked_text,
        "word_insertion": lambda txt, s: word_insertion_attack(txt, model_base, attack_budget, seed=s).attacked_text,
        "synonym_swap": lambda txt, s: synonym_replacement_attack(txt, model_base, attack_budget, seed=s).attacked_text,
        "paraphrase": lambda txt, s: paraphrase_attack(txt, model_base, attack_budget, seed=s).attacked_text,
    }

    records: dict[tuple[str, str], list[tuple[bool, int]]] = {
        (method, atk): []
        for method in ("hamming", "levenshtein", "bch")
        for atk in attack_fns
    }
    wm_dists: dict[str, list[int]] = {"hamming": [], "levenshtein": [], "bch": []}
    unwm_dists: dict[str, list[int]] = {"hamming": [], "levenshtein": [], "bch": []}
    wm_qual: list[dict[str, float]] = []
    unwm_qual: list[dict[str, float]] = []

    sample_idx = 0
    for prompt in _PROMPTS:
        for rep in range(samples_per_prompt):
            wm_id = (sample_idx * 409 + 137) % (1 << n)
            emb_cb = embedder.embed_with_codebook(prompt, wm_id, cb)
            emb_bch = embedder.embed_with_bch(prompt, wm_id, bch)
            emb_unwm = unwm_embedder.embed_with_codebook(prompt, wm_id, cb)

            q_w = evaluate_quality(emb_cb.generated_text, model=model_base)
            q_u = evaluate_quality(emb_unwm.generated_text, model=model_base)
            wm_qual.append(
                {
                    "distinct_1": q_w.distinct_1,
                    "distinct_2": q_w.distinct_2,
                    "trigram_rep": q_w.trigram_repetition_rate,
                    "perplexity": q_w.perplexity or 0.0,
                }
            )
            unwm_qual.append(
                {
                    "distinct_1": q_u.distinct_1,
                    "distinct_2": q_u.distinct_2,
                    "trigram_rep": q_u.trigram_repetition_rate,
                    "perplexity": q_u.perplexity or 0.0,
                }
            )

            # Unwatermarked / wrong-key distances for ROC / AUROC.
            unwm_dists["hamming"].append(
                extractor.extract_from_codebook(emb_unwm.generated_text, cb, metric="hamming").distance
            )
            unwm_dists["levenshtein"].append(
                extractor.extract_from_codebook(emb_unwm.generated_text, cb, metric="levenshtein").distance
            )
            unwm_dists["bch"].append(
                wrong_extractor.extract_from_bch(emb_unwm.generated_text, bch).distance
            )
            _ = wrong_cb  # kept explicit for readability

            for atk_name, atk_fn in attack_fns.items():
                atk_cb_text = atk_fn(emb_cb.generated_text, sample_idx + 100)
                atk_bch_text = atk_fn(emb_bch.generated_text, sample_idx + 100)

                r_ham = extractor.extract_from_codebook(atk_cb_text, cb, metric="hamming")
                r_lev = extractor.extract_from_codebook(atk_cb_text, cb, metric="levenshtein")
                r_bch = extractor.extract_from_bch(atk_bch_text, bch)

                records[("hamming", atk_name)].append((r_ham.watermark == wm_id, r_ham.distance))
                records[("levenshtein", atk_name)].append((r_lev.watermark == wm_id, r_lev.distance))
                records[("bch", atk_name)].append((r_bch.watermark == wm_id, r_bch.distance))

                if atk_name == "clean":
                    wm_dists["hamming"].append(r_ham.distance)
                    wm_dists["levenshtein"].append(r_lev.distance)
                    wm_dists["bch"].append(r_bch.distance)

            sample_idx += 1

    # Compare base vs. instruct entropy regimes (Section V insight).
    instruct_embedder = WatermarkEmbedder(model_inst, secret_key=key, delta=delta)
    instruct_extractor = WatermarkExtractor(model_inst, secret_key=key)
    instruct_matches: dict[str, list[bool]] = {"hamming": [], "levenshtein": [], "bch": []}
    for idx, prompt in enumerate(_PROMPTS):
        wm_id = (idx * 311 + 42) % (1 << n)
        e_cb = instruct_embedder.embed_with_codebook(prompt, wm_id, cb)
        e_bch = instruct_embedder.embed_with_bch(prompt, wm_id, bch)
        instruct_matches["hamming"].append(
            instruct_extractor.extract_from_codebook(e_cb.generated_text, cb, metric="hamming").watermark == wm_id
        )
        instruct_matches["levenshtein"].append(
            instruct_extractor.extract_from_codebook(e_cb.generated_text, cb, metric="levenshtein").watermark == wm_id
        )
        instruct_matches["bch"].append(
            instruct_extractor.extract_from_bch(e_bch.generated_text, bch).watermark == wm_id
        )

    attack_rows: list[dict[str, Any]] = []
    for method in ("levenshtein", "hamming", "bch"):
        for atk_name in attack_fns:
            entries = records[(method, atk_name)]
            attack_rows.append(
                asdict(
                    AttackBenchmarkRow(
                        method=method,
                        attack=atk_name,
                        match_rate=round(sum(1 for ok, _ in entries if ok) / len(entries), 4),
                        mean_distance=round(sum(d for _, d in entries) / len(entries), 2),
                        samples=len(entries),
                    )
                )
            )

    roc_summary = {
        method: {
            "auroc": round(res.auroc, 4),
            "tpr_at_1pct_fpr": round(res.tpr_at_max_fpr, 4),
            "threshold_at_1pct_fpr": res.threshold_at_max_fpr,
        }
        for method in ("levenshtein", "hamming", "bch")
        for res in (compute_roc_auroc(wm_dists[method], unwm_dists[method], max_fpr=0.01),)
    }

    def _mean_dict(rows: list[dict[str, float]]) -> dict[str, float]:
        keys = rows[0].keys()
        return {k: round(sum(r[k] for r in rows) / len(rows), 4) for k in keys}

    return {
        "system": backend_info(),
        "config": {
            "n": n,
            "u": u,
            "delta": delta,
            "attack_budget": attack_budget,
            "num_samples": sample_idx,
        },
        "speed_comparison": benchmark_rust_vs_python(n=max(n, 15), u=u),
        "attack_robustness": attack_rows,
        "roc_auroc": roc_summary,
        "entropy_regime_match_rate": {
            "base": {
                m: round(sum(1 for ok, _ in records[(m, "clean")] if ok) / sample_idx, 4)
                for m in ("levenshtein", "hamming", "bch")
            },
            "instruct": {
                m: round(sum(1 for ok in instruct_matches[m] if ok) / len(_PROMPTS), 4)
                for m in ("levenshtein", "hamming", "bch")
            },
        },
        "quality_comparison": {
            "watermarked": _mean_dict(wm_qual),
            "non_watermarked": _mean_dict(unwm_qual),
        },
    }


def render_markdown_summary(results: dict[str, Any]) -> str:
    spd = results["speed_comparison"]
    cfg = results["config"]
    lines = [
        "# Phase 2 Benchmark Summary",
        "",
        f"Measured on `{results['system']['backend']}` across {results['system']['threads']} threads "
        f"with `n={cfg['n']}`, `u={cfg['u']}`, `delta={cfg['delta']}`, "
        f"`attack_budget={cfg['attack_budget']}`, and {cfg['num_samples']} samples per condition.",
        "",
        f"## 1. Python/NumPy vs. Multi-Threaded Rust Speed at `n={spd['n']}` ({spd['entries']:,} codewords, `u={spd['u']}`)",
        "",
        "| Metric | Python/NumPy (ms) | Rust Native (ms) | Speedup |",
        "| --- | ---: | ---: | ---: |",
        f"| Hamming | {spd['python_hamming_ms']:.3f} | {spd.get('rust_hamming_ms', 'N/A')} | "
        f"{spd.get('hamming_speedup', 'N/A')}x |",
        f"| Levenshtein (Myers bit-parallel) | {spd['python_levenshtein_ms']:.3f} | "
        f"{spd.get('rust_levenshtein_ms', 'N/A')} | {spd.get('levenshtein_speedup', 'N/A')}x |",
        "",
        "## 2. Attack Robustness Matrix (Appendix B, 10% Token Budget)",
        "",
        "| Method | Clean | Word Deletion | Word Insertion | Synonym Swap | Paraphrase |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    by_pair = {(r["method"], r["attack"]): r["match_rate"] for r in results["attack_robustness"]}
    for method in ("levenshtein", "hamming", "bch"):
        vals = [
            f"{by_pair[(method, atk)] * 100:.1f}%"
            for atk in ("clean", "word_deletion", "word_insertion", "synonym_swap", "paraphrase")
        ]
        lines.append(f"| {method} | " + " | ".join(vals) + " |")

    lines.extend(
        [
            "",
            "## 3. ROC, AUROC, and Entropy Regimes",
            "",
            "| Method | AUROC | TPR at 1% FPR | Base Match | Instruct Match |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
    )
    for method in ("levenshtein", "hamming", "bch"):
        roc = results["roc_auroc"][method]
        b_mr = results["entropy_regime_match_rate"]["base"][method]
        i_mr = results["entropy_regime_match_rate"]["instruct"][method]
        lines.append(
            f"| {method} | {roc['auroc']:.4f} | {roc['tpr_at_1pct_fpr'] * 100:.1f}% | "
            f"{b_mr * 100:.1f}% | {i_mr * 100:.1f}% |"
        )

    qw = results["quality_comparison"]["watermarked"]
    qu = results["quality_comparison"]["non_watermarked"]
    lines.extend(
        [
            "",
            "## 4. Text Quality (Appendix G)",
            "",
            "| Condition | Distinct-1 | Distinct-2 | Trigram Repetition | Perplexity |",
            "| --- | ---: | ---: | ---: | ---: |",
            f"| Watermarked | {qw['distinct_1']:.4f} | {qw['distinct_2']:.4f} | {qw['trigram_rep']:.4f} | {qw['perplexity']:.2f} |",
            f"| Non-Watermarked | {qu['distinct_1']:.4f} | {qu['distinct_2']:.4f} | {qu['trigram_rep']:.4f} | {qu['perplexity']:.2f} |",
            "",
        ]
    )
    return "\n".join(lines)


def write_benchmark_outputs(output_dir: Path, results: dict[str, Any]) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "results.json"
    md_path = output_dir / "SUMMARY.md"
    json_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    md_path.write_text(render_markdown_summary(results), encoding="utf-8")
    return json_path, md_path
