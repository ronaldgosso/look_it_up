import { KeyRound, RefreshCw, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import type {
  ConstructionKind,
  EntropyMode,
  ExtractionMethod,
  StudioConfig,
} from '../types/studio'
import { cn } from '../utils/cn'

interface ConfigSidebarProps {
  config: StudioConfig
  onChangeConfig: (patch: Partial<StudioConfig>) => void
  watermark: number
  onChangeWatermark: (wm: number) => void
  previewCodeword: number[]
  isOpen: boolean
}

const N_OPTIONS = [8, 10, 12, 14]
const U_OPTIONS = [63, 127, 200]

export function ConfigSidebar({
  config,
  onChangeConfig,
  watermark,
  onChangeWatermark,
  previewCodeword,
  isOpen,
}: ConfigSidebarProps) {
  const [asciiDraft, setAsciiDraft] = useState('')
  const maxWatermark = (1 << config.n) - 1
  const clampedWatermark = Math.min(Math.max(0, watermark), maxWatermark)

  const applyRandomWatermark = () => {
    const rand = Math.floor(Math.random() * (maxWatermark + 1))
    onChangeWatermark(rand)
  }

  const applyAsciiTag = (tag: string) => {
    setAsciiDraft(tag)
    if (!tag.length) return
    let value = 0
    for (let i = 0; i < tag.length; i++) {
      value = ((value << 8) | (tag.charCodeAt(i) & 0xff)) >>> 0
    }
    onChangeWatermark(value & maxWatermark)
  }

  const handleMethodChange = (method: ExtractionMethod) => {
    const patch: Partial<StudioConfig> = { method }
    if (method === 'bch' && config.construction !== 'linear') {
      patch.construction = 'linear'
    }
    onChangeConfig(patch)
  }

  const handleConstructionChange = (construction: ConstructionKind) => {
    const patch: Partial<StudioConfig> = { construction }
    if (construction === 'rng' && config.method === 'bch') {
      patch.method = 'levenshtein'
    }
    onChangeConfig(patch)
  }

  const binaryTag = clampedWatermark.toString(2).padStart(config.n, '0')
  const hexWidth = Math.ceil(config.n / 4)
  const hexTag = `0x${clampedWatermark.toString(16).toUpperCase().padStart(hexWidth, '0')}`
  const onesCount = previewCodeword.reduce((acc, b) => acc + (b & 1), 0)

  return (
    <aside
      aria-label="Watermark scheme configuration"
      className={cn(
        'w-full shrink-0 border-b border-slate-800 bg-[#1B2336]/70 p-4 lg:w-80 lg:border-r lg:border-b-0',
        !isOpen && 'hidden lg:block',
      )}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-300 uppercase">
            <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            <span>Scheme Parameters</span>
          </div>
          <span className="rounded bg-[#272F42] px-2 py-0.5 font-mono text-[11px] text-slate-300 tabular-nums">
            |C| = {(1 << config.n).toLocaleString()}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="cfg-watermark-int" className="text-xs font-medium text-slate-300">
              Watermark Payload ID ({config.n}-bit)
            </label>
            <button
              type="button"
              onClick={applyRandomWatermark}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#272F42] px-2 py-0.5 text-[11px] font-medium text-slate-200 transition-colors hover:border-emerald-500/50 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              <span>Random</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <input
                id="cfg-watermark-int"
                type="number"
                min={0}
                max={maxWatermark}
                value={clampedWatermark}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10)
                  onChangeWatermark(Number.isNaN(parsed) ? 0 : Math.min(Math.max(0, parsed), maxWatermark))
                }}
                className="w-full rounded-md border border-slate-700 bg-[#0F172A] px-2.5 py-1.5 font-mono text-sm text-slate-100 tabular-nums focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <input
                id="cfg-watermark-ascii"
                type="text"
                maxLength={4}
                placeholder="ASCII tag..."
                aria-label="Derive watermark ID from ASCII tag"
                value={asciiDraft}
                onChange={(e) => applyAsciiTag(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-[#0F172A] px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded bg-[#0F172A] px-2.5 py-1.5 font-mono text-[11px] text-slate-400 tabular-nums">
            <span>{hexTag}</span>
            <span className="text-emerald-300">{binaryTag}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cfg-secret-key" className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <KeyRound className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>Secret Key (SHA-256 Seed)</span>
          </label>
          <input
            id="cfg-secret-key"
            type="text"
            value={config.secretKey}
            onChange={(e) => onChangeConfig({ secretKey: e.target.value || 'default-key' })}
            className="w-full rounded-md border border-slate-700 bg-[#0F172A] px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="cfg-bits-n" className="block text-xs font-medium text-slate-300">
              Payload Bits (n)
            </label>
            <select
              id="cfg-bits-n"
              value={config.n}
              onChange={(e) => {
                const nextN = Number(e.target.value)
                onChangeConfig({ n: nextN })
                onChangeWatermark(clampedWatermark & ((1 << nextN) - 1))
              }}
              className="w-full rounded-md border border-slate-700 bg-[#0F172A] px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              {N_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  n = {opt} ({1 << opt})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cfg-len-u" className="block text-xs font-medium text-slate-300">
              Token Length (u)
            </label>
            <select
              id="cfg-len-u"
              value={config.u}
              onChange={(e) => onChangeConfig({ u: Number(e.target.value) })}
              className="w-full rounded-md border border-slate-700 bg-[#0F172A] px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              {U_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  u = {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="cfg-delta" className="text-xs font-medium text-slate-300">
              Logit Bias Strength (delta)
            </label>
            <span className="font-mono text-xs font-semibold text-emerald-300 tabular-nums">
              {config.delta.toFixed(1)}
            </span>
          </div>
          <input
            id="cfg-delta"
            type="range"
            min={0.5}
            max={6.0}
            step={0.5}
            value={config.delta}
            onChange={(e) => onChangeConfig({ delta: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between font-mono text-[10px] text-slate-500">
            <span>0.5 (subtle)</span>
            <span>3.5 (paper)</span>
            <span>6.0 (strong)</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-slate-300">Codebook Construction</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(['linear', 'rng'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => handleConstructionChange(kind)}
                aria-pressed={config.construction === kind}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
                  config.construction === kind
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-[#0F172A] text-slate-400 hover:border-slate-500 hover:text-slate-200',
                )}
              >
                {kind === 'linear' ? 'Linear GF(2)' : 'RNG Codebook'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-slate-300">Extraction Decoder</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(['levenshtein', 'hamming', 'bch'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMethodChange(m)}
                aria-pressed={config.method === m}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
                  config.method === m
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-[#0F172A] text-slate-400 hover:border-slate-500 hover:text-slate-200',
                )}
              >
                {m === 'levenshtein' ? 'Levenshtein' : m === 'hamming' ? 'Hamming' : 'BCH ECC'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-slate-300">Token Entropy Regime</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(['base', 'instruct'] as EntropyMode[]).map((regime) => (
              <button
                key={regime}
                type="button"
                onClick={() => onChangeConfig({ entropyMode: regime })}
                aria-pressed={config.entropyMode === regime}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
                  config.entropyMode === regime
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-[#0F172A] text-slate-400 hover:border-slate-500 hover:text-slate-200',
                )}
              >
                {regime === 'base' ? 'Base (High H)' : 'Instruct (Low H)'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-800 bg-[#0F172A]/80 p-3">
          <label className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Tokenization Invariance (TI)</span>
            </span>
            <input
              type="checkbox"
              checked={config.enforceTi}
              onChange={(e) => onChangeConfig({ enforceTi: e.target.checked })}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-emerald-500"
            />
          </label>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="cfg-threshold" className="text-xs font-medium text-slate-300">
                Verification Threshold (tau)
              </label>
              <button
                type="button"
                onClick={() =>
                  onChangeConfig({
                    threshold: config.threshold === null ? Math.round(config.u * 0.35) : null,
                  })
                }
                className="font-mono text-[11px] text-emerald-400 hover:underline"
              >
                {config.threshold === null ? 'Auto: Always' : `d <= ${config.threshold}`}
              </button>
            </div>
            {config.threshold !== null && (
              <input
                id="cfg-threshold"
                type="number"
                min={0}
                max={config.u}
                value={config.threshold}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value, 10)
                  onChangeConfig({ threshold: Number.isNaN(val) ? 0 : Math.min(Math.max(0, val), config.u) })
                }}
                className="w-full rounded border border-slate-700 bg-[#1B2336] px-2 py-1 font-mono text-xs text-slate-100 tabular-nums focus:border-emerald-500 focus:outline-none"
              />
            )}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Target Codeword ({previewCodeword.length}b)</span>
            <span className="font-mono tabular-nums">wt = {onesCount}</span>
          </div>
          <div
            aria-label="Encoded codeword bits"
            className="flex flex-wrap gap-0.5 rounded-md border border-slate-800 bg-[#0F172A] p-2"
          >
            {previewCodeword.slice(0, 127).map((bit, idx) => (
              <span
                key={idx}
                className={cn(
                  'h-2 w-1.5 rounded-[1px]',
                  bit === 1 ? 'bg-emerald-500' : 'bg-red-500/70',
                )}
              />
            ))}
            {previewCodeword.length > 127 && (
              <span className="ml-1 font-mono text-[10px] text-slate-500">
                +{previewCodeword.length - 127}
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
