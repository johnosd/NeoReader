import { MAX_CHARS, translate } from './TranslationService'
import { splitParagraphIntoTtsChunks } from '../utils/ttsChunking'
import type { TtsChunk } from '../components/reader/EpubViewer'
import type { TranslationProvider, TranslationResult } from '../types/translation'

// Feature 018 (TTS Traduzido) — estado efêmero de UMA sessão de audiobook
// traduzido, nunca persistido (recriada do zero a cada play()/troca de
// capítulo-livro-idioma-provedor). Ver plan.md Decisão Invariante 11.
export interface TranslatedAudiobookSession {
  sourceLang: string
  targetLang: string
  requestedProvider: TranslationProvider
  // null até a primeira falha com fallback (FR-007); depois disso, fixo
  // pelo resto da sessão — nunca mais tenta requestedProvider.
  stickyProvider: TranslationProvider | null
  translatedChunksByParagraph: Map<number, TtsChunk[]>
  inFlightParagraph: number | null
  abortController: AbortController
}

export function createTranslatedAudiobookSession(
  sourceLang: string,
  targetLang: string,
  requestedProvider: TranslationProvider,
): TranslatedAudiobookSession {
  return {
    sourceLang,
    targetLang,
    requestedProvider,
    stickyProvider: null,
    translatedChunksByParagraph: new Map(),
    inFlightParagraph: null,
    abortController: new AbortController(),
  }
}

/**
 * Traduz um parágrafo inteiro para o audiobook traduzido (feature 018).
 * Parágrafos até `MAX_CHARS` (o mesmo limite de `TranslationService.ts`)
 * viram 1 única chamada — o caso comum. Parágrafos maiores são divididos em
 * pedaços sentence-aware (research.md R1) pra não truncar/perder texto, e
 * cada pedaço é traduzido separadamente antes de recombinar.
 */
export async function translateParagraphForAudiobook(
  text: string,
  source: string,
  target: string,
  provider: TranslationProvider,
  signal: AbortSignal,
  locale?: string,
): Promise<TranslationResult> {
  if (text.length <= MAX_CHARS) {
    return translate(text, source, target, { provider, signal })
  }

  // maxLen=480 deixa margem de segurança abaixo do limite real (480 < 500).
  const pieces = splitParagraphIntoTtsChunks(text, 40, locale, 480)
  const translatedPieces: string[] = []
  let resolvedProvider: TranslationProvider = provider
  let sawFallback = false

  for (const { sentence } of pieces) {
    const result = await translate(sentence, source, target, { provider, signal })
    translatedPieces.push(result.translatedText)
    // Se qualquer pedaço precisou de fallback, trata o parágrafo inteiro
    // como "caiu pro fallback" pro sticky fallback da sessão — conservador
    // de propósito: evita insistir no provider original se ele já mostrou
    // instabilidade no meio deste mesmo parágrafo.
    if (result.provider !== provider) {
      sawFallback = true
      resolvedProvider = result.provider
    }
  }

  return {
    translatedText: translatedPieces.join(' '),
    provider: sawFallback ? resolvedProvider : provider,
  }
}

/**
 * Re-chunka o texto JÁ TRADUZIDO em frases no formato que `useTTS.play()`
 * espera — reusa a mesma função pura de segmentação do texto original
 * (Decisão Invariante 6), preservando o `paraIdx` ORIGINAL pra highlight/
 * progresso continuarem apontando pro parágrafo certo do EPUB.
 */
export function buildTranslatedChunksForParagraph(
  paraIdx: number,
  translatedText: string,
  locale?: string,
): TtsChunk[] {
  return splitParagraphIntoTtsChunks(translatedText, 40, locale).map(({ sentence, offset }) => ({
    text: sentence,
    paraIdx,
    offsetInPara: offset,
  }))
}

/**
 * Traduz e chunka um parágrafo para a sessão, aplicando sticky fallback
 * (Decisão Invariante 8) e cache em memória da sessão (evita retraduzir um
 * parágrafo já processado).
 */
export async function translateParagraphForSession(
  session: TranslatedAudiobookSession,
  paraIdx: number,
  paragraphText: string,
  sourceLocale?: string,
): Promise<TtsChunk[]> {
  const cached = session.translatedChunksByParagraph.get(paraIdx)
  if (cached) return cached

  session.inFlightParagraph = paraIdx
  const effectiveProvider = session.stickyProvider ?? session.requestedProvider

  try {
    const result = await translateParagraphForAudiobook(
      paragraphText,
      session.sourceLang,
      session.targetLang,
      effectiveProvider,
      session.abortController.signal,
      sourceLocale,
    )

    if (session.stickyProvider === null && result.provider !== effectiveProvider) {
      session.stickyProvider = result.provider
    }

    // Chunking do texto JÁ TRADUZIDO usa o locale do idioma-ALVO (não o
    // sourceLocale do parágrafo original) — Intl.Segmenter precisa das
    // regras de sentença do idioma em que o texto está agora.
    const chunks = buildTranslatedChunksForParagraph(paraIdx, result.translatedText, session.targetLang)
    session.translatedChunksByParagraph.set(paraIdx, chunks)
    return chunks
  } finally {
    if (session.inFlightParagraph === paraIdx) session.inFlightParagraph = null
  }
}

// Estimativa aproximada de caracteres a traduzir (FR-013), derivada do
// tamanho do arquivo EPUB — não uma contagem exata de texto (research.md
// R3: ler o livro inteiro só pra estimar seria custo desproporcional ao
// propósito do aviso). Fator calibrado contra alguns EPUBs de referência:
// ~55% do tamanho do arquivo costuma ser texto puro depois de descontar
// marcação/metadados/imagens.
const ESTIMATED_TEXT_RATIO = 0.55

export function estimateTranslatedCharCount(fileSize: number): number {
  if (!Number.isFinite(fileSize) || fileSize <= 0) return 0
  return Math.round(fileSize * ESTIMATED_TEXT_RATIO)
}
