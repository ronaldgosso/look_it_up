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
  const [hoverOp, setHoverOp] = useState<{ idx: number; op: AlignmentOp } | null>(null)

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

  return (
    <div className="space-y-4">
      {/* Side-by-side Dual Decoder Comparison */}
      {comparison && (
        <div className="rounded-lg border border-slate-800 bg-[#0F172A] p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Columns3 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Dual-Decoder Comparison (Positional Hamming vs. Myers Levenshtein)</span>
            </div>
            {frameshiftSaved && (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                <GitMerge className="h-3 w-3" aria-hidden="true" />
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
                    ? 'Frameshift desync: index shift scrambles suffix bits'
                    : 'Zero-gap XOR comparison'
                }
              />
            )}
            <DecoderCard
              name="Levenshtein (Myers DP d_L)"
              res={lev}
              targetWatermark={targetWatermark}
              subtitle="Aligns deletions & insertions cleanly"
            />
            {bch && (
              <DecoderCard
                name="Shortened BCH (GF(2^m))"
                res={bch}
                targetWatermark={targetWatermark}
                subtitle="Algebraic syndrome correction (positional)"
              />
            )}
          </div>
        </div>
      )}

      {/* Two-Track Alignment Diff Tape */}
      <div className="rounded-lg border border-slate-800 bg-[#0F172A] p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">
              Two-Track Sequence Edit Alignment
            </span>
            <span className="font-mono text-[11px] tabular-nums">
              (= {counts.match} · S {counts.substitute} · + {counts.insert} · - {counts.delete})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px]">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-xs bg-emerald-500" /> = Match
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-xs bg-amber-400" /> S Sub
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-xs bg-sky-400" /> + Insert Gap
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-xs bg-red-500" /> - Deleted Codebit
            </span>
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="inline-flex min-w-full items-stretch gap-2">
            <div className="flex shrink-0 flex-col justify-between py-0.5 pr-1 font-mono text-[10px] text-slate-500">
              <span>Cand y</span>
              <span>Edit</span>
              <span>Code L_W</span>
            </div>

            <div className="flex flex-nowrap gap-0.5">
              {primaryResult.alignment.map((op, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseEnter={() => setHoverOp({ idx, op })}
                  onFocus={() => setHoverOp({ idx, op })}
                  className={cn(
                    'flex w-3.5 shrink-0 flex-col items-center gap-0.5 rounded-[2px] py-0.5 font-mono text-[9px] leading-tight transition-colors focus:outline-none',
                    hoverOp?.idx === idx && 'ring-1 ring-slate-200',
                  )}
                  title={`op #${idx} (${op.kind}): src[${op.source_idx ?? '-'}]=${op.source_bit ?? '·'} -> tgt[${op.target_idx ?? '-'}]=${op.target_bit ?? '·'}`}
                >
                  <span
                    className={cn(
                      'w-full text-center',
                      op.source_bit === null ? 'text-slate-600' : 'text-slate-300',
                    )}
                  >
                    {op.source_bit ?? '·'}
                  </span>
                  <span
                    className={cn(
                      'w-full rounded-[1px] text-center font-bold',
                      op.kind === 'match' && 'bg-emerald-500/80 text-slate-950',
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
                      op.target_bit === null ? 'text-slate-600' : 'text-slate-300',
                    )}
                  >
                    {op.target_bit ?? '·'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {hoverOp && (
          <div className="flex flex-wrap items-center gap-4 rounded bg-[#1B2336] px-2.5 py-1.5 font-mono text-[11px] text-slate-300 tabular-nums">
            <span>col #{hoverOp.idx}</span>
            <span className="uppercase text-emerald-300">{hoverOp.op.kind}</span>
            <span>
              cand[{hoverOp.op.source_idx ?? '-'}] = {hoverOp.op.source_bit ?? 'gap'}
            </span>
            <span>
              code[{hoverOp.op.target_idx ?? '-'}] = {hoverOp.op.target_bit ?? 'gap'}
            </span>
          </div>
        )}
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
        'rounded-md border p-2.5',
        ok
          ? 'border-emerald-500/35 bg-emerald-500/5'
          : 'border-red-500/40 bg-red-500/10',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-200">{name}</span>
        {ok ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-emerald-300">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            <span>ID {res.watermark}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-red-300">
            <XCircle className="h-3 w-3" aria-hidden="true" />
            <span>WRONG ({res.watermark})</span>
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-slate-300 tabular-nums">
        <span>
          dist = <strong>{res.distance}</strong>
          {res.margin !== null ? ` (margin +${res.margin})` : ''}
        </span>
        <span className="text-slate-500">{res.latency_ms.toFixed(2)} ms</span>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">{subtitle}</p>
    </div>
  )
}
