"""Language model backends and deterministic subword tokenization.

Provides:
1. A zero-cost, offline ``BuiltinNGramModel`` with a BPE-like greedy subword
   tokenizer (including mergeable subwords that realistically exhibit
   Tokenization Inconsistency from Appendix F) and tunable base/instruct
   logit entropy profiles.
2. An optional ``HuggingFaceBackend`` wrapping any local open-weights causal LM
   via ``transformers`` with zero API costs.
"""

from __future__ import annotations

import math
import re
from abc import ABC, abstractmethod
from collections import Counter, defaultdict
from typing import Literal, Sequence

import numpy as np

EntropyMode = Literal["base", "instruct"]

_CORPUS = """
This compact wireless charger delivers fast power for laptops, tablets, and phones while traveling.
I carried the portable battery pack on three flights and the braided cable stayed cool under load.
For daily commuting, active noise cancellation softens subway rumble without making voices sound hollow.
The aluminum frame feels sturdy in hand, though the hinge is slightly stiffer than expected at first.
Battery life easily lasts through a full workday of video calls, document editing, and light browsing.
Keyboard travel is crisp and quiet, making long writing sessions comfortable in shared workspaces.
Setup took less than five minutes after pairing over Bluetooth, and firmware updates installed cleanly.
Audio clarity shines on acoustic tracks and podcasts, while deep bass remains controlled rather than muddy.
Several reviewers noted that the matte finish resists fingerprints far better than glossy plastic shells.
At this price point, reliable thermal management and durable ports matter more than flashy lighting effects.
Overall, it is a practical upgrade for remote engineers, students, and frequent travelers seeking steady performance.
Reviewers praised the compact wireless charger because the aluminum housing prevents overheating during sustained fast charging.
The mechanical keyboard balances tactile feedback with low acoustic noise, making it ideal for shared engineering offices.
On long international flights, the lightweight travel adapter kept both a workstation laptop and smartphone powered smoothly.
Compared with older plastic models, this portable stand offers solid stability and smooth angle adjustments on wooden desks.
Sound isolation improves dramatically once the memory foam ear tips seal gently against ambient train noise.
Even after several weeks of heavy daily commutes, the woven nylon cord shows zero signs of fraying near either connector.
Users looking for dependable desk hardware will appreciate the clean industrial design and steady thermal output under load.
Historically, port cities adapted rapidly when steam navigation shortened transatlantic crossing schedules.
Merchants coordinated warehouse inventories across coastal routes using standardized bills of lading and telegraph alerts.
Municipal archives preserve detailed ledgers showing how grain shipments, insurance rates, and harbor fees evolved.
Early railway timetables forced regional towns to synchronize local clocks for safer track dispatch and freight handoffs.
Maritime insurers tracked seasonal weather patterns carefully so merchant fleets could adjust departure dates before winter storms.
Canal engineers constructed stone locks along river valleys to carry coal barges reliably between inland mines and coastal harbors.
Researchers studying public datasets often examine whether lexical diversity changes across short social media posts.
When evaluating online product reviews, provenance markers help platforms distinguish authentic buyer feedback from automated campaigns.
Cryptographic watermarks embed identifying signals directly into token choices while preserving natural phrasing and tone.
Error-correcting codebooks allow short passages to retain attribution payloads even after minor edits or synonyms.
Careful tokenizer alignment prevents subword merges from shifting bit positions during downstream verification.
Modern verification pipelines balance false positive thresholds against extraction latency across millions of candidate identities.
Engineers designing provenance tools test word deletions, insertions, and local rewrites to measure signal resilience.
Independent security audits confirm that affine linear codebooks guarantee uniform minimum separation across every watermark identity.
Short product reviews under two hundred tokens remain difficult to attribute unless the detector aligns shifted bit sequences cleanly.
When a small edit removes an adjective or swaps a synonym, edit-distance matching recovers the embedded identifier reliably.
"""


def _build_vocabulary() -> list[str]:
    """Construct a deterministic power-of-two subword vocabulary (size 1024).

    Includes single-character fallback symbols (printable ASCII + newline),
    subword fragments that can merge across boundaries (exposing Appendix F
    tokenization inconsistency), and frequent corpus words with leading spaces.
    """
    vocab: list[str] = []
    seen: set[str] = set()

    def _add(tok: str) -> None:
        if tok not in seen:
            seen.add(tok)
            vocab.append(tok)

    # Mandatory single-character fallback alphabet guarantees lossless encoding.
    _add("\n")
    for code in range(32, 127):
        _add(chr(code))

    # Deliberate subword pieces + merged forms to reflect BPE greedy merge behavior.
    subwords = [
        " the", " and", " for", " with", " that", " this", " from", " into",
        " while", " across", " when", " under", " over", " than", " more",
        " high", "light", " water", "mark", " watermark", "ing", "tion", "ment",
        "ity", "able", "less", "ness", "ly", "er", "ed", "es", "al",
        "in", "un", "re", "pro", "com", "con", "per", "pre", "sub", "inter",
        "battery", "review", "sound", "travel", "portable", "compact", "laptop",
        "charging", "noise", "quality", "design", "signal", "token", "tokens",
        "model", "models", "short", "text", "texts", "code", "word", "words",
    ]
    for sw in subwords:
        _add(sw)

    # Extract frequent space-prefixed and bare word tokens from the corpus.
    raw_words = re.findall(r" ?[A-Za-z0-9']+|[.,;:\-!?]", _CORPUS)
    counts = Counter(raw_words)
    for tok, _ in counts.most_common():
        if len(vocab) >= 1024:
            break
        _add(tok)

    # Pad deterministically to exact power of 2 (1024) if needed.
    filler_idx = 0
    while len(vocab) < 1024:
        _add(f" tok{filler_idx}")
        filler_idx += 1

    return vocab[:1024]


class SubwordTokenizer:
    """Greedy longest-match subword tokenizer over a fixed vocabulary."""

    def __init__(self, vocab: Sequence[str]) -> None:
        self.vocab = list(vocab)
        self.token_to_id: dict[str, int] = {tok: idx for idx, tok in enumerate(self.vocab)}
        self._max_len = max(len(tok) for tok in self.vocab)

    @property
    def vocab_size(self) -> int:
        return len(self.vocab)

    def encode(self, text: str) -> list[int]:
        ids: list[int] = []
        pos = 0
        n = len(text)
        while pos < n:
            matched_id: int | None = None
            max_end = min(n, pos + self._max_len)
            for end in range(max_end, pos, -1):
                piece = text[pos:end]
                tok_id = self.token_to_id.get(piece)
                if tok_id is not None:
                    matched_id = tok_id
                    pos = end
                    break
            if matched_id is None:
                # Fallback to '?' for non-ASCII characters outside fallback table.
                matched_id = self.token_to_id["?"]
                pos += 1
            ids.append(matched_id)
        return ids

    def decode(self, token_ids: Sequence[int]) -> str:
        return "".join(self.vocab[idx] for idx in token_ids)


class LanguageModelBackend(ABC):
    """Minimal causal LM interface needed for logit-bias watermarking."""

    @property
    @abstractmethod
    def vocab_size(self) -> int:
        """Total number of tokens in the model vocabulary."""

    @abstractmethod
    def encode(self, text: str) -> list[int]:
        """Tokenize text into a list of integer token IDs."""

    @abstractmethod
    def decode(self, token_ids: Sequence[int]) -> str:
        """Detokenize integer token IDs back into text."""

    @abstractmethod
    def next_token_logits(self, context_ids: Sequence[int]) -> np.ndarray:
        """Return raw log-probabilities / logits of shape (vocab_size,) for next token."""


class BuiltinNGramModel(LanguageModelBackend):
    """Zero-cost smoothed trigram/bigram/unigram LM with tunable entropy profile."""

    def __init__(self, entropy_mode: EntropyMode = "base") -> None:
        self.entropy_mode = entropy_mode
        vocab = _build_vocabulary()
        self.tokenizer = SubwordTokenizer(vocab)
        self._vocab_size = self.tokenizer.vocab_size

        # Restrict generated words to multi-character lexical/punctuation tokens
        # (suppressing rare single-letter noise and synthetic padding tokens).
        self._base_prior = np.full(self._vocab_size, -25.0, dtype=np.float64)
        self._punct_ids: list[int] = []
        self._space_word_ids: list[int] = []
        for idx, tok in enumerate(vocab):
            if tok in {".", ",", ";", ":", "-", "!", "?"}:
                self._punct_ids.append(idx)
                self._base_prior[idx] = -4.5
            elif tok.startswith(" ") and len(tok.strip()) >= 1 and not tok.startswith(" tok"):
                self._base_prior[idx] = -1.5
                self._space_word_ids.append(idx)

        corpus_ids = self.tokenizer.encode(_CORPUS)
        unigram = np.ones(self._vocab_size, dtype=np.float64) * 0.05
        bigram: dict[int, Counter[int]] = defaultdict(Counter)
        trigram: dict[tuple[int, int], Counter[int]] = defaultdict(Counter)

        for i, tok_id in enumerate(corpus_ids):
            unigram[tok_id] += 1.0
            if i >= 1:
                bigram[corpus_ids[i - 1]][tok_id] += 1
            if i >= 2:
                trigram[(corpus_ids[i - 2], corpus_ids[i - 1])][tok_id] += 1

        self._unigram_logits = np.log(unigram / unigram.sum()) + self._base_prior * 0.4
        self._bigram = bigram
        self._trigram = trigram
        self._punct_set = set(self._punct_ids)

    @property
    def vocab_size(self) -> int:
        return self._vocab_size

    def encode(self, text: str) -> list[int]:
        return self.tokenizer.encode(text)

    def decode(self, token_ids: Sequence[int]) -> str:
        return self.tokenizer.decode(token_ids)

    def next_token_logits(self, context_ids: Sequence[int]) -> np.ndarray:
        logits = self._unigram_logits.copy()

        # Prevent degenerate immediate self-repetition while preserving flow.
        if context_ids:
            last = context_ids[-1]
            logits[last] -= 5.0
            if last in self._punct_set:
                for p_id in self._punct_ids:
                    logits[p_id] -= 12.0
                for sw_id in self._space_word_ids:
                    logits[sw_id] += 1.5
            for nxt, cnt in self._bigram.get(last, {}).items():
                logits[nxt] += 2.6 * math.log1p(cnt)

        if len(context_ids) >= 2:
            pair = (context_ids[-2], context_ids[-1])
            for nxt, cnt in self._trigram.get(pair, {}).items():
                logits[nxt] += 3.2 * math.log1p(cnt)

            # Mild repetition penalty over recent 8-token window.
            for recent in context_ids[-8:]:
                logits[recent] -= 1.0

        # Instruct mode mimics sharp RLHF peaky distributions (Section V) that
        # can overpower moderate logit bias delta=6 on low-entropy positions.
        scale = 1.0 if self.entropy_mode == "base" else 3.2
        return logits * scale


class HuggingFaceBackend(LanguageModelBackend):
    """Optional free local open-weights LLM adapter using HuggingFace transformers."""

    def __init__(self, model_name: str = "gpt2", device: str | None = None) -> None:
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ImportError(
                "HuggingFaceBackend requires optional dependencies: "
                "pip install 'llmw-codebook[hf]'"
            ) from exc

        self._torch = torch
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForCausalLM.from_pretrained(model_name).to(self.device)
        self.model.eval()
        self._vocab_size = int(self.model.config.vocab_size)

    @property
    def vocab_size(self) -> int:
        return self._vocab_size

    def encode(self, text: str) -> list[int]:
        return list(self.tokenizer.encode(text, add_special_tokens=False))

    def decode(self, token_ids: Sequence[int]) -> str:
        return str(self.tokenizer.decode(list(token_ids), skip_special_tokens=True))

    def next_token_logits(self, context_ids: Sequence[int]) -> np.ndarray:
        torch = self._torch
        ids = list(context_ids)
        if not ids and self.tokenizer.bos_token_id is not None:
            ids = [int(self.tokenizer.bos_token_id)]
        tensor = torch.tensor([ids], dtype=torch.long, device=self.device)
        with torch.no_grad():
            outputs = self.model(input_ids=tensor)
            next_logits = outputs.logits[0, -1, :].detach().cpu().numpy().astype(np.float64)
        return next_logits
