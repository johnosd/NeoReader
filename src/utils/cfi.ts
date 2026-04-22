import * as CFI from 'foliate-js/epubcfi.js'

function unwrapCfi(cfi: string): string {
  const match = cfi.match(/^epubcfi\((.+)\)$/)
  return match ? match[1] : cfi
}

export function isCfiInLocation(cfi: string | null | undefined, location: string | null | undefined): boolean {
  if (!cfi || !location) return false
  if (cfi === location) return true
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
