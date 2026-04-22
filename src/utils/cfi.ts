import * as CFI from 'foliate-js/epubcfi.js'

function unwrapCfi(cfi: string): string {
  const match = cfi.match(/^epubcfi\((.+)\)$/)
  return match ? match[1] : cfi
}

export function normalizeCfi(cfi: string | null | undefined): string | null {
  if (!cfi) return null

  try {
    return CFI.collapse(cfi)
  } catch {
    return cfi
  }
}

export function areCfisEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalizedA = normalizeCfi(a)
  const normalizedB = normalizeCfi(b)
  if (!normalizedA || !normalizedB) return false
  if (normalizedA === normalizedB) return true

  try {
    return CFI.compare(normalizedA, normalizedB) === 0
  } catch {
    return unwrapCfi(normalizedA) === unwrapCfi(normalizedB)
  }
}

export function isCfiInLocation(cfi: string | null | undefined, location: string | null | undefined): boolean {
  if (!cfi || !location) return false
  if (areCfisEquivalent(cfi, location)) return true
  if (unwrapCfi(cfi).startsWith(unwrapCfi(location))) return true

  try {
    const start = CFI.collapse(location)
    const end = CFI.collapse(location, true)
    return CFI.compare(cfi, start) >= 0 && CFI.compare(cfi, end) <= 0
  } catch (err) {
    console.warn('[nr-cfi] failed to compare CFIs', { cfi, location, err })
    return false
  }
}
