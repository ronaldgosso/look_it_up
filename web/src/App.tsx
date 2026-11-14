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
  computeCodebookInfoWasm,
  embedWatermarkWasm,
  extractWatermarkWasm,
} from './engine/watermarkEngine'
import type {
  AttackResponse,
  AttackType,
  BenchmarkResults,
  CodebookInfoResponse,
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
  const [suspectText, setSuspectText] = useState<string>('')
  const [extractResult, setExtractResult] = useState<ExtractResponse | null>(null)
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
      return
    }
    if (runtimeMode === 'api' && apiEngine) {
      const res = await extractViaApi(activeConfig, textToCheck)
      setExtractResult(res)
      return
    }
    if (!wasm) return
    const res = extractWatermarkWasm(wasm, activeConfig, textToCheck)
    setExtractResult(res)
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
          ? await attackViaApi(baseText, attackType, 0.1, 0)
          : applyAttackBrowser(baseText, attackType, 0.1, 0)

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
      } else {
        setExtractResult(null)
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
      ? `Local API · ${apiEngine.backend} (${apiEngine.threads}T)`
      : 'Browser · Rust WASM + TS N-Gram'

  return (
    <div className="flex min-h-dvh flex-col bg-[#0F172A] text-slate-100">
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
        />

        <main className="flex-1 p-4 sm:p-6">
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
              suspectText={suspectText}
              extractResult={extractResult}
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
        </main>
      </div>

      <footer className="border-t border-slate-800 bg-[#0F172A] px-4 py-3 text-center font-mono text-[11px] text-slate-500">
        Zero-cost client-side Rust WebAssembly implementation of{' '}
        <a
          href="https://arxiv.org/abs/2611.16890"
          target="_blank"
          rel="noreferrer"
          className="text-slate-400 underline hover:text-emerald-400"
        >
          Janas, Morawiecki &amp; Pieprzyk (2026)
        </a>{' '}
        · Run local Python/Rayon backend via{' '}
        <code className="text-slate-400">uvicorn llmw_codebook.api:app --port 8000</code>
      </footer>
    </div>
  )
}

export default App
