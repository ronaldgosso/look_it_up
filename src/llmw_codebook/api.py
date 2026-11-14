"""Optional local FastAPI bridge connecting the Web Studio to Rust FFI & HuggingFace models."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from llmw_codebook._rust_accel import backend_info
from llmw_codebook.attacks import (
    paraphrase_attack,
    synonym_replacement_attack,
    word_deletion_attack,
    word_insertion_attack,
)
from llmw_codebook.bch import BCHCodec
from llmw_codebook.codebook import (
    LinearCodebook,
    collision_probability_bound,
    create_codebook,
    exact_linear_minimum_distance,
    gilbert_varshamov_distance,
)
from llmw_codebook.metrics import evaluate_quality
from llmw_codebook.models import BuiltinNGramModel
from llmw_codebook.watermark import WatermarkEmbedder, WatermarkExtractor

app = FastAPI(
    title="Look It Up — Codebook Watermarking API",
    version="0.3.0",
    description="Local Rust-accelerated API for arXiv:2611.16890 multi-bit LLM watermarking.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_MODELS = {
    "base": BuiltinNGramModel(entropy_mode="base"),
    "instruct": BuiltinNGramModel(entropy_mode="instruct"),
}


class InfoRequest(BaseModel):
    secret_key: str = "demo-secret-key"
    n: int = Field(default=12, ge=4, le=18)
    u: int = Field(default=127, ge=16, le=255)
    construction: Literal["linear", "rng"] = "linear"


class EmbedRequest(BaseModel):
    prompt: str
    watermark: int = Field(ge=0)
    secret_key: str = "demo-secret-key"
    n: int = Field(default=12, ge=4, le=18)
    u: int = Field(default=127, ge=16, le=255)
    delta: float = Field(default=6.0, ge=0.0, le=20.0)
    construction: Literal["linear", "rng"] = "linear"
    method: Literal["levenshtein", "hamming", "bch"] = "levenshtein"
    entropy_mode: Literal["base", "instruct"] = "base"
    enforce_ti: bool = True


class AttackRequest(BaseModel):
    text: str
    attack_type: Literal["word_deletion", "word_insertion", "synonym_swap", "paraphrase"]
    budget: float = Field(default=0.1, ge=0.0, le=0.5)
    seed: int = 0


class ExtractRequest(BaseModel):
    text: str
    secret_key: str = "demo-secret-key"
    n: int = Field(default=12, ge=4, le=18)
    u: int = Field(default=127, ge=16, le=255)
    construction: Literal["linear", "rng"] = "linear"
    method: Literal["levenshtein", "hamming", "bch"] = "levenshtein"
    threshold: int | None = None
    include_alignment: bool = True


@app.get("/api/health")
def health() -> dict[str, object]:
    return {"status": "ok", "engine": backend_info()}


@app.post("/api/info")
def info(req: InfoRequest) -> dict[str, object]:
    if req.u <= req.n:
        raise HTTPException(status_code=400, detail="u must be greater than n")
    exp, bound = collision_probability_bound(req.n, req.u)
    d_gv = gilbert_varshamov_distance(req.n, req.u)
    bch = BCHCodec(req.n, req.u)
    d_min: int | None = None
    if req.construction == "linear" and req.n <= 14:
        cb = LinearCodebook(req.secret_key, req.n, req.u)
        d_min = exact_linear_minimum_distance(cb)
    return {
        "n": req.n,
        "u": req.u,
        "collision_exponent": exp,
        "collision_bound": bound,
        "gilbert_varshamov_d": d_gv,
        "exact_linear_d_min": d_min,
        "bch": {
            "native_length": bch.params.native_length,
            "field_degree": bch.params.field_degree,
            "message_capacity": bch.params.message_capacity,
            "shortening_bits": bch.params.shortening_bits,
            "correction_capability": bch.params.correction_capability,
            "correction_rate": bch.params.correction_rate,
        },
    }


@app.post("/api/embed")
def embed(req: EmbedRequest) -> dict[str, object]:
    if req.u <= req.n or req.watermark >= (1 << req.n):
        raise HTTPException(status_code=400, detail="Invalid watermark/codebook dimensions")
    model = _MODELS[req.entropy_mode]
    embedder = WatermarkEmbedder(
        model,
        secret_key=req.secret_key,
        delta=req.delta,
        enforce_ti_consistency=req.enforce_ti,
    )
    t0 = time.perf_counter()
    if req.method == "bch":
        bch = BCHCodec(req.n, req.u)
        res = embedder.embed_with_bch(req.prompt, req.watermark, bch)
    else:
        cb = create_codebook(req.secret_key, req.n, req.u, construction=req.construction)
        res = embedder.embed_with_codebook(req.prompt, req.watermark, cb)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    qual = evaluate_quality(res.generated_text, model=None)
    return {
        "watermark": res.watermark,
        "codeword": [int(x) for x in res.codeword],
        "generated_text": res.generated_text,
        "embedded_bit_accuracy": res.embedded_bit_accuracy,
        "ti_corrections": res.ti_corrections,
        "latency_ms": round(elapsed_ms, 3),
        "quality": {
            "distinct_1": qual.distinct_1,
            "distinct_2": qual.distinct_2,
            "trigram_rep": qual.trigram_repetition_rate,
        },
        "steps": [
            {
                "step": s.step,
                "target_bit": s.target_bit,
                "token_id": s.token_id,
                "token_text": s.token_text,
                "selected_group": s.selected_group,
                "bias_flipped_choice": s.bias_flipped_choice,
                "pre_bias_margin": round(s.pre_bias_margin, 3),
                "ti_retries": s.ti_retries,
            }
            for s in res.steps
        ],
    }


@app.post("/api/attack")
def attack(req: AttackRequest) -> dict[str, object]:
    model = _MODELS["base"]
    dispatch = {
        "word_deletion": word_deletion_attack,
        "word_insertion": word_insertion_attack,
        "synonym_swap": synonym_replacement_attack,
        "paraphrase": paraphrase_attack,
    }
    res = dispatch[req.attack_type](req.text, model, attack_budget=req.budget, seed=req.seed)
    return {
        "attack_name": res.attack_name,
        "attacked_text": res.attacked_text,
        "original_tokens": res.original_tokens,
        "attacked_tokens": res.attacked_tokens,
        "budget_tokens": res.budget_tokens,
        "modified_tokens": res.modified_tokens,
    }


@app.post("/api/extract")
def extract(req: ExtractRequest) -> dict[str, object]:
    if req.u <= req.n:
        raise HTTPException(status_code=400, detail="u must be greater than n")
    model = _MODELS["base"]
    extractor = WatermarkExtractor(model, secret_key=req.secret_key)
    t0 = time.perf_counter()
    if req.method == "bch":
        bch = BCHCodec(req.n, req.u)
        res = extractor.extract_from_bch(req.text, bch, threshold=req.threshold)
    else:
        cb = create_codebook(req.secret_key, req.n, req.u, construction=req.construction)
        res = extractor.extract_from_codebook(
            req.text,
            cb,
            metric=req.method,
            threshold=req.threshold,
            include_alignment=req.include_alignment,
        )
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    alignment_ops = (
        [
            {
                "kind": op.kind,
                "source_idx": op.source_idx,
                "target_idx": op.target_idx,
                "source_bit": op.source_bit,
                "target_bit": op.target_bit,
            }
            for op in res.alignment.ops
        ]
        if res.alignment is not None
        else []
    )
    return {
        "watermark": res.watermark,
        "distance": res.distance,
        "second_best_distance": res.second_best_distance,
        "margin": res.margin,
        "is_watermarked": res.is_watermarked,
        "candidate_bits": [int(x) for x in res.candidate_bits],
        "matched_codeword": [int(x) for x in res.matched_codeword],
        "method": res.method,
        "latency_ms": round(elapsed_ms, 3),
        "alignment": alignment_ops,
    }


@app.get("/api/benchmarks")
def benchmarks() -> dict[str, object]:
    bench_file = Path(__file__).resolve().parents[2] / "benchmarks" / "results.json"
    if not bench_file.is_file():
        raise HTTPException(status_code=404, detail="Benchmark results not generated yet")
    return json.loads(bench_file.read_text(encoding="utf-8"))
