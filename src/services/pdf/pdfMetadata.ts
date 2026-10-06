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

// Título/autor de PDF muitas vezes é lixo deixado pelo programa que exportou (R-026): "(Microsoft Word -
// Flávia Muniz - Noturnos _Rev_)", "livro final.docx", "Untitled", autor "A" ou "Administrator". Lixo vira null
// e quem chama cai no nome do arquivo / "Autor desconhecido" — e o enriquecimento busca por algo útil.
const EXPORTER_TITLE_PREFIX = /^\(?\s*microsoft\s+(?:word|powerpoint|excel|office\s+word)\s*-/i
const SOURCE_FILE_TITLE = /\.(?:docx?|odt|rtf|pages|indd|qxd|tex|dvi|ps|pdf|pptx?|xlsx?)\)?$/i
const RAW_PDF_ESCAPE = /\\\d{3}/ // octal de string PDF que não foi decodificado (ex.: "Fl\341via")
const PLACEHOLDER_TITLE = /^(?:untitled|sem t[ií]tulo|sin t[ií]tulo|document(?:o)?\s*\d*|title|t[ií]tulo|cover|capa)$/i
const PLACEHOLDER_AUTHOR = /^(?:admin|administrator|administrador|user|usu[aá]rio|owner|unknown|desconhecido|author|autor|pc|home|default)$/i

export function pdfMetadataTitle(value: unknown): string | null {
  const title = pdfMetadataText(value, ' ')
  if (!title) return null
  if (EXPORTER_TITLE_PREFIX.test(title) || SOURCE_FILE_TITLE.test(title) || RAW_PDF_ESCAPE.test(title)) return null
  if (PLACEHOLDER_TITLE.test(title)) return null
  // Precisa de pelo menos duas letras (descarta "1", "-", "...").
  return (title.match(/\p{L}/gu)?.length ?? 0) >= 2 ? title : null
}

export function pdfMetadataAuthor(value: unknown): string | null {
  const author = pdfMetadataText(value)
  if (!author || RAW_PDF_ESCAPE.test(author) || PLACEHOLDER_AUTHOR.test(author)) return null
  return (author.match(/\p{L}/gu)?.length ?? 0) >= 2 ? author : null
}

export function pdfMetadataLanguage(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const tag = raw.trim()
  // Só aceita algo que se pareça com uma etiqueta de idioma (pt, pt-BR, en_US...).
  return /^[a-z]{2,3}([-_][A-Za-z0-9]+)*$/i.test(tag) ? normalizeLanguageTag(tag) : null
}
