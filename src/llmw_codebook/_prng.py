"""Deterministic hashing, PRNG, and vocabulary splitting primitives.

All primitives use fixed-width 64-bit arithmetic seeded from SHA-256 digests so
that Python and browser/TypeScript implementations produce identical codebooks
and vocabulary partitions for a given secret key.
"""

from __future__ import annotations

import hashlib
import numpy as np

_MASK64 = (1 << 64) - 1


def sha256_seed64(payload: bytes) -> int:
    """Return the first 64 bits of SHA-256(payload) as an unsigned integer."""
    digest = hashlib.sha256(payload).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=False)


def derive_token_seed(secret_key: str, prev_token_id: int | None) -> int:
    """Compute the Algorithm 2 / Algorithm 3 per-step partition seed.

    Uses ``hash(K)`` for the very first generated token (``prev_token_id is None``)
    and ``hash(s^(t-1), K)`` for all subsequent tokens.
    """
    key_bytes = secret_key.encode("utf-8")
    if prev_token_id is None:
        return sha256_seed64(key_bytes)
    token_bytes = str(prev_token_id).encode("utf-8") + b":" + key_bytes
    return sha256_seed64(token_bytes)


class SplitMix64:
    """Fast, cross-platform 64-bit deterministic PRNG."""

    __slots__ = ("_state",)

    def __init__(self, seed: int) -> None:
        self._state = seed & _MASK64

    def next_u64(self) -> int:
        self._state = (self._state + 0x9E3779B97F4A7C15) & _MASK64
        z = self._state
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & _MASK64
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & _MASK64
        return (z ^ (z >> 31)) & _MASK64

    def next_bit(self) -> int:
        return (self.next_u64() >> 63) & 1

    def next_bits(self, count: int) -> np.ndarray:
        """Generate ``count`` i.i.d. Bernoulli(0.5) bits as a uint8 array."""
        out = np.empty(count, dtype=np.uint8)
        idx = 0
        while idx < count:
            word = self.next_u64()
            take = min(64, count - idx)
            for shift in range(take):
                out[idx + shift] = (word >> (63 - shift)) & 1
            idx += take
        return out

    def randbelow(self, upper: int) -> int:
        if upper <= 1:
            return 0
        # Rejection sampling avoids modulo bias across arbitrary vocab sizes.
        limit = (_MASK64 + 1) - ((_MASK64 + 1) % upper)
        while True:
            val = self.next_u64()
            if val < limit:
                return val % upper


def split_vocabulary(vocab_size: int, seed: int, use_native: bool = True) -> np.ndarray:
    """Deterministically partition ``[0, vocab_size)`` into balanced sets V0 and V1.

    Returns a boolean mask ``is_v1`` of shape ``(vocab_size,)`` where ``False``
    indicates ``V0`` and ``True`` indicates ``V1``. Exactly ``vocab_size // 2``
    tokens are assigned to ``V0`` and the remainder to ``V1``.
    """
    if vocab_size < 2:
        raise ValueError(f"vocab_size must be at least 2, got {vocab_size}")
    if use_native:
        from llmw_codebook._rust_accel import is_native_available, native_split_vocab

        if is_native_available():
            return native_split_vocab(vocab_size, seed)
    rng = SplitMix64(seed)
    perm = list(range(vocab_size))
    for i in range(vocab_size - 1, 0, -1):
        j = rng.randbelow(i + 1)
        perm[i], perm[j] = perm[j], perm[i]
    half = vocab_size // 2
    is_v1 = np.zeros(vocab_size, dtype=bool)
    is_v1[perm[half:]] = True
    return is_v1
