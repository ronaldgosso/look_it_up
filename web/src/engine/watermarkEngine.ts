import type {
  AlignmentOp,
  AttackResponse,
  AttackType,
  CodebookInfoResponse,
  EmbedResponse,
  EntropyMode,
  ExtractResponse,
  StudioConfig,
  TokenStepTrace,
} from '../types/studio'
import type { LlmwWasmClient } from '../wasm/llmwWasm'
import modelDataRaw from './modelData.json'
import { deriveTokenSeed } from './sha256'

interface ModelData {
  vocab: string[]
  unigramLogits: number[]
  punctIds: number[]
  spaceWordIds: number[]
  bigram: Record<string, Record<string, number>>
  trigram: Record<string, Record<string, number>>
  insertionWords: string[]
  synonyms: Record<string, string[]>
  phraseRewrites: [string, string][]
}

const modelData = modelDataRaw as unknown as ModelData

class BrowserSubwordTokenizer {
  private readonly vocab: string[]
  private readonly tokenToId: Map<string, number>
  private readonly maxLen: number
  private readonly fallbackId: number

  constructor(vocab: string[]) {
    this.vocab = vocab
    this.tokenToId = new Map()
    let maxL = 1
    for (let i = 0; i < vocab.length; i++) {
      this.tokenToId.set(vocab[i], i)
      if (vocab[i].length > maxL) maxL = vocab[i].length
    }
    this.maxLen = maxL
    this.fallbackId = this.tokenToId.get('?') ?? 0
  }

  get vocabSize(): number {
    return this.vocab.length
  }

  encode(text: string): number[] {
    const ids: number[] = []
    let pos = 0
    const len = text.length
    while (pos < len) {
      let matchedId: number | undefined
      const maxEnd = Math.min(len, pos + this.maxLen)
      for (let end = maxEnd; end > pos; end--) {
        const cand = text.slice(pos, end)
        const id = this.tokenToId.get(cand)
        if (id !== undefined) {
          matchedId = id
          pos = end
          break
        }
      }
      if (matchedId === undefined) {
        matchedId = this.fallbackId
        pos += 1
      }
      ids.push(matchedId)
    }
    return ids
  }

  decode(ids: number[]): string {
    return ids.map((id) => this.vocab[id] ?? '').join('')
  }
}

export const browserTokenizer = new BrowserSubwordTokenizer(modelData.vocab)
const punctSet = new Set(modelData.punctIds)

function nextTokenLogits(contextIds: number[], entropyMode: EntropyMode): Float64Array {
  const logits = Float64Array.from(modelData.unigramLogits)

  if (contextIds.length > 0) {
    const last = contextIds[contextIds.length - 1]
    logits[last] -= 5.0
    if (punctSet.has(last)) {
      for (const pid of modelData.punctIds) logits[pid] -= 12.0
      for (const sid of modelData.spaceWordIds) logits[sid] += 1.5
    }
    const bi = modelData.bigram[String(last)]
    if (bi) {
      for (const [k, cnt] of Object.entries(bi)) {
        logits[Number(k)] += 2.6 * Math.log1p(cnt)
      }
    }
  }

  if (contextIds.length >= 2) {
    const pairKey = `${contextIds[contextIds.length - 2]},${contextIds[contextIds.length - 1]}`
    const tri = modelData.trigram[pairKey]
    if (tri) {
      for (const [k, cnt] of Object.entries(tri)) {
        logits[Number(k)] += 3.2 * Math.log1p(cnt)
      }
    }
    const start = Math.max(0, contextIds.length - 8)
    for (let i = start; i < contextIds.length; i++) {
      logits[contextIds[i]] -= 1.0
    }
  }

  if (entropyMode === 'instruct') {
    for (let i = 0; i < logits.length; i++) {
      logits[i] *= 3.2
    }
  }
  return logits
}

function argmax(arr: Float64Array): number {
  let bestIdx = 0
  let bestVal = arr[0]
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > bestVal) {
      bestVal = arr[i]
      bestIdx = i
    }
  }
  return bestIdx
}

function evaluateLexicalQuality(text: string) {
  const words = (text.toLowerCase().match(/[a-z0-9']+/g) ?? [])
  const distinct1 = words.length ? new Set(words).size / words.length : 0
  const bigrams: string[] = []
  for (let i = 0; i + 1 < words.length; i++) bigrams.push(`${words[i]} ${words[i + 1]}`)
  const distinct2 = bigrams.length ? new Set(bigrams).size / bigrams.length : 0
  const trigrams: string[] = []
  for (let i = 0; i + 2 < words.length; i++) {
    trigrams.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  }
  const trigramRep = trigrams.length ? 1 - new Set(trigrams).size / trigrams.length : 0
  return { distinct_1: distinct1, distinct_2: distinct2, trigram_rep: trigramRep }
}

export function embedWatermarkWasm(
  wasm: LlmwWasmClient,
  config: StudioConfig,
  prompt: string,
  watermark: number,
): EmbedResponse {
  const t0 = performance.now()
  const codeword =
    config.method === 'bch'
      ? wasm.bchEncode(config.n, config.u, watermark)
      : wasm.encodeCodeword(config.secretKey, config.n, config.u, config.construction, watermark)

  const promptIds = browserTokenizer.encode(prompt)
  const context = [...promptIds]
  const generatedIds: number[] = []
  const steps: TokenStepTrace[] = []
  const vocabSize = browserTokenizer.vocabSize

  for (let t = 0; t < codeword.length; t++) {
    const targetBit = codeword[t] & 1
    const prevTok = t === 0 ? null : generatedIds[generatedIds.length - 1]
    const seed = deriveTokenSeed(config.secretKey, prevTok)
    const isV1 = wasm.splitVocab(vocabSize, seed)

    const rawLogits = nextTokenLogits(context, config.entropyMode)
    const rawBest = argmax(rawLogits)

    let v1Max = -Infinity
    let v0Max = -Infinity
    for (let i = 0; i < vocabSize; i++) {
      if (isV1[i]) {
        if (rawLogits[i] > v1Max) v1Max = rawLogits[i]
      } else {
        if (rawLogits[i] > v0Max) v0Max = rawLogits[i]
      }
    }
    const preMargin = targetBit === 1 ? v1Max - v0Max : v0Max - v1Max

    const biased = Float64Array.from(rawLogits)
    for (let i = 0; i < vocabSize; i++) {
      if ((isV1[i] ? 1 : 0) === targetBit) {
        biased[i] += config.delta
      }
    }

    let chosenId = argmax(biased)
    let retries = 0
    if (config.enforceTi) {
      const working = Float64Array.from(biased)
      const fallback = chosenId
      while (retries <= 8) {
        const cand = argmax(working)
        if (!Number.isFinite(working[cand])) {
          chosenId = fallback
          break
        }
        const trial = [...generatedIds, cand]
        if (browserTokenizer.encode(browserTokenizer.decode(trial)).length === trial.length) {
          chosenId = cand
          break
        }
        working[cand] = -Infinity
        retries += 1
      }
    }

    const selectedGroup = isV1[chosenId] ? 1 : 0
    steps.push({
      step: t,
      target_bit: targetBit,
      token_id: chosenId,
      token_text: browserTokenizer.decode([chosenId]),
      selected_group: selectedGroup,
      bias_flipped_choice: chosenId !== rawBest,
      pre_bias_margin: Number(preMargin.toFixed(3)),
      ti_retries: retries,
    })
    generatedIds.push(chosenId)
    context.push(chosenId)
  }

  const generatedText = browserTokenizer.decode(generatedIds)
  const hits = steps.reduce((acc, s) => acc + (s.selected_group === s.target_bit ? 1 : 0), 0)
  const tiCorrections = steps.reduce((acc, s) => acc + s.ti_retries, 0)

  return {
    watermark,
    codeword: Array.from(codeword),
    generated_text: generatedText,
    embedded_bit_accuracy: steps.length ? hits / steps.length : 0,
    ti_corrections: tiCorrections,
    latency_ms: Number((performance.now() - t0).toFixed(3)),
    quality: evaluateLexicalQuality(generatedText),
    steps,
  }
}

export function computeBitAlignment(source: Uint8Array, target: Uint8Array): AlignmentOp[] {
  const m = source.length
  const n = target.length
  const dp: Int32Array[] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    const si = source[i - 1] & 1
    for (let j = 1; j <= n; j++) {
      const cost = si === (target[j - 1] & 1) ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }

  const ops: AlignmentOp[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = (source[i - 1] & 1) === (target[j - 1] & 1) ? 0 : 1
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        ops.push({
          kind: cost === 0 ? 'match' : 'substitute',
          source_idx: i - 1,
          target_idx: j - 1,
          source_bit: source[i - 1] & 1,
          target_bit: target[j - 1] & 1,
        })
        i -= 1
        j -= 1
        continue
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({
        kind: 'delete',
        source_idx: i - 1,
        target_idx: null,
        source_bit: source[i - 1] & 1,
        target_bit: null,
      })
      i -= 1
    } else {
      ops.push({
        kind: 'insert',
        source_idx: null,
        target_idx: j - 1,
        source_bit: null,
        target_bit: target[j - 1] & 1,
      })
      j -= 1
    }
  }
  ops.reverse()
  return ops
}

export function extractWatermarkWasm(
  wasm: LlmwWasmClient,
  config: StudioConfig,
  text: string,
): ExtractResponse {
  const t0 = performance.now()
  const tokens = browserTokenizer.encode(text).slice(0, config.u)
  const vocabSize = browserTokenizer.vocabSize
  const decoded = new Uint8Array(tokens.length)

  for (let t = 0; t < tokens.length; t++) {
    const prevTok = t === 0 ? null : tokens[t - 1]
    const seed = deriveTokenSeed(config.secretKey, prevTok)
    const isV1 = wasm.splitVocab(vocabSize, seed)
    decoded[t] = isV1[tokens[t]] ? 1 : 0
  }

  const padded = (arr: Uint8Array): Uint8Array => {
    if (arr.length === config.u) return arr
    const out = new Uint8Array(config.u)
    out.set(arr.subarray(0, config.u))
    return out
  }

  if (config.method === 'bch') {
    const fixed = padded(decoded)
    const bchRes = wasm.bchDecode(config.n, config.u, fixed)
    return {
      watermark: bchRes.watermark,
      distance: bchRes.flips,
      second_best_distance: null,
      margin: null,
      is_watermarked: config.threshold === null ? true : bchRes.flips <= config.threshold,
      candidate_bits: Array.from(fixed),
      matched_codeword: Array.from(bchRes.codeword),
      method: 'bch',
      latency_ms: Number((performance.now() - t0).toFixed(3)),
      alignment: computeBitAlignment(fixed, bchRes.codeword),
    }
  }

  const inputCand = config.method === 'hamming' ? padded(decoded) : decoded
  const match = wasm.searchCodebook(
    config.secretKey,
    config.n,
    config.u,
    config.construction,
    config.method,
    inputCand,
  )
  const margin =
    match.secondBestDistance !== null ? match.secondBestDistance - match.distance : null
  return {
    watermark: match.watermark,
    distance: match.distance,
    second_best_distance: match.secondBestDistance,
    margin,
    is_watermarked: config.threshold === null ? true : match.distance <= config.threshold,
    candidate_bits: Array.from(inputCand),
    matched_codeword: Array.from(match.codeword),
    method: config.method,
    latency_ms: Number((performance.now() - t0).toFixed(3)),
    alignment: computeBitAlignment(inputCand, match.codeword),
  }
}

class Mulberry32 {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive)
  }
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  }
}

function preserveCase(template: string, replacement: string): string {
  if (template === template.toUpperCase()) return replacement.toUpperCase()
  if (template[0] === template[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1)
  }
  return replacement
}

export function applyAttackBrowser(
  text: string,
  attackType: AttackType,
  budget = 0.1,
  seed = 0,
): AttackResponse {
  const origTokens = browserTokenizer.encode(text).length
  const targetBudget = Math.floor(budget * origTokens)
  const words = text.trim().split(/\s+/).filter(Boolean)
  const rng = new Mulberry32(seed + 1337)

  if (targetBudget <= 0 || words.length <= 1) {
    return {
      attack_name: attackType,
      attacked_text: text,
      original_tokens: origTokens,
      attacked_tokens: origTokens,
      budget_tokens: targetBudget,
      modified_tokens: 0,
    }
  }

  if (attackType === 'word_deletion') {
    const indices = words.map((_, i) => i)
    rng.shuffle(indices)
    const removed = new Set<number>()
    let removedToks = 0
    for (const idx of indices) {
      if (removed.size >= words.length - 1) break
      const wToks = Math.max(1, browserTokenizer.encode(` ${words[idx]}`).length)
      removed.add(idx)
      removedToks += wToks
      if (removedToks >= targetBudget) break
    }
    const attacked = words.filter((_, i) => !removed.has(i)).join(' ')
    return {
      attack_name: attackType,
      attacked_text: attacked,
      original_tokens: origTokens,
      attacked_tokens: browserTokenizer.encode(attacked).length,
      budget_tokens: targetBudget,
      modified_tokens: removedToks,
    }
  }

  if (attackType === 'word_insertion') {
    let insertedToks = 0
    const copy = [...words]
    while (insertedToks < targetBudget) {
      const w = modelData.insertionWords[rng.int(modelData.insertionWords.length)]
      const pos = rng.int(copy.length + 1)
      copy.splice(pos, 0, w)
      insertedToks += Math.max(1, browserTokenizer.encode(` ${w}`).length)
    }
    const attacked = copy.join(' ')
    return {
      attack_name: attackType,
      attacked_text: attacked,
      original_tokens: origTokens,
      attacked_tokens: browserTokenizer.encode(attacked).length,
      budget_tokens: targetBudget,
      modified_tokens: insertedToks,
    }
  }

  if (attackType === 'synonym_swap') {
    const copy = [...words]
    const cands: { idx: number; lead: string; core: string; trail: string; syns: string[] }[] = []
    copy.forEach((tok, idx) => {
      const m = tok.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/)
      if (!m) return
      const [, lead, core, trail] = m
      const syns = modelData.synonyms[core.toLowerCase()]
      if (syns && syns.length) cands.push({ idx, lead, core, trail, syns })
    })
    rng.shuffle(cands)
    let replacedToks = 0
    for (const c of cands) {
      const choice = preserveCase(c.core, c.syns[rng.int(c.syns.length)])
      const wToks = Math.max(1, browserTokenizer.encode(` ${copy[c.idx]}`).length)
      copy[c.idx] = `${c.lead}${choice}${c.trail}`
      replacedToks += wToks
      if (replacedToks >= targetBudget) break
    }
    const attacked = copy.join(' ')
    return {
      attack_name: attackType,
      attacked_text: attacked,
      original_tokens: origTokens,
      attacked_tokens: browserTokenizer.encode(attacked).length,
      budget_tokens: targetBudget,
      modified_tokens: replacedToks,
    }
  }

  // Center-out contiguous paraphrase attack (Appendix B.4)
  const center = rng.int(words.length)
  let left = center
  let right = center
  let expandLeft = true
  while (true) {
    const span = words.slice(left, right + 1).join(' ')
    if (browserTokenizer.encode(span).length >= targetBudget || (left === 0 && right === words.length - 1)) {
      break
    }
    if (expandLeft && left > 0) left -= 1
    else if (right < words.length - 1) right += 1
    else if (left > 0) left -= 1
    expandLeft = !expandLeft
  }

  const targetSpan = words.slice(left, right + 1).join(' ')
  const spanToks = browserTokenizer.encode(targetSpan).length
  let rewritten = targetSpan
  for (const [src, dst] of modelData.phraseRewrites) {
    if (rewritten.toLowerCase().includes(src)) {
      rewritten = rewritten.replace(new RegExp(src, 'gi'), dst)
    }
  }
  const spanWords = rewritten.split(/\s+/).map((w) => {
    const m = w.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/)
    if (!m) return w
    const [, lead, core, trail] = m
    const syns = modelData.synonyms[core.toLowerCase()]
    return syns && syns.length ? `${lead}${preserveCase(core, syns[rng.int(syns.length)])}${trail}` : w
  })
  if (spanWords.join(' ') === targetSpan) {
    const pos = spanWords.length > 1 ? rng.int(spanWords.length) : 0
    spanWords.splice(pos, 0, 'notably')
  }

  const attacked = [...words.slice(0, left), ...spanWords, ...words.slice(right + 1)].join(' ')
  return {
    attack_name: attackType,
    attacked_text: attacked,
    original_tokens: origTokens,
    attacked_tokens: browserTokenizer.encode(attacked).length,
    budget_tokens: targetBudget,
    modified_tokens: spanToks,
  }
}

function binaryEntropy(p: number): number {
  if (p <= 0 || p >= 1) return 0
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p)
}

function gilbertVarshamovDistance(n: number, u: number): number {
  const rate = 1 - n / u
  let best = 1
  for (let d = 1; d <= Math.floor(u / 2); d++) {
    if (binaryEntropy(d / u) <= rate) best = d
    else break
  }
  return best
}

function computeBchParams(n: number, u: number) {
  let m = 4
  while ((1 << m) - 1 < u) m += 1
  const n0 = (1 << m) - 1
  const shortening = n0 - u
  const seen = new Set<number>()
  const cosets: { elems: number[]; deg: number }[] = []
  for (let a = 1; a < n0; a++) {
    if (seen.has(a)) continue
    const elems: number[] = []
    let cur = a
    while (!seen.has(cur)) {
      seen.add(cur)
      elems.push(cur)
      cur = (cur * 2) % n0
    }
    cosets.push({ elems, deg: elems.length })
  }
  let bestK = n0
  let bestT = 1
  for (let t = 1; t <= Math.floor(n0 / 2); t++) {
    let parityDeg = 0
    for (const c of cosets) {
      if (c.elems.some((e) => e >= 1 && e <= 2 * t)) parityDeg += c.deg
    }
    const k = n0 - parityDeg
    if (k >= shortening + n) {
      bestK = k
      bestT = t
    } else {
      break
    }
  }
  return {
    native_length: n0,
    field_degree: m,
    message_capacity: bestK,
    shortening_bits: shortening,
    correction_capability: bestT,
    correction_rate: bestT / u,
  }
}

export function computeCodebookInfoWasm(
  wasm: LlmwWasmClient | null,
  config: StudioConfig,
): CodebookInfoResponse {
  const exp = 2 * config.n - config.u - 1
  const bound = Math.min(1, Math.pow(2, exp))
  const gv = gilbertVarshamovDistance(config.n, config.u)
  const dMin =
    wasm && config.construction === 'linear' && config.n <= 13
      ? wasm.linearDMin(config.secretKey, config.n, config.u)
      : null
  return {
    n: config.n,
    u: config.u,
    collision_exponent: exp,
    collision_bound: bound,
    gilbert_varshamov_d: gv,
    exact_linear_d_min: dMin,
    bch: computeBchParams(config.n, config.u),
  }
}
