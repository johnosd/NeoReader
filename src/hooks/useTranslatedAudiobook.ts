import { useCallback, useEffect, useRef } from 'react'
import {
  createTranslatedAudiobookSession,
  translateParagraphForSession,
  type TranslatedAudiobookSession,
} from '../services/TranslatedAudiobookService'
import type { TtsChunk } from '../components/reader/EpubViewer'
import type { TranslationProvider } from '../types/translation'

export interface UseTranslatedAudiobookOptions {
  getParagraphs: () => string[]
  onFatalFailure: (error: unknown) => void
}

/**
 * Orquestra a leitura traduzida (feature 018) por cima de `useTTS`, sem
 * alterar seu loop interno (plan.md Decisão Invariante 1/2). Constrói o
 * array inicial de chunks já traduzidos e expõe `advanceToNextParagraph`
 * pra ser chamado do callback `onParagraphChange` já existente — o
 * prefetch de 1 parágrafo à frente (Decisão Invariante 3).
 */
export function useTranslatedAudiobook(options: UseTranslatedAudiobookOptions) {
  const optionsRef = useRef(options)
  // Refs não podem ser escritas durante o render (react-hooks/refs) — sincroniza
  // via efeito, mesmo padrão de callbacksRef/configRef em useTTS.ts.
  useEffect(() => {
    optionsRef.current = options
  }, [options])
  const sessionRef = useRef<TranslatedAudiobookSession | null>(null)

  const isActive = useCallback(() => sessionRef.current !== null, [])

  // Traduz o parágrafo `paraIdx` (pulando parágrafos vazios) e retorna os
  // chunks já traduzidos, ou `[]` se chegou ao fim do conteúdo carregado.
  // `session` é sempre o valor JÁ CRIADO pelo chamador — nunca lido de
  // `sessionRef` aqui dentro, pra uma troca de sessão em voo (cancel())
  // nunca fazer este helper escrever no array/estado da sessão errada.
  async function translateFromParagraph(
    session: TranslatedAudiobookSession,
    startParaIdx: number,
  ): Promise<{ paraIdx: number; chunks: TtsChunk[] } | null> {
    const paragraphs = optionsRef.current.getParagraphs()
    for (let paraIdx = startParaIdx; paraIdx < paragraphs.length; paraIdx += 1) {
      const text = paragraphs[paraIdx]?.trim()
      if (!text) continue
      const chunks = await translateParagraphForSession(session, paraIdx, text)
      if (chunks.length === 0) continue
      return { paraIdx, chunks }
    }
    return null
  }

  const startSession = useCallback((sourceLang: string, targetLang: string, provider: TranslationProvider) => {
    sessionRef.current?.abortController.abort()
    const session = createTranslatedAudiobookSession(sourceLang, targetLang, provider)
    sessionRef.current = session
    return session
  }, [])

  // Cria uma sessão nova e traduz o primeiro parágrafo não-vazio a partir de
  // `startParaIdx` — chamado antes de `tts.play()` iniciar. Retorna os
  // chunks iniciais (índice 0 desse array = primeiro chunk a tocar), `[]` se
  // não há mais parágrafos com conteúdo a partir dali (fim legítimo da
  // seção — chamador deve tratar como "seção vazia", não como erro), ou
  // `null` se a sessão foi cancelada enquanto a tradução estava em voo
  // (usuário parou/trocou de contexto antes da resposta voltar — FR-011) OU
  // se a tradução falhou de vez (onFatalFailure já foi chamado). Em ambos os
  // casos de `null`, o chamador NÃO deve chamar startPlay/avançar de seção.
  const buildInitialChunks = useCallback(async (
    startParaIdx: number,
    sourceLang: string,
    targetLang: string,
    provider: TranslationProvider,
  ): Promise<TtsChunk[] | null> => {
    const session = startSession(sourceLang, targetLang, provider)
    try {
      const result = await translateFromParagraph(session, startParaIdx)
      // Checa de novo DEPOIS do await: cancel() pode ter sido chamado
      // enquanto a tradução estava em voo (ex: usuário apertou parar) —
      // mesmo que translate() não tenha rejeitado por causa disso.
      if (session.abortController.signal.aborted) return null
      return result?.chunks ?? []
    } catch (error) {
      if (session.abortController.signal.aborted) return []
      optionsRef.current.onFatalFailure(error)
      return null
    }
  }, [startSession])

  // Chamado pelo `onParagraphChange` já existente quando a leitura traduzida
  // está ativa — traduz o(s) parágrafo(s) seguinte(s) em segundo plano e
  // `push`-a os chunks resultantes no MESMO array por referência que
  // `useTTS.play()` já está iterando (research.md R2).
  const advanceToNextParagraph = useCallback((currentParaIdx: number, chunksArray: TtsChunk[]) => {
    const session = sessionRef.current
    if (!session) return
    if (session.inFlightParagraph !== null) return
    const nextStart = currentParaIdx + 1
    if (session.translatedChunksByParagraph.has(nextStart)) return

    void translateFromParagraph(session, nextStart)
      .then((result) => {
        // A sessão pode ter sido cancelada (troca de capítulo/livro/idioma/
        // provedor) enquanto esta tradução estava em voo — descarta o
        // resultado nesse caso, nunca escreve num array de uma sessão morta.
        if (!result || sessionRef.current !== session || session.abortController.signal.aborted) return
        chunksArray.push(...result.chunks)
      })
      .catch((error) => {
        if (session.abortController.signal.aborted || sessionRef.current !== session) return
        optionsRef.current.onFatalFailure(error)
      })
  }, [])

  const cancel = useCallback(() => {
    sessionRef.current?.abortController.abort()
    sessionRef.current = null
  }, [])

  // Usado pelos controles de avançar (próxima frase/parágrafo, feature 018):
  // se uma tradução ainda está em voo, "acabaram os chunks disponíveis" pode
  // só significar "ainda não terminou de traduzir o próximo parágrafo", não
  // "fim da seção" — evita avançar de capítulo precocemente por engano.
  const hasPendingTranslation = useCallback(() => sessionRef.current?.inFlightParagraph != null, [])

  return { isActive, buildInitialChunks, advanceToNextParagraph, cancel, hasPendingTranslation }
}
