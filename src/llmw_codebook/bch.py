"""Binary BCH error-correcting code variant with optional code shortening.

Implements Section IV and Appendix D of 'Look It Up: Multi-bit LLM Watermarking
via Codebook Search' (arXiv:2611.16890), including narrow-sense primitive
binary BCH encoding, syndrome computation, Berlekamp-Massey error-locator
synthesis, Chien search, and Table V parameter configurations.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from llmw_codebook.codebook import bits_to_int, int_to_bits

# Primitive polynomials over GF(2) for degrees m = 4..8.
# Bit i represents coefficient of x^i.
_PRIMITIVE_POLYS: dict[int, int] = {
    4: 0b10011,      # x^4 + x + 1
    5: 0b100101,     # x^5 + x^2 + 1
    6: 0b1000011,    # x^6 + x + 1
    7: 0b10001001,   # x^7 + x^3 + 1
    8: 0b100011101,  # x^8 + x^4 + x^3 + x^2 + 1
}


@dataclass(frozen=True)
class BCHParameters:
    """Resolved BCH code parameters including any code shortening (Appendix D)."""

    watermark_bits: int
    codeword_length: int
    native_length: int
    field_degree: int
    message_capacity: int
    shortening_bits: int
    correction_capability: int

    @property
    def correction_rate(self) -> float:
        return self.correction_capability / self.codeword_length


class _GF2m:
    """Finite field GF(2^m) lookup tables."""

    def __init__(self, m: int) -> None:
        if m not in _PRIMITIVE_POLYS:
            raise ValueError(f"Unsupported BCH field degree m={m}; expected 4..8")
        self.m = m
        self.size = 1 << m
        self.n0 = self.size - 1
        prim = _PRIMITIVE_POLYS[m]

        self.exp = [0] * (2 * self.n0)
        self.log = [-1] * self.size

        x = 1
        for i in range(self.n0):
            self.exp[i] = x
            self.exp[i + self.n0] = x
            self.log[x] = i
            x <<= 1
            if x & self.size:
                x ^= prim

    def mul(self, a: int, b: int) -> int:
        if a == 0 or b == 0:
            return 0
        return self.exp[self.log[a] + self.log[b]]

    def div(self, a: int, b: int) -> int:
        if b == 0:
            raise ZeroDivisionError("Division by zero in GF(2^m)")
        if a == 0:
            return 0
        return self.exp[(self.log[a] - self.log[b]) % self.n0]

    def pow_alpha(self, exponent: int) -> int:
        return self.exp[exponent % self.n0]


def _poly_mul_gf2(a: int, b: int) -> int:
    """Multiply two polynomials over GF(2) represented as bitmasks."""
    res = 0
    while b:
        if b & 1:
            res ^= a
        a <<= 1
        b >>= 1
    return res


def _poly_mod_gf2(dividend: int, divisor: int) -> int:
    """Compute dividend mod divisor over GF(2)."""
    deg_div = divisor.bit_length() - 1
    while dividend and (dividend.bit_length() - 1) >= deg_div:
        shift = (dividend.bit_length() - 1) - deg_div
        dividend ^= divisor << shift
    return dividend


def _minimal_poly_gf2(gf: _GF2m, root_exp: int) -> int:
    """Compute the minimal polynomial over GF(2) for alpha^root_exp."""
    coset: list[int] = []
    cur = root_exp % gf.n0
    while cur not in coset:
        coset.append(cur)
        cur = (cur * 2) % gf.n0

    # Multiply (x - alpha^e) over GF(2^m); resulting coefficients lie in GF(2).
    coeffs = [1]  # constant term first: coeffs[0] + coeffs[1]*x + ...
    for e in coset:
        root = gf.pow_alpha(e)
        next_coeffs = [0] * (len(coeffs) + 1)
        for idx, c in enumerate(coeffs):
            next_coeffs[idx] ^= gf.mul(c, root)
            next_coeffs[idx + 1] ^= c
        coeffs = next_coeffs

    poly = 0
    for idx, c in enumerate(coeffs):
        if c & 1:
            poly |= 1 << idx
    return poly


def _choose_bch_spec(n: int, u: int) -> tuple[int, int, int]:
    """Select native (m, k, t) maximizing t while supporting watermark_bits <= k."""
    m = 4
    while ((1 << m) - 1) < u:
        m += 1
    if m > 8:
        raise ValueError(f"Codeword length u={u} exceeds max supported BCH length 255")

    n0 = (1 << m) - 1
    shortening = n0 - u
    gf = _GF2m(m)

    # Precompute cyclotomic cosets and their degrees.
    seen: set[int] = set()
    cosets: list[tuple[set[int], int]] = []
    for a in range(1, n0):
        if a in seen:
            continue
        elems: set[int] = set()
        cur = a
        while cur not in elems:
            elems.add(cur)
            seen.add(cur)
            cur = (cur * 2) % n0
        cosets.append((elems, len(elems)))

    best_k = -1
    best_t = 0
    for t in range(1, n0 // 2 + 1):
        parity_deg = sum(deg for elems, deg in cosets if any(1 <= e <= 2 * t for e in elems))
        k = n0 - parity_deg
        usable_k = k - shortening
        if usable_k >= n:
            best_k = k
            best_t = t
        elif k < shortening + n:
            break

    if best_t == 0:
        raise ValueError(f"No valid BCH code for n={n}, u={u} (n0={n0}, shortening={shortening})")
    return m, best_k, best_t


class BCHCodec:
    """Systematic narrow-sense primitive binary BCH encoder/decoder."""

    def __init__(self, watermark_bits: int, codeword_length: int) -> None:
        if watermark_bits < 1 or codeword_length <= watermark_bits:
            raise ValueError(f"Require 1 <= n < u, got n={watermark_bits}, u={codeword_length}")

        m, k, t = _choose_bch_spec(watermark_bits, codeword_length)
        n0 = (1 << m) - 1
        gf = _GF2m(m)

        # Build generator polynomial g(x) = lcm_{i=1..2t} M_i(x).
        gen_poly = 1
        covered: set[int] = set()
        for root_exp in range(1, 2 * t + 1):
            if root_exp in covered:
                continue
            cur = root_exp % n0
            while cur not in covered:
                covered.add(cur)
                cur = (cur * 2) % n0
            gen_poly = _poly_mul_gf2(gen_poly, _minimal_poly_gf2(gf, root_exp))

        parity_len = gen_poly.bit_length() - 1
        actual_k = n0 - parity_len
        if actual_k != k:
            raise RuntimeError(f"Internal BCH degree mismatch: {actual_k} != {k}")

        self.gf = gf
        self.gen_poly = gen_poly
        self.parity_len = parity_len
        self.params = BCHParameters(
            watermark_bits=watermark_bits,
            codeword_length=codeword_length,
            native_length=n0,
            field_degree=m,
            message_capacity=k,
            shortening_bits=n0 - codeword_length,
            correction_capability=t,
        )

    def encode(self, watermark: int) -> np.ndarray:
        """Encode ``watermark`` (n-bit int) into a u-bit shortened systematic BCH codeword."""
        w_bits = int_to_bits(watermark, self.params.watermark_bits)
        # Layout in native k-bit message:
        # [shortening zeros] + [watermark_bits] + [padding zeros to k]
        k = self.params.message_capacity
        msg_int = 0
        offset = self.params.shortening_bits
        for idx, bit in enumerate(w_bits):
            if bit:
                msg_int |= 1 << (k - 1 - (offset + idx))

        # Systematic encoding: c(x) = m(x)*x^(n0-k) + (m(x)*x^(n0-k) mod g(x)).
        shifted = msg_int << self.parity_len
        rem = _poly_mod_gf2(shifted, self.gen_poly)
        native_cw_int = shifted ^ rem

        # Omit the top shortening_bits (known zeros) -> emit u bits.
        u = self.params.codeword_length
        return np.array(
            [(native_cw_int >> (u - 1 - pos)) & 1 for pos in range(u)],
            dtype=np.uint8,
        )

    def decode(self, received: np.ndarray) -> tuple[int, int, np.ndarray]:
        """Decode received u-bit vector.

        Returns ``(watermark, bit_flips, corrected_codeword)`` where ``bit_flips``
        is the Hamming distance between ``received`` and the reconstructed codeword
        (Section IV confidence metric).
        """
        arr = np.asarray(received, dtype=np.uint8)
        u = self.params.codeword_length
        if arr.shape != (u,):
            raise ValueError(f"Expected received vector of length {u}, got {arr.shape}")

        # Reconstruct full n0-bit word by prepending known shortening zeros.
        n0 = self.params.native_length
        recv_int = 0
        for pos, bit in enumerate(arr):
            if int(bit) & 1:
                recv_int |= 1 << (u - 1 - pos)

        t = self.params.correction_capability
        syndromes = self._compute_syndromes(recv_int, 2 * t)
        if not any(syndromes):
            corrected_int = recv_int
        else:
            err_positions = self._berlekamp_massey_chien(syndromes, t)
            corrected_int = recv_int
            for pos in err_positions:
                corrected_int ^= 1 << pos

        # Extract watermark from native systematic positions (after shortening zeros).
        k = self.params.message_capacity
        msg_int = corrected_int >> self.parity_len
        start_shift = k - 1 - self.params.shortening_bits
        w_bits = np.array(
            [(msg_int >> (start_shift - idx)) & 1 for idx in range(self.params.watermark_bits)],
            dtype=np.uint8,
        )
        watermark = bits_to_int(w_bits)
        reencoded = self.encode(watermark)
        bit_flips = int(np.count_nonzero(arr != reencoded))
        return watermark, bit_flips, reencoded

    def _compute_syndromes(self, poly_int: int, count: int) -> list[int]:
        """Evaluate r(alpha^j) for j = 1..count using Horner's rule over GF(2^m)."""
        gf = self.gf
        n0 = self.params.native_length
        # Extract set bit positions once; only bits set to 1 contribute alpha^(i*j).
        set_bits = [i for i in range(n0) if (poly_int >> i) & 1]
        syndromes: list[int] = []
        for j in range(1, count + 1):
            acc = 0
            for bit_pos in set_bits:
                acc ^= gf.pow_alpha(bit_pos * j)
            syndromes.append(acc)
        return syndromes

    def _berlekamp_massey_chien(self, syndromes: list[int], t: int) -> list[int]:
        """Find error-bit indices via Berlekamp-Massey + Chien search."""
        gf = self.gf
        n0 = self.params.native_length
        # Binary-field Berlekamp-Massey for syndromes S_1 .. S_{2t}.
        c = [1] + [0] * (2 * t)
        b = [1] + [0] * (2 * t)
        L = 0
        m_shift = 1
        b_disc = 1

        for n_step in range(2 * t):
            discrepancy = syndromes[n_step]
            for i in range(1, L + 1):
                if c[i] and syndromes[n_step - i]:
                    discrepancy ^= gf.mul(c[i], syndromes[n_step - i])

            if discrepancy == 0:
                m_shift += 1
            elif 2 * L <= n_step:
                temp = c[:]
                coef = gf.div(discrepancy, b_disc)
                for i in range(m_shift, 2 * t + 1):
                    if b[i - m_shift]:
                        c[i] ^= gf.mul(coef, b[i - m_shift])
                L = n_step + 1 - L
                b = temp
                b_disc = discrepancy
                m_shift = 1
            else:
                coef = gf.div(discrepancy, b_disc)
                for i in range(m_shift, 2 * t + 1):
                    if b[i - m_shift]:
                        c[i] ^= gf.mul(coef, b[i - m_shift])
                m_shift += 1

        if L > t:
            return []

        # Chien search: find roots alpha^(-p) of Lambda(x) = sum_{i=0..L} c[i] x^i.
        lambda_poly = c[: L + 1]
        positions: list[int] = []
        for pos in range(n0):
            x = gf.pow_alpha(n0 - pos)
            val = 0
            x_pow = 1
            for coef in lambda_poly:
                if coef:
                    val ^= gf.mul(coef, x_pow)
                x_pow = gf.mul(x_pow, x)
            if val == 0:
                positions.append(pos)

        return positions if len(positions) == L else []
