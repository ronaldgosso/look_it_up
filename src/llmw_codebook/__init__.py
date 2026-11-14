"""Faithful implementation of 'Look It Up: Multi-bit LLM Watermarking via Codebook Search'."""

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
from llmw_codebook.models import BuiltinNGramModel, HuggingFaceBackend, LanguageModelBackend
from llmw_codebook.watermark import (
    EmbedResult,
    ExtractionResult,
    TokenStepTrace,
    WatermarkEmbedder,
    WatermarkExtractor,
)

__version__ = "0.1.0"

__all__ = [
    "AlignmentResult",
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
    "RNGCodebook",
    "SpreadStats",
    "TokenStepTrace",
    "WatermarkEmbedder",
    "WatermarkExtractor",
    "__version__",
    "batch_hamming_distances",
    "batch_levenshtein_distances",
    "bits_to_int",
    "collision_probability_bound",
    "create_codebook",
    "derive_linear_params",
    "exact_linear_minimum_distance",
    "gilbert_varshamov_distance",
    "hamming_distance",
    "int_to_bits",
    "levenshtein_alignment",
    "levenshtein_distance",
    "measure_codebook_spread",
]
