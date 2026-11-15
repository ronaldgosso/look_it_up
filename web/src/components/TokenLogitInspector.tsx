import { ArrowLeft, ArrowRight, Crosshair, Flame, GitBranch, ShieldCheck } from 'lucide-react'
import type { TokenStepTrace } from '../types/studio'
import { cn } from '../utils/cn'

interface TokenLogitInspectorProps {
  steps: TokenStepTrace[]
  selectedIdx: number | null
  onSelectIdx: (idx: number) => void
}

export function TokenLogitInspector({
  steps,
  selectedIdx,
  onSelectIdx,
}: TokenLogitInspectorProps) {
  if (!steps.length) return null

  const activeIdx =
    selectedIdx !== null && selectedIdx >= 0 && selectedIdx < steps.length ? selectedIdx : 0
  const step = steps[activeIdx]

  const hasRichLogits =
    step.top_v1_logit !== undefined && step.top_v0_logit !== undefined

  const delta = step.bias_delta ?? 0
  const rawV1 = step.top_v1_logit ?? (step.selected_group === 1 ? step.pre_bias_margin : 0)
  const rawV0 = step.top_v0_logit ?? (step.selected_group === 0 ? step.pre_bias_margin : 0)
  const postV1 = step.target_bit === 1 ? rawV1 + delta : rawV1
  const postV0 = step.target_bit === 0 ? rawV0 + delta : rawV0

  const allVals = [rawV1, rawV0, postV1, postV0]
  const minLogit = Math.min(...allVals)
  const maxLogit = Math.max(...allVals)
  const span = Math.max(1, maxLogit - minLogit)
  const toWidthPct = (val: number) =>
    Math.max(8, Math.min(100, ((val - minLogit + span * 0.15) / (span * 1.15)) * 100))

  const jumpToNext = (predicate: (s: TokenStepTrace) => boolean) => {
    for (let offset = 1; offset <= steps.length; offset++) {
      const idx = (activeIdx + offset) % steps.length
      if (predicate(steps[idx])) {
        onSelectIdx(idx)
        return
      }
    }
  }

  const bitMatched = step.selected_group === step.target_bit

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-inset p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Crosshair className="size-4 text-accent" aria-hidden="true" />
          <span className="text-xs font-semibold text-ink">Logit-Bias Step Inspector</span>
          <span className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-xs text-ink-secondary tabular-nums">
            t = {step.step + 1} / {steps.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={activeIdx <= 0}
            onClick={() => onSelectIdx(activeIdx - 1)}
            aria-label="Previous token step"
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:border-ink-muted hover:text-ink disabled:opacity-40"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            disabled={activeIdx >= steps.length - 1}
            onClick={() => onSelectIdx(activeIdx + 1)}
            aria-label="Next token step"
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:border-ink-muted hover:text-ink disabled:opacity-40"
          >
            <span>Next</span>
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => jumpToNext((s) => s.bias_flipped_choice)}
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/12 px-2.5 py-1 text-xs font-medium text-accent-ink transition-colors hover:bg-emerald-500/20"
          >
            <Flame className="size-3.5" aria-hidden="true" />
            <span>Next Flip</span>
          </button>
          <button
            type="button"
            onClick={() => jumpToNext((s) => s.selected_group !== s.target_bit || s.ti_retries > 0)}
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/12 px-2.5 py-1 text-xs font-medium text-warning-ink transition-colors hover:bg-amber-500/20"
          >
            <GitBranch className="size-3.5" aria-hidden="true" />
            <span>Next Mismatch/TI</span>
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="space-y-3 rounded-md border border-border bg-surface/80 p-3 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-ink-secondary">
              V1 vs V0 Candidate Race {delta > 0 ? `(+${delta.toFixed(1)} to V${step.target_bit})` : ''}
            </span>
            <span
              className={cn(
                'rounded px-2 py-0.5 font-mono text-xs font-semibold',
                !bitMatched
                  ? 'bg-red-500/15 text-danger-ink'
                  : step.bias_flipped_choice
                    ? 'bg-emerald-500/20 text-accent-ink'
                    : 'bg-surface-elevated text-ink-secondary',
              )}
            >
              {!bitMatched
                ? 'Margin Override'
                : step.bias_flipped_choice
                  ? 'BIAS FLIPPED'
                  : 'Naturally Aligned'}
            </span>
          </div>

          {hasRichLogits ? (
            <div className="space-y-2.5 font-mono text-xs tabular-nums">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-accent-ink">
                    V1 peak: <span className="font-semibold text-ink">{JSON.stringify(step.top_v1_token)}</span>
                  </span>
                  <span className="text-ink-secondary">
                    {rawV1.toFixed(2)}
                    {step.target_bit === 1 && (
                      <span className="text-accent-ink"> to {postV1.toFixed(2)}</span>
                    )}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded bg-surface-inset">
                  <div
                    className={cn(
                      'h-full rounded transition-opacity',
                      step.target_bit === 1 ? 'bg-emerald-500' : 'bg-emerald-500/45',
                    )}
                    style={{ width: `${toWidthPct(postV1)}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-danger-ink">
                    V0 peak: <span className="font-semibold text-ink">{JSON.stringify(step.top_v0_token)}</span>
                  </span>
                  <span className="text-ink-secondary">
                    {rawV0.toFixed(2)}
                    {step.target_bit === 0 && (
                      <span className="text-danger-ink"> to {postV0.toFixed(2)}</span>
                    )}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded bg-surface-inset">
                  <div
                    className={cn(
                      'h-full rounded transition-opacity',
                      step.target_bit === 0 ? 'bg-red-500' : 'bg-red-500/45',
                    )}
                    style={{ width: `${toWidthPct(postV0)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="py-2 font-mono text-xs text-ink-muted">
              Detailed candidate logit pairs appear in WASM Browser mode. Current pre-bias margin:{' '}
              <span className="font-semibold text-ink">{step.pre_bias_margin.toFixed(3)}</span>
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-md border border-border bg-surface/80 font-mono text-xs tabular-nums lg:col-span-6">
          <div className="p-3">
            <dt className="font-sans text-xs text-ink-muted">Selected Token</dt>
            <dd className="mt-1 truncate text-sm font-semibold text-ink">
              {JSON.stringify(step.token_text)}
            </dd>
            <dd className="mt-0.5 text-xs text-ink-muted">id #{step.token_id}</dd>
          </div>

          <div className="p-3">
            <dt className="font-sans text-xs text-ink-muted">Codeword Target vs Pick</dt>
            <dd className="mt-1 text-sm font-semibold">
              <span className="text-accent-ink">b[{step.step}] = {step.target_bit}</span>
              <span className="mx-1.5 text-ink-muted">/</span>
              <span className={step.selected_group === 1 ? 'text-accent-ink' : 'text-danger-ink'}>
                V{step.selected_group}
              </span>
            </dd>
            <dd className="mt-0.5 text-xs text-ink-muted">
              margin = {step.pre_bias_margin.toFixed(3)}
            </dd>
          </div>

          <div className="p-3">
            <dt className="font-sans text-xs text-ink-muted">SHA-256 Partition</dt>
            <dd className="mt-1 text-xs font-semibold text-ink">
              {step.v1_fraction !== undefined
                ? `${(step.v1_fraction * 100).toFixed(1)}% V1`
                : 'Balanced 50.0%'}
            </dd>
            <dd className="mt-0.5 text-xs text-ink-muted">key || prev_token</dd>
          </div>

          <div className="p-3">
            <dt className="flex items-center gap-1 font-sans text-xs text-ink-muted">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden="true" />
              <span>TI Merge Check</span>
            </dt>
            <dd className="mt-1 text-xs font-semibold text-ink">
              {step.ti_retries} {step.ti_retries === 1 ? 'retry' : 'retries'}
            </dd>
            <dd className="mt-0.5 text-xs text-ink-muted">Appendix F roundtrip</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
