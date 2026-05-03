const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  copy: '(c)',
  hellip: '...',
  laquo: '"',
  ldquo: '"',
  lsquo: "'",
  lt: '<',
  mdash: '-',
  nbsp: ' ',
  ndash: '-',
  quot: '"',
  raquo: '"',
  rdquo: '"',
  reg: '(r)',
  rsquo: "'",
  gt: '>',
  trade: '(tm)',
}

export function normalizePlainText(value?: string | null): string | null {
  const cleaned = value?.replace(/\s+/g, ' ').trim()
  return cleaned || null
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16)
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : ''
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10)
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : ''
    })
    .replace(/&([a-z]+);/gi, (entity, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? entity)
}

export function htmlToPlainText(value?: string | null): string | null {
  const decoded = decodeHtmlEntities(value ?? '')
  const withoutBlocks = decoded
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/\s*(p|div|li|h[1-6]|blockquote)\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')

  return normalizePlainText(decodeHtmlEntities(withoutBlocks))
}
