"""Tests for Hamming and Myers bit-parallel Levenshtein distances."""

import numpy as np

from llmw_codebook.distances import (
    batch_hamming_distances,
    batch_levenshtein_distances,
    hamming_distance,
    levenshtein_alignment,
    levenshtein_distance,
)


def test_myers_levenshtein_matches_dp_alignment_across_lengths() -> None:
    rng = np.random.default_rng(123)
    for m, n in [(0, 5), (5, 0), (1, 1), (17, 19), (64, 64), (127, 120), (200, 193)]:
        a = rng.integers(0, 2, size=m, dtype=np.uint8)
        b = rng.integers(0, 2, size=n, dtype=np.uint8)
        dp_res = levenshtein_alignment(a, b)
        myers_dist = levenshtein_distance(a, b)
        assert myers_dist == dp_res.distance


def test_alignment_reconstructs_target_with_exact_edit_count() -> None:
    source = np.array([1, 0, 1, 1, 0, 0, 1, 0, 1], dtype=np.uint8)
    target = np.array([0, 1, 1, 0, 1, 0, 1, 1], dtype=np.uint8)
    res = levenshtein_alignment(source, target)

    reconstructed: list[int] = []
    edits = 0
    for op in res.ops:
        if op.kind == "match":
            assert op.source_bit == op.target_bit
            reconstructed.append(int(op.target_bit))
        elif op.kind == "substitute":
            assert op.source_bit != op.target_bit
            reconstructed.append(int(op.target_bit))
            edits += 1
        elif op.kind == "insert":
            reconstructed.append(int(op.target_bit))
            edits += 1
        elif op.kind == "delete":
            edits += 1

    assert reconstructed == target.tolist()
    assert edits == res.distance


def test_batch_distances_consistency() -> None:
    rng = np.random.default_rng(99)
    cand = rng.integers(0, 2, size=63, dtype=np.uint8)
    table = rng.integers(0, 2, size=(32, 63), dtype=np.uint8)

    h_dists = batch_hamming_distances(cand, table)
    l_dists = batch_levenshtein_distances(cand, table)

    for i in range(32):
        assert h_dists[i] == hamming_distance(cand, table[i])
        assert l_dists[i] == levenshtein_distance(cand, table[i])
        assert l_dists[i] <= h_dists[i]
