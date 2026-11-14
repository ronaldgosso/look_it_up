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
  const toWidthPct = (val: number) => Math.max(8, Math.min(100, ((val - minLogit + span * 0.15) / (span * 1.15)) * 100))

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
    <div className="rounded-lg border border-slate-700/80 bg-[#0F172A] p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Crosshair className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          <span className="text-xs font-semibold text-slate-200">
            Logit-Bias Step Inspector
          </span>
          <span className="rounded bg-[#272F42] px-2 py-0.5 font-mono text-[11px] text-slate-300 tabular-nums">
            t = {step.step + 1} / {steps.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={activeIdx <= 0}
            onClick={() => onSelectIdx(activeIdx - 1)}
            aria-label="Previous token step"
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#1B2336] px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            disabled={activeIdx >= steps.length - 1}
            onClick={() => onSelectIdx(activeIdx + 1)}
            aria-label="Next token step"
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#1B2336] px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
          >
            <span>Next</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => jumpToNext((s) => s.bias_flipped_choice)}
            className="inline-flex items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20"
          >
            <Flame className="h-3 w-3" aria-hidden="true" />
            <span>Next Flip</span>
          </button>
          <button
            type="button"
            onClick={() => jumpToNext((s) => s.selected_group !== s.target_bit || s.ti_retries > 0)}
            className="inline-flex items-center gap-1 rounded border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20"
          >
            <GitBranch className="h-3 w-3" aria-hidden="true" />
            <span>Next Mismatch/TI</span>
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Competition Race Bars */}
        <div className="space-y-2.5 rounded-md border border-slate-800 bg-[#1B2336]/55 p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>
              V1 vs V0 Peak Candidate Race {delta > 0 ? `(+${delta.toFixed(1)} to V${step.target_bit})` : ''}
            </span>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                !bitMatched
                  ? 'bg-red-500/15 text-red-300'
                  : step.bias_flipped_choice
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-700/70 text-slate-300',
              )}
            >
              {!bitMatched
                ? 'MARGIN OVERRIDE'
                : step.bias_flipped_choice
                  ? 'BIAS FLIPPED'
                  : 'NATURALLY ALIGNED'}
            </span>
          </div>

          {hasRichLogits ? (
            <div className="space-y-2 font-mono text-xs tabular-nums">
              {/* V1 bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-emerald-300">
                    V1 peak: <strong className="text-white">{JSON.stringify(step.top_v1_token)}</strong>
                  </span>
                  <span className="text-slate-300">
                    {rawV1.toFixed(2)}
                    {step.target_bit === 1 && (
                      <span className="text-emerald-400"> -&gt; {postV1.toFixed(2)}</span>
                    )}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded bg-[#0F172A]">
                  <div
                    className={cn(
                      'h-full rounded transition-all',
                      step.target_bit === 1 ? 'bg-emerald-500' : 'bg-emerald-500/50',
                    )}
                    style={{ width: `${toWidthPct(postV1)}%` }}
                  />
                </div>
              </div>

              {/* V0 bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-red-300">
                    V0 peak: <strong className="text-white">{JSON.stringify(step.top_v0_token)}</strong>
                  </span>
                  <span className="text-slate-300">
                    {rawV0.toFixed(2)}
                    {step.target_bit === 0 && (
                      <span className="text-red-400"> -&gt; {postV0.toFixed(2)}</span>
                    )}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded bg-[#0F172A]">
                  <div
                    className={cn(
                      'h-full rounded transition-all',
                      step.target_bit === 0 ? 'bg-red-500' : 'bg-red-500/50',
                    )}
                    style={{ width: `${toWidthPct(postV0)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="py-2 font-mono text-xs text-slate-400">
              Detailed candidate logit pairs appear when generated via WASM Browser mode; current step pre-bias margin ={' '}
              <strong className="text-slate-200">{step.pre_bias_margin.toFixed(3)}</strong>.
            </div>
          )}
        </div>

        {/* Step Telemetry */}
        <div className="grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
          <div className="rounded border border-slate-800 bg-[#1B2336]/55 p-2.5">
            <div className="text-[10px] text-slate-400 uppercase">Selected Token</div>
            <div className="mt-1 truncate text-sm font-semibold text-white">
              {JSON.stringify(step.token_text)}
            </div>
            <div className="text-[10px] text-slate-500">id #{step.token_id}</div>
          </div>

          <div className="rounded border border-slate-800 bg-[#1B2336]/55 p-2.5">
            <div className="text-[10px] text-slate-400 uppercase">Codeword Target vs Pick</div>
            <div className="mt-1 text-sm font-semibold">
              <span className="text-emerald-300">b[{step.step}] = {step.target_bit}</span>
              <span className="mx-1.5 text-slate-600">/</span>
              <span className={step.selected_group === 1 ? 'text-emerald-300' : 'text-red-300'}>
                V{step.selected_group}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              margin = {step.pre_bias_margin.toFixed(3)}
            </div>
          </div>

          <div className="rounded border border-slate-800 bg-[#1B2336]/55 p-2.5">
            <div className="text-[10px] text-slate-400 uppercase">SHA-256 Vocab Partition</div>
            <div className="mt-1 text-xs font-semibold text-slate-200">
              {step.v1_fraction !== undefined
                ? `${(step.v1_fraction * 100).toFixed(1)}% V1`
                : 'Balanced 50.0%'}
            </div>
            <div className="text-[10px] text-slate-500">seeded by (key, prev_tok)</div>
          </div>

          <div className="rounded border border-slate-800 bg-[#1B2336]/55 p-2.5">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase">
              <ShieldCheck className="h-3 w-3 text-emerald-400" aria-hidden="true" />
              <span>TI Merge Check</span>
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-200">
              {step.ti_retries} {step.ti_retries === 1 ? 'retry' : 'retries'}
            </div>
            <div className="text-[10px] text-slate-500">Appendix F roundtrip</div>
          </div>
        </div>
      </div>
    </div>
  )
}
