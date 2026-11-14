"""Tests for Linear & RNG codebooks, theoretical bounds, and spread properties."""

import numpy as np
import pytest

from llmw_codebook.codebook import (
    LinearCodebook,
    RNGCodebook,
    collision_probability_bound,
    create_codebook,
    exact_linear_minimum_distance,
    gilbert_varshamov_distance,
    measure_codebook_spread,
)
from llmw_codebook.distances import batch_levenshtein_distances


def test_collision_bound_and_gv_match_paper_values() -> None:
    exp, bound = collision_probability_bound(24, 127)
    assert exp == -80
    assert bound == pytest.approx(2.0 ** -80)

    # Section III-D evaluates d_GV ~= 32 for u=127 and d_GV ~= 60 for u=200 at n=24.
    d_127 = gilbert_varshamov_distance(24, 127)
    d_200 = gilbert_varshamov_distance(24, 200)
    assert 31 <= d_127 <= 33
    assert 59 <= d_200 <= 61


def test_linear_codebook_determinism_and_key_separation() -> None:
    cb1 = LinearCodebook("secret-alpha", n=8, u=63)
    cb2 = LinearCodebook("secret-alpha", n=8, u=63)
    cb3 = LinearCodebook("secret-beta", n=8, u=63)

    assert np.array_equal(cb1.table, cb2.table)
    assert not np.array_equal(cb1.table, cb3.table)

    for w in (0, 1, 42, 255):
        assert np.array_equal(cb1.encode(w), cb1.table[w])


def test_linear_codebook_has_zero_hamming_spread_unlike_rng() -> None:
    # Appendix E.2: every codeword in a linear code has identical nearest-neighbor
    # Hamming distance equal to the minimum weight of nonzero linear codewords.
    lin = LinearCodebook("spread-key-2026", n=8, u=127)
    lin_spread = measure_codebook_spread(lin, sample_size=256, metric="hamming")
    assert lin_spread.zero_spread is True
    assert lin_spread.min_distance == lin_spread.max_distance
    assert lin_spread.min_distance == exact_linear_minimum_distance(lin)

    rng_cb = RNGCodebook("spread-key-2026", n=8, u=127)
    rng_spread = measure_codebook_spread(rng_cb, sample_size=256, metric="hamming")
    assert rng_spread.zero_spread is False
    assert rng_spread.min_distance < rng_spread.max_distance


def test_branch_and_bound_levenshtein_matches_brute_force() -> None:
    cb = create_codebook("search-key", n=8, u=63, construction="linear")
    rng = np.random.default_rng(7)
    target_w = 173
    cw = cb.encode(target_w)

    # Apply random deletions, substitutions, and insertions to the codeword.
    corrupted = cw.copy()
    flip_idx = rng.choice(63, size=6, replace=False)
    corrupted[flip_idx] ^= 1
    corrupted = np.delete(corrupted, [3, 19, 44])
    corrupted = np.insert(corrupted, 10, [1, 0])

    match = cb.search(corrupted, metric="levenshtein")
    all_dists = batch_levenshtein_distances(corrupted, cb.table)
    sorted_dists = np.sort(all_dists)

    assert match.watermark == target_w
    assert match.distance == int(all_dists[target_w])
    assert match.distance == int(sorted_dists[0])
    assert match.second_best_distance == int(sorted_dists[1])
