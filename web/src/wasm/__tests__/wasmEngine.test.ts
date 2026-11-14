import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { sha256 } from '../../engine/sha256'
import {
  applyAttackBrowser,
  computeCodebookInfoWasm,
  embedWatermarkWasm,
  extractWatermarkWasm,
} from '../../engine/watermarkEngine'
import type { StudioConfig } from '../../types/studio'
import { getWasmClient, type LlmwWasmClient } from '../llmwWasm'

function loadTestWasm(): Promise<LlmwWasmClient> {
  const wasmPath = path.resolve(process.cwd(), 'public', 'llmw_wasm.wasm')
  const bytes = new Uint8Array(fs.readFileSync(wasmPath))
  return getWasmClient(bytes)
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

describe('llmw_wasm + browser engine', () => {
  it('matches NIST SHA-256 test vector', () => {
    const digest = sha256(new TextEncoder().encode('abc'))
    expect(toHex(digest)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('loads llmw_wasm.wasm and exposes deterministic codebook & BCH primitives', async () => {
    const wasm = await loadTestWasm()
    expect(wasm.byteLength).toBeGreaterThan(10_000)

    // Vocab partition balanced split
    const mask = wasm.splitVocab(1024, 0x123456789abcdef0n)
    const v1Count = mask.reduce((acc, b) => acc + (b & 1), 0)
    expect(mask.length).toBe(1024)
    expect(v1Count).toBe(512)

    // Encode + exact search recovery for linear & rng codebooks
    for (const construction of ['linear', 'rng'] as const) {
      const cw = wasm.encodeCodeword('test-key', 10, 127, construction, 345)
      expect(cw.length).toBe(127)
      const hit = wasm.searchCodebook('test-key', 10, 127, construction, 'levenshtein', cw)
      expect(hit.watermark).toBe(345)
      expect(hit.distance).toBe(0)
      expect(hit.secondBestDistance).not.toBeNull()
      expect(hit.secondBestDistance!).toBeGreaterThan(20)
    }

    // Exact linear minimum distance check
    const dMin = wasm.linearDMin('test-key', 10, 127)
    expect(dMin).toBeGreaterThan(25)

    // BCH single- and multi-bit error correction
    const bchCode = wasm.bchEncode(12, 127, 1337)
    const noisy = new Uint8Array(bchCode)
    noisy[3] ^= 1
    noisy[27] ^= 1
    noisy[64] ^= 1
    const decoded = wasm.bchDecode(12, 127, noisy)
    expect(decoded.watermark).toBe(1337)
    expect(decoded.flips).toBe(3)
  })

  it('completes end-to-end embed -> deletion attack -> Levenshtein extraction roundtrip', async () => {
    const wasm = await loadTestWasm()
    const config: StudioConfig = {
      secretKey: 'look-it-up-demo-key',
      n: 12,
      u: 127,
      delta: 4.5,
      construction: 'linear',
      method: 'levenshtein',
      entropyMode: 'base',
      enforceTi: true,
      threshold: null,
    }

    const watermark = 2026
    const embedded = embedWatermarkWasm(
      wasm,
      config,
      'Language model watermarking embeds an undetectable',
      watermark,
    )
    expect(embedded.watermark).toBe(watermark)
    expect(embedded.codeword.length).toBe(127)
    expect(embedded.embedded_bit_accuracy).toBeGreaterThan(0.85)

    const attacked = applyAttackBrowser(embedded.generated_text, 'word_deletion', 0.1, 7)
    expect(attacked.modified_tokens).toBeGreaterThan(0)

    const extracted = extractWatermarkWasm(wasm, config, attacked.attacked_text)
    expect(extracted.watermark).toBe(watermark)
    expect(extracted.is_watermarked).toBe(true)
    expect(extracted.alignment.length).toBeGreaterThan(0)

    const info = computeCodebookInfoWasm(wasm, config)
    expect(info.exact_linear_d_min).not.toBeNull()
    expect(info.bch.correction_capability).toBeGreaterThan(0)
  })

  it('completes end-to-end BCH embed -> clean extraction roundtrip', async () => {
    const wasm = await loadTestWasm()
    const config: StudioConfig = {
      secretKey: 'look-it-up-demo-key',
      n: 12,
      u: 127,
      delta: 5.0,
      construction: 'linear',
      method: 'bch',
      entropyMode: 'base',
      enforceTi: true,
      threshold: null,
    }

    const watermark = 1337
    const embedded = embedWatermarkWasm(
      wasm,
      config,
      'Error-correcting codebooks allow decoders to',
      watermark,
    )
    const extracted = extractWatermarkWasm(wasm, config, embedded.generated_text)
    expect(extracted.watermark).toBe(watermark)
    expect(extracted.method).toBe('bch')
  })
})
