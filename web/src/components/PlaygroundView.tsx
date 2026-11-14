import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Play,
  RotateCcw,
  Scissors,
  SearchCheck,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import type {
  AttackResponse,
  AttackType,
  EmbedResponse,
  ExtractResponse,
  StudioConfig,
  TokenStepTrace,
} from '../types/studio'
import { cn } from '../utils/cn'

interface PlaygroundViewProps {
  config: StudioConfig
  watermark: number
  runtimeLabel: string
  wasmReady: boolean
  busy: boolean
  errorMessage: string | null
  prompt: string
  onChangePrompt: (nextPrompt: string) => void
  embedResult: EmbedResponse | null
  attackMeta: AttackResponse | null
  suspectText: string
  extractResult: ExtractResponse | null
  onEmbed: () => void
  onAttack: (attackType: AttackType) => void
  onResetText: () => void
  onChangeSuspectText: (text: string) => void
  onExtractNow: () => void
}

const PROMPT_PRESETS = [
  'Language model watermarking embeds an undetectable',
  'Cryptographic pseudorandom generators partition the',
  'Robust multi-bit verification relies on',
  'Error-correcting codebooks allow decoders to',
]

const ATTACK_BUTTONS: Array<{ id: AttackType; label: string }> = [
  { id: 'word_deletion', label: 'Word Deletion (10%)' },
  { id: 'word_insertion', label: 'Word Insertion (10%)' },
  { id: 'synonym_swap', label: 'Synonym Swap (10%)' },
  { id: 'paraphrase', label: 'Paraphrase (10%)' },
]

export function PlaygroundView({
  config,
  watermark,
  runtimeLabel,
  wasmReady,
  busy,
  errorMessage,
  prompt,
  onChangePrompt,
  embedResult,
  attackMeta,
  suspectText,
  extractResult,
  onEmbed,
  onAttack,
  onResetText,
  onChangeSuspectText,
  onExtractNow,
}: PlaygroundViewProps) {
  const [selectedStep, setSelectedStep] = useState<TokenStepTrace | null>(null)

  const metricLabel =
    config.method === 'levenshtein'
      ? 'Levenshtein d_L'
      : config.method === 'hamming'
        ? 'Hamming d_H'
        : 'BCH Flips'

  const matchedExact =
    extractResult !== null &&
    extractResult.is_watermarked &&
    extractResult.watermark === watermark

  const verdictKind: 'matched' | 'mismatch' | 'unwatermarked' | 'idle' =
    extractResult === null
      ? 'idle'
      : !extractResult.is_watermarked
        ? 'unwatermarked'
        : matchedExact
          ? 'matched'
          : 'mismatch'

  const biasFlips = embedResult
    ? embedResult.steps.filter((s) => s.bias_flipped_choice).length
    : 0

  return (
    <div className="space-y-5">
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Stage 1: Prompt & Embed */}
      <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <span className="font-mono text-[11px] font-medium tracking-wider text-emerald-400 uppercase">
              Stage 1 · Logit-Biased Generation
            </span>
            <h2 className="text-base font-semibold text-slate-100 text-balance">
              Embed {config.n}-bit Codeword into Token Stream
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded bg-[#272F42] px-2.5 py-1 font-mono text-[11px] text-slate-300">
            <Cpu className="h-3 w-3 text-emerald-400" aria-hidden="true" />
            <span>{runtimeLabel}</span>
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Presets:</span>
            {PROMPT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onChangePrompt(preset)}
                className={cn(
                  'rounded border px-2 py-1 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
                  prompt === preset
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-[#0F172A] text-slate-300 hover:border-slate-500',
                )}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="playground-prompt" className="sr-only">
                Generation prompt
              </label>
              <input
                id="playground-prompt"
                type="text"
                value={prompt}
                onChange={(e) => onChangePrompt(e.target.value)}
                placeholder="Enter a seed prompt..."
                className="w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={!wasmReady || busy}
              onClick={onEmbed}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              <span>{busy ? 'Running...' : 'Embed & Generate'}</span>
            </button>
          </div>
        </div>

        {embedResult && (
          <div className="mt-4 space-y-4 border-t border-slate-800 pt-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <MetricTile
                label="Bit Accuracy"
                value={`${(embedResult.embedded_bit_accuracy * 100).toFixed(1)}%`}
                accent
              />
              <MetricTile
                label="Bias Flips"
                value={`${biasFlips}/${embedResult.steps.length}`}
              />
              <MetricTile label="TI Retries" value={`${embedResult.ti_corrections}`} />
              <MetricTile
                label="Distinct-1 / 2"
                value={`${embedResult.quality.distinct_1.toFixed(2)} / ${embedResult.quality.distinct_2.toFixed(2)}`}
              />
              <MetricTile label="Embed Latency" value={`${embedResult.latency_ms.toFixed(1)} ms`} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Token Stream Ribbon (click a token to inspect V1/V0 logit margin)</span>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-emerald-500" /> V1
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-red-500" /> V0
                  </span>
                </div>
              </div>

              <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto rounded-lg border border-slate-800 bg-[#0F172A] p-3">
                {embedResult.steps.map((step) => {
                  const isV1 = step.selected_group === 1
                  const bitHit = step.selected_group === step.target_bit
                  const isSelected = selectedStep?.step === step.step
                  return (
                    <button
                      key={step.step}
                      type="button"
                      onClick={() => setSelectedStep(isSelected ? null : step)}
                      className={cn(
                        'rounded border px-1.5 py-0.5 font-mono text-xs transition-colors',
                        isV1
                          ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200 hover:border-emerald-400'
                          : 'border-red-500/35 bg-red-500/12 text-red-200 hover:border-red-400',
                        !bitHit && 'underline decoration-amber-400 decoration-dashed',
                        isSelected && 'ring-2 ring-slate-200',
                      )}
                      title={`t=${step.step} | target=${step.target_bit} | group=V${step.selected_group} | margin=${step.pre_bias_margin}`}
                    >
                      {step.token_text === ' ' ? '·' : step.token_text}
                    </button>
                  )
                })}
              </div>

              {selectedStep && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-700 bg-[#0F172A] px-3 py-2 font-mono text-xs text-slate-300 tabular-nums">
                  <span>
                    step <strong className="text-white">#{selectedStep.step}</strong>
                  </span>
                  <span>
                    token <strong className="text-white">{JSON.stringify(selectedStep.token_text)}</strong> (id{' '}
                    {selectedStep.token_id})
                  </span>
                  <span>
                    target <strong className="text-emerald-300">{selectedStep.target_bit}</strong> / picked{' '}
                    <strong className={selectedStep.selected_group === 1 ? 'text-emerald-300' : 'text-red-300'}>
                      V{selectedStep.selected_group}
                    </strong>
                  </span>
                  <span>pre-bias margin {selectedStep.pre_bias_margin.toFixed(3)}</span>
                  <span>flipped: {selectedStep.bias_flipped_choice ? 'yes' : 'no'}</span>
                  <span>TI retries: {selectedStep.ti_retries}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Stage 2: Channel Attacks & Manual Tampering */}
      <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <span className="font-mono text-[11px] font-medium tracking-wider text-amber-400 uppercase">
              Stage 2 · Appendix B Robustness Channel
            </span>
            <h2 className="text-base font-semibold text-slate-100 text-balance">
              Simulate Deletion, Insertion, Synonym Swap &amp; Paraphrase Attacks
            </h2>
          </div>

          {attackMeta && (
            <span className="rounded bg-[#272F42] px-2.5 py-1 font-mono text-[11px] text-slate-300 tabular-nums">
              {attackMeta.attack_name}: {attackMeta.modified_tokens}/{attackMeta.budget_tokens} tok edited (
              {attackMeta.original_tokens} -&gt; {attackMeta.attacked_tokens})
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pb-3">
          {ATTACK_BUTTONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              disabled={!embedResult || busy}
              onClick={() => onAttack(id)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#272F42] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-amber-500/50 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            >
              <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}

          <button
            type="button"
            disabled={!embedResult || busy}
            onClick={onResetText}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#0F172A] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset to Generated</span>
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="playground-suspect-text" className="text-xs font-medium text-slate-300">
              Suspect / Attacked Output (editable for custom tampering)
            </label>
            <button
              type="button"
              disabled={!wasmReady || !suspectText.trim() || busy}
              onClick={onExtractNow}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <SearchCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Extract &amp; Verify</span>
            </button>
          </div>
          <textarea
            id="playground-suspect-text"
            rows={4}
            value={suspectText}
            onChange={(e) => onChangeSuspectText(e.target.value)}
            placeholder="Generate watermarked prose above or paste any suspect text to run decoder search..."
            className="w-full rounded-lg border border-slate-700 bg-[#0F172A] p-3 font-mono text-xs leading-relaxed text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </section>

      {/* Stage 3: Codebook Extraction & Alignment Verdict */}
      <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <span className="font-mono text-[11px] font-medium tracking-wider text-emerald-400 uppercase">
              Stage 3 · Codebook Search Decoder
            </span>
            <h2 className="text-base font-semibold text-slate-100 text-balance">
              Recovered Watermark Verdict &amp; Bit Alignment
            </h2>
          </div>

          {verdictKind !== 'idle' && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-semibold',
                verdictKind === 'matched' &&
                  'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
                verdictKind === 'mismatch' &&
                  'border-amber-500/40 bg-amber-500/15 text-amber-300',
                verdictKind === 'unwatermarked' &&
                  'border-red-500/40 bg-red-500/15 text-red-300',
              )}
            >
              {verdictKind === 'matched' && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
              {verdictKind === 'mismatch' && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
              {verdictKind === 'unwatermarked' && <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>
                {verdictKind === 'matched'
                  ? 'EXACT MATCH'
                  : verdictKind === 'mismatch'
                    ? 'ID MISMATCH'
                    : 'BELOW THRESHOLD'}
              </span>
            </span>
          )}
        </div>

        {!extractResult ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-slate-700 bg-[#0F172A]/60 p-6 text-xs text-slate-400">
            <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span>
              Run <strong>Embed &amp; Generate</strong> to test exhaustive Levenshtein, Hamming, or BCH codebook recovery.
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <MetricTile
                label="Recovered ID"
                value={`${extractResult.watermark}`}
                subValue={`target ${watermark}`}
                accent={matchedExact}
              />
              <MetricTile label={metricLabel} value={`${extractResult.distance}`} />
              <MetricTile
                label="2nd-Best Dist"
                value={
                  extractResult.second_best_distance !== null
                    ? `${extractResult.second_best_distance}`
                    : 'N/A'
                }
              />
              <MetricTile
                label="Separation Margin"
                value={extractResult.margin !== null ? `+${extractResult.margin}` : 'N/A'}
                accent={(extractResult.margin ?? 0) > 0}
              />
              <MetricTile
                label="Search Latency"
                value={`${extractResult.latency_ms.toFixed(2)} ms`}
              />
            </div>

            <div className="space-y-2 rounded-lg border border-slate-800 bg-[#0F172A] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>
                  Bit Alignment ({extractResult.candidate_bits.length} extracted vs{' '}
                  {extractResult.matched_codeword.length} codeword bits)
                </span>
                <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-emerald-500" /> Match
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-amber-400" /> Sub
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-sky-400" /> Ins
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-red-500" /> Del
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-0.5">
                {extractResult.alignment.slice(0, 140).map((op, idx) => (
                  <span
                    key={idx}
                    title={`${op.kind}: src=${op.source_bit ?? '-'} -> tgt=${op.target_bit ?? '-'}`}
                    className={cn(
                      'inline-flex h-4 w-2.5 items-center justify-center rounded-[2px] font-mono text-[9px] text-slate-950 font-bold',
                      op.kind === 'match' && 'bg-emerald-500/85',
                      op.kind === 'substitute' && 'bg-amber-400',
                      op.kind === 'insert' && 'bg-sky-400',
                      op.kind === 'delete' && 'bg-red-500 text-white',
                    )}
                  >
                    {op.kind === 'delete' ? '-' : (op.target_bit ?? op.source_bit ?? '')}
                  </span>
                ))}
                {extractResult.alignment.length > 140 && (
                  <span className="ml-1 self-center font-mono text-[10px] text-slate-500">
                    +{extractResult.alignment.length - 140} ops
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function MetricTile({
  label,
  value,
  subValue,
  accent,
}: {
  label: string
  value: string
  subValue?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#0F172A] px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div
        className={cn(
          'mt-0.5 font-mono text-sm font-semibold tabular-nums',
          accent ? 'text-emerald-300' : 'text-slate-100',
        )}
      >
        {value}
      </div>
      {subValue && <div className="font-mono text-[10px] text-slate-500 tabular-nums">{subValue}</div>}
    </div>
  )
}
