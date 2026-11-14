import { BarChart2, Equal, Shuffle } from 'lucide-react'
import { useState } from 'react'
import type { DistanceSpectrumStats } from '../types/studio'

interface DistanceSpectrumChartProps {
  u: number
  n: number
  gvDistance: number
  linearSpectrum: DistanceSpectrumStats
  rngSpectrum: DistanceSpectrumStats
}

export function DistanceSpectrumChart({
  u,
  n,
  gvDistance,
  linearSpectrum,
  rngSpectrum,
}: DistanceSpectrumChartProps) {
  const [hoveredDist, setHoveredDist] = useState<number | null>(null)

  const width = 680
  const height = 232
  const padL = 42
  const padR = 16
  const padT = 26
  const padB = 34
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const maxCount = Math.max(1, ...linearSpectrum.bins, ...rngSpectrum.bins)

  const minNZ = Math.max(0, Math.min(linearSpectrum.minFromW, rngSpectrum.minFromW) - 6)
  const maxNZ = Math.min(u, Math.max(linearSpectrum.maxFromW, rngSpectrum.maxFromW) + 6)
  const xSpan = Math.max(10, maxNZ - minNZ)
  const toX = (d: number) => padL + ((d - minNZ) / xSpan) * plotW
  const toY = (c: number) => padT + plotH - (c / maxCount) * plotH
  const barW = Math.max(2, plotW / (xSpan + 1) - 1)

  const gvX = toX(gvDistance)
  const linMinX = toX(linearSpectrum.nnMin)
  const gvLeftAligned = linMinX >= gvX

  const xTicks = Array.from({ length: 5 }, (_, i) => Math.round(minNZ + (i / 4) * xSpan))

  const inspectedDist = hoveredDist ?? linearSpectrum.nnMin
  const inspectedLin = linearSpectrum.bins[inspectedDist] ?? 0
  const inspectedRng = rngSpectrum.bins[inspectedDist] ?? 0

  return (
    <section
      aria-labelledby="spectrum-chart-heading"
      className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="spectrum-chart-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <BarChart2 className="size-4 text-accent" aria-hidden="true" />
          <span>
            Linear GF(2) vs. RNG Distance Distribution (n={n}, u={u})
          </span>
        </h3>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <span className="inline-flex items-center gap-1.5 text-accent-ink">
            <span className="size-2.5 rounded-xs bg-emerald-500/85" aria-hidden="true" /> Linear GF(2)
          </span>
          <span className="inline-flex items-center gap-1.5 text-info-ink">
            <span className="size-2.5 rounded-xs bg-sky-400/80" aria-hidden="true" /> RNG Codebook
          </span>
          <span className="inline-flex items-center gap-1.5 text-warning-ink">
            <span className="h-0.5 w-3 bg-amber-400" aria-hidden="true" /> d_GV ({gvDistance})
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/35 bg-surface-inset p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-ink">
              <Equal className="size-3.5" aria-hidden="true" />
              <span>Linear GF(2) Nearest-Neighbor Spread</span>
            </span>
            <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-accent-ink">
              {linearSpectrum.zeroSpread ? 'ZERO SPREAD' : 'NON-ZERO'}
            </span>
          </div>
          <div className="mt-1.5 font-mono text-xs text-ink-secondary tabular-nums">
            NN range across codewords:{' '}
            <strong className="text-ink">
              [{linearSpectrum.nnMin} .. {linearSpectrum.nnMax}]
            </strong>{' '}
            bits, mean sep {linearSpectrum.meanFromW.toFixed(1)}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Every codeword sits at identical nearest-neighbor distance d_min = {linearSpectrum.nnMin}.
          </p>
        </div>

        <div className="rounded-lg border border-sky-500/35 bg-surface-inset p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-info-ink">
              <Shuffle className="size-3.5" aria-hidden="true" />
              <span>RNG Codebook Nearest-Neighbor Spread</span>
            </span>
            <span className="rounded border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-warning-ink">
              SPREAD = {rngSpectrum.nnMax - rngSpectrum.nnMin} BITS
            </span>
          </div>
          <div className="mt-1.5 font-mono text-xs text-ink-secondary tabular-nums">
            NN range across sample:{' '}
            <strong className="text-ink">
              [{rngSpectrum.nnMin} .. {rngSpectrum.nnMax}]
            </strong>{' '}
            bits, mean sep {rngSpectrum.meanFromW.toFixed(1)}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Random codebooks exhibit weaker minimum pairs ({rngSpectrum.nnMin} vs {linearSpectrum.nnMin}).
          </p>
        </div>
      </div>

      <div className="studio-scroll overflow-x-auto rounded-lg border border-border bg-surface-inset p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Hamming distance histogram comparing Linear GF(2) and RNG codebooks"
          className="w-full min-w-[480px] select-none"
        >
          <title>
            {`Hamming distance distribution at n=${n}, u=${u}: Linear minimum distance ${linearSpectrum.nnMin} bits vs Gilbert-Varshamov bound ${gvDistance} bits`}
          </title>

          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + plotH * (1 - frac)
            return (
              <g key={frac}>
                <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="#1E293B" strokeDasharray="3 3" />
                <text x={padL - 8} y={y + 4} textAnchor="end" fill="#94A3B8" fontSize="10" fontFamily="monospace">
                  {Math.round(maxCount * frac)}
                </text>
              </g>
            )
          })}

          <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#374869" />
          <line x1={padL} x2={width - padR} y1={padT + plotH} y2={padT + plotH} stroke="#374869" />

          {Array.from({ length: maxNZ - minNZ + 1 }, (_, k) => {
            const d = minNZ + k
            const linCount = linearSpectrum.bins[d] ?? 0
            const rngCount = rngSpectrum.bins[d] ?? 0
            const x = toX(d)
            const halfW = Math.max(1.5, barW * 0.48)
            return (
              <g
                key={d}
                onMouseEnter={() => setHoveredDist(d)}
                onMouseLeave={() => setHoveredDist(null)}
              >
                {rngCount > 0 && (
                  <rect
                    x={x}
                    y={toY(rngCount)}
                    width={halfW}
                    height={padT + plotH - toY(rngCount)}
                    fill="rgba(56, 189, 248, 0.7)"
                    rx="1"
                  />
                )}
                {linCount > 0 && (
                  <rect
                    x={x - halfW}
                    y={toY(linCount)}
                    width={halfW}
                    height={padT + plotH - toY(linCount)}
                    fill="rgba(34, 197, 94, 0.88)"
                    rx="1"
                  />
                )}
              </g>
            )
          })}

          {gvDistance >= minNZ && gvDistance <= maxNZ && (
            <g>
              <line
                x1={gvX}
                x2={gvX}
                y1={padT - 2}
                y2={padT + plotH}
                stroke="#F59E0B"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              <text
                x={gvLeftAligned ? gvX - 6 : gvX + 6}
                y={padT + 10}
                textAnchor={gvLeftAligned ? 'end' : 'start'}
                fill="#FCD34D"
                fontSize="10"
                fontWeight="600"
                fontFamily="monospace"
              >
                d_GV={gvDistance}
              </text>
            </g>
          )}

          {linearSpectrum.nnMin >= minNZ && linearSpectrum.nnMin <= maxNZ && (
            <g>
              <line
                x1={linMinX}
                x2={linMinX}
                y1={padT - 2}
                y2={padT + plotH}
                stroke="#22C55E"
                strokeWidth="1.5"
              />
              <text
                x={gvLeftAligned ? linMinX + 6 : linMinX - 6}
                y={padT + 10}
                textAnchor={gvLeftAligned ? 'start' : 'end'}
                fill="#86EFAC"
                fontSize="10"
                fontWeight="600"
                fontFamily="monospace"
              >
                d_min={linearSpectrum.nnMin}
              </text>
            </g>
          )}

          {xTicks.map((tick) => (
            <text
              key={tick}
              x={toX(tick)}
              y={height - 12}
              textAnchor="middle"
              fill="#94A3B8"
              fontSize="10"
              fontFamily="monospace"
            >
              {tick}
            </text>
          ))}
        </svg>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 font-mono text-xs text-ink-muted tabular-nums">
          <span>Bin distance d = {inspectedDist} bits</span>
          <span>
            Linear: <strong className="text-accent-ink">{inspectedLin}</strong> codewords | RNG:{' '}
            <strong className="text-info-ink">{inspectedRng}</strong> codewords
          </span>
        </div>
      </div>
    </section>
  )
}
