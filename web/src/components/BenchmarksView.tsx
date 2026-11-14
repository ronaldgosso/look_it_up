import { BarChart3, Gauge, RefreshCw, Scale, ShieldAlert } from 'lucide-react'
import type { BenchmarkResults } from '../types/studio'
import { cn } from '../utils/cn'

interface BenchmarksViewProps {
  benchmarks: BenchmarkResults | null
  apiConnected: boolean
  onRefreshFromApi: () => void
  refreshing: boolean
}

const ATTACK_LABELS: Record<string, string> = {
  clean: 'Clean (No Attack)',
  word_deletion: 'Word Deletion',
  word_insertion: 'Word Insertion',
  synonym_swap: 'Synonym Swap',
  paraphrase: 'Paraphrase',
}

const METHOD_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'levenshtein', label: 'Levenshtein d_L' },
  { key: 'hamming', label: 'Hamming d_H' },
  { key: 'bch', label: 'Shortened BCH' },
]

function formatQualityLabel(rawKey: string): string {
  return rawKey
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-')
}

export function BenchmarksView({
  benchmarks,
  apiConnected,
  onRefreshFromApi,
  refreshing,
}: BenchmarksViewProps) {
  if (!benchmarks) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading benchmark snapshot">
        <div className="h-20 animate-pulse rounded-xl border border-border bg-surface p-4" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-36 animate-pulse rounded-xl border border-border bg-surface" />
          <div className="h-36 animate-pulse rounded-xl border border-border bg-surface" />
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />
      </div>
    )
  }

  const speed = benchmarks.speed_comparison
  const rocEntries = Object.entries(benchmarks.roc_auroc)
  const regimes = benchmarks.entropy_regime_match_rate
  const quality = benchmarks.quality_comparison

  const attackOrder: string[] = []
  const byAttack = new Map<
    string,
    Map<string, { match_rate: number; mean_distance: number; samples: number }>
  >()
  for (const row of benchmarks.attack_robustness) {
    if (!byAttack.has(row.attack)) {
      byAttack.set(row.attack, new Map())
      attackOrder.push(row.attack)
    }
    byAttack.get(row.attack)!.set(row.method.toLowerCase(), {
      match_rate: row.match_rate,
      mean_distance: row.mean_distance,
      samples: row.samples,
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-ink text-balance">
            Rust Speedups, Appendix B Robustness &amp; AUROC Analysis
          </h2>
          <p className="mt-1 font-mono text-xs text-ink-muted tabular-nums">
            n={benchmarks.config.n} | u={benchmarks.config.u} | delta={benchmarks.config.delta} | budget=
            {(benchmarks.config.attack_budget * 100).toFixed(0)}% | samples={benchmarks.config.num_samples} |{' '}
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
              : 'Start the local FastAPI server on :8000 to run live benchmarks'
          }
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface-elevated px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-emerald-500/60 hover:text-accent-ink disabled:opacity-45"
        >
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} aria-hidden="true" />
          <span>{apiConnected ? 'Refresh from API' : 'Static Snapshot'}</span>
        </button>
      </div>

      <section aria-labelledby="bench-speed-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center gap-2 pb-3">
          <Gauge className="size-4 text-accent" aria-hidden="true" />
          <h3 id="bench-speed-heading" className="text-sm font-semibold text-ink">
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

      <section aria-labelledby="bench-attack-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-warning" aria-hidden="true" />
            <h3 id="bench-attack-heading" className="text-sm font-semibold text-ink">
              Appendix B Attack Recovery Comparison
            </h3>
          </div>
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            Match rate &amp; mean distance ({benchmarks.config.num_samples} samples/cell)
          </span>
        </div>

        <div className="studio-scroll overflow-x-auto rounded-lg border border-border bg-surface-inset">
          <table className="w-full text-left font-mono text-xs tabular-nums">
            <thead>
              <tr className="border-b border-border text-ink-muted">
                <th scope="col" className="px-3.5 py-2.5 font-sans text-xs font-medium">
                  Channel Attack
                </th>
                {METHOD_COLUMNS.map((col) => (
                  <th key={col.key} scope="col" className="px-3.5 py-2.5 font-sans text-xs font-medium">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/80">
              {attackOrder.map((attackKey) => {
                const methodsMap = byAttack.get(attackKey)!
                return (
                  <tr key={attackKey} className="transition-colors hover:bg-surface/60">
                    <th scope="row" className="px-3.5 py-3 font-sans text-xs font-medium text-ink">
                      {ATTACK_LABELS[attackKey] ?? attackKey}
                    </th>
                    {METHOD_COLUMNS.map((col) => {
                      const stats = methodsMap.get(col.key)
                      if (!stats) {
                        return (
                          <td key={col.key} className="px-3.5 py-3 text-ink-muted">
                            N/A
                          </td>
                        )
                      }
                      const pct = stats.match_rate * 100
                      return (
                        <td key={col.key} className="px-3.5 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                'font-semibold',
                                stats.match_rate >= 0.85
                                  ? 'text-accent-ink'
                                  : stats.match_rate >= 0.5
                                    ? 'text-warning-ink'
                                    : 'text-danger-ink',
                              )}
                            >
                              {pct.toFixed(1)}%
                            </span>
                            <span className="text-ink-muted">d={stats.mean_distance.toFixed(1)}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                stats.match_rate >= 0.85
                                  ? 'bg-emerald-500'
                                  : stats.match_rate >= 0.5
                                    ? 'bg-amber-400'
                                    : 'bg-red-500/80',
                              )}
                              style={{ width: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="bench-auroc-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-center gap-2 pb-3">
            <BarChart3 className="size-4 text-accent" aria-hidden="true" />
            <h3 id="bench-auroc-heading" className="text-sm font-semibold text-ink">
              Detection AUROC &amp; TPR at 1% FPR
            </h3>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-surface-inset">
            <table className="w-full text-left font-mono text-xs tabular-nums">
              <thead>
                <tr className="border-b border-border text-ink-muted">
                  <th scope="col" className="px-3.5 py-2 font-sans text-xs font-medium">
                    Decoder
                  </th>
                  <th scope="col" className="px-3.5 py-2 font-sans text-xs font-medium">
                    AUROC
                  </th>
                  <th scope="col" className="px-3.5 py-2 font-sans text-xs font-medium">
                    TPR at 1% FPR
                  </th>
                  <th scope="col" className="px-3.5 py-2 font-sans text-xs font-medium">
                    Threshold
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {rocEntries.map(([method, stats]) => (
                  <tr key={method}>
                    <th scope="row" className="px-3.5 py-2.5 font-semibold text-ink uppercase">
                      {method}
                    </th>
                    <td className="px-3.5 py-2.5 font-semibold text-accent-ink">
                      {stats.auroc.toFixed(3)}
                    </td>
                    <td className="px-3.5 py-2.5 text-ink">
                      {(stats.tpr_at_1pct_fpr * 100).toFixed(1)}%
                    </td>
                    <td className="px-3.5 py-2.5 text-ink-muted">
                      tau = {stats.threshold_at_1pct_fpr.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="bench-quality-heading" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-center gap-2 pb-3">
            <Scale className="size-4 text-accent" aria-hidden="true" />
            <h3 id="bench-quality-heading" className="text-sm font-semibold text-ink">
              Entropy Regimes &amp; Appendix G Lexical Quality
            </h3>
          </div>

          <div className="space-y-3 font-mono text-xs tabular-nums">
            <div className="rounded-lg border border-border bg-surface-inset p-3.5">
              <div className="mb-2 font-sans text-xs font-medium text-ink-secondary">
                Match Rate by Entropy Regime
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-ink-muted">Base (High H):</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-accent-ink">
                    {Object.entries(regimes.base).map(([k, v]) => (
                      <span key={k}>
                        {k}={(v * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-ink-muted">Instruct (Low H):</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-warning-ink">
                    {Object.entries(regimes.instruct).map(([k, v]) => (
                      <span key={k}>
                        {k}={(v * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface-inset p-3.5">
              <div className="mb-2 font-sans text-xs font-medium text-ink-secondary">
                Lexical Diversity (Watermarked vs Unwatermarked)
              </div>
              <dl className="grid grid-cols-3 gap-3">
                {Object.keys(quality.watermarked).map((metric) => (
                  <div key={metric}>
                    <dt className="font-sans text-xs text-ink-muted">{formatQualityLabel(metric)}</dt>
                    <dd className="mt-0.5 font-semibold text-ink">
                      {quality.watermarked[metric].toFixed(3)}{' '}
                      <span className="font-normal text-ink-muted">
                        vs {(quality.non_watermarked[metric] ?? 0).toFixed(3)}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
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
    <div className="space-y-3 rounded-lg border border-border bg-surface-inset p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">{title}</span>
        {speedup !== undefined && (
          <span className="rounded border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-accent-ink tabular-nums">
            {speedup.toFixed(1)}x faster
          </span>
        )}
      </div>

      <div className="space-y-2.5 font-mono text-xs tabular-nums">
        <div>
          <div className="mb-1 flex justify-between text-ink-secondary">
            <span>Pure Python</span>
            <span>{pythonMs.toFixed(2)} ms</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
            <div className="h-full rounded-full bg-slate-400" style={{ width: `${pythonPct}%` }} />
          </div>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-accent-ink">
            <span>Rust Rayon Native</span>
            <span>{rustMs !== undefined ? `${rustMs.toFixed(2)} ms` : 'N/A'}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rustPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
