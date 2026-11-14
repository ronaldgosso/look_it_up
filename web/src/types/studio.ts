export type RuntimeMode = 'wasm' | 'api'
export type ConstructionKind = 'linear' | 'rng'
export type ExtractionMethod = 'levenshtein' | 'hamming' | 'bch'
export type EntropyMode = 'base' | 'instruct'
export type AttackType = 'word_deletion' | 'word_insertion' | 'synonym_swap' | 'paraphrase'
export type EditKind = 'match' | 'substitute' | 'insert' | 'delete'

export interface StudioConfig {
  secretKey: string
  n: number
  u: number
  delta: number
  construction: ConstructionKind
  method: ExtractionMethod
  entropyMode: EntropyMode
  enforceTi: boolean
  threshold: number | null
}

export interface TokenStepTrace {
  step: number
  target_bit: number
  token_id: number
  token_text: string
  selected_group: number
  bias_flipped_choice: boolean
  pre_bias_margin: number
  ti_retries: number
}

export interface QualitySnapshot {
  distinct_1: number
  distinct_2: number
  trigram_rep: number
}

export interface EmbedResponse {
  watermark: number
  codeword: number[]
  generated_text: string
  embedded_bit_accuracy: number
  ti_corrections: number
  latency_ms: number
  quality: QualitySnapshot
  steps: TokenStepTrace[]
}

export interface AttackResponse {
  attack_name: string
  attacked_text: string
  original_tokens: number
  attacked_tokens: number
  budget_tokens: number
  modified_tokens: number
}

export interface AlignmentOp {
  kind: EditKind
  source_idx: number | null
  target_idx: number | null
  source_bit: number | null
  target_bit: number | null
}

export interface ExtractResponse {
  watermark: number
  distance: number
  second_best_distance: number | null
  margin: number | null
  is_watermarked: boolean
  candidate_bits: number[]
  matched_codeword: number[]
  method: ExtractionMethod
  latency_ms: number
  alignment: AlignmentOp[]
}

export interface CodebookInfoResponse {
  n: number
  u: number
  collision_exponent: number
  collision_bound: number
  gilbert_varshamov_d: number
  exact_linear_d_min: number | null
  bch: {
    native_length: number
    field_degree: number
    message_capacity: number
    shortening_bits: number
    correction_capability: number
    correction_rate: number
  }
}

export interface BenchmarkResults {
  system: { backend: string; threads: number; abi_version?: number }
  config: { n: number; u: number; delta: number; attack_budget: number; num_samples: number }
  speed_comparison: {
    n: number
    u: number
    entries: number
    python_hamming_ms: number
    python_levenshtein_ms: number
    rust_hamming_ms?: number
    rust_levenshtein_ms?: number
    hamming_speedup?: number
    levenshtein_speedup?: number
  }
  attack_robustness: Array<{
    method: string
    attack: string
    match_rate: number
    mean_distance: number
    samples: number
  }>
  roc_auroc: Record<
    string,
    { auroc: number; tpr_at_1pct_fpr: number; threshold_at_1pct_fpr: number }
  >
  entropy_regime_match_rate: {
    base: Record<string, number>
    instruct: Record<string, number>
  }
  quality_comparison: {
    watermarked: Record<string, number>
    non_watermarked: Record<string, number>
  }
}
