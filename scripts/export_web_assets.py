"""Export synchronized model weights, attack lexicons, WASM binary, and benchmarks for web/."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from llmw_codebook.attacks import _INSERTION_WORDS, _PHRASE_REWRITES, _SYNONYMS
from llmw_codebook.models import BuiltinNGramModel


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    web_dir = repo_root / "web"
    public_dir = web_dir / "public"
    engine_dir = web_dir / "src" / "engine"
    public_dir.mkdir(parents=True, exist_ok=True)
    engine_dir.mkdir(parents=True, exist_ok=True)

    # Export exact BuiltinNGramModel weights & tokenizer vocabulary for bit-exact browser inference.
    model = BuiltinNGramModel(entropy_mode="base")
    bigram = {
        str(k): {str(nk): int(cnt) for nk, cnt in counter.items()}
        for k, counter in model._bigram.items()
    }
    trigram = {
        f"{k[0]},{k[1]}": {str(nk): int(cnt) for nk, cnt in counter.items()}
        for k, counter in model._trigram.items()
    }
    model_payload = {
        "vocab": model.tokenizer.vocab,
        "unigramLogits": [round(float(x), 6) for x in model._unigram_logits],
        "punctIds": model._punct_ids,
        "spaceWordIds": model._space_word_ids,
        "bigram": bigram,
        "trigram": trigram,
        "insertionWords": list(_INSERTION_WORDS),
        "synonyms": {k: list(v) for k, v in _SYNONYMS.items()},
        "phraseRewrites": [list(pair) for pair in _PHRASE_REWRITES],
    }
    out_model = engine_dir / "modelData.json"
    out_model.write_text(json.dumps(model_payload), encoding="utf-8")

    wasm_src = repo_root / "target" / "wasm32-unknown-unknown" / "release" / "llmw_wasm.wasm"
    if wasm_src.is_file():
        shutil.copy2(wasm_src, public_dir / "llmw_wasm.wasm")
    bench_src = repo_root / "benchmarks" / "results.json"
    if bench_src.is_file():
        shutil.copy2(bench_src, public_dir / "benchmarks.json")

    print(
        f"Exported {out_model} ({out_model.stat().st_size:,} bytes), "
        f"WASM exists={(public_dir / 'llmw_wasm.wasm').is_file()}"
    )


if __name__ == "__main__":
    main()
