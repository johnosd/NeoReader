import type {
  CefrLevel,
  CefrOrdinal,
  WordLensData,
  WordLensLemmas,
  WordLensLevels,
  WordLensManifest,
} from '@/types/wordLens'

interface LoadWordLensDataOptions {
  enabled: boolean
  language?: string | null
  userLevel: CefrLevel
  fetchImpl?: typeof fetch
}

let cachedDataPromise: Promise<WordLensData | null> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLocalAssetPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !path.includes('..') &&
    !path.includes(':') &&
    !path.includes('?') &&
    !path.includes('#')
  )
}

function validateManifest(value: unknown): WordLensManifest {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.packVersion !== 'string' ||
    typeof value.levelsPath !== 'string' ||
    typeof value.lemmasPath !== 'string' ||
    !isLocalAssetPath(value.levelsPath) ||
    !isLocalAssetPath(value.lemmasPath)
  ) {
    throw new Error('Invalid Word Lens manifest')
  }
  return value as unknown as WordLensManifest
}

function validateLevels(value: unknown): WordLensLevels {
  if (!isRecord(value)) throw new Error('Invalid Word Lens levels')
  for (const level of Object.values(value)) {
    if (!Number.isInteger(level) || Number(level) < 1 || Number(level) > 6) {
      throw new Error('Invalid Word Lens level entry')
    }
  }
  return value as WordLensLevels
}

function validateLemmas(value: unknown): WordLensLemmas {
  if (!isRecord(value) || Object.values(value).some((lemma) => typeof lemma !== 'string')) {
    throw new Error('Invalid Word Lens lemmas')
  }
  return value as WordLensLemmas
}

function isEnglish(language?: string | null): boolean {
  if (!language) return false
  return language.trim().replace('_', '-').split('-')[0].toLowerCase() === 'en'
}

export function resolveWordLensAssetUrl(
  path: string,
  basePath = import.meta.env.BASE_URL,
  documentUrl = globalThis.location?.href ?? 'http://localhost/',
): string {
  if (!isLocalAssetPath(path)) throw new Error('Word Lens asset path must be local')

  const origin = new URL(documentUrl)
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  const baseUrl = new URL(normalizedBase.replace(/^\/+/, ''), `${origin.origin}/`)
  const assetUrl = new URL(`word-lens/${path}`, baseUrl)
  if (assetUrl.origin !== origin.origin) throw new Error('External Word Lens asset URL rejected')
  return assetUrl.toString()
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`Word Lens asset unavailable (${response.status})`)
  return response.json() as Promise<unknown>
}

async function loadData(fetchImpl: typeof fetch): Promise<WordLensData> {
  const manifestUrl = resolveWordLensAssetUrl('manifest.json')
  const manifest = validateManifest(await fetchJson(manifestUrl, fetchImpl))
  const [levels, lemmas] = await Promise.all([
    fetchJson(resolveWordLensAssetUrl(manifest.levelsPath), fetchImpl).then(validateLevels),
    fetchJson(resolveWordLensAssetUrl(manifest.lemmasPath), fetchImpl).then(validateLemmas),
  ])
  return { levels, lemmas }
}

export function loadWordLensData({
  enabled,
  language,
  userLevel,
  fetchImpl = globalThis.fetch,
}: LoadWordLensDataOptions): Promise<WordLensData | null> {
  if (!enabled || userLevel === 'C2' || !isEnglish(language)) return Promise.resolve(null)
  if (!cachedDataPromise) {
    cachedDataPromise = loadData(fetchImpl).catch(() => null)
  }
  return cachedDataPromise
}

export function resetWordLensDataCacheForTests(): void {
  cachedDataPromise = null
}

export type { CefrOrdinal }
