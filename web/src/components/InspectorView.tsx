import { Binary, GitCompare, Shield } from 'lucide-react'
import { useMemo } from 'react'
import type { CodebookInfoResponse, StudioConfig } from '../types/studio'
import { cn } from '../utils/cn'
import type { LlmwWasmClient } from '../wasm/llmwWasm'
import { BchAnalyzerPanel } from './BchAnalyzerPanel'
import { DistanceSpectrumChart } from './DistanceSpectrumChart'

interface InspectorViewProps {
  config: StudioConfig
  watermark: number
  info: CodebookInfoResponse | null
  wasm: LlmwWasmClient | null
}

function formatCollisionBound(exponent: number, bound: number): string {
  if (bound === 0 || exponent < -10) {
    return `2^(${exponent})`
  }
  return `2^(${exponent}) (~${bound.toExponential(2)})`
}

function hammingDistanceBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length)
  let d = 0
  for (let i = 0; i < len; i++) {
    if ((a[i] & 1) !== (b[i] & 1)) d += 1
  }
  return d + Math.abs(a.length - b.length)
}

export function InspectorView({ config, watermark, info, wasm }: InspectorViewProps) {
  const comparison = useMemo(() => {
    if (!wasm) return null
    const maxMask = (1 << config.n) - 1
    const baseId = watermark & maxMask
    const neighborId = (baseId ^ 1) & maxMask
    const codeA = wasm.encodeCodeword(config.secretKey, config.n, config.u, config.construction, baseId)
    const codeB = wasm.encodeCodeword(config.secretKey, config.n, config.u, config.construction, neighborId)
    const hamming = hammingDistanceBytes(codeA, codeB)
    const levenshtein = wasm.levenshtein(codeA, codeB)
    return { baseId, neighborId, codeA, codeB, hamming, levenshtein }
  }, [wasm, config.secretKey, config.n, config.u, config.construction, watermark])

  const spectra = useMemo(() => {
    if (!wasm) return null
    const spreadSamples = config.n <= 10 ? 256 : 96
    const linear = wasm.distanceSpectrum(
      config.secretKey,
      config.n,
      config.u,
      'linear',
      watermark,
      spreadSamples,
    )
    const rng = wasm.distanceSpectrum(
      config.secretKey,
      config.n,
      config.u,
      'rng',
      watermark,
      spreadSamples,
    )
    return { linear, rng }
  }, [wasm, config.secretKey, config.n, config.u, watermark])

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
          <div>
            <span className="font-mono text-[11px] font-medium tracking-wider text-emerald-400 uppercase">
              Codebook Geometry · Sections IV &amp; V
            </span>
            <h2 className="text-base font-semibold text-slate-100 text-balance">
              Theoretical Bounds, Minimum Distance &amp; BCH Algebra
            </h2>
          </div>
          <span className="rounded bg-[#272F42] px-2.5 py-1 font-mono text-xs text-slate-300 tabular-nums">
            Rate R = {(config.n / config.u).toFixed(4)} bits/token
          </span>
        </div>

        {!info ? (
          <div className="text-xs text-slate-400">Computing codebook invariants...</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <BoundCard
              icon={Shield}
              title="Random Collision Bound"
              value={formatCollisionBound(info.collision_exponent, info.collision_bound)}
              detail={`2^(2n - u - 1) for |C|=2^${info.n}, u=${info.u}`}
            />
            <BoundCard
              icon={Binary}
              title="Gilbert-Varshamov d_GV"
              value={`${info.gilbert_varshamov_d} bits`}
              detail={`${((info.gilbert_varshamov_d / info.u) * 100).toFixed(1)}% normalized distance`}
            />
            <BoundCard
              icon={Binary}
              title="Exact Linear d_min"
              value={info.exact_linear_d_min !== null ? `${info.exact_linear_d_min} bits` : 'N/A'}
              detail={
                config.construction !== 'linear'
                  ? 'Available for Linear GF(2) construction'
                  : config.n > 13
                    ? 'Switch to n <= 13 (or Local API) for exhaustive weight scan'
                    : 'Minimum nonzero codeword weight'
              }
            />
            <BoundCard
              icon={Shield}
              title={`Shortened BCH GF(2^${info.bch.field_degree})`}
              value={`t = ${info.bch.correction_capability} bits`}
              detail={`n0=${info.bch.native_length}, k=${info.bch.message_capacity}, corr=${(
                info.bch.correction_rate * 100
              ).toFixed(1)}%`}
            />
          </div>
        )}
      </section>

      {spectra && info && (
        <DistanceSpectrumChart
          u={config.u}
          n={config.n}
          gvDistance={info.gilbert_varshamov_d}
          linearSpectrum={spectra.linear}
          rngSpectrum={spectra.rng}
        />
      )}

      {info && (
        <BchAnalyzerPanel
          n={config.n}
          u={config.u}
          watermark={watermark}
          currentT={info.bch.correction_capability}
          wasm={wasm}
        />
      )}

      {comparison && (
        <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-100">
                Adjacent Codeword Pair Separation (ID {comparison.baseId} vs ID {comparison.neighborId})
              </h3>
            </div>
            <div className="flex gap-3 font-mono text-xs tabular-nums">
              <span className="rounded bg-[#0F172A] px-2.5 py-1 text-slate-200">
                d_H = <strong className="text-emerald-300">{comparison.hamming}</strong>
              </span>
              <span className="rounded bg-[#0F172A] px-2.5 py-1 text-slate-200">
                d_L = <strong className="text-emerald-300">{comparison.levenshtein}</strong>
              </span>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-800 bg-[#0F172A] p-3">
            <BitRow label={`C(${comparison.baseId})`} bits={comparison.codeA} />
            <BitRow label={`C(${comparison.neighborId})`} bits={comparison.codeB} />
            <div className="flex items-start gap-2 pt-1">
              <span className="w-20 shrink-0 font-mono text-[11px] text-amber-300">Diff Mask</span>
              <div className="flex flex-wrap gap-0.5">
                {Array.from(comparison.codeA).map((bit, idx) => {
                  const differs = (bit & 1) !== (comparison.codeB[idx] & 1)
                  return (
                    <span
                      key={idx}
                      className={cn(
                        'h-2.5 w-1.5 rounded-[1px]',
                        differs ? 'bg-amber-400' : 'bg-slate-800',
                      )}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function BoundCard({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: typeof Binary
  title: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#0F172A] p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Icon className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
        <span>{title}</span>
      </div>
      <div className="mt-1.5 font-mono text-base font-semibold text-slate-100 tabular-nums">
        {value}
      </div>
      <p className="mt-1 text-[11px] text-slate-400 text-pretty">{detail}</p>
    </div>
  )
}

function BitRow({ label, bits }: { label: string; bits: Uint8Array }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-20 shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">{label}</span>
      <div className="flex flex-wrap gap-0.5">
        {Array.from(bits).map((b, idx) => (
          <span
            key={idx}
            className={cn(
              'h-2.5 w-1.5 rounded-[1px]',
              (b & 1) === 1 ? 'bg-emerald-500' : 'bg-red-500/75',
            )}
          />
        ))}
      </div>
    </div>
  )
}
