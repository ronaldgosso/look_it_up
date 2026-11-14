"""Text quality metrics (Appendix G) and ROC/AUROC discrimination metrics (Appendix A)."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Sequence

import numpy as np

from llmw_codebook.models import LanguageModelBackend

_WORD_RE = re.compile(r"[A-Za-z0-9']+")


@dataclass(frozen=True)
class QualityMetrics:
    """Word-level lexical diversity and perplexity summary (Appendix G)."""

    distinct_1: float
    distinct_2: float
    trigram_repetition_rate: float
    perplexity: float | None = None


@dataclass(frozen=True)
class ROCSummary:
    """Empirical ROC curve, AUROC, and operating point at <= max_fpr."""

    auroc: float
    max_fpr: float
    tpr_at_max_fpr: float
    fpr_at_threshold: float
    threshold_at_max_fpr: int
    fpr_curve: tuple[float, ...]
    tpr_curve: tuple[float, ...]
    thresholds: tuple[int, ...]


def _words(text: str) -> list[str]:
    return [w.lower() for w in _WORD_RE.findall(text)]


def distinct_1(text: str) -> float:
    """Unique unigrams divided by total unigrams (Appendix G.C)."""
    tokens = _words(text)
    if not tokens:
        return 0.0
    return len(set(tokens)) / len(tokens)


def distinct_2(text: str) -> float:
    """Unique bigrams divided by total bigrams (Appendix G.C)."""
    tokens = _words(text)
    if len(tokens) < 2:
        return 0.0
    bigrams = list(zip(tokens, tokens[1:]))
    return len(set(bigrams)) / len(bigrams)


def trigram_repetition_rate(text: str) -> float:
    """1 - (unique trigrams / total trigrams) (Appendix G.C)."""
    tokens = _words(text)
    if len(tokens) < 3:
        return 0.0
    trigrams = list(zip(tokens, tokens[1:], tokens[2:]))
    return 1.0 - (len(set(trigrams)) / len(trigrams))


def compute_perplexity(model: LanguageModelBackend, text: str) -> float:
    """Autoregressive perplexity exp(-mean log p(s_t | s_<t)) under ``model``."""
    ids = model.encode(text)
    if len(ids) < 2:
        return 1.0

    total_nll = 0.0
    steps = 0
    for t in range(1, len(ids)):
        logits = model.next_token_logits(ids[:t]).astype(np.float64)
        max_l = float(np.max(logits))
        shifted = logits - max_l
        log_z = max_l + math.log(float(np.sum(np.exp(shifted))))
        log_prob = float(logits[ids[t]]) - log_z
        total_nll -= log_prob
        steps += 1

    avg_nll = total_nll / max(1, steps)
    return math.exp(min(avg_nll, 50.0))


def evaluate_quality(
    text: str,
    model: LanguageModelBackend | None = None,
) -> QualityMetrics:
    """Compute Appendix G lexical diversity and optional perplexity metrics."""
    ppl = compute_perplexity(model, text) if model is not None else None
    return QualityMetrics(
        distinct_1=distinct_1(text),
        distinct_2=distinct_2(text),
        trigram_repetition_rate=trigram_repetition_rate(text),
        perplexity=ppl,
    )


def compute_roc_auroc(
    watermarked_distances: Sequence[int],
    unwatermarked_distances: Sequence[int],
    max_fpr: float = 0.01,
) -> ROCSummary:
    """Compute ROC curve, AUROC, and TPR at FPR <= ``max_fpr`` (Table III & Appendix A).

    Lower distances correspond to stronger watermark detection: a sample is
    flagged as watermarked when ``distance <= threshold``.
    """
    if not watermarked_distances or not unwatermarked_distances:
        raise ValueError("Both watermarked and unwatermarked distance lists must be non-empty")

    wm = np.asarray(watermarked_distances, dtype=np.int32)
    unwm = np.asarray(unwatermarked_distances, dtype=np.int32)
    max_d = int(max(int(wm.max()), int(unwm.max())))
    thresholds = list(range(-1, max_d + 1))

    fprs: list[float] = []
    tprs: list[float] = []
    for thr in thresholds:
        fpr = float(np.mean(unwm <= thr))
        tpr = float(np.mean(wm <= thr))
        fprs.append(fpr)
        tprs.append(tpr)

    # Sort ascending by FPR, then TPR for exact trapezoidal AUROC.
    pairs = sorted(zip(fprs, tprs, thresholds), key=lambda p: (p[0], p[1]))
    s_fpr = [p[0] for p in pairs]
    s_tpr = [p[1] for p in pairs]
    auroc = 0.0
    for i in range(1, len(s_fpr)):
        auroc += 0.5 * (s_tpr[i] + s_tpr[i - 1]) * (s_fpr[i] - s_fpr[i - 1])

    # Best threshold satisfying FPR <= max_fpr (highest TPR, then lowest FPR).
    valid = [(tpr, -fpr, thr, fpr) for fpr, tpr, thr in pairs if fpr <= max_fpr]
    if valid:
        best_tpr, _, best_thr, best_fpr = max(valid)
    else:
        best_tpr, best_fpr, best_thr = 0.0, 0.0, -1

    return ROCSummary(
        auroc=auroc,
        max_fpr=max_fpr,
        tpr_at_max_fpr=best_tpr,
        fpr_at_threshold=best_fpr,
        threshold_at_max_fpr=best_thr,
        fpr_curve=tuple(s_fpr),
        tpr_curve=tuple(s_tpr),
        thresholds=tuple(p[2] for p in pairs),
    )
