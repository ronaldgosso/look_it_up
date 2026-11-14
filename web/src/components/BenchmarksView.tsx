import { BarChart3, Gauge, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react'
import type { BenchmarkResults } from '../types/studio'
import { cn } from '../utils/cn'

interface BenchmarksViewProps {
  benchmarks: BenchmarkResults | null
  apiConnected: boolean
  onRefreshFromApi: () => void
  refreshing: boolean
}

export function BenchmarksView({
  benchmarks,
  apiConnected,
  onRefreshFromApi,
  refreshing,
}: BenchmarksViewProps) {
  if (!benchmarks) {
    return (
      <div className="rounded-xl border border-slate-800 bg-[#1B2336] p-8 text-center text-sm text-slate-400">
        Loading static benchmark snapshot (`benchmarks.json`)...
      </div>
    )
  }

  const speed = benchmarks.speed_comparison
  const rocEntries = Object.entries(benchmarks.roc_auroc)
  const regimes = benchmarks.entropy_regime_match_rate
  const quality = benchmarks.quality_comparison

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#1B2336] p-4">
        <div>
          <span className="font-mono text-[11px] font-medium tracking-wider text-emerald-400 uppercase">
            Reproducible Evaluation · benchmarks/results.json
          </span>
          <h2 className="text-base font-semibold text-slate-100 text-balance">
            Rust Speedups, Appendix B Robustness &amp; AUROC Analysis
          </h2>
          <p className="mt-0.5 font-mono text-xs text-slate-400 tabular-nums">
            n={benchmarks.config.n} | u={benchmarks.config.u} | delta={benchmarks.config.delta} | budget=
            {(benchmarks.config.attack_budget * 100).toFixed(0)}% | samples={benchmarks.config.num_samples} | backend=
            {benchmarks.system.backend} ({benchmarks.system.threads}T)
          </p>
        </div>

        <button
          type="button"
          disabled={!apiConnected || refreshing}
          onClick={onRefreshFromApi}
          title={
            apiConnected
              ? 'Fetch live benchmark snapshot from Local Python API'
              : 'Connect Local Python API on :8000 to refresh live results'
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#272F42] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-emerald-500/50 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden="true" />
          <span>{apiConnected ? 'Refresh from API' : 'Static Snapshot'}</span>
        </button>
      </div>

      {/* Rust vs Python Extraction Speed */}
      <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5">
        <div className="flex items-center gap-2 pb-3">
          <Gauge className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-100">
            Codebook Extraction Speed ({speed.entries.toLocaleString()} codewords, u={speed.u})
          </h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SpeedComparisonCard
            title="Hamming Codebook Search"
            pythonMs={speed.python_hamming_ms}
            rustMs={speed.rust_hamming_ms}
            speedup={speed.hamming_speedup}
          />
          <SpeedComparisonCard
            title="Levenshtein Codebook Search"
            pythonMs={speed.python_levenshtein_ms}
            rustMs={speed.rust_levenshtein_ms}
            speedup={speed.levenshtein_speedup}
          />
        </div>
      </section>

      {/* Attack Robustness Matrix */}
      <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5">
        <div className="flex items-center gap-2 pb-3">
          <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-100">
            Appendix B Attack Recovery Matrix
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs tabular-nums">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-4 font-medium">Decoder</th>
                <th className="py-2 pr-4 font-medium">Channel Attack</th>
                <th className="py-2 pr-4 font-medium">Match Rate</th>
                <th className="py-2 pr-4 font-medium">Mean Dist</th>
                <th className="py-2 font-medium">Samples</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {benchmarks.attack_robustness.map((row, idx) => (
                <tr key={idx} className="hover:bg-[#0F172A]/60">
                  <td className="py-2 pr-4 text-slate-200 uppercase">{row.method}</td>
                  <td className="py-2 pr-4 text-slate-300">{row.attack}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={cn(
                        'font-semibold',
                        row.match_rate >= 0.85
                          ? 'text-emerald-300'
                          : row.match_rate >= 0.5
                            ? 'text-amber-300'
                            : 'text-red-300',
                      )}
                    >
                      {(row.match_rate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{row.mean_distance.toFixed(2)}</td>
                  <td className="py-2 text-slate-400">{row.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Zero-Bit Detection ROC AUROC */}
        <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5">
          <div className="flex items-center gap-2 pb-3">
            <BarChart3 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-100">
              Detection AUROC &amp; TPR @ 1% FPR
            </h3>
          </div>

          <div className="space-y-2.5">
            {rocEntries.map(([method, stats]) => (
              <div
                key={method}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0F172A] px-3 py-2.5 font-mono text-xs tabular-nums"
              >
                <span className="font-semibold text-slate-200 uppercase">{method}</span>
                <div className="flex gap-4 text-slate-300">
                  <span>
                    AUROC <strong className="text-emerald-300">{stats.auroc.toFixed(3)}</strong>
                  </span>
                  <span>
                    TPR@1% <strong className="text-slate-100">{(stats.tpr_at_1pct_fpr * 100).toFixed(1)}%</strong>
                  </span>
                  <span>tau={stats.threshold_at_1pct_fpr.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Entropy Regime & Lexical Diversity */}
        <section className="rounded-xl border border-slate-800 bg-[#1B2336] p-4 sm:p-5">
          <div className="flex items-center gap-2 pb-3">
            <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-100">
              Entropy Regimes &amp; Appendix G Lexical Quality
            </h3>
          </div>

          <div className="space-y-3 font-mono text-xs tabular-nums">
            <div className="rounded-lg border border-slate-800 bg-[#0F172A] p-3">
              <div className="mb-1.5 text-[11px] text-slate-400">Match Rate by Entropy Regime</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400">Base (High H): </span>
                  {Object.entries(regimes.base).map(([k, v]) => (
                    <span key={k} className="mr-2 text-emerald-300">
                      {k}={(v * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
                <div>
                  <span className="text-slate-400">Instruct (Low H): </span>
                  {Object.entries(regimes.instruct).map(([k, v]) => (
                    <span key={k} className="mr-2 text-amber-300">
                      {k}={(v * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#0F172A] p-3">
              <div className="mb-1.5 text-[11px] text-slate-400">
                Lexical Diversity (Watermarked vs Unwatermarked)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Object.keys(quality.watermarked).map((metric) => (
                  <div key={metric}>
                    <div className="text-[10px] text-slate-500">{metric}</div>
                    <div className="text-slate-100">
                      {quality.watermarked[metric].toFixed(3)}{' '}
                      <span className="text-slate-500">vs {(quality.non_watermarked[metric] ?? 0).toFixed(3)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function SpeedComparisonCard({
  title,
  pythonMs,
  rustMs,
  speedup,
}: {
  title: string
  pythonMs: number
  rustMs?: number
  speedup?: number
}) {
  const maxVal = Math.max(pythonMs, rustMs ?? 0, 1)
  const pythonPct = Math.min(100, (pythonMs / maxVal) * 100)
  const rustPct = rustMs !== undefined ? Math.max(2, Math.min(100, (rustMs / maxVal) * 100)) : 0

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-[#0F172A] p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-200">{title}</span>
        {speedup !== undefined && (
          <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-300 tabular-nums">
            {speedup.toFixed(1)}x faster
          </span>
        )}
      </div>

      <div className="space-y-2 font-mono text-xs tabular-nums">
        <div>
          <div className="mb-1 flex justify-between text-slate-400">
            <span>Pure Python</span>
            <span>{pythonMs.toFixed(2)} ms</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-[#272F42]">
            <div className="h-full bg-slate-400" style={{ width: `${pythonPct}%` }} />
          </div>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-emerald-300">
            <span>Rust Rayon Native</span>
            <span>{rustMs !== undefined ? `${rustMs.toFixed(2)} ms` : 'N/A'}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-[#272F42]">
            <div className="h-full bg-emerald-500" style={{ width: `${rustPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
