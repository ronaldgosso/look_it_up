import { BarChart2, Equal, Shuffle } from 'lucide-react'
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
  const width = 680
  const height = 220
  const padL = 38
  const padR = 16
  const padT = 18
  const padB = 30
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const maxCount = Math.max(
    1,
    ...linearSpectrum.bins,
    ...rngSpectrum.bins,
  )

  const minNZ = Math.max(
    0,
    Math.min(linearSpectrum.minFromW, rngSpectrum.minFromW) - 6,
  )
  const maxNZ = Math.min(
    u,
    Math.max(linearSpectrum.maxFromW, rngSpectrum.maxFromW) + 6,
  )
  const xSpan = Math.max(10, maxNZ - minNZ)
  const toX = (d: number) => padL + ((d - minNZ) / xSpan) * plotW
  const toY = (c: number) => padT + plotH - (c / maxCount) * plotH
  const barW = Math.max(2, plotW / (xSpan + 1) - 1)

  const gvX = toX(gvDistance)
  const linMinX = toX(linearSpectrum.nnMin)

  const xTicks = Array.from({ length: 5 }, (_, i) =>
    Math.round(minNZ + (i / 4) * xSpan),
  )

  return (
    <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-[11px] font-medium tracking-wider text-emerald-400 uppercase">
            Appendix E.2 · Codebook Spread &amp; Distance Spectrum
          </span>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <BarChart2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span>
              Linear GF(2) vs. RNG Distance Distribution (n={n}, u={u})
            </span>
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500/80" /> Linear GF(2)
          </span>
          <span className="inline-flex items-center gap-1.5 text-sky-300">
            <span className="h-2.5 w-2.5 rounded-xs bg-sky-400/75" /> RNG Codebook
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <span className="h-0.5 w-3 bg-amber-400" /> d_GV ({gvDistance})
          </span>
        </div>
      </div>

      {/* Spread Comparison Badges */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/35 bg-[#0F172A] p-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <Equal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Linear GF(2) Nearest-Neighbor Spread</span>
            </span>
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
              {linearSpectrum.zeroSpread ? 'ZERO SPREAD' : 'NON-ZERO'}
            </span>
          </div>
          <div className="mt-1.5 font-mono text-xs text-slate-300 tabular-nums">
            NN range across codewords:{' '}
            <strong className="text-white">
              [{linearSpectrum.nnMin} .. {linearSpectrum.nnMax}]
            </strong>{' '}
            bits · mean sep {linearSpectrum.meanFromW.toFixed(1)}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Every codeword sits at identical nearest-neighbor distance d_min = {linearSpectrum.nnMin}.
          </p>
        </div>

        <div className="rounded-lg border border-sky-500/35 bg-[#0F172A] p-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300">
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>RNG Codebook Nearest-Neighbor Spread</span>
            </span>
            <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
              SPREAD = {rngSpectrum.nnMax - rngSpectrum.nnMin} BITS
            </span>
          </div>
          <div className="mt-1.5 font-mono text-xs text-slate-300 tabular-nums">
            NN range across sample:{' '}
            <strong className="text-white">
              [{rngSpectrum.nnMin} .. {rngSpectrum.nnMax}]
            </strong>{' '}
            bits · mean sep {rngSpectrum.meanFromW.toFixed(1)}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Random codebooks exhibit weaker minimum pairs ({rngSpectrum.nnMin} vs {linearSpectrum.nnMin}).
          </p>
        </div>
      </div>

      {/* Inline SVG Histogram */}
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0F172A] p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Hamming distance histogram comparing Linear and RNG codebooks"
          className="w-full min-w-[480px] select-none"
        >
          {/* Horizontal guide lines */}
          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + plotH * (1 - frac)
            return (
              <g key={frac}>
                <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="#1E293B" strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3} textAnchor="end" fill="#64748B" fontSize="9" fontFamily="monospace">
                  {Math.round(maxCount * frac)}
                </text>
              </g>
            )
          })}

          {/* Axes */}
          <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#334155" />
          <line x1={padL} x2={width - padR} y1={padT + plotH} y2={padT + plotH} stroke="#334155" />

          {/* Histogram bars */}
          {Array.from({ length: maxNZ - minNZ + 1 }, (_, k) => {
            const d = minNZ + k
            const linCount = linearSpectrum.bins[d] ?? 0
            const rngCount = rngSpectrum.bins[d] ?? 0
            const x = toX(d)
            const halfW = Math.max(1.5, barW * 0.48)
            return (
              <g key={d}>
                {rngCount > 0 && (
                  <rect
                    x={x}
                    y={toY(rngCount)}
                    width={halfW}
                    height={padT + plotH - toY(rngCount)}
                    fill="rgba(56, 189, 248, 0.65)"
                    rx="1"
                  >
                    <title>{`RNG d=${d}: ${rngCount} codewords`}</title>
                  </rect>
                )}
                {linCount > 0 && (
                  <rect
                    x={x - halfW}
                    y={toY(linCount)}
                    width={halfW}
                    height={padT + plotH - toY(linCount)}
                    fill="rgba(34, 197, 94, 0.85)"
                    rx="1"
                  >
                    <title>{`Linear d=${d}: ${linCount} codewords`}</title>
                  </rect>
                )}
              </g>
            )
          })}

          {/* Gilbert-Varshamov and Linear d_min markers */}
          {gvDistance >= minNZ && gvDistance <= maxNZ && (
            <g>
              <line x1={gvX} x2={gvX} y1={padT} y2={padT + plotH} stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4 2" />
              <text x={gvX + 4} y={padT + 11} fill="#FCD34D" fontSize="9.5" fontFamily="monospace">
                d_GV={gvDistance}
              </text>
            </g>
          )}

          {linearSpectrum.nnMin >= minNZ && linearSpectrum.nnMin <= maxNZ && (
            <g>
              <line x1={linMinX} x2={linMinX} y1={padT + 14} y2={padT + plotH} stroke="#22C55E" strokeWidth="1.5" />
              <text x={linMinX - 4} y={padT + 24} textAnchor="end" fill="#86EFAC" fontSize="9.5" fontFamily="monospace">
                d_min={linearSpectrum.nnMin}
              </text>
            </g>
          )}

          {/* X-axis ticks */}
          {xTicks.map((tick) => (
            <text
              key={tick}
              x={toX(tick)}
              y={height - 10}
              textAnchor="middle"
              fill="#94A3B8"
              fontSize="10"
              fontFamily="monospace"
            >
              {tick}
            </text>
          ))}
        </svg>
      </div>
    </section>
  )
}
