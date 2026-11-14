"""Hamming and Levenshtein distance primitives, alignment, and batch search."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

import numpy as np

EditKind = Literal["match", "substitute", "insert", "delete"]


@dataclass(frozen=True)
class EditOp:
    """Single aligned operation transforming ``source`` into ``target``."""

    kind: EditKind
    source_idx: int | None
    target_idx: int | None
    source_bit: int | None
    target_bit: int | None


@dataclass(frozen=True)
class AlignmentResult:
    """Full Levenshtein edit distance and optimal alignment transcript."""

    distance: int
    ops: tuple[EditOp, ...]


def _bits_to_int(seq: Sequence[int] | np.ndarray) -> int:
    val = 0
    for idx, bit in enumerate(seq):
        if int(bit) & 1:
            val |= 1 << idx
    return val


def hamming_distance(a: Sequence[int] | np.ndarray, b: Sequence[int] | np.ndarray) -> int:
    """Compute Hamming distance between two equal-length binary sequences."""
    arr_a = np.asarray(a, dtype=np.uint8)
    arr_b = np.asarray(b, dtype=np.uint8)
    if arr_a.shape != arr_b.shape:
        raise ValueError(f"Shape mismatch for Hamming distance: {arr_a.shape} vs {arr_b.shape}")
    return int(np.count_nonzero(arr_a != arr_b))


def batch_hamming_distances(candidate: np.ndarray, codewords: np.ndarray) -> np.ndarray:
    """Vectorized Hamming distance from ``candidate`` (u,) to each row in ``codewords`` (M, u)."""
    cand = np.asarray(candidate, dtype=np.uint8)
    cw = np.asarray(codewords, dtype=np.uint8)
    if cw.ndim != 2 or cw.shape[1] != cand.shape[0]:
        raise ValueError(f"Expected codewords shape (M, {cand.shape[0]}), got {cw.shape}")
    return np.count_nonzero(cw != cand, axis=1).astype(np.int32)


def levenshtein_distance(
    a: Sequence[int] | np.ndarray,
    b: Sequence[int] | np.ndarray,
    use_native: bool = True,
) -> int:
    """Exact binary Levenshtein distance via Myers' bit-parallel algorithm.

    Operates in O(|b|) arbitrary-precision bit operations on binary sequences,
    producing exact edit distance matching Wagner-Fischer DP.
    """
    if use_native:
        from llmw_codebook._rust_accel import is_native_available, native_levenshtein

        if is_native_available():
            return native_levenshtein(np.asarray(a, dtype=np.uint8), np.asarray(b, dtype=np.uint8))

    m = len(a)
    n = len(b)
    if m == 0:
        return n
    if n == 0:
        return m

    # Use shorter sequence as pattern for maximum speed.
    if m > n:
        a, b = b, a
        m, n = n, m

    mask_all = (1 << m) - 1
    high_bit = 1 << (m - 1)
    peq1 = _bits_to_int(a)
    peq0 = mask_all ^ peq1

    pv = mask_all
    mv = 0
    score = m

    for bit in b:
        eq = peq1 if (int(bit) & 1) else peq0
        xv = eq | mv
        xh = (((eq & pv) + pv) ^ pv) | eq
        ph = mv | (~(xh | pv) & mask_all)
        mh = pv & xh

        if ph & high_bit:
            score += 1
        elif mh & high_bit:
            score -= 1

        ph = ((ph << 1) | 1) & mask_all
        mh = (mh << 1) & mask_all
        pv = mh | (~(xv | ph) & mask_all)
        mv = ph & xv

    return score


def batch_levenshtein_distances(
    candidate: np.ndarray,
    codewords: np.ndarray,
) -> np.ndarray:
    """Compute exact Levenshtein distance from ``candidate`` (u,) to every row of ``codewords``."""
    cand_list = [int(x) for x in candidate]
    m = len(cand_list)
    if m == 0:
        return np.full(codewords.shape[0], codewords.shape[1], dtype=np.int32)

    mask_all = (1 << m) - 1
    high_bit = 1 << (m - 1)
    peq1 = _bits_to_int(cand_list)
    peq0 = mask_all ^ peq1

    num_rows = codewords.shape[0]
    distances = np.empty(num_rows, dtype=np.int32)

    for row_idx in range(num_rows):
        pv = mask_all
        mv = 0
        score = m
        row = codewords[row_idx]
        for bit in row:
            eq = peq1 if bit else peq0
            xv = eq | mv
            xh = (((eq & pv) + pv) ^ pv) | eq
            ph = mv | (~(xh | pv) & mask_all)
            mh = pv & xh
            if ph & high_bit:
                score += 1
            elif mh & high_bit:
                score -= 1
            ph = ((ph << 1) | 1) & mask_all
            mh = (mh << 1) & mask_all
            pv = mh | (~(xv | ph) & mask_all)
            mv = ph & xv
        distances[row_idx] = score

    return distances


def levenshtein_alignment(
    source: Sequence[int] | np.ndarray,
    target: Sequence[int] | np.ndarray,
) -> AlignmentResult:
    """Compute exact Levenshtein distance and backtraced edit operations."""
    s = [int(x) & 1 for x in source]
    t = [int(x) & 1 for x in target]
    m, n = len(s), len(t)

    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j

    for i in range(1, m + 1):
        si = s[i - 1]
        row = dp[i]
        prev = dp[i - 1]
        for j in range(1, n + 1):
            cost = 0 if si == t[j - 1] else 1
            row[j] = min(
                prev[j] + 1,       # delete from source
                row[j - 1] + 1,    # insert into source
                prev[j - 1] + cost # match / substitute
            )

    ops: list[EditOp] = []
    i, j = m, n
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            cost = 0 if s[i - 1] == t[j - 1] else 1
            if dp[i][j] == dp[i - 1][j - 1] + cost:
                kind: EditKind = "match" if cost == 0 else "substitute"
                ops.append(EditOp(kind, i - 1, j - 1, s[i - 1], t[j - 1]))
                i -= 1
                j -= 1
                continue
        if i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            ops.append(EditOp("delete", i - 1, None, s[i - 1], None))
            i -= 1
        else:
            ops.append(EditOp("insert", None, j - 1, None, t[j - 1]))
            j -= 1

    ops.reverse()
    return AlignmentResult(distance=dp[m][n], ops=tuple(ops))
