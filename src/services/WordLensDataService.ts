import type {
  CefrLevel,
  CefrOrdinal,
  WordLensData,
  WordLensDictionaryEntry,
  WordLensDictionaryPartition,
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
const cachedDictionaryPartitions = new Map<string, Promise<WordLensDictionaryPartition>>()

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
  if (
    value.dictionaryPath !== undefined && (
      typeof value.dictionaryPath !== 'string' ||
      !isLocalAssetPath(value.dictionaryPath) ||
      !Array.isArray(value.dictionaryPartitions) ||
      value.dictionaryPartitions.some((partition) => (
        typeof partition !== 'string' || !/^(?:[a-z]{2}|[a-z]-other|other)$/.test(partition)
      ))
    )
  ) {
    throw new Error('Invalid Word Lens dictionary manifest')
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validateDictionaryPartition(value: unknown): WordLensDictionaryPartition {
  if (!isRecord(value)) throw new Error('Invalid Word Lens dictionary partition')
  for (const entry of Object.values(value)) {
    if (
      !isRecord(entry) ||
      !isStringArray(entry.partsOfSpeech) ||
      !Array.isArray(entry.senses)
    ) {
      throw new Error('Invalid Word Lens dictionary entry')
    }
    for (const sense of entry.senses) {
      if (
        !isRecord(sense) ||
        typeof sense.partOfSpeech !== 'string' ||
        typeof sense.definition !== 'string' ||
        !isStringArray(sense.examples) ||
        !isStringArray(sense.synonyms)
      ) {
        throw new Error('Invalid Word Lens dictionary sense')
      }
    }
  }
  return value as WordLensDictionaryPartition
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
  return {
    levels,
    lemmas,
    packVersion: manifest.packVersion,
    ...(manifest.dictionaryPath && manifest.dictionaryPartitions
      ? {
          dictionaryPath: manifest.dictionaryPath,
          dictionaryPartitions: manifest.dictionaryPartitions,
        }
      : {}),
  }
}

function getDictionaryPartitionName(lemma: string): string {
  const normalized = lemma.trim().toLowerCase()
  const first = normalized[0] ?? ''
  const second = normalized[1] ?? ''
  if (!/[a-z]/.test(first)) return 'other'
  if (!/[a-z]/.test(second)) return `${first}-other`
  return first + second
}

export async function loadWordLensDefinition(
  lemma: string,
  data: WordLensData,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<WordLensDictionaryEntry | null> {
  const normalizedLemma = lemma.trim().toLowerCase()
  const dictionaryPath = data.dictionaryPath
  const availablePartitions = data.dictionaryPartitions
  if (!normalizedLemma || !dictionaryPath || !availablePartitions) return null

  const partition = getDictionaryPartitionName(normalizedLemma)
  if (!availablePartitions.includes(partition)) return null
  const cacheKey = `${data.packVersion ?? ''}:${dictionaryPath}:${partition}`
  let partitionPromise = cachedDictionaryPartitions.get(cacheKey)
  if (!partitionPromise) {
    const url = resolveWordLensAssetUrl(`${dictionaryPath}/${partition}.json`)
    partitionPromise = fetchJson(url, fetchImpl)
      .then(validateDictionaryPartition)
    cachedDictionaryPartitions.set(cacheKey, partitionPromise)
  }
  const dictionary = await partitionPromise
  return dictionary?.[normalizedLemma] ?? null
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
  cachedDictionaryPartitions.clear()
}

export type { CefrOrdinal }
