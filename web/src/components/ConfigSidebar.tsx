import { KeyRound, RefreshCw, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
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
  onCloseMobile: () => void
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
  onCloseMobile,
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
      id="scheme-config-sidebar"
      aria-label="Watermark scheme parameters"
      className={cn(
        'w-full shrink-0 border-b border-border bg-surface/85 p-4 sm:p-5 lg:w-80 lg:border-r lg:border-b-0',
        !isOpen && 'hidden lg:block',
      )}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <SlidersHorizontal className="size-4 text-accent" aria-hidden="true" />
            <span>Scheme Parameters</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="rounded border border-border bg-surface-inset px-2 py-0.5 font-mono text-xs text-ink-secondary tabular-nums"
              title="Total codewords in palette"
            >
              |C| = {(1 << config.n).toLocaleString()}
            </span>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close scheme parameters"
              className="inline-flex size-8 items-center justify-center rounded-md border border-border-strong bg-surface-elevated text-ink-secondary hover:text-ink lg:hidden"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="cfg-watermark-int" className="text-xs font-medium text-ink-secondary">
              Watermark Payload ID ({config.n}-bit)
            </label>
            <button
              type="button"
              onClick={applyRandomWatermark}
              className="inline-flex min-h-7 items-center gap-1 rounded border border-border-strong bg-surface-elevated px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:border-emerald-500/60 hover:text-accent-ink"
            >
              <RefreshCw className="size-3" aria-hidden="true" />
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
                  onChangeWatermark(
                    Number.isNaN(parsed) ? 0 : Math.min(Math.max(0, parsed), maxWatermark),
                  )
                }}
                className="min-h-9 w-full rounded-md border border-border-strong bg-surface-inset px-2.5 py-1.5 font-mono text-sm text-ink tabular-nums focus:border-emerald-400"
              />
            </div>
            <div>
              <input
                id="cfg-watermark-ascii"
                type="text"
                maxLength={4}
                placeholder="ASCII tag"
                aria-label="Derive watermark ID from ASCII tag"
                value={asciiDraft}
                onChange={(e) => applyAsciiTag(e.target.value)}
                className="min-h-9 w-full rounded-md border border-border-strong bg-surface-inset px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-ink-muted focus:border-emerald-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-inset px-2.5 py-1.5 font-mono text-xs tabular-nums">
            <span className="text-ink-muted">{hexTag}</span>
            <span className="break-all text-right text-accent-ink">{binaryTag}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="cfg-secret-key"
            className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary"
          >
            <KeyRound className="size-3.5 text-ink-muted" aria-hidden="true" />
            <span>Secret Key (SHA-256 Seed)</span>
          </label>
          <input
            id="cfg-secret-key"
            type="text"
            value={config.secretKey}
            onChange={(e) => onChangeConfig({ secretKey: e.target.value || 'default-key' })}
            className="min-h-9 w-full rounded-md border border-border-strong bg-surface-inset px-2.5 py-1.5 font-mono text-xs text-ink focus:border-emerald-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="cfg-bits-n" className="block text-xs font-medium text-ink-secondary">
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
              className="min-h-9 w-full rounded-md border border-border-strong bg-surface-inset px-2.5 py-1.5 font-mono text-xs text-ink focus:border-emerald-400"
            >
              {N_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  n = {opt} ({1 << opt})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cfg-len-u" className="block text-xs font-medium text-ink-secondary">
              Token Length (u)
            </label>
            <select
              id="cfg-len-u"
              value={config.u}
              onChange={(e) => onChangeConfig({ u: Number(e.target.value) })}
              className="min-h-9 w-full rounded-md border border-border-strong bg-surface-inset px-2.5 py-1.5 font-mono text-xs text-ink focus:border-emerald-400"
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
            <label htmlFor="cfg-delta" className="text-xs font-medium text-ink-secondary">
              Logit Bias Strength (delta)
            </label>
            <span className="font-mono text-xs font-semibold text-accent-ink tabular-nums">
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
            className="h-2 w-full accent-emerald-500"
          />
          <div className="flex justify-between font-mono text-xs text-ink-muted tabular-nums">
            <span>0.5 subtle</span>
            <span>3.5 paper</span>
            <span>6.0 strong</span>
          </div>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-ink-secondary">Codebook Construction</legend>
          <div role="radiogroup" aria-label="Codebook construction" className="grid grid-cols-2 gap-1.5">
            {(['linear', 'rng'] as const).map((kind) => {
              const checked = config.construction === kind
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => handleConstructionChange(kind)}
                  className={cn(
                    'min-h-8 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    checked
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-accent-ink'
                      : 'border-border-strong bg-surface-inset text-ink-muted hover:border-ink-muted hover:text-ink',
                  )}
                >
                  {kind === 'linear' ? 'Linear GF(2)' : 'RNG Codebook'}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-ink-secondary">Extraction Decoder</legend>
          <div role="radiogroup" aria-label="Extraction decoder" className="grid grid-cols-3 gap-1.5">
            {(['levenshtein', 'hamming', 'bch'] as const).map((m) => {
              const checked = config.method === m
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => handleMethodChange(m)}
                  className={cn(
                    'min-h-8 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                    checked
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-accent-ink'
                      : 'border-border-strong bg-surface-inset text-ink-muted hover:border-ink-muted hover:text-ink',
                  )}
                >
                  {m === 'levenshtein' ? 'Levenshtein' : m === 'hamming' ? 'Hamming' : 'BCH ECC'}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-ink-secondary">Token Entropy Regime</legend>
          <div role="radiogroup" aria-label="Token entropy regime" className="grid grid-cols-2 gap-1.5">
            {(['base', 'instruct'] as EntropyMode[]).map((regime) => {
              const checked = config.entropyMode === regime
              return (
                <button
                  key={regime}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => onChangeConfig({ entropyMode: regime })}
                  className={cn(
                    'min-h-8 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    checked
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-accent-ink'
                      : 'border-border-strong bg-surface-inset text-ink-muted hover:border-ink-muted hover:text-ink',
                  )}
                >
                  {regime === 'base' ? 'Base (High H)' : 'Instruct (Low H)'}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="space-y-3 rounded-lg border border-border bg-surface-inset p-3">
          <label className="flex min-h-7 cursor-pointer items-center justify-between gap-2 text-xs font-medium text-ink-secondary">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
              <span>Tokenization Invariance (TI)</span>
            </span>
            <input
              type="checkbox"
              checked={config.enforceTi}
              onChange={(e) => onChangeConfig({ enforceTi: e.target.checked })}
              className="size-4 rounded border-border-strong bg-surface accent-emerald-500"
            />
          </label>

          <div className="space-y-1.5 border-t border-border pt-2.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="cfg-threshold" className="text-xs font-medium text-ink-secondary">
                Threshold (tau)
              </label>
              <button
                type="button"
                onClick={() =>
                  onChangeConfig({
                    threshold: config.threshold === null ? Math.round(config.u * 0.35) : null,
                  })
                }
                aria-pressed={config.threshold !== null}
                className="min-h-7 rounded border border-border-strong bg-surface px-2 py-0.5 font-mono text-xs text-accent-ink transition-colors hover:border-emerald-500/60"
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
                  onChangeConfig({
                    threshold: Number.isNaN(val) ? 0 : Math.min(Math.max(0, val), config.u),
                  })
                }}
                className="min-h-8 w-full rounded border border-border-strong bg-surface px-2.5 py-1 font-mono text-xs text-ink tabular-nums focus:border-emerald-400"
              />
            )}
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>Target Codeword ({previewCodeword.length}b)</span>
            <span className="font-mono text-ink-secondary tabular-nums">
              wt = {onesCount} / {previewCodeword.length}
            </span>
          </div>
          <div
            role="img"
            aria-label={`Target codeword bit pattern of length ${previewCodeword.length} with Hamming weight ${onesCount}`}
            className="flex flex-wrap gap-0.5 rounded-md border border-border bg-surface-inset p-2.5"
          >
            {previewCodeword.slice(0, 127).map((bit, idx) => (
              <span
                key={idx}
                className={cn(
                  'h-2 w-1.5 rounded-[1px]',
                  bit === 1 ? 'bg-emerald-500' : 'bg-rose-500/75',
                )}
              />
            ))}
            {previewCodeword.length > 127 && (
              <span className="ml-1 font-mono text-xs text-ink-muted tabular-nums">
                +{previewCodeword.length - 127}
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
