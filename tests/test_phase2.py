"""Phase 2 tests: Rust vs. Python bit-exact differential parity, attacks, metrics, and benchmarks."""

import numpy as np
import pytest

from llmw_codebook._prng import derive_token_seed, split_vocabulary
from llmw_codebook._rust_accel import (
    is_native_available,
    native_bch_decode,
    native_bch_encode,
)
from llmw_codebook.attacks import (
    paraphrase_attack,
    synonym_replacement_attack,
    word_deletion_attack,
    word_insertion_attack,
)
from llmw_codebook.bch import BCHCodec
from llmw_codebook.benchmarks import run_attack_and_quality_suite
from llmw_codebook.codebook import create_codebook
from llmw_codebook.distances import levenshtein_distance
from llmw_codebook.metrics import (
    compute_roc_auroc,
    distinct_1,
    distinct_2,
    evaluate_quality,
    trigram_repetition_rate,
)
from llmw_codebook.models import BuiltinNGramModel


def test_rust_native_is_loaded_and_bit_exact_with_python() -> None:
    assert is_native_available() is True

    # 1. Vocabulary splitting parity
    for prev in (None, 0, 17, 511, 1023):
        seed = derive_token_seed("parity-secret", prev)
        py_mask = split_vocabulary(1024, seed, use_native=False)
        rs_mask = split_vocabulary(1024, seed, use_native=True)
        assert np.array_equal(py_mask, rs_mask)

    # 2. Levenshtein parity across 64/127/128/200 lengths
    rng = np.random.default_rng(2026)
    for m, n in [(0, 10), (63, 64), (127, 121), (128, 128), (200, 189)]:
        a = rng.integers(0, 2, size=m, dtype=np.uint8)
        b = rng.integers(0, 2, size=n, dtype=np.uint8)
        assert levenshtein_distance(a, b, use_native=True) == levenshtein_distance(
            a, b, use_native=False
        )

    # 3. Linear & RNG codebook encode + Hamming/Levenshtein search parity
    for construction in ("linear", "rng"):
        cb_py = create_codebook("parity-cb", n=10, u=127, construction=construction, use_native=False)
        cb_rs = create_codebook("parity-cb", n=10, u=127, construction=construction, use_native=True)
        wm = 613
        cw = cb_py.encode(wm)
        noisy = cw.copy()
        noisy[[4, 29, 77, 110]] ^= 1
        m_rs_ham = cb_rs.search(noisy, metric="hamming")
        m_py_ham = cb_py.search(noisy, metric="hamming")
        assert (m_rs_ham.watermark, m_rs_ham.distance, m_rs_ham.second_best_distance) == (
            m_py_ham.watermark,
            m_py_ham.distance,
            m_py_ham.second_best_distance,
        )
        assert np.array_equal(m_rs_ham.codeword, m_py_ham.codeword)

        noisy_del = np.delete(noisy, [15, 63, 98])
        m_rs_lev = cb_rs.search(noisy_del, metric="levenshtein")
        m_py_lev = cb_py.search(noisy_del, metric="levenshtein")
        assert (m_rs_lev.watermark, m_rs_lev.distance, m_rs_lev.second_best_distance) == (
            m_py_lev.watermark,
            m_py_lev.distance,
            m_py_lev.second_best_distance,
        )
        assert np.array_equal(m_rs_lev.codeword, m_py_lev.codeword)

    # 4. BCH Rust vs Python parity
    bch_py = BCHCodec(24, 200)
    wm24 = 0x9F2C18
    cw_py = bch_py.encode(wm24)
    cw_rs = native_bch_encode(24, 200, wm24)
    assert np.array_equal(cw_py, cw_rs)

    corrupted = cw_py.copy()
    corrupted[np.arange(0, 200, 11)] ^= 1
    d_py = bch_py.decode(corrupted)
    d_rs = native_bch_decode(24, 200, corrupted)
    assert d_rs[0] == d_py[0] == wm24
    assert d_rs[1] == d_py[1]
    assert np.array_equal(d_rs[2], d_py[2])


def test_appendix_b_attacks_respect_budgets_and_transform_text() -> None:
    model = BuiltinNGramModel(entropy_mode="base")
    text = (
        "This compact wireless charger delivers fast power for portable laptops while traveling "
        "and the braided cable stayed cool under load during daily commuting."
    )

    d_res = word_deletion_attack(text, model, attack_budget=0.15, seed=1)
    assert d_res.attacked_tokens < d_res.original_tokens
    assert d_res.modified_tokens >= d_res.budget_tokens

    i_res = word_insertion_attack(text, model, attack_budget=0.15, seed=2)
    assert i_res.attacked_tokens > i_res.original_tokens
    assert i_res.modified_tokens >= i_res.budget_tokens

    s_res = synonym_replacement_attack(text, model, attack_budget=0.15, seed=3)
    assert s_res.attacked_text != text
    assert s_res.modified_tokens > 0

    p_res = paraphrase_attack(text, model, attack_budget=0.15, seed=4)
    assert p_res.attacked_text != text
    assert p_res.modified_tokens >= p_res.budget_tokens


def test_quality_metrics_and_roc_auroc() -> None:
    model = BuiltinNGramModel(entropy_mode="base")
    sample = "Compact wireless charger delivers steady power and reliable thermal management."
    q = evaluate_quality(sample, model=model)
    assert 0.0 < distinct_1(sample) <= 1.0
    assert 0.0 < distinct_2(sample) <= 1.0
    assert 0.0 <= trigram_repetition_rate(sample) <= 1.0
    assert q.perplexity is not None and q.perplexity > 1.0

    roc = compute_roc_auroc([1, 3, 4, 6, 8], [45, 51, 55, 60, 62], max_fpr=0.01)
    assert roc.auroc == pytest.approx(1.0)
    assert roc.tpr_at_max_fpr == pytest.approx(1.0)


def test_benchmark_runner_smoke() -> None:
    res = run_attack_and_quality_suite(n=8, u=63, samples_per_prompt=1, attack_budget=0.1)
    assert res["system"]["backend"] == "rust-native"
    assert len(res["attack_robustness"]) == 15
    assert res["roc_auroc"]["levenshtein"]["auroc"] >= 0.95
