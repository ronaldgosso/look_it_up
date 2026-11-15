import { AlertTriangle, CheckCircle2, Cpu, Scissors, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { computeBchShorteningCurve, simulateBchChannel } from '../engine/watermarkEngine'
import { cn } from '../utils/cn'
import type { LlmwWasmClient } from '../wasm/llmwWasm'

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

  const width = 680
  const height = 224
  const padL = 42
  const padR = 16
  const padT = 26
  const padB = 34
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const maxT = Math.max(10, ...curvePoints.map((p) => p.t))
  const toX = (nVal: number) => padL + ((nVal - 8) / (32 - 8)) * plotW
  const toY = (tVal: number) => padT + plotH - (tVal / maxT) * plotH

  const activeX = toX(n)
  const activeY = toY(currentT)
  const activeTagText = `Active (${n}b, t=${currentT})`
  const activeTagW = 114
  const activeTagX = Math.max(padL + 2, Math.min(width - padR - activeTagW, activeX - activeTagW / 2))
  const placeBelow = activeY < padT + 26
  const activeTagY = placeBelow ? activeY + 11 : activeY - 26

  return (
    <section
      aria-labelledby="bch-frontier-heading"
      className="space-y-5 rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="bch-frontier-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Cpu className="size-4 text-accent" aria-hidden="true" />
          <span>Shortened BCH Error-Correction Frontier (Payload n vs. Capability t)</span>
        </h3>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          {CURVE_U_SERIES.map((s) => (
            <span key={s.u} className="inline-flex items-center gap-1.5 text-ink-secondary">
              <span className="h-0.5 w-3" style={{ backgroundColor: s.stroke }} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="studio-scroll overflow-x-auto rounded-lg border border-border bg-surface-inset p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Shortened BCH correction capability t across payload bits n"
          className="w-full min-w-[480px] select-none"
        >
          <title>
            {`Shortened BCH error-correction bounds across n=8..32; active Studio operating point n=${n}, t=${currentT} bits`}
          </title>

          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const val = Math.round(maxT * frac)
            const y = toY(val)
            return (
              <g key={frac}>
                <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="#1E293B" strokeDasharray="3 3" />
                <text x={padL - 8} y={y + 4} textAnchor="end" fill="#94A3B8" fontSize="10" fontFamily="monospace">
                  {val}b
                </text>
              </g>
            )
          })}

          <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#374869" />
          <line x1={padL} x2={width - padR} y1={padT + plotH} y2={padT + plotH} stroke="#374869" />

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

          {n >= 8 && n <= 32 && (
            <g>
              <circle cx={activeX} cy={activeY} r="6.5" fill="none" stroke="#F59E0B" strokeWidth="2" />
              <rect
                x={activeTagX}
                y={activeTagY}
                width={activeTagW}
                height={18}
                rx="4"
                fill="#090E1A"
                stroke="#F59E0B"
                strokeOpacity="0.65"
                strokeWidth="1"
              />
              <text
                x={activeTagX + activeTagW / 2}
                y={activeTagY + 12.5}
                textAnchor="middle"
                fill="#FCD34D"
                fontSize="10"
                fontWeight="600"
                fontFamily="monospace"
              >
                {activeTagText}
              </text>
            </g>
          )}

          {CURVE_N_VALUES.map((nv) => (
            <text
              key={nv}
              x={toX(nv)}
              y={height - 12}
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

      {bchTrial && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-inset p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                <Zap className="size-4 text-accent" aria-hidden="true" />
                <span>Interactive BCH Berlekamp-Massey Syndrome Sandbox (t = {currentT} bits)</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                Toggle individual codeword bits to inject channel noise or test a 1-bit deletion frameshift.
              </p>
            </div>

            {bchTrial.succeeded ? (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 rounded border border-emerald-500/45 bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-accent-ink"
              >
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                <span>DECODED ID {bchTrial.decodedWatermark} ({bchTrial.flips} fixed)</span>
              </span>
            ) : (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 rounded border border-red-500/45 bg-red-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-danger-ink"
              >
                <AlertTriangle className="size-3.5" aria-hidden="true" />
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
              className="min-h-8 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-emerald-500/60"
            >
              Inject {Math.min(currentT, 3)} Bit Flips (&le; t)
            </button>
            <button
              type="button"
              onClick={() => injectRandomFlips(currentT)}
              className="min-h-8 rounded-md border border-emerald-500/45 bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-emerald-500/20"
            >
              Max Guarantee: Inject t={currentT} Flips
            </button>
            <button
              type="button"
              onClick={() => injectRandomFlips(currentT + 3)}
              className="min-h-8 rounded-md border border-amber-500/45 bg-amber-500/12 px-3 py-1.5 text-xs font-medium text-warning-ink transition-colors hover:bg-amber-500/20"
            >
              Overload: Inject {currentT + 3} Flips (&gt; t)
            </button>
            <button
              type="button"
              onClick={() => setDropFrameshift((f) => !f)}
              aria-pressed={dropFrameshift}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                dropFrameshift
                  ? 'border-red-500/55 bg-red-500/20 text-danger-ink'
                  : 'border-border-strong bg-surface text-ink-secondary hover:border-red-500/50 hover:text-ink',
              )}
            >
              <Scissors className="size-3.5" aria-hidden="true" />
              <span>{dropFrameshift ? '1-Bit Deletion Active' : 'Inject 1 Deletion Frameshift'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFlippedBits([])
                setDropFrameshift(false)
              }}
              className="min-h-8 rounded-md border border-border bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
            >
              Clear Channel
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            {Array.from(bchTrial.originalCodeword).map((origBit, idx) => {
              const isFlipped = flippedBits.includes(idx)
              const isDropped = dropFrameshift && idx === Math.floor(u / 4)
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleBit(idx)}
                  aria-pressed={isFlipped}
                  aria-label={`Codeword bit ${idx}: original ${origBit}${isFlipped ? ', flipped' : ''}${isDropped ? ', deleted' : ''}`}
                  title={`bit[${idx}]: ${origBit}${isFlipped ? ' (flipped)' : ''}${isDropped ? ' (deleted)' : ''}`}
                  className={cn(
                    'h-5 w-3 rounded-[2px] font-mono text-[11px] font-bold transition-colors',
                    isDropped
                      ? 'bg-red-500 text-white'
                      : isFlipped
                        ? 'bg-amber-400 text-slate-950 ring-1 ring-amber-200'
                        : origBit === 1
                          ? 'bg-emerald-500/85 text-slate-950 hover:bg-emerald-400'
                          : 'bg-surface-elevated text-ink-secondary hover:bg-slate-600',
                  )}
                >
                  {isDropped ? '-' : (origBit ^ (isFlipped ? 1 : 0))}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1 font-mono text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-xs bg-emerald-500/85" aria-hidden="true" /> Original 1
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-xs bg-surface-elevated ring-1 ring-border-strong" aria-hidden="true" /> Original 0
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-xs bg-amber-400" aria-hidden="true" /> Flipped Bit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-xs bg-red-500" aria-hidden="true" /> Deleted Frameshift (-)
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
