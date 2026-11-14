import type { ConstructionKind, DistanceSpectrumStats, ExtractionMethod } from '../types/studio'

interface LlmwWasmExports {
  memory: WebAssembly.Memory
  wasm_alloc(len: number): number
  wasm_free(ptr: number, len: number): void
  wasm_levenshtein(aPtr: number, aLen: number, bPtr: number, bLen: number): number
  wasm_split_vocab(vocabSize: number, seedHi: number, seedLo: number, outPtr: number): void
  wasm_encode_codeword(
    keyPtr: number,
    keyLen: number,
    n: number,
    u: number,
    construction: number,
    watermark: number,
    outPtr: number,
  ): void
  wasm_linear_d_min(keyPtr: number, keyLen: number, n: number, u: number): number
  wasm_distance_spectrum(
    keyPtr: number,
    keyLen: number,
    n: number,
    u: number,
    construction: number,
    watermark: number,
    spreadSamples: number,
    histOutPtr: number,
    statsOutPtr: number,
  ): void
  wasm_codebook_search(
    keyPtr: number,
    keyLen: number,
    n: number,
    u: number,
    construction: number,
    metric: number,
    candPtr: number,
    candLen: number,
    outResultsPtr: number,
  ): void
  wasm_bch_encode(n: number, u: number, watermark: number, outPtr: number): void
  wasm_bch_decode(n: number, u: number, recvPtr: number, outResultsPtr: number): void
}

const textEncoder = new TextEncoder()

export class LlmwWasmClient {
  private readonly exports: LlmwWasmExports
  public readonly byteLength: number

  private constructor(exports: LlmwWasmExports, byteLength: number) {
    this.exports = exports
    this.byteLength = byteLength
  }

  static async load(wasmBytesOverride?: Uint8Array): Promise<LlmwWasmClient> {
    let bytes: Uint8Array
    if (wasmBytesOverride) {
      bytes = wasmBytesOverride
    } else {
      const baseUrl = import.meta.env.BASE_URL ?? './'
      const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
      const resp = await fetch(`${normalized}llmw_wasm.wasm`)
      if (!resp.ok) {
        throw new Error(`Failed to fetch llmw_wasm.wasm (${resp.status})`)
      }
      bytes = new Uint8Array(await resp.arrayBuffer())
    }

    const arrayCopy = new Uint8Array(bytes).buffer
    const { instance } = await WebAssembly.instantiate(arrayCopy, {})
    return new LlmwWasmClient(instance.exports as unknown as LlmwWasmExports, bytes.byteLength)
  }

  private withBytes<T>(data: Uint8Array, fn: (ptr: number, len: number) => T): T {
    const len = Math.max(1, data.length)
    const ptr = this.exports.wasm_alloc(len)
    try {
      if (data.length > 0) {
        new Uint8Array(this.exports.memory.buffer, ptr, data.length).set(data)
      }
      return fn(ptr, data.length)
    } finally {
      this.exports.wasm_free(ptr, len)
    }
  }

  private withAlloc<T>(byteLen: number, fn: (ptr: number) => T): T {
    const len = Math.max(1, byteLen)
    const ptr = this.exports.wasm_alloc(len)
    try {
      return fn(ptr)
    } finally {
      this.exports.wasm_free(ptr, len)
    }
  }

  levenshtein(a: Uint8Array, b: Uint8Array): number {
    return this.withBytes(a, (aPtr, aLen) =>
      this.withBytes(b, (bPtr, bLen) => this.exports.wasm_levenshtein(aPtr, aLen, bPtr, bLen)),
    )
  }

  splitVocab(vocabSize: number, seed: bigint): Uint8Array {
    const seedHi = Number((seed >> 32n) & 0xffffffffn) >>> 0
    const seedLo = Number(seed & 0xffffffffn) >>> 0
    return this.withAlloc(vocabSize, (outPtr) => {
      this.exports.wasm_split_vocab(vocabSize, seedHi, seedLo, outPtr)
      return new Uint8Array(this.exports.memory.buffer, outPtr, vocabSize).slice()
    })
  }

  encodeCodeword(
    secretKey: string,
    n: number,
    u: number,
    construction: ConstructionKind,
    watermark: number,
  ): Uint8Array {
    const keyBytes = textEncoder.encode(secretKey)
    const kind = construction === 'rng' ? 1 : 0
    return this.withBytes(keyBytes, (keyPtr, keyLen) =>
      this.withAlloc(u, (outPtr) => {
        this.exports.wasm_encode_codeword(keyPtr, keyLen, n, u, kind, watermark >>> 0, outPtr)
        return new Uint8Array(this.exports.memory.buffer, outPtr, u).slice()
      }),
    )
  }

  linearDMin(secretKey: string, n: number, u: number): number {
    const keyBytes = textEncoder.encode(secretKey)
    return this.withBytes(keyBytes, (keyPtr, keyLen) =>
      this.exports.wasm_linear_d_min(keyPtr, keyLen, n, u),
    )
  }

  distanceSpectrum(
    secretKey: string,
    n: number,
    u: number,
    construction: ConstructionKind,
    watermark: number,
    spreadSamples = 96,
  ): DistanceSpectrumStats {
    const keyBytes = textEncoder.encode(secretKey)
    const kind = construction === 'rng' ? 1 : 0
    return this.withBytes(keyBytes, (keyPtr, keyLen) =>
      this.withAlloc((u + 1) * 4, (histPtr) =>
        this.withAlloc(6 * 4, (statsPtr) => {
          this.exports.wasm_distance_spectrum(
            keyPtr,
            keyLen,
            n,
            u,
            kind,
            watermark >>> 0,
            spreadSamples,
            histPtr,
            statsPtr,
          )
          const histView = new Uint32Array(this.exports.memory.buffer, histPtr, u + 1)
          const statsView = new Uint32Array(this.exports.memory.buffer, statsPtr, 6)
          return {
            bins: Array.from(histView),
            minFromW: statsView[0],
            maxFromW: statsView[1],
            meanFromW: statsView[2] / 1000,
            nnMin: statsView[3],
            nnMax: statsView[4],
            zeroSpread: statsView[5] === 1,
          }
        }),
      ),
    )
  }

  searchCodebook(
    secretKey: string,
    n: number,
    u: number,
    construction: ConstructionKind,
    metric: Exclude<ExtractionMethod, 'bch'>,
    candidate: Uint8Array,
  ): { watermark: number; distance: number; secondBestDistance: number | null; codeword: Uint8Array } {
    const keyBytes = textEncoder.encode(secretKey)
    const kind = construction === 'rng' ? 1 : 0
    const met = metric === 'hamming' ? 0 : 1

    const [watermark, distance, secondRaw] = this.withBytes(keyBytes, (keyPtr, keyLen) =>
      this.withBytes(candidate, (candPtr, candLen) =>
        this.withAlloc(12, (outPtr) => {
          this.exports.wasm_codebook_search(
            keyPtr,
            keyLen,
            n,
            u,
            kind,
            met,
            candPtr,
            candLen,
            outPtr,
          )
          const view = new Uint32Array(this.exports.memory.buffer, outPtr, 3)
          return [view[0], view[1], view[2]]
        }),
      ),
    )

    const secondBestDistance = secondRaw === 0xffffffff ? null : secondRaw
    const codeword = this.encodeCodeword(secretKey, n, u, construction, watermark)
    return { watermark, distance, secondBestDistance, codeword }
  }

  bchEncode(n: number, u: number, watermark: number): Uint8Array {
    return this.withAlloc(u, (outPtr) => {
      this.exports.wasm_bch_encode(n, u, watermark >>> 0, outPtr)
      return new Uint8Array(this.exports.memory.buffer, outPtr, u).slice()
    })
  }

  bchDecode(
    n: number,
    u: number,
    received: Uint8Array,
  ): { watermark: number; flips: number; codeword: Uint8Array } {
    const [wmLo, wmHi, flips] = this.withBytes(received, (recvPtr) =>
      this.withAlloc(12, (outPtr) => {
        this.exports.wasm_bch_decode(n, u, recvPtr, outPtr)
        const view = new Uint32Array(this.exports.memory.buffer, outPtr, 3)
        return [view[0], view[1], view[2]]
      }),
    )
    const watermark = Number((BigInt(wmHi) << 32n) | BigInt(wmLo))
    const codeword = this.bchEncode(n, u, watermark)
    return { watermark, flips, codeword }
  }
}

let cachedPromise: Promise<LlmwWasmClient> | null = null

export function getWasmClient(wasmBytesOverride?: Uint8Array): Promise<LlmwWasmClient> {
  if (!cachedPromise) {
    cachedPromise = LlmwWasmClient.load(wasmBytesOverride)
  }
  return cachedPromise
}
