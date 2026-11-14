import {
  Activity,
  BarChart3,
  Binary,
  Cpu,
  ExternalLink,
  FlaskConical,
  Menu,
  Server,
  X,
} from 'lucide-react'
import type { KeyboardEvent } from 'react'
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

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = TABS.length - 1

    if (nextIndex !== null) {
      event.preventDefault()
      const nextTab = TABS[nextIndex]
      onSelectTab(nextTab.id)
      document.getElementById(`tab-${nextTab.id}`)?.focus()
    }
  }

  return (
    <header className="z-30 border-b border-border bg-canvas/95 backdrop-blur-sm lg:sticky lg:top-0">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? 'Hide scheme parameters drawer' : 'Show scheme parameters drawer'}
            aria-expanded={sidebarOpen}
            aria-controls="scheme-config-sidebar"
            className="inline-flex size-9 items-center justify-center rounded-md border border-border-strong bg-surface text-ink-secondary transition-colors hover:border-ink-muted hover:text-ink lg:hidden"
          >
            {sidebarOpen ? (
              <X className="size-4" aria-hidden="true" />
            ) : (
              <Menu className="size-4" aria-hidden="true" />
            )}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-emerald-500/35 bg-surface-inset p-1.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                className="size-full"
                aria-hidden="true"
              >
                <path fill="#F8FAFC" d="M 24 62 H 50 L 115 127 V 216 H 102 L 24 138 Z" />
                <path fill="#F8FAFC" d="M 232 62 H 206 L 141 127 V 216 H 154 L 232 138 Z" />
                <polygon fill="#22C55E" points="128,20 172,64 128,108 84,64" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm font-semibold text-ink sm:text-base text-balance">
                  Look It Up Studio
                </h1>
                <a
                  href="https://arxiv.org/abs/2611.16890"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-border-strong bg-surface px-2 py-0.5 font-mono text-xs text-ink-secondary transition-colors hover:border-emerald-500/60 hover:text-accent-ink"
                >
                  <span>arXiv:2611.16890</span>
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </div>
              <p className="hidden text-xs text-ink-muted sm:block">
                Multi-bit LLM Watermarking via Codebook Search
              </p>
            </div>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Studio workspace views"
          className="flex w-full items-center justify-between gap-1 rounded-lg border border-border bg-surface p-1 sm:w-auto sm:justify-start"
        >
          {TABS.map(({ id, label, icon: Icon }, idx) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`panel-${id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => onSelectTab(id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={cn(
                  'inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:flex-initial sm:px-3',
                  active
                    ? 'bg-emerald-500/15 text-accent-ink ring-1 ring-inset ring-emerald-500/45'
                    : 'text-ink-muted hover:bg-surface-elevated hover:text-ink',
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {id === 'inspector' ? (
                  <>
                    <span className="sm:hidden">Inspector</span>
                    <span className="hidden sm:inline">{label}</span>
                  </>
                ) : (
                  <span>{label}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs tabular-nums',
              wasmError
                ? 'border-red-500/45 bg-red-500/10 text-danger-ink'
                : wasmReady
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-accent-ink'
                  : 'border-border-strong bg-surface text-ink-secondary',
            )}
            title={wasmError ?? 'Client-side Rust WebAssembly runtime status'}
          >
            <Activity className="size-3.5 shrink-0" aria-hidden="true" />
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
            className="inline-flex rounded-md border border-border-strong bg-surface p-0.5 text-xs"
          >
            <button
              type="button"
              onClick={() => onChangeRuntimeMode('wasm')}
              aria-pressed={runtimeMode === 'wasm'}
              className={cn(
                'inline-flex min-h-7 items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors',
                runtimeMode === 'wasm'
                  ? 'bg-surface-elevated text-accent-ink'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              <Cpu className="size-3.5 shrink-0" aria-hidden="true" />
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
                'inline-flex min-h-7 items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors',
                !apiEngine && 'opacity-45',
                runtimeMode === 'api'
                  ? 'bg-surface-elevated text-accent-ink'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              <Server className="size-3.5 shrink-0" aria-hidden="true" />
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
