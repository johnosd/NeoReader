/**
 * Retorna a frase do texto que contém o offset de caractere dado.
 * Delimitadores: . ! ? seguidos de espaço ou fim de string.
 * Fallback: texto inteiro se não houver delimitadores.
 */
export function getSentenceAt(text: string, charOffset: number): string {
  const parts = text.match(/[^.!?]*[.!?]+\s*/g)
  if (!parts || parts.length <= 1) return text.trim()

  let pos = 0
  for (const part of parts) {
    pos += part.length
    if (charOffset < pos) return part.trim()
  }
  // Offset além do último ponto (cauda sem pontuação) → última frase
  return parts[parts.length - 1].trim()
}

/** Escapa caracteres HTML para uso seguro em innerHTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
