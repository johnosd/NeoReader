import * as CFI from 'foliate-js/epubcfi.js'
import { isPdfLocator } from './pdfLocator'

function unwrapCfi(cfi: string): string {
  const match = cfi.match(/^epubcfi\((.+)\)$/)
  return match ? match[1] : cfi
}

export function normalizeCfi(cfi: string | null | undefined): string | null {
  if (!cfi) return null
  // Localizador de PDF (feature 022) não é CFI: não passa pelo parser do EPUB (que o interpretaria como lixo).
  if (isPdfLocator(cfi)) return cfi.trim()

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
  // Localizadores de PDF só são equivalentes quando idênticos (não existe "colapso" nem comparação por CFI).
  if (isPdfLocator(normalizedA) || isPdfLocator(normalizedB)) return false

  try {
    return CFI.compare(normalizedA, normalizedB) === 0
  } catch {
    return unwrapCfi(normalizedA) === unwrapCfi(normalizedB)
  }
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`

  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    return String(error)
  }
}

export function isCfiInLocation(cfi: string | null | undefined, location: string | null | undefined): boolean {
  if (!cfi || !location) return false
  if (areCfisEquivalent(cfi, location)) return true
  if (isPdfLocator(cfi) || isPdfLocator(location)) return false
  if (unwrapCfi(cfi).startsWith(unwrapCfi(location))) return true

  try {
    const start = CFI.collapse(location)
    const end = CFI.collapse(location, true)
    return CFI.compare(cfi, start) >= 0 && CFI.compare(cfi, end) <= 0
  } catch (err) {
    console.warn(`[nr-cfi] failed to compare CFIs: ${JSON.stringify({
      cfi,
      location,
      error: formatUnknownError(err),
    })}`)
    return false
  }
}
