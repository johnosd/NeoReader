export function normalizeLanguageTag(candidate?: string | null, fallback = 'en'): string {
  const value = candidate?.trim()
  if (!value) return fallback

  const [rawLanguage, rawRegion, ...rest] = value.replace('_', '-').split('-')
  const language = rawLanguage.toLowerCase()
  const region = rawRegion ? rawRegion.toUpperCase() : null

  return [language, region, ...rest].filter(Boolean).join('-')
}

export function getBaseLanguage(candidate?: string | null, fallback = 'en'): string {
  return normalizeLanguageTag(candidate, fallback).split('-')[0]
}

export function isLanguageCompatible(candidate?: string | null, target?: string | null): boolean {
  if (!candidate || !target) return false

  const normalizedCandidate = normalizeLanguageTag(candidate)
  const normalizedTarget = normalizeLanguageTag(target)

  return (
    normalizedCandidate === normalizedTarget ||
    getBaseLanguage(normalizedCandidate) === getBaseLanguage(normalizedTarget)
  )
}

export function clampTtsRate(rate?: number | null): number {
  if (!Number.isFinite(rate)) return 1
  return Math.min(1.2, Math.max(0.7, Number(rate)))
}
