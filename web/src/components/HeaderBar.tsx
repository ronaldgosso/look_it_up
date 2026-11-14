import {
  Activity,
  BarChart3,
  Binary,
  Cpu,
  ExternalLink,
  FlaskConical,
  Menu,
  Server,
} from 'lucide-react'
import type { RuntimeMode } from '../types/studio'
import { cn } from '../utils/cn'

export type StudioTab = 'playground' | 'benchmarks' | 'inspector'

interface HeaderBarProps {
  activeTab: StudioTab
  onSelectTab: (tab: StudioTab) => void
  runtimeMode: RuntimeMode
  onChangeRuntimeMode: (mode: RuntimeMode) => void
  wasmReady: boolean
  wasmByteLength: number | null
  wasmError: string | null
  apiEngine: { backend: string; threads: number } | null
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

const TABS: Array<{ id: StudioTab; label: string; icon: typeof FlaskConical }> = [
  { id: 'playground', label: 'Playground', icon: FlaskConical },
  { id: 'benchmarks', label: 'Benchmarks', icon: BarChart3 },
  { id: 'inspector', label: 'Codebook Inspector', icon: Binary },
]

export function HeaderBar({
  activeTab,
  onSelectTab,
  runtimeMode,
  onChangeRuntimeMode,
  wasmReady,
  wasmByteLength,
  wasmError,
  apiEngine,
  sidebarOpen,
  onToggleSidebar,
}: HeaderBarProps) {
  const wasmKb = wasmByteLength !== null ? `${(wasmByteLength / 1024).toFixed(1)} KB` : null

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#0F172A]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? 'Hide configuration sidebar' : 'Show configuration sidebar'}
            aria-expanded={sidebarOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-[#1B2336] text-slate-300 transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 lg:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/40 bg-[#0F172A] p-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                className="h-full w-full"
                aria-hidden="true"
              >
                <path fill="#F8FAFC" d="M 24 62 H 50 L 115 127 V 216 H 102 L 24 138 Z" />
                <path fill="#F8FAFC" d="M 232 62 H 206 L 141 127 V 216 H 154 L 232 138 Z" />
                <polygon fill="#22C55E" points="128,20 172,64 128,108 84,64" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-slate-100 sm:text-base text-balance">
                  Look It Up Studio
                </h1>
                <a
                  href="https://arxiv.org/abs/2611.16890"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#1B2336] px-1.5 py-0.5 font-mono text-[11px] text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                >
                  <span>arXiv:2611.16890</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
              <p className="hidden text-xs text-slate-400 sm:block">
                Multi-bit LLM Watermarking via Codebook Search (Rust + WASM)
              </p>
            </div>
          </div>
        </div>

        <nav aria-label="Studio sections" className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#1B2336] p-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTab(id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
                  active
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/40'
                    : 'text-slate-400 hover:bg-[#272F42] hover:text-slate-200',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] tabular-nums',
              wasmError
                ? 'border-red-500/40 bg-red-500/10 text-red-300'
                : wasmReady
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 bg-[#1B2336] text-slate-400',
            )}
            title={wasmError ?? 'Client-side Rust WebAssembly runtime status'}
          >
            <Activity className="h-3 w-3" aria-hidden="true" />
            <span>
              {wasmError
                ? 'WASM Error'
                : wasmReady
                  ? `WASM Ready (${wasmKb ?? 'ok'})`
                  : 'Loading WASM...'}
            </span>
          </div>

          <div
            role="group"
            aria-label="Execution runtime"
            className="inline-flex rounded-md border border-slate-700 bg-[#1B2336] p-0.5 text-xs"
          >
            <button
              type="button"
              onClick={() => onChangeRuntimeMode('wasm')}
              aria-pressed={runtimeMode === 'wasm'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
                runtimeMode === 'wasm'
                  ? 'bg-[#272F42] text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              <span>WASM Browser</span>
            </button>

            <button
              type="button"
              disabled={!apiEngine}
              onClick={() => onChangeRuntimeMode('api')}
              aria-pressed={runtimeMode === 'api'}
              title={
                apiEngine
                  ? `Connected to ${apiEngine.backend} (${apiEngine.threads} threads)`
                  : 'Start local uvicorn server on :8000 to enable Python/Native API mode'
              }
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
                !apiEngine && 'cursor-not-allowed opacity-45',
                runtimeMode === 'api'
                  ? 'bg-[#272F42] text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Server className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Local API
                {apiEngine ? ` (${apiEngine.threads}T)` : ''}
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
