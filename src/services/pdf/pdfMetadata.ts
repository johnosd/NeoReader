import { normalizeLanguageTag } from '@/utils/language'

// Metadados do pdf.js vêm como string, array (dc:creator) ou ausentes.
export function pdfMetadataText(value: unknown, separator = ', '): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (Array.isArray(value)) {
    const parts = value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
    return parts.length ? parts.join(separator) : null
  }
  return null
}

export function pdfMetadataLanguage(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const tag = raw.trim()
  // Só aceita algo que se pareça com uma etiqueta de idioma (pt, pt-BR, en_US...).
  return /^[a-z]{2,3}([-_][A-Za-z0-9]+)*$/i.test(tag) ? normalizeLanguageTag(tag) : null
}
