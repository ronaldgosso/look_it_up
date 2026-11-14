"""End-to-end tests for watermark embedding, TI consistency, extraction, and CLI."""

import json

import pytest

from llmw_codebook.bch import BCHCodec
from llmw_codebook.cli import main as cli_main
from llmw_codebook.codebook import LinearCodebook
from llmw_codebook.models import BuiltinNGramModel
from llmw_codebook.watermark import WatermarkEmbedder, WatermarkExtractor


def test_tokenizer_exhibits_inconsistency_and_embedder_prevents_it() -> None:
    model = BuiltinNGramModel(entropy_mode="base")
    # Demonstrate real greedy-merge TI on subwords (" water" + "mark" -> " watermark").
    tok_water = model.tokenizer.token_to_id[" water"]
    tok_mark = model.tokenizer.token_to_id["mark"]
    merged_text = model.decode([tok_water, tok_mark])
    assert merged_text == " watermark"
    assert len(model.encode(merged_text)) == 1  # 2 tokens collapsed to 1!

    cb = LinearCodebook("ti-key-1", n=10, u=63)
    embedder = WatermarkEmbedder(model, secret_key="ti-key-1", delta=6.0, enforce_ti_consistency=True)
    res = embedder.embed_with_codebook("Write a review of a wireless charger:", 513, cb)

    # Stepwise check ensures exact token-count preservation on retokenization.
    assert len(res.generated_token_ids) == 63
    assert len(model.encode(res.generated_text)) == 63


@pytest.mark.parametrize("metric", ["hamming", "levenshtein"])
def test_codebook_embed_and_extract_roundtrip(metric: str) -> None:
    key = "portfolio-demo-key"
    n, u = 12, 127
    watermark = 2749
    model = BuiltinNGramModel(entropy_mode="base")
    cb = LinearCodebook(key, n=n, u=u)

    embedder = WatermarkEmbedder(model, secret_key=key, delta=6.0)
    extractor = WatermarkExtractor(model, secret_key=key)

    emb = embedder.embed_with_codebook(
        "The compact wireless charger for travel laptops", watermark, cb
    )
    assert emb.embedded_bit_accuracy >= 0.90

    ext = extractor.extract_from_codebook(
        emb.generated_text, cb, metric=metric, threshold=25, include_alignment=True
    )
    assert ext.watermark == watermark
    assert ext.is_watermarked is True
    assert ext.distance <= 15
    assert ext.margin is not None and ext.margin >= 10

    # Extraction with the wrong secret key should fail threshold verification.
    wrong_cb = LinearCodebook("wrong-secret-key", n=n, u=u)
    wrong_ext = WatermarkExtractor(model, secret_key="wrong-secret-key").extract_from_codebook(
        emb.generated_text, wrong_cb, metric=metric, threshold=25
    )
    assert wrong_ext.is_watermarked is False
    assert wrong_ext.distance > 25


def test_bch_embed_and_extract_roundtrip() -> None:
    key = "bch-secret-key"
    watermark = 0x5A3C
    model = BuiltinNGramModel(entropy_mode="base")
    bch = BCHCodec(watermark_bits=16, codeword_length=127)

    embedder = WatermarkEmbedder(model, secret_key=key, delta=6.0)
    extractor = WatermarkExtractor(model, secret_key=key)
    emb = embedder.embed_with_bch("Historically, port cities adapted rapidly", watermark, bch)
    ext = extractor.extract_from_bch(emb.generated_text, bch, threshold=23)

    assert ext.watermark == watermark
    assert ext.is_watermarked is True
    assert ext.distance <= 10


def test_levenshtein_survives_word_deletion_where_hamming_breaks() -> None:
    key = "frameshift-demo"
    n, u = 10, 127
    watermark = 612
    model = BuiltinNGramModel(entropy_mode="base")
    cb = LinearCodebook(key, n=n, u=u)
    embedder = WatermarkEmbedder(model, secret_key=key, delta=6.0)
    extractor = WatermarkExtractor(model, secret_key=key)

    emb = embedder.embed_with_codebook("Battery life easily lasts through a full workday", watermark, cb)
    # Delete 3 words near the beginning of the generated text, inducing a bit-stream frameshift.
    words = emb.generated_text.split(" ")
    attacked_text = " ".join(words[:4] + words[7:])

    lev_ext = extractor.extract_from_codebook(attacked_text, cb, metric="levenshtein")
    ham_ext = extractor.extract_from_codebook(attacked_text, cb, metric="hamming")

    assert lev_ext.watermark == watermark
    assert lev_ext.distance < ham_ext.distance


def test_cli_info_and_roundtrip(capsys: pytest.CaptureFixture[str]) -> None:
    rc_info = cli_main(["info", "-n", "10", "-u", "127"])
    assert rc_info == 0
    info_out = json.loads(capsys.readouterr().out)
    assert info_out["hamming_spread"]["zero_spread"] is True
    assert info_out["bch"]["native_length"] == 127

    rc_rt = cli_main(["roundtrip", "-n", "10", "-u", "127", "--watermark", "421"])
    assert rc_rt == 0
    rt_out = json.loads(capsys.readouterr().out)
    assert rt_out["exact_match"] is True
    assert rt_out["recovered_watermark"] == 421
