"""Appendix B adversarial attack suite for evaluating watermark robustness.

Implements all four token-budgeted word-level attacks from Section V-C and
Appendix B: word deletion, word insertion, synonym replacement, and contiguous
region paraphrasing.
"""

from __future__ import annotations

import math
import random
import re
from dataclasses import dataclass
from typing import Callable

from llmw_codebook.models import LanguageModelBackend

_INSERTION_WORDS: tuple[str, ...] = (
    "actually", "also", "always", "around", "basically", "beyond", "briefly",
    "calmly", "clearly", "closely", "commonly", "completely", "consistently",
    "daily", "deeply", "directly", "distinctly", "easily", "effectively",
    "essentially", "evenly", "eventually", "fairly", "firmly", "frequently",
    "generally", "gently", "gradually", "greatly", "honestly", "initially",
    "largely", "lightly", "locally", "mainly", "merely", "mildly", "modern",
    "mostly", "naturally", "nearly", "neatly", "notably", "often", "overall",
    "partly", "plainly", "possibly", "practically", "primarily", "probably",
    "promptly", "properly", "quietly", "rapidly", "rarely", "readily",
    "really", "recently", "regularly", "relatively", "reliably", "remarkably",
    "roughly", "safely", "seemingly", "seriously", "shortly", "significantly",
    "simply", "slightly", "smoothly", "solidly", "somewhat", "steadily",
    "strongly", "subtly", "suddenly", "surely", "surprisingly", "tightly",
    "truly", "typically", "ultimately", "usually", "widely", "adapter",
    "balance", "battery", "cable", "clarity", "comfort", "contrast", "design",
    "detail", "device", "duration", "effort", "feature", "finish", "flow",
    "frame", "hardware", "impact", "manner", "margin", "memory", "method",
    "mode", "module", "noise", "note", "option", "output", "packet", "pattern",
    "period", "phase", "point", "power", "process", "quality", "range",
    "record", "region", "result", "review", "route", "scale", "session",
    "signal", "source", "span", "speed", "state", "status", "surface",
    "system", "task", "tone", "travel", "trend", "unit", "value", "version",
)

_SYNONYMS: dict[str, tuple[str, ...]] = {
    "compact": ("small", "sleek", "pocketable"),
    "wireless": ("cordless", "untethered"),
    "charger": ("adapter", "powerbrick"),
    "delivers": ("provides", "supplies", "offers"),
    "fast": ("rapid", "quick", "speedy"),
    "power": ("energy", "output", "charge"),
    "portable": ("mobile", "handheld", "travel-ready"),
    "battery": ("cell", "pack"),
    "braided": ("woven", "sheathed"),
    "cable": ("cord", "lead"),
    "cool": ("chilly", "unheated"),
    "daily": ("everyday", "routine"),
    "active": ("dynamic", "live"),
    "noise": ("sound", "static", "hum"),
    "softens": ("dampens", "reduces", "muffles"),
    "aluminum": ("alloy", "metal"),
    "frame": ("chassis", "body", "shell"),
    "sturdy": ("solid", "rugged", "durable"),
    "easily": ("effortlessly", "readily"),
    "lasts": ("endures", "runs", "continues"),
    "full": ("entire", "complete"),
    "quiet": ("silent", "hushed", "muted"),
    "comfortable": ("cozy", "pleasant", "ergonomic"),
    "cleanly": ("smoothly", "neatly"),
    "clarity": ("crispness", "clearness"),
    "shines": ("excels", "stands"),
    "controlled": ("balanced", "measured"),
    "matte": ("satin", "non-glossy"),
    "finish": ("coating", "surface"),
    "resists": ("repels", "avoids"),
    "reliable": ("dependable", "trustworthy", "consistent"),
    "durable": ("long-lasting", "tough"),
    "practical": ("useful", "sensible"),
    "steady": ("stable", "constant"),
    "performance": ("operation", "behavior"),
    "historically": ("traditionally", "formerly"),
    "rapidly": ("swiftly", "quickly"),
    "shortened": ("reduced", "trimmed"),
    "coordinated": ("organized", "arranged"),
    "detailed": ("thorough", "comprehensive"),
    "evolved": ("developed", "progressed"),
    "forced": ("compelled", "required"),
    "safer": ("securer", "steadier"),
    "public": ("open", "shared"),
    "examine": ("inspect", "analyze", "study"),
    "short": ("brief", "concise"),
    "authentic": ("genuine", "real"),
    "embed": ("insert", "encode", "weave"),
    "identifying": ("attributing", "tracking"),
    "signals": ("markers", "patterns"),
    "preserving": ("maintaining", "keeping"),
    "natural": ("organic", "fluent"),
    "allow": ("enable", "permit"),
    "retain": ("keep", "preserve"),
    "minor": ("small", "slight"),
    "edits": ("changes", "revisions"),
    "careful": ("thorough", "precise"),
    "prevents": ("avoids", "blocks"),
    "modern": ("contemporary", "current"),
    "balance": ("weigh", "trade"),
    "test": ("evaluate", "probe"),
    "measure": ("quantify", "assess"),
    "resilience": ("robustness", "strength"),
    "heavy": ("intense", "demanding"),
    "zero": ("no", "minimal"),
    "clean": ("tidy", "neat"),
    "confirm": ("verify", "validate"),
    "guarantee": ("ensure", "promise"),
    "uniform": ("consistent", "even"),
    "difficult": ("hard", "challenging"),
    "removes": ("deletes", "strips"),
    "recovers": ("retrieves", "extracts"),
    "reliably": ("dependably", "consistently"),
    "local": ("nearby", "regional"),
    "bright": ("vivid", "clear"),
    "strong": ("robust", "firm"),
    "high": ("elevated", "tall"),
    "low": ("reduced", "minimal"),
}

_PHRASE_REWRITES: tuple[tuple[str, str], ...] = (
    ("while preserving", "even as keeping"),
    ("more than", "above and beyond"),
    ("less than", "under"),
    ("at first", "initially"),
    ("in hand", "to hold"),
    ("on the go", "while traveling"),
    ("across coastal routes", "along maritime corridors"),
    ("short product reviews", "brief customer evaluations"),
    ("watermark identity", "embedded identifier"),
    ("word deletions", "removed words"),
    ("local rewrites", "nearby edits"),
)


def extra_tokenizer_words() -> tuple[str, ...]:
    """Return space-prefixed attack lexicon words for subword tokenizer alignment."""
    words: set[str] = set()
    for w in _INSERTION_WORDS:
        words.add(" " + w)
    for k, syns in _SYNONYMS.items():
        words.add(" " + k)
        for s in syns:
            words.add(" " + s)
    return tuple(sorted(words))


@dataclass(frozen=True)
class AttackResult:
    """Outcome of a single Appendix B adversarial edit."""

    attack_name: str
    original_text: str
    attacked_text: str
    original_tokens: int
    attacked_tokens: int
    budget_tokens: int
    modified_tokens: int


def _split_words_preserving_punct(text: str) -> list[str]:
    return text.split()


def _preserve_case(template: str, replacement: str) -> str:
    if template.isupper():
        return replacement.upper()
    if template[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def _token_budget(model: LanguageModelBackend, text: str, attack_budget: float) -> tuple[int, int]:
    orig_tokens = len(model.encode(text))
    budget = math.floor(attack_budget * orig_tokens)
    return orig_tokens, budget


def word_deletion_attack(
    text: str,
    model: LanguageModelBackend,
    attack_budget: float = 0.1,
    seed: int = 0,
) -> AttackResult:
    """Appendix B.1: randomly drop words until cumulative removed tokens >= B."""
    orig_tokens, budget = _token_budget(model, text, attack_budget)
    words = _split_words_preserving_punct(text)
    if budget <= 0 or len(words) <= 1:
        return AttackResult("word_deletion", text, text, orig_tokens, orig_tokens, budget, 0)

    rng = random.Random(seed)
    indices = list(range(len(words)))
    rng.shuffle(indices)

    removed: set[int] = set()
    removed_toks = 0
    for idx in indices:
        if len(removed) >= len(words) - 1:
            break
        w_toks = max(1, len(model.encode(" " + words[idx])))
        removed.add(idx)
        removed_toks += w_toks
        if removed_toks >= budget:
            break

    attacked = " ".join(w for i, w in enumerate(words) if i not in removed)
    return AttackResult(
        attack_name="word_deletion",
        original_text=text,
        attacked_text=attacked,
        original_tokens=orig_tokens,
        attacked_tokens=len(model.encode(attacked)),
        budget_tokens=budget,
        modified_tokens=removed_toks,
    )


def word_insertion_attack(
    text: str,
    model: LanguageModelBackend,
    attack_budget: float = 0.1,
    seed: int = 0,
) -> AttackResult:
    """Appendix B.2: insert random English words until inserted tokens >= B."""
    orig_tokens, budget = _token_budget(model, text, attack_budget)
    words = _split_words_preserving_punct(text)
    if budget <= 0 or not words:
        return AttackResult("word_insertion", text, text, orig_tokens, orig_tokens, budget, 0)

    rng = random.Random(seed)
    inserted_toks = 0
    while inserted_toks < budget:
        new_word = rng.choice(_INSERTION_WORDS)
        pos = rng.randint(0, len(words))
        words.insert(pos, new_word)
        inserted_toks += max(1, len(model.encode(" " + new_word)))

    attacked = " ".join(words)
    return AttackResult(
        attack_name="word_insertion",
        original_text=text,
        attacked_text=attacked,
        original_tokens=orig_tokens,
        attacked_tokens=len(model.encode(attacked)),
        budget_tokens=budget,
        modified_tokens=inserted_toks,
    )


def synonym_replacement_attack(
    text: str,
    model: LanguageModelBackend,
    attack_budget: float = 0.1,
    seed: int = 0,
) -> AttackResult:
    """Appendix B.3: swap words with synonyms until original replaced tokens >= B."""
    orig_tokens, budget = _token_budget(model, text, attack_budget)
    words = _split_words_preserving_punct(text)
    if budget <= 0 or not words:
        return AttackResult("synonym_replacement", text, text, orig_tokens, orig_tokens, budget, 0)

    candidates: list[tuple[int, str, str, str]] = []
    for idx, token in enumerate(words):
        m = re.match(r"^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$", token)
        if not m:
            continue
        lead, core, trail = m.groups()
        syns = _SYNONYMS.get(core.lower())
        if syns:
            candidates.append((idx, lead, core, trail))

    rng = random.Random(seed)
    rng.shuffle(candidates)

    replaced_toks = 0
    for idx, lead, core, trail in candidates:
        syns = _SYNONYMS[core.lower()]
        choice = _preserve_case(core, rng.choice(syns))
        orig_w_toks = max(1, len(model.encode(" " + words[idx])))
        words[idx] = f"{lead}{choice}{trail}"
        replaced_toks += orig_w_toks
        if replaced_toks >= budget:
            break

    attacked = " ".join(words)
    return AttackResult(
        attack_name="synonym_replacement",
        original_text=text,
        attacked_text=attacked,
        original_tokens=orig_tokens,
        attacked_tokens=len(model.encode(attacked)),
        budget_tokens=budget,
        modified_tokens=replaced_toks,
    )


def _builtin_paraphrase_span(span_text: str, rng: random.Random) -> str:
    rewritten = span_text
    for src, dst in _PHRASE_REWRITES:
        if src in rewritten.lower():
            rewritten = re.sub(re.escape(src), dst, rewritten, flags=re.IGNORECASE)

    words = rewritten.split()
    out: list[str] = []
    i = 0
    while i < len(words):
        w = words[i]
        m = re.match(r"^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$", w)
        if m:
            lead, core, trail = m.groups()
            syns = _SYNONYMS.get(core.lower())
            if syns:
                out.append(f"{lead}{_preserve_case(core, rng.choice(syns))}{trail}")
                i += 1
                continue
        out.append(w)
        i += 1

    # Light local modifier adjustment to mirror natural paraphrasing length drift.
    if out and " ".join(out) == span_text:
        pos = rng.randint(0, len(out) - 1) if len(out) > 1 else 0
        if out[pos].lower() in {"very", "quite", "really", "actually", "notably"}:
            out.pop(pos)
        else:
            out.insert(pos, rng.choice(("effectively", "notably", "clearly")))
    return " ".join(out)


def paraphrase_attack(
    text: str,
    model: LanguageModelBackend,
    attack_budget: float = 0.1,
    seed: int = 0,
    rewriter: Callable[[str], str] | None = None,
) -> AttackResult:
    """Appendix B.4: rewrite a contiguous center-expanded span covering >= B tokens."""
    orig_tokens, budget = _token_budget(model, text, attack_budget)
    words = _split_words_preserving_punct(text)
    if budget <= 0 or len(words) < 2:
        return AttackResult("paraphrase", text, text, orig_tokens, orig_tokens, budget, 0)

    rng = random.Random(seed)
    center = rng.randrange(len(words))
    left = center
    right = center
    expand_left = True

    while True:
        span_text = " ".join(words[left : right + 1])
        span_toks = len(model.encode(span_text))
        if span_toks >= budget or (left == 0 and right == len(words) - 1):
            break
        if expand_left and left > 0:
            left -= 1
        elif right < len(words) - 1:
            right += 1
        elif left > 0:
            left -= 1
        expand_left = not expand_left

    target_span = " ".join(words[left : right + 1])
    span_toks = len(model.encode(target_span))
    rewritten_span = rewriter(target_span) if rewriter is not None else _builtin_paraphrase_span(target_span, rng)
    attacked_words = words[:left] + rewritten_span.split() + words[right + 1 :]
    attacked = " ".join(attacked_words)

    return AttackResult(
        attack_name="paraphrase",
        original_text=text,
        attacked_text=attacked,
        original_tokens=orig_tokens,
        attacked_tokens=len(model.encode(attacked)),
        budget_tokens=budget,
        modified_tokens=span_toks,
    )
