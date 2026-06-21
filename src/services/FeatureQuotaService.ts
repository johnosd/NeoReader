import { BillingService } from './BillingService'

export type FeatureQuotaKey = 'book-intelligence' | 'nyt-discovery'

export interface FeatureQuotaOptions {
  now?: Date
  isPro?: boolean | null
  hasValidCache?: boolean
  subjectKey?: string
}

export interface FeatureQuotaSnapshot {
  key: FeatureQuotaKey
  monthKey: string
  limit: number | null
  used: number
  remaining: number | null
  isPro: boolean
  /** true enquanto o BillingService ainda nao terminou o cold start (isPro era null). */
  billingLoading: boolean
  hasValidCache: boolean
  allowed: boolean
  blockedReason: 'quota-exhausted' | null
}

export interface FeatureQuotaConsumeResult extends FeatureQuotaSnapshot {
  consumed: boolean
}

interface StoredFeatureQuota {
  monthKey: string
  used: number
  subjects?: string[]
  updatedAt: string
}

export const FEATURE_QUOTA_LIMITS: Record<FeatureQuotaKey, number> = {
  'book-intelligence': 5,
  'nyt-discovery': 5,
}

const STORAGE_PREFIX = 'neoreader:feature-quota:v1:'
const memoryStorage = new Map<string, string>()

export function formatFeatureQuotaMonth(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

export function buildBookIntelligenceQuotaSubject(input: {
  bookId?: number
  title: string
  author: string
}): string {
  if (input.bookId !== undefined) return `book:${input.bookId}`
  return `book:${input.title.trim().toLowerCase()}::${input.author.trim().toLowerCase()}`
}

function storageKey(key: FeatureQuotaKey): string {
  const uid = localStorage.getItem('neoreader:active-uid') ?? 'guest'
  return `${STORAGE_PREFIX}${uid}:${key}`
}

// Retorna null quando o BillingService ainda nao terminou de inicializar (cold start).
// null e diferente de false: significa "entitlement desconhecido, adiar decisao".
function resolveIsPro(value: boolean | null | undefined): boolean | null {
  if (value === true || value === false) return value
  return BillingService.getCachedStatus().isPro
}

function readStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key)
    }
  } catch {
    // localStorage can throw in restricted/private contexts.
  }
  return memoryStorage.get(key) ?? null
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value)
      return
    }
  } catch {
    // Fall through to in-memory storage so quota still works for the session.
  }
  memoryStorage.set(key, value)
}

function removeStorage(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore localStorage failures and clear the memory fallback too.
  }
  memoryStorage.delete(key)
}

function readStoredQuota(key: FeatureQuotaKey, monthKey: string): StoredFeatureQuota {
  const fallback: StoredFeatureQuota = {
    monthKey,
    used: 0,
    updatedAt: new Date().toISOString(),
  }
  const raw = readStorage(storageKey(key))
  if (!raw) return fallback

  try {
    const parsed = JSON.parse(raw) as Partial<StoredFeatureQuota>
    if (parsed.monthKey !== monthKey) return fallback
    const subjects = Array.isArray(parsed.subjects)
      ? [...new Set(parsed.subjects.filter((subject): subject is string => typeof subject === 'string'))]
      : undefined
    return {
      monthKey,
      used: Math.max(Math.max(0, Number(parsed.used) || 0), subjects?.length ?? 0),
      ...(subjects ? { subjects } : {}),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt,
    }
  } catch {
    return fallback
  }
}

function writeStoredQuota(key: FeatureQuotaKey, record: StoredFeatureQuota): void {
  writeStorage(storageKey(key), JSON.stringify(record))
}

function buildSnapshot(
  key: FeatureQuotaKey,
  options: FeatureQuotaOptions = {},
): FeatureQuotaSnapshot {
  const now = options.now ?? new Date()
  const monthKey = formatFeatureQuotaMonth(now)
  const rawIsPro = resolveIsPro(options.isPro)
  const billingLoading = rawIsPro === null
  const isPro = rawIsPro === true
  const hasValidCache = options.hasValidCache === true
  const stored = readStoredQuota(key, monthKey)
  const subjectAlreadyUsed = Boolean(options.subjectKey && stored.subjects?.includes(options.subjectKey))
  const limit = isPro ? null : FEATURE_QUOTA_LIMITS[key]
  const remaining = limit === null ? null : Math.max(0, limit - stored.used)
  // Enquanto o billing carrega, permite a acao para nao bloquear usuario Pro incorretamente.
  const allowed = billingLoading || isPro || hasValidCache || subjectAlreadyUsed || remaining === null || remaining > 0

  return {
    key,
    monthKey,
    limit,
    used: stored.used,
    remaining,
    isPro,
    billingLoading,
    hasValidCache,
    allowed,
    blockedReason: allowed ? null : 'quota-exhausted',
  }
}

export const FeatureQuotaService = {
  getSnapshot(key: FeatureQuotaKey, options: FeatureQuotaOptions = {}): FeatureQuotaSnapshot {
    return buildSnapshot(key, options)
  },

  consume(key: FeatureQuotaKey, options: FeatureQuotaOptions = {}): FeatureQuotaConsumeResult {
    const snapshot = buildSnapshot(key, options)

    // Local-first quota is a product/UX guard, not anti-abuse enforcement.
    // Move this to backend/Firebase if server-side enforcement becomes necessary.
    const subjectAlreadyUsed = Boolean(options.subjectKey && readStoredQuota(key, snapshot.monthKey).subjects?.includes(options.subjectKey))

    // Nao decrementa quota enquanto billing nao inicializou: entitlement ainda desconhecido.
    if (!snapshot.allowed || snapshot.isPro || snapshot.hasValidCache || subjectAlreadyUsed || snapshot.billingLoading) {
      return { ...snapshot, consumed: false }
    }

    const now = options.now ?? new Date()
    const stored = readStoredQuota(key, snapshot.monthKey)
    const nextSubjects = options.subjectKey
      ? [...new Set([...(stored.subjects ?? []), options.subjectKey])]
      : stored.subjects
    const nextUsed = options.subjectKey ? nextSubjects!.length : snapshot.used + 1
    writeStoredQuota(key, {
      monthKey: snapshot.monthKey,
      used: nextUsed,
      ...(nextSubjects ? { subjects: nextSubjects } : {}),
      updatedAt: now.toISOString(),
    })

    return {
      ...snapshot,
      used: nextUsed,
      remaining: snapshot.limit === null ? null : Math.max(0, snapshot.limit - nextUsed),
      allowed: true,
      blockedReason: null,
      consumed: true,
    }
  },

  reset(key?: FeatureQuotaKey): void {
    if (key) {
      removeStorage(storageKey(key))
      return
    }

    removeStorage(storageKey('book-intelligence'))
    removeStorage(storageKey('nyt-discovery'))
  },
}
