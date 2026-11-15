import { useEffect, useMemo, useState } from 'react'
import { BenchmarksView } from './components/BenchmarksView'
import { ConfigSidebar } from './components/ConfigSidebar'
import { HeaderBar, type StudioTab } from './components/HeaderBar'
import { InspectorView } from './components/InspectorView'
import { PlaygroundView } from './components/PlaygroundView'
import {
  attackViaApi,
  checkApiHealth,
  embedViaApi,
  extractViaApi,
  infoViaApi,
  loadStaticBenchmarks,
} from './engine/apiClient'
import {
  applyAttackBrowser,
  compareDecodersWasm,
  computeCodebookInfoWasm,
  embedWatermarkWasm,
  extractWatermarkWasm,
} from './engine/watermarkEngine'
import type {
  AttackResponse,
  AttackType,
  BenchmarkResults,
  CodebookInfoResponse,
  DualDecoderComparison,
  EmbedResponse,
  ExtractResponse,
  RuntimeMode,
  StudioConfig,
} from './types/studio'
import { getWasmClient, type LlmwWasmClient } from './wasm/llmwWasm'

const INITIAL_CONFIG: StudioConfig = {
  secretKey: 'look-it-up-demo-key',
  n: 12,
  u: 127,
  delta: 3.5,
  construction: 'linear',
  method: 'levenshtein',
  entropyMode: 'base',
  enforceTi: true,
  threshold: null,
}

export function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>('playground')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>('wasm')
  const [config, setConfig] = useState<StudioConfig>(INITIAL_CONFIG)
  const [watermark, setWatermark] = useState<number>(1337)
  const [prompt, setPrompt] = useState<string>(
    'Language model watermarking embeds an undetectable',
  )

  const [wasm, setWasm] = useState<LlmwWasmClient | null>(null)
  const [wasmError, setWasmError] = useState<string | null>(null)
  const [apiEngine, setApiEngine] = useState<{ backend: string; threads: number } | null>(null)

  const [benchmarks, setBenchmarks] = useState<BenchmarkResults | null>(null)
  const [refreshingBench, setRefreshingBench] = useState(false)

  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [embedResult, setEmbedResult] = useState<EmbedResponse | null>(null)
  const [attackMeta, setAttackMeta] = useState<AttackResponse | null>(null)
  const [attackBudget, setAttackBudget] = useState<number>(0.1)
  const [attackSeed, setAttackSeed] = useState<number>(0)
  const [suspectText, setSuspectText] = useState<string>('')
  const [extractResult, setExtractResult] = useState<ExtractResponse | null>(null)
  const [decoderComparison, setDecoderComparison] = useState<DualDecoderComparison | null>(null)
  const [apiCodebookInfo, setApiCodebookInfo] = useState<CodebookInfoResponse | null>(null)

  useEffect(() => {
    let cancelled = false

    getWasmClient()
      .then((client) => {
        if (!cancelled) {
          setWasm(client)
          setWasmError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setWasmError(err instanceof Error ? err.message : String(err))
        }
      })

    checkApiHealth().then((engine) => {
      if (!cancelled && engine) {
        setApiEngine(engine)
      }
    })

    loadStaticBenchmarks().then((data) => {
      if (!cancelled && data) {
        setBenchmarks(data)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (runtimeMode !== 'api' || !apiEngine || activeTab !== 'inspector') {
      return
    }
    let cancelled = false
    infoViaApi(config)
      .then((data) => {
        if (!cancelled) setApiCodebookInfo(data)
      })
      .catch(() => {
        if (!cancelled) setApiCodebookInfo(null)
      })
    return () => {
      cancelled = true
    }
  }, [runtimeMode, apiEngine, activeTab, config])

  const previewCodeword = useMemo(() => {
    if (!wasm) return []
    const wm = watermark & ((1 << config.n) - 1)
    const bits =
      config.method === 'bch'
        ? wasm.bchEncode(config.n, config.u, wm)
        : wasm.encodeCodeword(config.secretKey, config.n, config.u, config.construction, wm)
    return Array.from(bits)
  }, [wasm, watermark, config.n, config.u, config.secretKey, config.construction, config.method])

  const wasmCodebookInfo = useMemo(
    () => computeCodebookInfoWasm(wasm, config),
    [wasm, config],
  )

  const codebookInfo =
    runtimeMode === 'api' && apiCodebookInfo ? apiCodebookInfo : wasmCodebookInfo

  const handlePatchConfig = (patch: Partial<StudioConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }))
  }

  const runExtraction = async (textToCheck: string, activeConfig: StudioConfig) => {
    if (!textToCheck.trim()) {
      setExtractResult(null)
      setDecoderComparison(null)
      return
    }
    if (runtimeMode === 'api' && apiEngine) {
      const res = await extractViaApi(activeConfig, textToCheck)
      setExtractResult(res)
      setDecoderComparison(null)
      return
    }
    if (!wasm) return
    const res = extractWatermarkWasm(wasm, activeConfig, textToCheck)
    setExtractResult(res)
    setDecoderComparison(compareDecodersWasm(wasm, activeConfig, textToCheck))
  }

  const handleEmbed = async () => {
    if (!wasm && runtimeMode === 'wasm') return
    setBusy(true)
    setErrorMessage(null)
    try {
      const embedded =
        runtimeMode === 'api' && apiEngine
          ? await embedViaApi(config, prompt, watermark)
          : embedWatermarkWasm(wasm!, config, prompt, watermark)

      setEmbedResult(embedded)
      setAttackMeta(null)
      setSuspectText(embedded.generated_text)
      await runExtraction(embedded.generated_text, config)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleAttack = async (attackType: AttackType) => {
    if (!embedResult) return
    setBusy(true)
    setErrorMessage(null)
    try {
      const baseText = embedResult.generated_text
      const attacked =
        runtimeMode === 'api' && apiEngine
          ? await attackViaApi(baseText, attackType, attackBudget, attackSeed)
          : applyAttackBrowser(baseText, attackType, attackBudget, attackSeed)

      setAttackMeta(attacked)
      setSuspectText(attacked.attacked_text)
      await runExtraction(attacked.attacked_text, config)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleResetText = async () => {
    if (!embedResult) return
    setErrorMessage(null)
    setAttackMeta(null)
    setSuspectText(embedResult.generated_text)
    try {
      await runExtraction(embedResult.generated_text, config)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const handleChangeSuspectText = (nextText: string) => {
    setSuspectText(nextText)
    setAttackMeta(null)
    if (runtimeMode === 'wasm' && wasm) {
      setErrorMessage(null)
      if (nextText.trim()) {
        setExtractResult(extractWatermarkWasm(wasm, config, nextText))
        setDecoderComparison(compareDecodersWasm(wasm, config, nextText))
      } else {
        setExtractResult(null)
        setDecoderComparison(null)
      }
    }
  }

  const handleExtractNow = async () => {
    setBusy(true)
    setErrorMessage(null)
    try {
      await runExtraction(suspectText, config)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleRefreshBenchmarks = async () => {
    if (!apiEngine) return
    setRefreshingBench(true)
    try {
      const res = await fetch('http://127.0.0.1:8000/api/benchmarks')
      if (res.ok) {
        const data = (await res.json()) as BenchmarkResults
        setBenchmarks(data)
      }
    } finally {
      setRefreshingBench(false)
    }
  }

  const runtimeLabel =
    runtimeMode === 'api' && apiEngine
      ? `Local API / ${apiEngine.backend} (${apiEngine.threads}T)`
      : 'Browser / Rust WASM + TS N-Gram'

  const constructionLabel = config.construction === 'linear' ? 'Linear GF(2)' : 'RNG Codebook'
  const methodLabel =
    config.method === 'levenshtein'
      ? 'Levenshtein'
      : config.method === 'hamming'
        ? 'Hamming'
        : 'BCH ECC'

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-950"
      >
        Skip to studio workspace
      </a>

      <HeaderBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        runtimeMode={runtimeMode}
        onChangeRuntimeMode={setRuntimeMode}
        wasmReady={wasm !== null}
        wasmByteLength={wasm?.byteLength ?? null}
        wasmError={wasmError}
        apiEngine={apiEngine}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />

      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col lg:flex-row">
        <ConfigSidebar
          config={config}
          onChangeConfig={handlePatchConfig}
          watermark={watermark}
          onChangeWatermark={setWatermark}
          previewCodeword={previewCodeword}
          isOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
        />

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 p-4 focus:outline-none sm:p-6">
          {!sidebarOpen && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs lg:hidden">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-ink-secondary tabular-nums">
                <span>ID {watermark}</span>
                <span>n={config.n}</span>
                <span>u={config.u}</span>
                <span>{constructionLabel}</span>
                <span className="text-accent-ink">{methodLabel}</span>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="min-h-7 rounded border border-border-strong bg-surface-elevated px-2.5 py-1 font-medium text-ink transition-colors hover:border-emerald-500/60"
              >
                Edit Parameters
              </button>
            </div>
          )}

          <div
            id={`panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
          >
            {activeTab === 'playground' && (
              <PlaygroundView
                config={config}
                watermark={watermark}
                runtimeLabel={runtimeLabel}
                wasmReady={wasm !== null || (runtimeMode === 'api' && apiEngine !== null)}
                busy={busy}
                errorMessage={errorMessage}
                prompt={prompt}
                onChangePrompt={setPrompt}
                embedResult={embedResult}
                attackMeta={attackMeta}
                attackBudget={attackBudget}
                onChangeAttackBudget={setAttackBudget}
                attackSeed={attackSeed}
                onChangeAttackSeed={setAttackSeed}
                suspectText={suspectText}
                extractResult={extractResult}
                decoderComparison={decoderComparison}
                onEmbed={handleEmbed}
                onAttack={handleAttack}
                onResetText={handleResetText}
                onChangeSuspectText={handleChangeSuspectText}
                onExtractNow={handleExtractNow}
              />
            )}

            {activeTab === 'benchmarks' && (
              <BenchmarksView
                benchmarks={benchmarks}
                apiConnected={apiEngine !== null}
                onRefreshFromApi={handleRefreshBenchmarks}
                refreshing={refreshingBench}
              />
            )}

            {activeTab === 'inspector' && (
              <InspectorView
                config={config}
                watermark={watermark}
                info={codebookInfo}
                wasm={wasm}
              />
            )}
          </div>
        </main>
      </div>

      <footer className="border-t border-border bg-canvas px-4 py-3.5 text-center font-mono text-xs text-ink-muted">
        Client-side Rust WebAssembly implementation of{' '}
        <a
          href="https://arxiv.org/abs/2611.16890"
          target="_blank"
          rel="noreferrer"
          className="text-ink-secondary underline decoration-border-strong underline-offset-4 transition-colors hover:text-accent-ink"
        >
          Janas, Morawiecki &amp; Pieprzyk (2026)
        </a>
        <span className="mx-2 text-border-strong" aria-hidden="true">
          |
        </span>
        Local API:{' '}
        <code className="text-ink-secondary">uvicorn llmw_codebook.api:app --port 8000</code>
      </footer>
    </div>
  )
}

export default App
