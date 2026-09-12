import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/TranslationService', async () => {
  const actual = await vi.importActual<typeof import('@/services/TranslationService')>('@/services/TranslationService')
  return {
    ...actual,
    translate: vi.fn(),
  }
})

import { translate } from '@/services/TranslationService'
import {
  buildTranslatedChunksForParagraph,
  createTranslatedAudiobookSession,
  translateParagraphForAudiobook,
  translateParagraphForSession,
} from '@/services/TranslatedAudiobookService'

const mockTranslate = vi.mocked(translate)

beforeEach(() => {
  mockTranslate.mockReset()
})

describe('translateParagraphForAudiobook', () => {
  it('parágrafo curto vira 1 única chamada de tradução', async () => {
    mockTranslate.mockResolvedValue({ translatedText: 'texto traduzido', provider: 'mymemory' })

    const result = await translateParagraphForAudiobook('Um parágrafo curto.', 'en', 'pt-BR', 'mymemory', new AbortController().signal)

    expect(mockTranslate).toHaveBeenCalledTimes(1)
    expect(result.translatedText).toBe('texto traduzido')
  })

  it('parágrafo acima de 500 chars é dividido e nenhum trecho é perdido', async () => {
    // Cada frase tem ~60 chars, 10 frases = ~600 chars > MAX_CHARS (500).
    const sentence = 'Esta e uma frase de teste com tamanho razoavel para dividir. '
    const longParagraph = sentence.repeat(10).trim()
    mockTranslate.mockImplementation((text) => Promise.resolve({ translatedText: `[T]${text}`, provider: 'mymemory' }))

    const result = await translateParagraphForAudiobook(longParagraph, 'en', 'pt-BR', 'mymemory', new AbortController().signal)

    expect(mockTranslate.mock.calls.length).toBeGreaterThan(1)
    // Cada pedaço original enviado pra translate() deve aparecer dentro do
    // resultado final (via o marcador [T]) — prova que nenhum pedaço do
    // parágrafo ficou de fora da tradução.
    for (const call of mockTranslate.mock.calls) {
      const [pieceText] = call
      expect(result.translatedText).toContain(pieceText)
    }
    // Concatenar todos os pedaços originais enviados deve reconstituir
    // (aproximadamente) o parágrafo inteiro, sem perda de conteúdo.
    const sentPieces = mockTranslate.mock.calls.map((call) => call[0]).join(' ')
    expect(sentPieces.replace(/\s+/g, '')).toBe(longParagraph.replace(/\s+/g, ''))
  })

  it('respeita o provider pedido em cada pedaço', async () => {
    const longParagraph = 'Frase numero um bem completa aqui. '.repeat(10).trim()
    mockTranslate.mockResolvedValue({ translatedText: 'x', provider: 'deepl' })

    await translateParagraphForAudiobook(longParagraph, 'en', 'pt-BR', 'deepl', new AbortController().signal)

    for (const call of mockTranslate.mock.calls) {
      const [, , , options] = call
      expect(options?.provider).toBe('deepl')
    }
  })
})

describe('buildTranslatedChunksForParagraph', () => {
  it('preserva o paraIdx original independente do texto traduzido', () => {
    const chunks = buildTranslatedChunksForParagraph(5, 'Primeira frase aqui. Segunda frase completa aqui tambem.')

    expect(chunks.length).toBeGreaterThan(0)
    for (const chunk of chunks) {
      expect(chunk.paraIdx).toBe(5)
    }
  })

  it('retorna vazio para texto vazio', () => {
    expect(buildTranslatedChunksForParagraph(0, '')).toEqual([])
  })
})

describe('translateParagraphForSession — sticky fallback (FR-007)', () => {
  it('depois de uma tradução cair pro fallback, chamadas seguintes usam o fallback direto', async () => {
    // Primeira chamada: provider pedido é 'deepl', mas o resultado vem com
    // provider 'mymemory' (simula fallback já resolvido por translate()).
    mockTranslate.mockResolvedValueOnce({ translatedText: 'primeiro paragrafo', provider: 'mymemory' })
    mockTranslate.mockResolvedValueOnce({ translatedText: 'segundo paragrafo', provider: 'mymemory' })

    const session = createTranslatedAudiobookSession('en', 'pt-BR', 'deepl')

    await translateParagraphForSession(session, 0, 'Primeiro paragrafo original.')
    expect(session.stickyProvider).toBe('mymemory')

    await translateParagraphForSession(session, 1, 'Segundo paragrafo original.')

    // A segunda chamada a translate() deve já pedir 'mymemory' diretamente,
    // nunca tentar 'deepl' de novo (sticky fallback).
    const secondCallOptions = mockTranslate.mock.calls[1][3]
    expect(secondCallOptions?.provider).toBe('mymemory')
  })

  it('sem fallback (provider pedido == provider retornado), continua tentando o mesmo provider', async () => {
    mockTranslate.mockResolvedValue({ translatedText: 'ok', provider: 'deepl' })
    const session = createTranslatedAudiobookSession('en', 'pt-BR', 'deepl')

    await translateParagraphForSession(session, 0, 'Paragrafo um.')
    await translateParagraphForSession(session, 1, 'Paragrafo dois.')

    expect(session.stickyProvider).toBeNull()
    for (const call of mockTranslate.mock.calls) {
      expect(call[3]?.provider).toBe('deepl')
    }
  })

  it('cacheia o resultado por parágrafo — não retraduz o mesmo paraIdx duas vezes', async () => {
    mockTranslate.mockResolvedValue({ translatedText: 'traduzido', provider: 'mymemory' })
    const session = createTranslatedAudiobookSession('en', 'pt-BR', 'mymemory')

    await translateParagraphForSession(session, 0, 'Paragrafo repetido.')
    await translateParagraphForSession(session, 0, 'Paragrafo repetido.')

    expect(mockTranslate).toHaveBeenCalledTimes(1)
  })
})
