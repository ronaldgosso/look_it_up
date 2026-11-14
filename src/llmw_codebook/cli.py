"""Command-line interface for codebook inspection, embedding, and extraction."""

from __future__ import annotations

import argparse
import json
import sys

from llmw_codebook.bch import BCHCodec
from llmw_codebook.codebook import (
    LinearCodebook,
    collision_probability_bound,
    create_codebook,
    exact_linear_minimum_distance,
    gilbert_varshamov_distance,
    measure_codebook_spread,
)
from llmw_codebook.models import BuiltinNGramModel
from llmw_codebook.watermark import WatermarkEmbedder, WatermarkExtractor


def _cmd_info(args: argparse.Namespace) -> int:
    exp, bound = collision_probability_bound(args.n, args.u)
    d_gv = gilbert_varshamov_distance(args.n, args.u)
    payload: dict[str, object] = {
        "n": args.n,
        "u": args.u,
        "construction": args.construction,
        "collision_exponent": exp,
        "collision_bound": bound,
        "gilbert_varshamov_d": d_gv,
    }
    if args.n <= 16:
        cb = create_codebook(args.key, args.n, args.u, construction=args.construction)
        spread = measure_codebook_spread(cb, sample_size=args.sample_size, metric="hamming")
        payload["hamming_spread"] = {
            "min": spread.min_distance,
            "mean": round(spread.mean_distance, 3),
            "max": spread.max_distance,
            "zero_spread": spread.zero_spread,
        }
        if isinstance(cb, LinearCodebook):
            payload["exact_linear_d_min"] = exact_linear_minimum_distance(cb)
    bch = BCHCodec(args.n, args.u)
    payload["bch"] = {
        "native_length": bch.params.native_length,
        "field_degree": bch.params.field_degree,
        "message_capacity": bch.params.message_capacity,
        "shortening_bits": bch.params.shortening_bits,
        "correction_capability_t": bch.params.correction_capability,
        "correction_rate": round(bch.params.correction_rate, 4),
    }
    print(json.dumps(payload, indent=2))
    return 0


def _cmd_roundtrip(args: argparse.Namespace) -> int:
    model = BuiltinNGramModel(entropy_mode=args.entropy)
    embedder = WatermarkEmbedder(model, secret_key=args.key, delta=args.delta)
    extractor = WatermarkExtractor(model, secret_key=args.key)

    if args.method == "bch":
        bch = BCHCodec(args.n, args.u)
        emb = embedder.embed_with_bch(args.prompt, args.watermark, bch)
        ext = extractor.extract_from_bch(emb.generated_text, bch, threshold=args.threshold)
    else:
        cb = create_codebook(args.key, args.n, args.u, construction=args.construction)
        emb = embedder.embed_with_codebook(args.prompt, args.watermark, cb)
        ext = extractor.extract_from_codebook(
            emb.generated_text, cb, metric=args.method, threshold=args.threshold
        )

    out = {
        "method": args.method,
        "embedded_watermark": args.watermark,
        "recovered_watermark": ext.watermark,
        "exact_match": ext.watermark == args.watermark,
        "distance": ext.distance,
        "second_best_distance": ext.second_best_distance,
        "margin": ext.margin,
        "embedded_bit_accuracy": round(emb.embedded_bit_accuracy, 4),
        "ti_corrections": emb.ti_corrections,
        "generated_text_preview": emb.generated_text[:200],
    }
    print(json.dumps(out, indent=2))
    return 0 if out["exact_match"] else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="llmw-codebook",
        description="Multi-bit LLM Watermarking via Codebook Search (arXiv:2611.16890)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    info = sub.add_parser("info", help="Compute theoretical bounds, spread, and BCH parameters")
    info.add_argument("--key", default="demo-secret-key")
    info.add_argument("-n", type=int, default=12)
    info.add_argument("-u", type=int, default=127)
    info.add_argument("--construction", choices=["linear", "rng"], default="linear")
    info.add_argument("--sample-size", type=int, default=200)
    info.set_defaults(func=_cmd_info)

    rt = sub.add_parser("roundtrip", help="Embed and extract a watermark with the built-in LM")
    rt.add_argument("--key", default="demo-secret-key")
    rt.add_argument("-n", type=int, default=12)
    rt.add_argument("-u", type=int, default=127)
    rt.add_argument("--watermark", type=int, default=1337)
    rt.add_argument("--delta", type=float, default=6.0)
    rt.add_argument("--entropy", choices=["base", "instruct"], default="base")
    rt.add_argument("--construction", choices=["linear", "rng"], default="linear")
    rt.add_argument("--method", choices=["hamming", "levenshtein", "bch"], default="levenshtein")
    rt.add_argument("--threshold", type=int, default=None)
    rt.add_argument(
        "--prompt",
        default="Write a product review for a compact wireless charger:",
    )
    rt.set_defaults(func=_cmd_roundtrip)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
