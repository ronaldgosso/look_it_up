import { AlertTriangle, CheckCircle2, Cpu, Scissors, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { computeBchShorteningCurve, simulateBchChannel } from '../engine/watermarkEngine'
import type { LlmwWasmClient } from '../wasm/llmwWasm'
import { cn } from '../utils/cn'

interface BchAnalyzerPanelProps {
  n: number
  u: number
  watermark: number
  currentT: number
  wasm: LlmwWasmClient | null
}

const CURVE_U_SERIES = [
  { u: 63, stroke: '#94A3B8', label: 'u = 63 (GF(2^6))' },
  { u: 127, stroke: '#22C55E', label: 'u = 127 (GF(2^7))' },
  { u: 200, stroke: '#38BDF8', label: 'u = 200 (shortened from 255)' },
]
const CURVE_N_VALUES = [8, 10, 12, 16, 20, 24, 28, 32]

export function BchAnalyzerPanel({
  n,
  u,
  watermark,
  currentT,
  wasm,
}: BchAnalyzerPanelProps) {
  const [flippedBits, setFlippedBits] = useState<number[]>([])
  const [dropFrameshift, setDropFrameshift] = useState(false)

  const curvePoints = useMemo(
    () => computeBchShorteningCurve([63, 127, 200], CURVE_N_VALUES),
    [],
  )

  const bchTrial = useMemo(() => {
    if (!wasm) return null
    return simulateBchChannel(
      wasm,
      n,
      u,
      watermark & ((1 << n) - 1),
      flippedBits.filter((i) => i < u),
      dropFrameshift ? Math.floor(u / 4) : null,
    )
  }, [wasm, n, u, watermark, flippedBits, dropFrameshift])

  const injectRandomFlips = (count: number) => {
    const picks = new Set<number>()
    let step = 7
    while (picks.size < Math.min(count, u)) {
      picks.add((step * picks.size + 5) % u)
      step += 3
    }
    setFlippedBits(Array.from(picks).sort((a, b) => a - b))
  }

  const toggleBit = (idx: number) => {
    setFlippedBits((prev) =>
      prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx].sort((a, b) => a - b),
    )
  }

  // SVG Curve Geometry
  const width = 680
  const height = 210
  const padL = 38
  const padR = 16
  const padT = 18
  const padB = 30
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const maxT = Math.max(10, ...curvePoints.map((p) => p.t))
  const toX = (nVal: number) => padL + ((nVal - 8) / (32 - 8)) * plotW
  const toY = (tVal: number) => padT + plotH - (tVal / maxT) * plotH

  return (
    <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5 space-y-5">
      {/* Curve Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-[11px] font-medium tracking-wider text-emerald-400 uppercase">
            Table V &amp; Appendix D · BCH Algebraic Scaling
          </span>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Cpu className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span>Shortened BCH Error-Correction Frontier (Payload n vs. Capability t)</span>
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          {CURVE_U_SERIES.map((s) => (
            <span key={s.u} className="inline-flex items-center gap-1.5 text-slate-300">
              <span className="h-0.5 w-3" style={{ backgroundColor: s.stroke }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Inline SVG BCH Capacity Curve */}
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0F172A] p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Shortened BCH correction capability t across payload bits n"
          className="w-full min-w-[480px] select-none"
        >
          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const val = Math.round(maxT * frac)
            const y = toY(val)
            return (
              <g key={frac}>
                <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="#1E293B" strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3} textAnchor="end" fill="#64748B" fontSize="9" fontFamily="monospace">
                  {val}b
                </text>
              </g>
            )
          })}

          <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#334155" />
          <line x1={padL} x2={width - padR} y1={padT + plotH} y2={padT + plotH} stroke="#334155" />

          {CURVE_U_SERIES.map((series) => {
            const pts = curvePoints.filter((p) => p.u === series.u)
            const poly = pts.map((p) => `${toX(p.n).toFixed(1)},${toY(p.t).toFixed(1)}`).join(' ')
            return (
              <g key={series.u}>
                <polyline fill="none" stroke={series.stroke} strokeWidth="2" points={poly} />
                {pts.map((p) => (
                  <circle key={`${p.u}-${p.n}`} cx={toX(p.n)} cy={toY(p.t)} r="3.5" fill={series.stroke}>
                    <title>{`n=${p.n}, u=${p.u} (shortened ${p.shorteningBits}b from GF(2^${p.fieldDegree})): t=${p.t} bits (${(
                      p.correctionRate * 100
                    ).toFixed(1)}%)`}</title>
                  </circle>
                ))}
              </g>
            )
          })}

          {/* Highlight active Studio (n, currentT) point */}
          {n >= 8 && n <= 32 && (
            <g>
              <circle
                cx={toX(n)}
                cy={toY(currentT)}
                r="6"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2"
              />
              <text
                x={toX(n) + 8}
                y={toY(currentT) + 16}
                fill="#FCD34D"
                fontSize="10"
                fontFamily="monospace"
              >
                Active ({n}b, t={currentT})
              </text>
            </g>
          )}

          {CURVE_N_VALUES.map((nv) => (
            <text
              key={nv}
              x={toX(nv)}
              y={height - 10}
              textAnchor="middle"
              fill="#94A3B8"
              fontSize="10"
              fontFamily="monospace"
            >
              n={nv}
            </text>
          ))}
        </svg>
      </div>

      {/* Interactive BCH Bit-Flip & Frameshift Sandbox */}
      {bchTrial && (
        <div className="rounded-lg border border-slate-800 bg-[#0F172A] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Zap className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>Interactive BCH Berlekamp-Massey Syndrome Sandbox (t = {currentT} bits)</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Click any codeword bit below to toggle channel noise or simulate a positional deletion frameshift.
              </p>
            </div>

            {bchTrial.succeeded ? (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>DECODED ID {bchTrial.decodedWatermark} ({bchTrial.flips} fixed)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-red-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {dropFrameshift ? 'FRAMESHIFT DESYNC' : 'EXCEEDED t BOUND'} (got {bchTrial.decodedWatermark})
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => injectRandomFlips(Math.min(currentT, 3))}
              className="rounded border border-slate-700 bg-[#1B2336] px-2.5 py-1 text-xs text-slate-200 hover:border-emerald-500/50"
            >
              Inject {Math.min(currentT, 3)} Bit Flips (&le; t)
            </button>
            <button
              type="button"
              onClick={() => injectRandomFlips(currentT)}
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20"
            >
              Max Guarantee: Inject t={currentT} Flips
            </button>
            <button
              type="button"
              onClick={() => injectRandomFlips(currentT + 3)}
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/20"
            >
              Overload: Inject {currentT + 3} Flips (&gt; t)
            </button>
            <button
              type="button"
              onClick={() => setDropFrameshift((f) => !f)}
              aria-pressed={dropFrameshift}
              className={cn(
                'inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs transition-colors',
                dropFrameshift
                  ? 'border-red-500/50 bg-red-500/20 text-red-200'
                  : 'border-slate-700 bg-[#1B2336] text-slate-300 hover:border-red-500/40',
              )}
            >
              <Scissors className="h-3 w-3" aria-hidden="true" />
              <span>{dropFrameshift ? '1-Bit Deletion Active' : 'Inject 1 Deletion Frameshift'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFlippedBits([])
                setDropFrameshift(false)
              }}
              className="rounded border border-slate-700 bg-[#0F172A] px-2.5 py-1 text-xs text-slate-400 hover:text-white"
            >
              Clear Channel
            </button>
          </div>

          <div className="flex flex-wrap gap-0.5">
            {Array.from(bchTrial.originalCodeword).map((origBit, idx) => {
              const isFlipped = flippedBits.includes(idx)
              const isDropped = dropFrameshift && idx === Math.floor(u / 4)
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleBit(idx)}
                  title={`bit[${idx}]: ${origBit}${isFlipped ? ' (flipped)' : ''}${isDropped ? ' (deleted)' : ''}`}
                  className={cn(
                    'h-4 w-2.5 rounded-[2px] font-mono text-[9px] font-bold transition-colors',
                    isDropped
                      ? 'bg-red-500 text-white'
                      : isFlipped
                        ? 'bg-amber-400 text-slate-950 ring-1 ring-amber-200'
                        : origBit === 1
                          ? 'bg-emerald-500/80 text-slate-950 hover:bg-emerald-400'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600',
                  )}
                >
                  {isDropped ? '-' : (origBit ^ (isFlipped ? 1 : 0))}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
