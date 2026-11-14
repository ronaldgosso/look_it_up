import type {
  AttackResponse,
  AttackType,
  BenchmarkResults,
  CodebookInfoResponse,
  EmbedResponse,
  ExtractResponse,
  StudioConfig,
} from '../types/studio'

const DEFAULT_API_BASE = 'http://127.0.0.1:8000'

async function postJson<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`API ${path} failed (${res.status}): ${txt}`)
  }
  return (await res.json()) as T
}

export async function checkApiHealth(baseUrl = DEFAULT_API_BASE): Promise<{ backend: string; threads: number } | null> {
  try {
    const res = await fetch(`${baseUrl}/api/health`)
    if (!res.ok) return null
    const data = (await res.json()) as { engine?: { backend: string; threads: number } }
    return data.engine ?? null
  } catch {
    return null
  }
}

export function embedViaApi(
  config: StudioConfig,
  prompt: string,
  watermark: number,
  baseUrl = DEFAULT_API_BASE,
): Promise<EmbedResponse> {
  return postJson<EmbedResponse>(baseUrl, '/api/embed', {
    prompt,
    watermark,
    secret_key: config.secretKey,
    n: config.n,
    u: config.u,
    delta: config.delta,
    construction: config.construction,
    method: config.method,
    entropy_mode: config.entropyMode,
    enforce_ti: config.enforceTi,
  })
}

export function attackViaApi(
  text: string,
  attackType: AttackType,
  budget = 0.1,
  seed = 0,
  baseUrl = DEFAULT_API_BASE,
): Promise<AttackResponse> {
  return postJson<AttackResponse>(baseUrl, '/api/attack', {
    text,
    attack_type: attackType,
    budget,
    seed,
  })
}

export function extractViaApi(
  config: StudioConfig,
  text: string,
  baseUrl = DEFAULT_API_BASE,
): Promise<ExtractResponse> {
  return postJson<ExtractResponse>(baseUrl, '/api/extract', {
    text,
    secret_key: config.secretKey,
    n: config.n,
    u: config.u,
    construction: config.construction,
    method: config.method,
    threshold: config.threshold,
    include_alignment: true,
  })
}

export function infoViaApi(
  config: StudioConfig,
  baseUrl = DEFAULT_API_BASE,
): Promise<CodebookInfoResponse> {
  return postJson<CodebookInfoResponse>(baseUrl, '/api/info', {
    secret_key: config.secretKey,
    n: config.n,
    u: config.u,
    construction: config.construction,
  })
}

export async function loadStaticBenchmarks(): Promise<BenchmarkResults | null> {
  try {
    const baseUrl = import.meta.env.BASE_URL ?? './'
    const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    const res = await fetch(`${normalized}benchmarks.json`)
    if (!res.ok) return null
    return (await res.json()) as BenchmarkResults
  } catch {
    return null
  }
}
