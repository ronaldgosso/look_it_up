"""Faithful implementation of 'Look It Up: Multi-bit LLM Watermarking via Codebook Search'."""

from llmw_codebook._rust_accel import backend_info, is_native_available
from llmw_codebook.attacks import (
    AttackResult,
    paraphrase_attack,
    synonym_replacement_attack,
    word_deletion_attack,
    word_insertion_attack,
)
from llmw_codebook.bch import BCHCodec, BCHParameters
from llmw_codebook.codebook import (
    BaseCodebook,
    CodebookMatch,
    LinearCodebook,
    RNGCodebook,
    SpreadStats,
    bits_to_int,
    collision_probability_bound,
    create_codebook,
    derive_linear_params,
    exact_linear_minimum_distance,
    gilbert_varshamov_distance,
    int_to_bits,
    measure_codebook_spread,
)
from llmw_codebook.distances import (
    AlignmentResult,
    EditOp,
    batch_hamming_distances,
    batch_levenshtein_distances,
    hamming_distance,
    levenshtein_alignment,
    levenshtein_distance,
)
from llmw_codebook.metrics import (
    QualityMetrics,
    ROCSummary,
    compute_perplexity,
    compute_roc_auroc,
    distinct_1,
    distinct_2,
    evaluate_quality,
    trigram_repetition_rate,
)
from llmw_codebook.models import BuiltinNGramModel, HuggingFaceBackend, LanguageModelBackend
from llmw_codebook.watermark import (
    EmbedResult,
    ExtractionResult,
    TokenStepTrace,
    WatermarkEmbedder,
    WatermarkExtractor,
)

__version__ = "0.2.0"

__all__ = [
    "AlignmentResult",
    "AttackResult",
    "BCHCodec",
    "BCHParameters",
    "BaseCodebook",
    "BuiltinNGramModel",
    "CodebookMatch",
    "EditOp",
    "EmbedResult",
    "ExtractionResult",
    "HuggingFaceBackend",
    "LanguageModelBackend",
    "LinearCodebook",
    "QualityMetrics",
    "RNGCodebook",
    "ROCSummary",
    "SpreadStats",
    "TokenStepTrace",
    "WatermarkEmbedder",
    "WatermarkExtractor",
    "__version__",
    "backend_info",
    "batch_hamming_distances",
    "batch_levenshtein_distances",
    "bits_to_int",
    "collision_probability_bound",
    "compute_perplexity",
    "compute_roc_auroc",
    "create_codebook",
    "derive_linear_params",
    "distinct_1",
    "distinct_2",
    "evaluate_quality",
    "exact_linear_minimum_distance",
    "gilbert_varshamov_distance",
    "hamming_distance",
    "int_to_bits",
    "is_native_available",
    "levenshtein_alignment",
    "levenshtein_distance",
    "measure_codebook_spread",
    "paraphrase_attack",
    "synonym_replacement_attack",
    "trigram_repetition_rate",
    "word_deletion_attack",
    "word_insertion_attack",
]
