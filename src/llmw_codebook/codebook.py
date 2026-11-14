"""Codebook construction, nearest-neighbor lookup, and coding-theory diagnostics.

Implements Section III-A, Section III-D, Appendix C, and Appendix E of
'Look It Up: Multi-bit LLM Watermarking via Codebook Search' (arXiv:2611.16890).
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal

import numpy as np

from llmw_codebook._prng import SplitMix64, sha256_seed64
from llmw_codebook.distances import (
    batch_hamming_distances,
    batch_levenshtein_distances,
    hamming_distance,
    levenshtein_distance,
)

DistanceMetric = Literal["hamming", "levenshtein"]
ConstructionKind = Literal["linear", "rng"]


@dataclass(frozen=True)
class CodebookMatch:
    """Nearest-neighbor codebook search result."""

    watermark: int
    distance: int
    second_best_distance: int | None
    codeword: np.ndarray

    @property
    def margin(self) -> int | None:
        if self.second_best_distance is None:
            return None
        return self.second_best_distance - self.distance


@dataclass(frozen=True)
class SpreadStats:
    """Nearest-neighbor distance statistics across sampled codewords (Appendix E)."""

    metric: DistanceMetric
    sample_size: int
    min_distance: int
    mean_distance: float
    max_distance: int
    zero_spread: bool


def int_to_bits(value: int, width: int) -> np.ndarray:
    """Convert non-negative integer ``value`` to big-endian bit vector of length ``width``."""
    if value < 0 or value >= (1 << width):
        raise ValueError(f"Watermark {value} out of range for {width}-bit space [0, {1 << width})")
    return np.array([(value >> (width - 1 - bit)) & 1 for bit in range(width)], dtype=np.uint8)


def bits_to_int(bits: np.ndarray) -> int:
    """Convert big-endian bit vector back to non-negative integer."""
    out = 0
    for b in bits:
        out = (out << 1) | (int(b) & 1)
    return out


def binary_entropy(p: float) -> float:
    """Binary entropy function H_2(p) in bits."""
    if p <= 0.0 or p >= 1.0:
        return 0.0
    return -p * math.log2(p) - (1.0 - p) * math.log2(1.0 - p)


def collision_probability_bound(n: int, u: int) -> tuple[int, float]:
    """Return ``(exponent, bound)`` for Eq. (1): Pr[any collision] <= 2^(2n - u - 1)."""
    exp = 2 * n - u - 1
    bound = math.ldexp(1.0, exp) if exp < 1024 else float("inf")
    return exp, min(1.0, bound)


def gilbert_varshamov_distance(n: int, u: int) -> int:
    """Compute Gilbert-Varshamov minimum distance d_GV satisfying H_2(d/u) <= 1 - n/u."""
    if n >= u:
        return 1
    target_rate = 1.0 - (n / u)
    best_d = 1
    for d in range(1, u // 2 + 1):
        if binary_entropy(d / u) <= target_rate:
            best_d = d
        else:
            break
    return best_d


def derive_linear_params(secret_key: str, n: int, u: int) -> tuple[np.ndarray, np.ndarray]:
    """Derive generator matrix G (n x u) and affine offset r (u,) per Appendix C Eq. (2)-(3)."""
    if n < 1 or u <= n:
        raise ValueError(f"Require 1 <= n < u, got n={n}, u={u}")
    key_bytes = secret_key.encode("utf-8")
    seed_g = sha256_seed64(key_bytes + b"linear-G")
    seed_r = sha256_seed64(key_bytes + b"linear-r")

    rng_g = SplitMix64(seed_g)
    g_flat = rng_g.next_bits(n * u)
    g_mat = g_flat.reshape((n, u))

    rng_r = SplitMix64(seed_r)
    r_vec = rng_r.next_bits(u)
    return g_mat, r_vec


class BaseCodebook(ABC):
    """Shared interface for precomputed or on-demand multi-bit watermarks."""

    construction_name: ConstructionKind = "linear"

    def __init__(
        self,
        secret_key: str,
        n: int,
        u: int,
        max_materialize_n: int = 20,
        use_native: bool = True,
    ) -> None:
        if n < 1 or u <= n:
            raise ValueError(f"Require 1 <= n < u, got n={n}, u={u}")
        self.secret_key = secret_key
        self.n = n
        self.u = u
        self.num_entries = 1 << n
        self._max_materialize_n = max_materialize_n
        self._use_native = use_native
        self._table: np.ndarray | None = None
        self._native_handle = None

    def _get_native_handle(self):
        if not self._use_native or self.n > 24 or self.u > 256:
            return None
        if self._native_handle is None:
            from llmw_codebook._rust_accel import NativeCodebookHandle, is_native_available

            if is_native_available():
                self._native_handle = NativeCodebookHandle(
                    self.secret_key, self.n, self.u, self.construction_name
                )
        return self._native_handle

    @property
    def table(self) -> np.ndarray:
        """Lazily materialize the full (2^n, u) codeword matrix."""
        if self._table is None:
            if self.n > self._max_materialize_n:
                raise MemoryError(
                    f"Refusing to materialize 2^{self.n} ({self.num_entries:,}) codewords "
                    f"above max_materialize_n={self._max_materialize_n}; pass a higher limit explicitly."
                )
            self._table = self._build_table()
        return self._table

    @abstractmethod
    def encode(self, watermark: int) -> np.ndarray:
        """Map an n-bit integer watermark W to its u-bit codeword L_W."""

    @abstractmethod
    def _build_table(self) -> np.ndarray:
        """Materialize all 2^n codewords as a uint8 array of shape (2^n, u)."""

    def search(
        self,
        candidate: np.ndarray,
        metric: DistanceMetric = "levenshtein",
    ) -> CodebookMatch:
        """Find the nearest codeword in C to ``candidate`` under Hamming or Levenshtein distance."""
        cand = np.asarray(candidate, dtype=np.uint8)
        if metric == "hamming" and cand.shape[0] != self.u:
            raise ValueError(
                f"Hamming search requires candidate of length u={self.u}, got {cand.shape[0]}"
            )
        handle = self._get_native_handle()
        if handle is not None and metric in ("hamming", "levenshtein"):
            wm, dist, second, cw = handle.search(cand, metric=metric)
            return CodebookMatch(
                watermark=wm,
                distance=dist,
                second_best_distance=second,
                codeword=cw,
            )

        table = self.table
        if metric == "hamming":
            dists = batch_hamming_distances(cand, table)
            return self._extract_top_match(dists, table)

        if metric == "levenshtein":
            # Exact branch-and-bound using bit-count lower bound:
            # max(|ones(a) - ones(b)|, |zeros(a) - zeros(b)|) <= d_Lev(a, b).
            cand_len = int(cand.shape[0])
            cand_ones = int(np.count_nonzero(cand))
            cand_zeros = cand_len - cand_ones
            row_ones = np.count_nonzero(table, axis=1).astype(np.int32)
            row_zeros = self.u - row_ones
            lower_bounds = np.maximum(np.abs(row_ones - cand_ones), np.abs(row_zeros - cand_zeros))

            # Seed upper bounds from best Hamming/length-matched candidates first.
            if cand_len == self.u:
                ham_dists = batch_hamming_distances(cand, table)
                seed_order = np.argsort(ham_dists, kind="mergesort")[: min(8, self.num_entries)]
            else:
                seed_order = np.argsort(lower_bounds, kind="mergesort")[: min(8, self.num_entries)]

            best_idx = -1
            best_dist = 1 << 30
            second_dist: int | None = None
            seen_seeds: set[int] = set()

            def _consider(row_idx: int, dist: int) -> None:
                nonlocal best_idx, best_dist, second_dist
                if dist < best_dist:
                    if best_idx != -1:
                        second_dist = best_dist
                    best_dist = dist
                    best_idx = row_idx
                elif second_dist is None or dist < second_dist:
                    second_dist = dist

            for raw_idx in seed_order:
                idx = int(raw_idx)
                seen_seeds.add(idx)
                _consider(idx, levenshtein_distance(cand, table[idx]))

            prune_cutoff = second_dist if second_dist is not None else best_dist
            candidate_indices = np.flatnonzero(lower_bounds <= prune_cutoff)
            # Visit tightest lower bounds first so bounds shrink quickly.
            ordered = candidate_indices[np.argsort(lower_bounds[candidate_indices], kind="mergesort")]
            for raw_idx in ordered:
                idx = int(raw_idx)
                if idx in seen_seeds:
                    continue
                prune_cutoff = second_dist if second_dist is not None else best_dist
                if int(lower_bounds[idx]) > prune_cutoff:
                    break
                _consider(idx, levenshtein_distance(cand, table[idx]))

            return CodebookMatch(
                watermark=best_idx,
                distance=best_dist,
                second_best_distance=second_dist,
                codeword=table[best_idx].copy(),
            )

        raise ValueError(f"Unsupported metric: {metric!r}")

    def _extract_top_match(self, dists: np.ndarray, table: np.ndarray) -> CodebookMatch:
        if len(dists) == 1:
            return CodebookMatch(
                watermark=0,
                distance=int(dists[0]),
                second_best_distance=None,
                codeword=table[0].copy(),
            )
        top2 = np.argpartition(dists, 1)[:2]
        i0, i1 = int(top2[0]), int(top2[1])
        if dists[i1] < dists[i0] or (dists[i1] == dists[i0] and i1 < i0):
            i0, i1 = i1, i0
        return CodebookMatch(
            watermark=i0,
            distance=int(dists[i0]),
            second_best_distance=int(dists[i1]),
            codeword=table[i0].copy(),
        )


class LinearCodebook(BaseCodebook):
    """Affine linear codebook over GF(2): L_W = bits(W) * G mod 2 XOR r."""

    construction_name: ConstructionKind = "linear"

    def __init__(
        self,
        secret_key: str,
        n: int,
        u: int,
        max_materialize_n: int = 20,
        use_native: bool = True,
    ) -> None:
        super().__init__(
            secret_key=secret_key,
            n=n,
            u=u,
            max_materialize_n=max_materialize_n,
            use_native=use_native,
        )
        self.generator_matrix, self.offset = derive_linear_params(secret_key, n, u)

    def encode(self, watermark: int) -> np.ndarray:
        w_bits = int_to_bits(watermark, self.n)
        cw = (w_bits @ self.generator_matrix) & 1
        return np.bitwise_xor(cw, self.offset).astype(np.uint8)

    def _build_table(self) -> np.ndarray:
        # Vectorized GF(2) generation in chunks keeps memory predictable.
        out = np.empty((self.num_entries, self.u), dtype=np.uint8)
        g_u8 = self.generator_matrix.astype(np.uint8)
        r_u8 = self.offset.astype(np.uint8)
        bit_shifts = np.arange(self.n - 1, -1, -1, dtype=np.uint32)
        chunk = 1 << 14
        for start in range(0, self.num_entries, chunk):
            end = min(start + chunk, self.num_entries)
            ids = np.arange(start, end, dtype=np.uint32)[:, None]
            w_bits = ((ids >> bit_shifts) & 1).astype(np.uint8)
            out[start:end] = np.bitwise_xor((w_bits @ g_u8) & 1, r_u8)
        return out


class RNGCodebook(BaseCodebook):
    """Independent random codebook baseline: seed_i = SHA256(K || i)."""

    construction_name: ConstructionKind = "rng"

    def encode(self, watermark: int) -> np.ndarray:
        if watermark < 0 or watermark >= self.num_entries:
            raise ValueError(
                f"Watermark {watermark} out of range for {self.n}-bit space [0, {self.num_entries})"
            )
        seed_i = sha256_seed64(self.secret_key.encode("utf-8") + str(watermark).encode("utf-8"))
        return SplitMix64(seed_i).next_bits(self.u)

    def _build_table(self) -> np.ndarray:
        out = np.empty((self.num_entries, self.u), dtype=np.uint8)
        for idx in range(self.num_entries):
            out[idx] = self.encode(idx)
        return out


def create_codebook(
    secret_key: str,
    n: int,
    u: int,
    construction: ConstructionKind = "linear",
    max_materialize_n: int = 20,
    use_native: bool = True,
) -> BaseCodebook:
    """Factory for Linear or RNG codebooks."""
    if construction == "linear":
        return LinearCodebook(
            secret_key=secret_key,
            n=n,
            u=u,
            max_materialize_n=max_materialize_n,
            use_native=use_native,
        )
    if construction == "rng":
        return RNGCodebook(
            secret_key=secret_key,
            n=n,
            u=u,
            max_materialize_n=max_materialize_n,
            use_native=use_native,
        )
    raise ValueError(f"Unknown codebook construction: {construction!r}")


def measure_codebook_spread(
    codebook: BaseCodebook,
    sample_size: int = 500,
    metric: DistanceMetric = "hamming",
    seed: int = 0,
) -> SpreadStats:
    """Measure nearest-neighbor distance spread (Appendix E).

    Samples up to ``sample_size`` entries (or all 2^n entries if smaller) and
    computes each entry's distance to its nearest distinct neighbor in the full
    materialized codebook.
    """
    table = codebook.table
    total = table.shape[0]
    if total < 2:
        raise ValueError("Codebook must contain at least 2 codewords to measure spread")

    count = min(sample_size, total)
    if count == total:
        sample_indices = np.arange(total)
    else:
        rng = np.random.default_rng(seed)
        sample_indices = rng.choice(total, size=count, replace=False)

    nn_dists = np.empty(count, dtype=np.int32)
    for pos, raw_idx in enumerate(sample_indices):
        idx = int(raw_idx)
        row = table[idx]
        if metric == "hamming":
            dists = batch_hamming_distances(row, table)
            dists[idx] = codebook.u + 1
            nn_dists[pos] = int(dists.min())
        elif metric == "levenshtein":
            dists = batch_levenshtein_distances(row, table)
            dists[idx] = codebook.u + 1
            nn_dists[pos] = int(dists.min())
        else:
            raise ValueError(f"Unsupported metric: {metric!r}")

    d_min = int(nn_dists.min())
    d_max = int(nn_dists.max())
    return SpreadStats(
        metric=metric,
        sample_size=count,
        min_distance=d_min,
        mean_distance=float(nn_dists.mean()),
        max_distance=d_max,
        zero_spread=(d_min == d_max),
    )


def exact_linear_minimum_distance(codebook: LinearCodebook) -> int:
    """Compute exact minimum Hamming distance of a LinearCodebook via minimum nonzero weight.

    Uses the linear-code property (Appendix E.2): d_min equals the minimum
    Hamming weight of (bits(W) * G mod 2) over all W in {1, ..., 2^n - 1}.
    """
    table = codebook.table
    linear_only = np.bitwise_xor(table[1:], codebook.offset)
    weights = np.count_nonzero(linear_only, axis=1)
    return int(weights.min())
