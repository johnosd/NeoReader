// Normaliza e compara texto pra filtrar resultados de busca por palavra-chave
// (YouTube Data API não suporta frase exata nem operadores booleanos de
// verdade no parâmetro `q` — é busca livre, então sem checagem de relevância
// qualquer termo comum devolve muito ruído sem relação com o autor/livro).

export function normalizeForMatch(value?: string | null): string | null {
  const normalized = value
    ?.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

  return normalized || null
}

export function significantWords(value: string): string[] {
  return value
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
}

// true quando `haystack` contém `needle` inteiro como substring (normalizados)
// ou cobre pelo menos `minRatio` das palavras significativas de `needle`.
export function hasRelevantOverlap(
  haystack: string | null | undefined,
  needle: string | null | undefined,
  minRatio: number,
): boolean {
  const normalizedHaystack = normalizeForMatch(haystack)
  const normalizedNeedle = normalizeForMatch(needle)
  if (!normalizedHaystack || !normalizedNeedle) return false

  if (normalizedHaystack.includes(normalizedNeedle)) return true

  const words = significantWords(normalizedNeedle)
  if (words.length === 0) return false

  const matched = words.filter((word) => normalizedHaystack.includes(word)).length
  return matched / words.length >= minRatio
}
