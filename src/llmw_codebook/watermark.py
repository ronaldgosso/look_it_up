"""Watermark embedding (Algorithm 2 + Appendix F) and extraction (Algorithm 3)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

import numpy as np

from llmw_codebook._prng import derive_token_seed, split_vocabulary
from llmw_codebook.bch import BCHCodec
from llmw_codebook.codebook import BaseCodebook
from llmw_codebook.distances import AlignmentResult, levenshtein_alignment
from llmw_codebook.models import LanguageModelBackend

ExtractionMethod = Literal["hamming", "levenshtein", "bch"]


@dataclass(frozen=True)
class TokenStepTrace:
    """Per-token telemetry captured during watermark embedding."""

    step: int
    target_bit: int
    token_id: int
    token_text: str
    selected_group: int
    bias_flipped_choice: bool
    pre_bias_margin: float
    ti_retries: int


@dataclass(frozen=True)
class EmbedResult:
    """Output of Algorithm 2 watermark embedding."""

    watermark: int
    codeword: np.ndarray
    prompt_text: str
    generated_token_ids: tuple[int, ...]
    generated_text: str
    steps: tuple[TokenStepTrace, ...]

    @property
    def embedded_bit_accuracy(self) -> float:
        """Fraction of steps where the sampled token fell in the intended group V_{b_t}."""
        if not self.steps:
            return 0.0
        hits = sum(1 for s in self.steps if s.selected_group == s.target_bit)
        return hits / len(self.steps)

    @property
    def ti_corrections(self) -> int:
        return sum(s.ti_retries for s in self.steps)


@dataclass(frozen=True)
class ExtractionResult:
    """Output of Algorithm 3 watermark extraction."""

    watermark: int
    distance: int
    second_best_distance: int | None
    margin: int | None
    is_watermarked: bool
    threshold: int | None
    candidate_bits: np.ndarray
    matched_codeword: np.ndarray
    method: ExtractionMethod
    alignment: AlignmentResult | None = None


def _ensure_consistent_token(
    model: LanguageModelBackend,
    generated_ids: list[int],
    logits_biased: np.ndarray,
    max_ti_retries: int,
) -> tuple[int, int]:
    """Algorithm 2 greedy sampling with Appendix F stepwise TI verification."""
    working = logits_biased.copy()
    retries = 0
    best_fallback = int(np.argmax(working))

    while retries <= max_ti_retries:
        cand_id = int(np.argmax(working))
        if not np.isfinite(working[cand_id]):
            break
        trial_seq = generated_ids + [cand_id]
        round_trip = model.encode(model.decode(trial_seq))
        if len(round_trip) == len(trial_seq):
            return cand_id, retries
        working[cand_id] = -np.inf
        retries += 1

    return best_fallback, retries


class WatermarkEmbedder:
    """Embed u-bit codewords into LLM token streams via Algorithm 2 + Appendix F."""

    def __init__(
        self,
        model: LanguageModelBackend,
        secret_key: str,
        delta: float = 6.0,
        enforce_ti_consistency: bool = True,
        max_ti_retries: int = 8,
    ) -> None:
        self.model = model
        self.secret_key = secret_key
        self.delta = float(delta)
        self.enforce_ti_consistency = enforce_ti_consistency
        self.max_ti_retries = max_ti_retries

    def embed_codeword(
        self,
        prompt: str,
        watermark: int,
        codeword: np.ndarray,
    ) -> EmbedResult:
        """Embed an explicit u-bit codeword during generation."""
        cw = np.asarray(codeword, dtype=np.uint8)
        u = int(cw.shape[0])
        prompt_ids = self.model.encode(prompt)
        context = list(prompt_ids)
        generated_ids: list[int] = []
        traces: list[TokenStepTrace] = []

        for t in range(u):
            target_bit = int(cw[t]) & 1
            prev_tok = None if t == 0 else generated_ids[-1]
            seed = derive_token_seed(self.secret_key, prev_tok)
            is_v1 = split_vocabulary(self.model.vocab_size, seed)

            raw_logits = self.model.next_token_logits(context)
            raw_best = int(np.argmax(raw_logits))

            biased_logits = raw_logits.copy()
            if target_bit == 0:
                biased_logits[~is_v1] += self.delta
            else:
                biased_logits[is_v1] += self.delta

            if self.enforce_ti_consistency:
                chosen_id, retries = _ensure_consistent_token(
                    self.model, generated_ids, biased_logits, self.max_ti_retries
                )
            else:
                chosen_id = int(np.argmax(biased_logits))
                retries = 0

            # Margin between best V1 and best V0 token before bias.
            v1_max = float(np.max(raw_logits[is_v1]))
            v0_max = float(np.max(raw_logits[~is_v1]))
            pre_margin = v1_max - v0_max if target_bit == 1 else v0_max - v1_max

            selected_group = 1 if bool(is_v1[chosen_id]) else 0
            traces.append(
                TokenStepTrace(
                    step=t,
                    target_bit=target_bit,
                    token_id=chosen_id,
                    token_text=self.model.decode([chosen_id]),
                    selected_group=selected_group,
                    bias_flipped_choice=(chosen_id != raw_best),
                    pre_bias_margin=pre_margin,
                    ti_retries=retries,
                )
            )
            generated_ids.append(chosen_id)
            context.append(chosen_id)

        return EmbedResult(
            watermark=watermark,
            codeword=cw.copy(),
            prompt_text=prompt,
            generated_token_ids=tuple(generated_ids),
            generated_text=self.model.decode(generated_ids),
            steps=tuple(traces),
        )

    def embed_with_codebook(
        self,
        prompt: str,
        watermark: int,
        codebook: BaseCodebook,
    ) -> EmbedResult:
        """Encode ``watermark`` with ``codebook`` and embed into generated text."""
        return self.embed_codeword(prompt, watermark, codebook.encode(watermark))

    def embed_with_bch(
        self,
        prompt: str,
        watermark: int,
        bch: BCHCodec,
    ) -> EmbedResult:
        """Encode ``watermark`` with ``bch`` and embed into generated text."""
        return self.embed_codeword(prompt, watermark, bch.encode(watermark))


class WatermarkExtractor:
    """Recover embedded bit sequences and identify watermarks via Algorithm 3."""

    def __init__(self, model: LanguageModelBackend, secret_key: str) -> None:
        self.model = model
        self.secret_key = secret_key

    def decode_bits(
        self,
        text_or_tokens: str | Sequence[int],
        u: int,
        truncate: bool = True,
    ) -> np.ndarray:
        """Recover bit candidate bL by classifying tokens against V0/V1 (Algorithm 3)."""
        if isinstance(text_or_tokens, str):
            tokens = self.model.encode(text_or_tokens)
        else:
            tokens = list(text_or_tokens)

        if truncate and len(tokens) > u:
            tokens = tokens[:u]

        bits: list[int] = []
        for t, tok_id in enumerate(tokens):
            prev_tok = None if t == 0 else tokens[t - 1]
            seed = derive_token_seed(self.secret_key, prev_tok)
            is_v1 = split_vocabulary(self.model.vocab_size, seed)
            bits.append(1 if bool(is_v1[tok_id]) else 0)
        return np.array(bits, dtype=np.uint8)

    def extract_from_codebook(
        self,
        text_or_tokens: str | Sequence[int],
        codebook: BaseCodebook,
        metric: Literal["hamming", "levenshtein"] = "levenshtein",
        threshold: int | None = None,
        include_alignment: bool = False,
    ) -> ExtractionResult:
        """Extract watermark via nearest-neighbor search in ``codebook``."""
        candidate = self.decode_bits(text_or_tokens, u=codebook.u, truncate=True)
        if metric == "hamming" and len(candidate) != codebook.u:
            # Pad or truncate to fixed length u so Hamming comparison stays well-defined
            # even under deletions (reflecting frameshift brittleness noted in Section V-C).
            padded = np.zeros(codebook.u, dtype=np.uint8)
            take = min(len(candidate), codebook.u)
            padded[:take] = candidate[:take]
            candidate = padded

        match = codebook.search(candidate, metric=metric)
        alignment = (
            levenshtein_alignment(candidate, match.codeword) if include_alignment else None
        )
        is_wm = True if threshold is None else match.distance <= threshold
        return ExtractionResult(
            watermark=match.watermark,
            distance=match.distance,
            second_best_distance=match.second_best_distance,
            margin=match.margin,
            is_watermarked=is_wm,
            threshold=threshold,
            candidate_bits=candidate,
            matched_codeword=match.codeword,
            method=metric,
            alignment=alignment,
        )

    def extract_from_bch(
        self,
        text_or_tokens: str | Sequence[int],
        bch: BCHCodec,
        threshold: int | None = None,
    ) -> ExtractionResult:
        """Extract watermark via algebraic BCH decoding (Section IV)."""
        u = bch.params.codeword_length
        candidate = self.decode_bits(text_or_tokens, u=u, truncate=True)
        if len(candidate) != u:
            padded = np.zeros(u, dtype=np.uint8)
            padded[: min(len(candidate), u)] = candidate[: min(len(candidate), u)]
            candidate = padded

        watermark, bit_flips, reencoded = bch.decode(candidate)
        is_wm = True if threshold is None else bit_flips <= threshold
        return ExtractionResult(
            watermark=watermark,
            distance=bit_flips,
            second_best_distance=None,
            margin=None,
            is_watermarked=is_wm,
            threshold=threshold,
            candidate_bits=candidate,
            matched_codeword=reencoded,
            method="bch",
            alignment=None,
        )
