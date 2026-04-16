import { getCachedTranslation, setCachedTranslation } from '../db/translations'

const SOURCE_LANG = 'en'
const TARGET_LANG = 'pt-BR'
// MyMemory API aceita ~500 chars por request no plano gratuito
const MAX_CHARS = 500

/**
 * Hash djb2 — rápido, sem dependências, suficiente para chave de cache.
 * Inclui o langpair para evitar colisões entre pares de idiomas diferentes.
 */
export function hashText(text: string, langpair: string): number {
  const input = `${langpair}::${text}`
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    // Operação bit a bit: (hash * 33) XOR charCode
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
    hash = hash >>> 0  // mantém unsigned 32-bit (evita números negativos)
  }
  return hash
}

/**
 * Traduz `text` de `source` para `target`.
 * Verifica cache no IndexedDB antes de chamar a API.
 * Trunca em MAX_CHARS para respeitar o limite do plano gratuito do MyMemory.
 */
export async function translate(
  text: string,
  source: string = SOURCE_LANG,
  target: string = TARGET_LANG,
): Promise<string> {
  const truncated = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text
  const langpair = `${source}|${target}`
  const hash = hashText(truncated, langpair)

  // Cache hit — sem chamada de rede
  const cached = await getCachedTranslation(hash)
  if (cached) return cached.translatedText

  // Cache miss — chama MyMemory API
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncated)}&langpair=${langpair}`

  // AbortController: cancela a requisição após 10s para não travar no Android sem rede.
  // .finally() garante que o timer seja limpo tanto em sucesso quanto em erro.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  const response = await fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timeoutId))

  if (!response.ok) throw new Error('Tradução indisponível. Verifique sua conexão.')

  const data = await response.json() as {
    responseData: { translatedText: string }
    responseStatus: number
  }

  if (data.responseStatus !== 200) {
    throw new Error('Tradução indisponível. Tente novamente.')
  }

  const translatedText = data.responseData.translatedText

  // Salva no cache (fire-and-forget — não bloqueia o retorno)
  void setCachedTranslation({
    textHash: hash,
    sourceText: truncated,
    translatedText,
    sourceLang: source,
    targetLang: target,
    createdAt: new Date(),
  })

  return translatedText
}

/**
 * Extrai o texto dos próximos `n` parágrafos a partir do segundo elemento da lista.
 * O primeiro elemento (índice 0) é o parágrafo já traduzido — pulamos ele.
 * Filtra elementos desconectados do DOM (caso o usuário já tenha virado a página).
 */
export function extractNextNParagraphs(elements: Element[], n: number = 10): string {
  return elements
    .slice(1, n + 1)
    .filter((el) => el.isConnected)
    .map((el) => el.textContent?.trim())
    .filter((t): t is string => !!t && t.length > 0)
    .join(' ')
}
