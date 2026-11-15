import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Play,
  RotateCcw,
  Scissors,
  SearchCheck,
  Terminal,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import type {
  AttackResponse,
  AttackType,
  DualDecoderComparison,
  EmbedResponse,
  ExtractResponse,
  StudioConfig,
} from '../types/studio'
import { cn } from '../utils/cn'
import { AlignmentFrameshiftPanel } from './AlignmentFrameshiftPanel'
import { TokenLogitInspector } from './TokenLogitInspector'

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
  attackBudget: number
  onChangeAttackBudget: (budget: number) => void
  attackSeed: number
  onChangeAttackSeed: (seed: number) => void
  suspectText: string
  extractResult: ExtractResponse | null
  decoderComparison: DualDecoderComparison | null
  onEmbed: () => void
  onAttack: (attackType: AttackType) => void
  onResetText: () => void
  onChangeSuspectText: (text: string) => void
  onExtractNow: () => void
}

const PROMPT_PRESETS: Array<{ label: string; text: string }> = [
  {
    label: 'Watermarking',
    text: 'Language model watermarking embeds an undetectable',
  },
  {
    label: 'PRG Partition',
    text: 'Cryptographic pseudorandom generators partition the',
  },
  {
    label: 'Multi-bit Verify',
    text: 'Robust multi-bit verification relies on',
  },
  {
    label: 'Error-Correcting',
    text: 'Error-correcting codebooks allow decoders to',
  },
]

const ATTACK_BUTTONS: Array<{ id: AttackType; label: string }> = [
  { id: 'word_deletion', label: 'Word Deletion' },
  { id: 'word_insertion', label: 'Word Insertion' },
  { id: 'synonym_swap', label: 'Synonym Swap' },
  { id: 'paraphrase', label: 'Paraphrase' },
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
  attackBudget,
  onChangeAttackBudget,
  attackSeed,
  onChangeAttackSeed,
  suspectText,
  extractResult,
  decoderComparison,
  onEmbed,
  onAttack,
  onResetText,
  onChangeSuspectText,
  onExtractNow,
}: PlaygroundViewProps) {
  const [selectedStepIdx, setSelectedStepIdx] = useState<number>(0)

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
          className="flex items-start gap-2.5 rounded-lg border border-red-500/45 bg-red-500/12 p-3 text-xs text-danger-ink"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      <section aria-labelledby="stage-1-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-emerald-500/40 bg-emerald-500/12 font-mono text-xs font-semibold text-accent-ink"
            >
              1
            </span>
            <h2 id="stage-1-heading" className="text-base font-semibold text-ink text-balance">
              Embed {config.n}-bit Codeword into Token Stream
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-inset px-2.5 py-1 font-mono text-xs text-ink-secondary">
            <Cpu className="size-3.5 text-accent" aria-hidden="true" />
            <span>{runtimeLabel}</span>
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Prompt presets">
            <span className="text-xs text-ink-muted">Presets:</span>
            {PROMPT_PRESETS.map((preset) => {
              const selected = prompt === preset.text
              return (
                <button
                  key={preset.label}
                  type="button"
                  title={preset.text}
                  onClick={() => onChangePrompt(preset.text)}
                  aria-pressed={selected}
                  className={cn(
                    'min-h-7 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    selected
                      ? 'border-emerald-500/55 bg-emerald-500/15 text-accent-ink'
                      : 'border-border-strong bg-surface-inset text-ink-secondary hover:border-ink-muted hover:text-ink',
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
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
                className="min-h-10 w-full rounded-lg border border-border-strong bg-surface-inset px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-emerald-400"
              />
            </div>

            <button
              type="button"
              disabled={!wasmReady || busy}
              onClick={onEmbed}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
            >
              <Play className="size-4 fill-current" aria-hidden="true" />
              <span>{busy ? 'Running...' : 'Embed & Generate'}</span>
            </button>
          </div>
        </div>

        {embedResult && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <dl className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-inset sm:grid-cols-5 sm:divide-x sm:divide-y-0">
              <KpiCell
                label="Bit Accuracy"
                value={`${(embedResult.embedded_bit_accuracy * 100).toFixed(1)}%`}
                accent
              />
              <KpiCell label="Bias Flips" value={`${biasFlips}/${embedResult.steps.length}`} />
              <KpiCell label="TI Retries" value={`${embedResult.ti_corrections}`} />
              <KpiCell
                label="Distinct-1 / 2"
                value={`${embedResult.quality.distinct_1.toFixed(2)} / ${embedResult.quality.distinct_2.toFixed(2)}`}
              />
              <KpiCell label="Embed Latency" value={`${embedResult.latency_ms.toFixed(1)} ms`} />
            </dl>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-ink-secondary">
                  Token Stream Ribbon (select any token to inspect logit competition)
                </span>
                <div className="flex items-center gap-3 font-mono text-xs text-ink-secondary">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-xs bg-emerald-500" aria-hidden="true" /> V1
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-xs bg-rose-500" aria-hidden="true" /> V0
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-xs border-b-2 border-amber-400" aria-hidden="true" /> Bit mismatch
                  </span>
                </div>
              </div>

              <div className="studio-scroll flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface-inset p-3">
                {embedResult.steps.map((step, idx) => {
                  const isV1 = step.selected_group === 1
                  const bitHit = step.selected_group === step.target_bit
                  const isSelected = selectedStepIdx === idx
                  return (
                    <button
                      key={step.step}
                      type="button"
                      onClick={() => setSelectedStepIdx(idx)}
                      aria-pressed={isSelected}
                      className={cn(
                        'rounded border px-2 py-0.5 font-mono text-xs transition-colors',
                        isV1
                          ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-100 hover:border-emerald-400/70'
                          : 'border-rose-500/30 bg-surface-elevated text-ink-secondary hover:border-rose-400/70',
                        !bitHit && 'border-b-2 border-b-amber-400',
                        isSelected && 'bg-emerald-500/25 text-ink ring-2 ring-emerald-400',
                      )}
                      title={`t=${step.step} | target=${step.target_bit} | group=V${step.selected_group} | margin=${step.pre_bias_margin}`}
                    >
                      {step.token_text === ' ' ? 'space' : step.token_text}
                    </button>
                  )
                })}
              </div>

              <TokenLogitInspector
                steps={embedResult.steps}
                selectedIdx={selectedStepIdx}
                onSelectIdx={setSelectedStepIdx}
              />
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="stage-2-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-amber-500/40 bg-amber-500/12 font-mono text-xs font-semibold text-warning-ink"
            >
              2
            </span>
            <h2 id="stage-2-heading" className="text-base font-semibold text-ink text-balance">
              Adversarial Channel Attacks &amp; Manual Tampering
            </h2>
          </div>

          {attackMeta && (
            <span className="rounded border border-border bg-surface-inset px-2.5 py-1 font-mono text-xs text-ink-secondary tabular-nums">
              {attackMeta.attack_name}: {attackMeta.modified_tokens}/{attackMeta.budget_tokens} tok edited (
              {attackMeta.original_tokens} to {attackMeta.attacked_tokens})
            </span>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface-inset px-3.5 py-2.5">
          <div className="flex items-center gap-3">
            <label htmlFor="attack-budget-slider" className="text-xs font-medium text-ink-secondary">
              Token Attack Budget
            </label>
            <input
              id="attack-budget-slider"
              type="range"
              min={0.05}
              max={0.3}
              step={0.05}
              value={attackBudget}
              onChange={(e) => onChangeAttackBudget(Number(e.target.value))}
              className="h-2 w-28 accent-amber-400"
            />
            <span className="w-10 font-mono text-xs font-semibold text-warning-ink tabular-nums">
              {(attackBudget * 100).toFixed(0)}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="attack-seed-input" className="text-xs font-medium text-ink-secondary">
              Seed
            </label>
            <input
              id="attack-seed-input"
              type="number"
              min={0}
              max={999}
              value={attackSeed}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10)
                onChangeAttackSeed(Number.isNaN(parsed) ? 0 : Math.max(0, parsed))
              }}
              className="min-h-8 w-16 rounded border border-border-strong bg-surface px-2 py-1 font-mono text-xs text-ink tabular-nums focus:border-emerald-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pb-3">
          {ATTACK_BUTTONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              disabled={!embedResult || busy}
              onClick={() => onAttack(id)}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface-elevated px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-amber-500/60 hover:text-warning-ink disabled:opacity-45"
            >
              <Scissors className="size-3.5" aria-hidden="true" />
              <span>
                {label} ({(attackBudget * 100).toFixed(0)}%)
              </span>
            </button>
          ))}

          <button
            type="button"
            disabled={!embedResult || busy}
            onClick={onResetText}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-ink-muted hover:text-ink disabled:opacity-45"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <span>Reset to Generated</span>
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="playground-suspect-text" className="text-xs font-medium text-ink-secondary">
              Suspect / Attacked Output (editable for manual tampering)
            </label>
            <button
              type="button"
              disabled={!wasmReady || !suspectText.trim() || busy}
              onClick={onExtractNow}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-emerald-500/45 bg-emerald-500/12 px-3 py-1 text-xs font-medium text-accent-ink transition-colors hover:bg-emerald-500/20 disabled:opacity-45"
            >
              <SearchCheck className="size-3.5" aria-hidden="true" />
              <span>Extract &amp; Verify</span>
            </button>
          </div>
          <textarea
            id="playground-suspect-text"
            rows={4}
            value={suspectText}
            onChange={(e) => onChangeSuspectText(e.target.value)}
            placeholder="Generate watermarked prose above or paste any suspect text to run decoder search..."
            className="w-full rounded-lg border border-border-strong bg-surface-inset p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-ink-muted focus:border-emerald-400"
          />
        </div>
      </section>

      <section aria-labelledby="stage-3-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-emerald-500/40 bg-emerald-500/12 font-mono text-xs font-semibold text-accent-ink"
            >
              3
            </span>
            <h2 id="stage-3-heading" className="text-base font-semibold text-ink text-balance">
              Codebook Extraction Verdict &amp; Sequence Alignment
            </h2>
          </div>

          {verdictKind !== 'idle' && (
            <span
              role="status"
              aria-live="polite"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-semibold',
                verdictKind === 'matched' &&
                  'border-emerald-500/45 bg-emerald-500/15 text-accent-ink',
                verdictKind === 'mismatch' &&
                  'border-amber-500/45 bg-amber-500/15 text-warning-ink',
                verdictKind === 'unwatermarked' &&
                  'border-red-500/45 bg-red-500/15 text-danger-ink',
              )}
            >
              {verdictKind === 'matched' && <CheckCircle2 className="size-3.5" aria-hidden="true" />}
              {verdictKind === 'mismatch' && <AlertTriangle className="size-3.5" aria-hidden="true" />}
              {verdictKind === 'unwatermarked' && <XCircle className="size-3.5" aria-hidden="true" />}
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border-strong bg-surface-inset p-5">
            <div className="flex items-start gap-2.5 text-xs text-ink-secondary text-pretty">
              <Terminal className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>
                No extracted bitstring yet. Generate watermarked tokens in step 1 or paste suspect text above to compare Levenshtein, Hamming, and BCH decoders.
              </span>
            </div>
            <button
              type="button"
              disabled={!wasmReady || busy}
              onClick={onEmbed}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-500/45 bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-emerald-500/20 disabled:opacity-45"
            >
              <Play className="size-3.5 fill-current" aria-hidden="true" />
              <span>Run Sample Extraction</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-inset sm:grid-cols-5 sm:divide-x sm:divide-y-0">
              <KpiCell
                label="Recovered ID"
                value={`${extractResult.watermark}`}
                subValue={`target ${watermark}`}
                accent={matchedExact}
              />
              <KpiCell label={metricLabel} value={`${extractResult.distance}`} />
              <KpiCell
                label="2nd-Best Dist"
                value={
                  extractResult.second_best_distance !== null
                    ? `${extractResult.second_best_distance}`
                    : 'N/A'
                }
              />
              <KpiCell
                label="Separation Margin"
                value={extractResult.margin !== null ? `+${extractResult.margin}` : 'N/A'}
                accent={(extractResult.margin ?? 0) > 0}
              />
              <KpiCell label="Search Latency" value={`${extractResult.latency_ms.toFixed(2)} ms`} />
            </dl>

            <AlignmentFrameshiftPanel
              targetWatermark={watermark}
              u={config.u}
              primaryResult={extractResult}
              comparison={decoderComparison}
            />
          </div>
        )}
      </section>
    </div>
  )
}

function KpiCell({
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
    <div className="px-3.5 py-2.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 font-mono text-sm font-semibold tabular-nums',
          accent ? 'text-accent-ink' : 'text-ink',
        )}
      >
        {value}
      </dd>
      {subValue && <dd className="font-mono text-xs text-ink-muted tabular-nums">{subValue}</dd>}
    </div>
  )
}
