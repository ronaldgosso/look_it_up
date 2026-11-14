"""Tests for BCH encoding, decoding, and Appendix D Table V parameters."""

import numpy as np
import pytest

from llmw_codebook.bch import BCHCodec


def test_table_v_and_appendix_d_parameters() -> None:
    bch_127_24 = BCHCodec(watermark_bits=24, codeword_length=127)
    assert bch_127_24.params.native_length == 127
    assert bch_127_24.params.field_degree == 7
    assert bch_127_24.params.message_capacity == 29
    assert bch_127_24.params.shortening_bits == 0
    assert bch_127_24.params.correction_capability == 21
    assert bch_127_24.params.correction_rate == pytest.approx(21 / 127)

    bch_200_24 = BCHCodec(watermark_bits=24, codeword_length=200)
    assert bch_200_24.params.native_length == 255
    assert bch_200_24.params.field_degree == 8
    assert bch_200_24.params.message_capacity == 79
    assert bch_200_24.params.shortening_bits == 55
    assert bch_200_24.params.correction_capability == 27
    assert bch_200_24.params.correction_rate == pytest.approx(27 / 200)

    # Appendix D.4: n=32 at u=200 uses BCH(255, 87) shortened by 55 -> t=26.
    bch_200_32 = BCHCodec(watermark_bits=32, codeword_length=200)
    assert bch_200_32.params.native_length == 255
    assert bch_200_32.params.message_capacity == 87
    assert bch_200_32.params.shortening_bits == 55
    assert bch_200_32.params.correction_capability == 26


@pytest.mark.parametrize(
    ("n", "u", "watermark"),
    [
        (16, 127, 0xBEEF),
        (24, 127, 0xA5C391),
        (24, 200, 0x123456),
        (32, 200, 0xDEADBEEF),
    ],
)
def test_bch_corrects_up_to_t_bit_errors(n: int, u: int, watermark: int) -> None:
    codec = BCHCodec(watermark_bits=n, codeword_length=u)
    t = codec.params.correction_capability
    cw = codec.encode(watermark)
    assert cw.shape == (u,)

    # Zero errors
    decoded0, flips0, _ = codec.decode(cw)
    assert decoded0 == watermark
    assert flips0 == 0

    # Exact t random bit flips
    rng = np.random.default_rng(watermark & 0xFFFF)
    for num_err in (1, t // 2, t):
        corrupted = cw.copy()
        err_idx = rng.choice(u, size=num_err, replace=False)
        corrupted[err_idx] ^= 1
        decoded, flips, reencoded = codec.decode(corrupted)
        assert decoded == watermark
        assert flips == num_err
        assert np.array_equal(reencoded, cw)
