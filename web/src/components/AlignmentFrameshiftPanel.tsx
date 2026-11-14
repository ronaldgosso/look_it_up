import { CheckCircle2, Columns3, GitMerge, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { AlignmentOp, DualDecoderComparison, ExtractResponse } from '../types/studio'
import { cn } from '../utils/cn'

interface AlignmentFrameshiftPanelProps {
  targetWatermark: number
  u: number
  primaryResult: ExtractResponse
  comparison: DualDecoderComparison | null
}

export function AlignmentFrameshiftPanel({
  targetWatermark,
  u,
  primaryResult,
  comparison,
}: AlignmentFrameshiftPanelProps) {
  const [activeColIdx, setActiveColIdx] = useState<number>(0)

  const hamming = comparison?.hamming ?? null
  const lev = comparison?.levenshtein ?? primaryResult
  const bch = comparison?.bch ?? null

  const hammingFailed = hamming !== null && hamming.watermark !== targetWatermark
  const levSucceeded = lev.watermark === targetWatermark
  const frameshiftSaved = hammingFailed && levSucceeded

  const counts = primaryResult.alignment.reduce(
    (acc, op) => {
      acc[op.kind] += 1
      return acc
    },
    { match: 0, substitute: 0, insert: 0, delete: 0 },
  )

  const clampedIdx =
    primaryResult.alignment.length > 0
      ? Math.min(activeColIdx, primaryResult.alignment.length - 1)
      : 0
  const activeOp: AlignmentOp | undefined = primaryResult.alignment[clampedIdx]

  return (
    <div className="space-y-4">
      {comparison && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-inset p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink">
              <Columns3 className="size-4 text-accent" aria-hidden="true" />
              <span>Dual-Decoder Comparison (Positional Hamming vs. Myers Levenshtein)</span>
            </div>
            {frameshiftSaved && (
              <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/45 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-accent-ink">
                <GitMerge className="size-3.5" aria-hidden="true" />
                <span>FRAMESHIFT RECOVERED BY LEVENSHTEIN</span>
              </span>
            )}
          </div>

          <div className={cn('grid gap-2.5', bch ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
            {hamming && (
              <DecoderCard
                name="Hamming (Fixed-Index d_H)"
                res={hamming}
                targetWatermark={targetWatermark}
                subtitle={
                  hamming.watermark !== targetWatermark && primaryResult.candidate_bits.length !== u
                    ? 'Frameshift desync shifts every downstream index'
                    : 'Zero-gap XOR comparison'
                }
              />
            )}
            <DecoderCard
              name="Levenshtein (Myers DP d_L)"
              res={lev}
              targetWatermark={targetWatermark}
              subtitle="Aligns token deletions and insertions"
            />
            {bch && (
              <DecoderCard
                name="Shortened BCH (GF(2^m))"
                res={bch}
                targetWatermark={targetWatermark}
                subtitle="Algebraic syndrome decoding (positional)"
              />
            )}
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border bg-surface-inset p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">Two-Track Sequence Edit Alignment</span>
            <span className="font-mono text-ink-muted tabular-nums">
              (= {counts.match} / S {counts.substitute} / + {counts.insert} / - {counts.delete})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-ink-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-xs bg-emerald-500" aria-hidden="true" /> = Match
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-xs bg-amber-400" aria-hidden="true" /> S Sub
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-xs bg-sky-400" aria-hidden="true" /> + Insert Gap
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-xs bg-red-500" aria-hidden="true" /> - Deleted Codebit
            </span>
          </div>
        </div>

        <div className="studio-scroll overflow-x-auto pb-1.5">
          <div className="inline-flex min-w-full items-stretch gap-2">
            <div className="flex shrink-0 flex-col justify-between py-0.5 pr-1.5 font-mono text-xs text-ink-muted">
              <span>Cand y</span>
              <span>Edit</span>
              <span>Code L_W</span>
            </div>

            <div className="flex flex-nowrap gap-0.5">
              {primaryResult.alignment.map((op, idx) => {
                const isActive = clampedIdx === idx
                return (
                  <button
                    key={idx}
                    type="button"
                    onMouseEnter={() => setActiveColIdx(idx)}
                    onFocus={() => setActiveColIdx(idx)}
                    onClick={() => setActiveColIdx(idx)}
                    aria-label={`Column ${idx}: ${op.kind}, candidate bit ${op.source_bit ?? 'gap'}, codeword bit ${op.target_bit ?? 'gap'}`}
                    className={cn(
                      'flex w-4 shrink-0 flex-col items-center gap-0.5 rounded-xs py-0.5 font-mono text-[11px] leading-tight transition-colors',
                      isActive && 'bg-surface-elevated ring-1 ring-ink-secondary',
                    )}
                  >
                    <span
                      className={cn(
                        'w-full text-center',
                        op.source_bit === null ? 'text-ink-muted' : 'text-ink-secondary',
                      )}
                    >
                      {op.source_bit ?? '-'}
                    </span>
                    <span
                      className={cn(
                        'w-full rounded-[2px] text-center font-bold',
                        op.kind === 'match' && 'bg-emerald-500/85 text-slate-950',
                        op.kind === 'substitute' && 'bg-amber-400 text-slate-950',
                        op.kind === 'insert' && 'bg-sky-400 text-slate-950',
                        op.kind === 'delete' && 'bg-red-500 text-white',
                      )}
                    >
                      {op.kind === 'match'
                        ? '='
                        : op.kind === 'substitute'
                          ? 'S'
                          : op.kind === 'insert'
                            ? '+'
                            : '-'}
                    </span>
                    <span
                      className={cn(
                        'w-full text-center',
                        op.target_bit === null ? 'text-ink-muted' : 'text-ink-secondary',
                      )}
                    >
                      {op.target_bit ?? '-'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex min-h-8 flex-wrap items-center gap-4 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-xs text-ink-secondary tabular-nums">
          {activeOp ? (
            <>
              <span>col #{clampedIdx}</span>
              <span className="font-semibold text-accent-ink">{activeOp.kind}</span>
              <span>
                cand[{activeOp.source_idx ?? '-'}] = {activeOp.source_bit ?? 'gap'}
              </span>
              <span>
                code[{activeOp.target_idx ?? '-'}] = {activeOp.target_bit ?? 'gap'}
              </span>
            </>
          ) : (
            <span className="text-ink-muted">Hover or focus any alignment column to inspect bit coordinates.</span>
          )}
        </div>
      </div>
    </div>
  )
}

function DecoderCard({
  name,
  res,
  targetWatermark,
  subtitle,
}: {
  name: string
  res: ExtractResponse
  targetWatermark: number
  subtitle: string
}) {
  const ok = res.watermark === targetWatermark
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        ok ? 'border-emerald-500/40 bg-emerald-500/8' : 'border-red-500/45 bg-red-500/10',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">{name}</span>
        {ok ? (
          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-accent-ink">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            <span>ID {res.watermark}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-danger-ink">
            <XCircle className="size-3.5" aria-hidden="true" />
            <span>WRONG ({res.watermark})</span>
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-xs text-ink-secondary tabular-nums">
        <span>
          dist = <strong className="text-ink">{res.distance}</strong>
          {res.margin !== null ? ` (margin +${res.margin})` : ''}
        </span>
        <span className="text-ink-muted">{res.latency_ms.toFixed(2)} ms</span>
      </div>
      <p className="mt-1.5 text-xs text-ink-muted text-pretty">{subtitle}</p>
    </div>
  )
}
