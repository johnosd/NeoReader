// Texto gravado em Book.author quando o arquivo não tem autor (EpubService, importadores, PdfService).
// As variantes em inglês/espanhol cobrem livros gravados por versões antigas ou pela UI traduzida.
const PLACEHOLDER_AUTHORS = new Set(['autor desconhecido', 'unknown author', 'autor desconocido'])

/**
 * Autor que serve como termo de busca/critério de match nas fontes online, ou null.
 * O texto de reserva não identifica ninguém: buscar `inauthor:Autor desconhecido`
 * no Google Books só derruba resultados certos (R-031 da feature 022).
 */
export function usableAuthorHint(author: string | null | undefined): string | null {
  const trimmed = author?.trim()
  if (!trimmed) return null
  return PLACEHOLDER_AUTHORS.has(trimmed.toLowerCase()) ? null : trimmed
}
