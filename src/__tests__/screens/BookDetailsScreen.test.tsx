import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookDetailsScreen } from '@/screens/BookDetailsScreen'
import { FeatureQuotaService } from '@/services/FeatureQuotaService'
import type { Book, Bookmark, BookSettings, ReadingProgress } from '@/types/book'
import type { Highlight } from '@/types/highlight'
import { BOOK_INFO_SCHEMA_VERSION, type StoredBookInfo } from '@/types/bookInfo'

const mocks = vi.hoisted(() => ({
  liveQueryIndex: 0,
  bookSettings: {
    bookId: 1,
    ttsProvider: 'speechify',
    ttsRate: 1,
  } as BookSettings,
  progress: null as ReadingProgress | null,
  bookmarks: [] as Bookmark[],
  highlights: [] as Highlight[],
  deleteHighlight: vi.fn(),
  updateBookSettings: vi.fn(),
  listSpeechifyVoices: vi.fn(),
  parseExtras: vi.fn(),
  getStoredBookInfo: vi.fn(),
  saveBookInfo: vi.fn(),
  patchBookInfo: vi.fn(),
  collectBookInfo: vi.fn(),
  useEntitlements: vi.fn(),
  scheduleBookmarkDriveSync: vi.fn(),
  setBookmarkDriveSyncStatus: vi.fn(),
  getCachedBookmarkDriveSyncStatus: vi.fn(() => ({ code: 'pending-offline' as const })),
  refreshDriveToken: vi.fn(),
  capacitorListeners: {
    backButton: null as ((event?: unknown) => void) | null,
  },
}))

vi.mock('dexie-react-hooks', () => ({
  // Mock posicional: a ordem aqui espelha a ordem dos useLiveQuery no
  // componente (liveBook, progress, bookmarks, vocabCount, highlights,
  // bookSettings). Mexeu na ordem lá, mexe aqui.
  useLiveQuery: vi.fn(() => {
    const values = [undefined, mocks.progress, mocks.bookmarks, 0, mocks.highlights, mocks.bookSettings]
    const value = values[mocks.liveQueryIndex % values.length]
    mocks.liveQueryIndex += 1
    return value
  }),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    // Captura o handler do backButton (em vez de só descartar) pra permitir
    // simular o botão físico do Android disparando `mocks.capacitorListeners.backButton?.()`.
    addListener: vi.fn(async (eventName: 'backButton', handler: (payload?: unknown) => void) => {
      if (eventName === 'backButton') {
        mocks.capacitorListeners.backButton = handler
      }
      return { remove: vi.fn() }
    }),
  },
}))

vi.mock('@/db/database', () => ({
  db: {},
}))

vi.mock('@/db/books', () => ({
  toggleFavorite: vi.fn(),
}))

vi.mock('@/db/bookmarks', () => ({
  softDeleteBookmark: vi.fn(),
}))

vi.mock('@/db/highlights', () => ({
  getHighlightsByBookId: vi.fn(async () => mocks.highlights),
  deleteHighlight: mocks.deleteHighlight,
}))

vi.mock('@/db/bookInfo', () => ({
  getStoredBookInfo: mocks.getStoredBookInfo,
  saveBookInfo: mocks.saveBookInfo,
  patchBookInfo: mocks.patchBookInfo,
}))

vi.mock('@/db/bookSettings', () => ({
  getBookSettings: vi.fn(async () => mocks.bookSettings),
  updateBookSettings: mocks.updateBookSettings,
}))

vi.mock('@/db/settings', () => ({
  getSettings: vi.fn(async () => ({
    appSettings: {
      speechifyApiKey: 'speechify-key',
      elevenLabsApiKey: '',
      fishAudioApiKey: '',
      translationTargetLang: 'pt-BR',
      youtubeApiKey: '',
    },
    readerDefaults: {
      defaultFontSize: 'md',
      lineHeight: 'comfortable',
      readerTheme: 'dark',
      fontFamily: 'classic',
      overrideBookFont: true,
      overrideBookColors: true,
    },
    updatedAt: new Date(),
  })),
}))

vi.mock('@/hooks/useBookCoverUrl', () => ({
  useBookCoverUrl: vi.fn(() => null),
}))

vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: mocks.useEntitlements,
}))

vi.mock('@/services/BookmarkDriveSyncService', () => ({
  scheduleBookmarkDriveSync: mocks.scheduleBookmarkDriveSync,
}))

vi.mock('@/services/BookmarkDriveSyncStatus', () => ({
  setBookmarkDriveSyncStatus: mocks.setBookmarkDriveSyncStatus,
  getCachedBookmarkDriveSyncStatus: mocks.getCachedBookmarkDriveSyncStatus,
}))

vi.mock('@/services/FirebaseAuthService', () => ({
  refreshDriveToken: mocks.refreshDriveToken,
}))

vi.mock('@/services/EpubService', () => ({
  EpubService: {
    parseExtras: mocks.parseExtras,
  },
}))

vi.mock('@/services/bookInfo', () => ({
  BookInfoService: vi.fn(function BookInfoServiceMock(
    _providers,
    options?: { onProviderAttempt?: (attempt: unknown) => void },
  ) {
    return {
      collect: async (...args: unknown[]) => {
        options?.onProviderAttempt?.({
          source: 'google-books',
          status: 'empty',
          fields: [],
          details: [
            'API key Google Books: configurada',
            'Query "Livro de teste Autor" retornou HTTP 200, totalItems=0, encontrado=nao.',
          ],
        })
        return mocks.collectBookInfo(...args)
      },
    }
  }),
  EpubBookInfoProvider: vi.fn(function EpubBookInfoProviderMock() {}),
  GoogleBooksProvider: vi.fn(function GoogleBooksProviderMock() {}),
  OpenLibraryProvider: vi.fn(function OpenLibraryProviderMock() {}),
  YouTubeReviewsProvider: vi.fn(function YouTubeReviewsProviderMock() {}),
}))

vi.mock('@/services/SpeechifyService', () => ({
  SpeechifyService: {
    listCompatibleVoices: mocks.listSpeechifyVoices,
    synthesize: vi.fn(),
  },
}))

vi.mock('@/services/ElevenLabsService', () => ({
  ElevenLabsService: {
    listCompatibleVoices: vi.fn(async () => []),
    synthesize: vi.fn(),
  },
}))

vi.mock('@/services/NativeTtsService', () => ({
  NativeTtsService: {
    listCompatibleVoices: vi.fn(async () => []),
    speakPreview: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  },
}))

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = []

  play = vi.fn(async () => {
    queueMicrotask(() => this.dispatchEvent(new Event('ended')))
  })
  pause = vi.fn(() => {
    this.dispatchEvent(new Event('pause'))
  })

  constructor(public readonly src: string) {
    super()
    FakeAudio.instances.push(this)
  }

  static reset() {
    FakeAudio.instances = []
  }
}

const book: Book = {
  id: 1,
  title: 'Livro de teste',
  author: 'Autor',
  fileBlob: new Blob(['epub']),
  addedAt: new Date('2024-01-01T00:00:00Z'),
  lastOpenedAt: null,
  readingStatus: 'unread',
  isFavorite: false,
}

const SLOW_BOOK_DETAILS_TEST_TIMEOUT_MS = 15_000

function emptyBookInfo(): StoredBookInfo {
  return {
    bookId: 1,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    metadataSchemaVersion: BOOK_INFO_SCHEMA_VERSION,
    category: null,
    rating: null,
    synopsis: null,
    pageCount: null,
    publishedDate: null,
    publisher: null,
    language: null,
    isbn10: null,
    isbn13: null,
    subtitle: null,
    series: null,
    edition: null,
    universalIdentifier: null,
    reviews: null,
    lookupHints: {
      title: 'Livro de teste',
      author: 'Autor',
      identifiers: [],
    },
  }
}

async function openVoiceSheet() {
  render(
    <BookDetailsScreen
      book={book}
      onBack={vi.fn()}
      onRead={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
  fireEvent.click(await screen.findByText('Narracao'))
  await screen.findByText('Ativo')
  fireEvent.click(screen.getByRole('button', { name: /Voz/ }))
  await screen.findByText('Luna')
}

describe('BookDetailsScreen chapters', () => {
  beforeEach(() => {
    mocks.liveQueryIndex = 0
    mocks.bookSettings = {
      bookId: 1,
      ttsProvider: 'speechify',
      ttsRate: 1,
    } as BookSettings
    mocks.progress = {
      bookId: 1,
      cfi: 'epubcfi(/6/4)',
      percentage: 42,
      fraction: 0.42,
      sectionHref: 'chapter-1.xhtml',
      sectionLabel: 'Chapter 1',
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    }
    mocks.bookmarks = []
    mocks.highlights = []
    mocks.deleteHighlight.mockReset()
    mocks.updateBookSettings.mockReset()
    mocks.getStoredBookInfo.mockReset()
    mocks.saveBookInfo.mockReset()
    mocks.patchBookInfo.mockReset()
    mocks.collectBookInfo.mockReset()
    mocks.useEntitlements.mockReset()
    mocks.useEntitlements.mockReturnValue({
      isPro: false,
      isLoading: false,
      expiresAt: undefined,
      activeProductId: undefined,
      refresh: vi.fn(),
    })
    mocks.scheduleBookmarkDriveSync.mockReset()
    mocks.scheduleBookmarkDriveSync.mockResolvedValue(undefined)
    mocks.setBookmarkDriveSyncStatus.mockReset()
    mocks.getCachedBookmarkDriveSyncStatus.mockReset()
    mocks.getCachedBookmarkDriveSyncStatus.mockReturnValue({ code: 'pending-offline' })
    mocks.refreshDriveToken.mockReset()
    mocks.capacitorListeners.backButton = null
    FeatureQuotaService.reset()
    mocks.getStoredBookInfo.mockResolvedValue(emptyBookInfo())
    mocks.collectBookInfo.mockResolvedValue(emptyBookInfo())
    mocks.saveBookInfo.mockImplementation(async (_bookId: number, info: StoredBookInfo) => ({
      ...emptyBookInfo(),
      ...info,
      bookId: 1,
    }))
    mocks.parseExtras.mockResolvedValue({
      description: null,
      language: 'pt-BR',
      toc: [
        {
          label: 'Part I',
          href: 'part.xhtml',
          subitems: [
            { label: 'Chapter 1', href: 'chapter-1.xhtml' },
          ],
        },
      ],
      previewText: 'Trecho real do livro para preview.',
      styleDiagnostics: [],
    })
    mocks.listSpeechifyVoices.mockResolvedValue([])
  })

  it('renderiza as abas na ordem definida para detalhes do livro', () => {
    // 'Detalhes' deixou de ser aba propria (011-book-details-settings-categorias)
    // e virou categoria dentro de Configuracoes — ver T009/T021.
    const expectedTabs = ['Capitulo', 'Marcacoes', 'Destaques', 'Reviews', 'Autor', 'Configuracoes']

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    const tabLabels = screen.getAllByRole('button')
      .map((button) => button.textContent?.replace(/\d+$/, '').trim() ?? '')
      .filter((label) => expectedTabs.includes(label))
    const tabsStart = tabLabels.indexOf('Capitulo')

    expect(tabLabels.slice(tabsStart, tabsStart + expectedTabs.length)).toEqual(expectedTabs)
  })

  it('aba Configuracoes mostra o menu de 4 categorias, nao os controles direto', async () => {
    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))

    // Controles ficam atras de 1 clique de categoria (FR-001) — nao aparecem direto no menu.
    expect(screen.queryByText('Tema do leitor')).toBeNull()
    // Nome acessivel exato (title + description) de cada linha — prova que
    // nenhum badge/estado dinamico foi anexado a nenhuma delas (FR-009).
    expect(await screen.findByRole('button', {
      name: 'Aparencia do Leitor Tema, fonte, tamanho e modo de leitura para este livro.',
    })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Idioma Idioma original do livro e idioma de traducao para este livro.',
    })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Narracao Provedor de voz, voz selecionada e velocidade de fala para este livro.',
    })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Detalhes Sinopse, informacoes editoriais, diagnosticos e dados do arquivo.',
    })).toBeTruthy()
  })

  it('dentro de uma categoria, tocar em voltar (UI) retorna ao menu sem chamar onBack', async () => {
    const onBack = vi.fn()
    render(
      <BookDetailsScreen book={book} onBack={onBack} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Narracao'))
    await screen.findByText('TTS')

    fireEvent.click(screen.getByRole('button', { name: 'Narracao' }))

    expect(await screen.findByText('Aparencia do Leitor')).toBeTruthy()
    expect(screen.queryByText('TTS')).toBeNull()
    expect(onBack).not.toHaveBeenCalled()
  })

  it('botao fisico de voltar do Android, dentro de uma categoria, volta ao menu sem chamar onBack', async () => {
    const onBack = vi.fn()
    render(
      <BookDetailsScreen book={book} onBack={onBack} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Narracao'))
    await screen.findByText('TTS')

    await act(async () => {
      mocks.capacitorListeners.backButton?.()
    })

    expect(await screen.findByText('Aparencia do Leitor')).toBeTruthy()
    expect(screen.queryByText('TTS')).toBeNull()
    expect(onBack).not.toHaveBeenCalled()
  })

  it('botao fisico de voltar do Android, no menu de categorias, chama onBack', async () => {
    const onBack = vi.fn()
    render(
      <BookDetailsScreen book={book} onBack={onBack} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    await screen.findByText('Aparencia do Leitor')

    await act(async () => {
      mocks.capacitorListeners.backButton?.()
    })

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('trocar de aba estando dentro de uma categoria e voltar pra Configuracoes mostra o menu de novo', async () => {
    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Narracao'))
    await screen.findByText('TTS')

    fireEvent.click(screen.getByRole('button', { name: /^Capitulo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))

    expect(await screen.findByText('Aparencia do Leitor')).toBeTruthy()
    expect(screen.queryByText('TTS')).toBeNull()
  })

  // ── US4: aba de highlights ───────────────────────────────────────────────
  function highlightFixture(patch: Partial<Highlight> = {}): Highlight {
    return {
      id: 1,
      bookId: 1,
      cfi: 'epubcfi(/6/4!/4/2/1:0,/1:20)',
      paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'Trecho marcado pelo leitor',
      color: 'amber',
      sectionIndex: 3,
      percentage: 40,
      createdAt: new Date('2026-03-04T12:00:00.000Z'),
      ...patch,
    }
  }

  it('T037: a aba lista os highlights na ordem de percentage, com trecho, cor, posicao e data', async () => {
    // getHighlightsByBookId já devolve ordenado — a lista preserva essa ordem
    mocks.highlights = [
      highlightFixture({ id: 1, percentage: 12, text: 'Primeiro trecho', color: 'indigo' }),
      highlightFixture({ id: 2, percentage: 77, text: 'Segundo trecho', color: 'rose' }),
    ]

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Destaques/ }))

    const primeiro = await screen.findByText('Primeiro trecho')
    const segundo = screen.getByText('Segundo trecho')
    expect(primeiro.compareDocumentPosition(segundo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/^12% ·/)).toBeTruthy()
    expect(screen.getByText(/^77% ·/)).toBeTruthy()
    // cor: bolinha com o hex da paleta compartilhada
    const cores = document.querySelectorAll('[style*="background-color"]')
    const hexes = [...cores].map((el) => (el as HTMLElement).style.backgroundColor)
    expect(hexes).toContain('rgb(99, 102, 241)') // indigo #6366f1
    expect(hexes).toContain('rgb(244, 63, 94)') // rose #f43f5e
  })

  it('T038: tocar num highlight abre o livro no CFI dele', async () => {
    const onRead = vi.fn()
    mocks.highlights = [highlightFixture({ cfi: 'epubcfi(/6/8!/4/2/1:5,/1:40)' })]

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={onRead} onOpenSettings={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Destaques/ }))
    fireEvent.click(await screen.findByText('Trecho marcado pelo leitor'))

    await waitFor(() => {
      expect(onRead).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'epubcfi(/6/8!/4/2/1:5,/1:40)')
    })
  })

  it('T039: livro sem highlights mostra estado vazio, e o contador aparece junto de marcacoes e vocabulario', async () => {
    mocks.highlights = []

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )

    expect(screen.getByText('destaques')).toBeTruthy()
    expect(screen.getByText('marcadores')).toBeTruthy()
    expect(screen.getByText('vocabulario')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Destaques/ }))
    expect(await screen.findByText('Nenhum destaque ainda')).toBeTruthy()
  })

  it('T039a: remover pela lista chama deleteHighlight', async () => {
    mocks.highlights = [highlightFixture({ id: 9 })]

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Destaques/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remover destaque' }))

    expect(mocks.deleteHighlight).toHaveBeenCalledWith(9)
  })

  // ── Anotação de texto associada ao highlight (feature 013) ──────────────
  it('highlight com anotacao mostra o texto da nota na aba Destaques', async () => {
    mocks.highlights = [highlightFixture({ id: 1, note: 'Reflexao sobre o trecho' })]

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Destaques/ }))

    expect(await screen.findByText('Reflexao sobre o trecho')).toBeTruthy()
  })

  it('highlight sem anotacao nao mostra nenhum elemento extra de nota', async () => {
    mocks.highlights = [highlightFixture({ id: 1 })]

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Destaques/ }))
    await screen.findByText('Trecho marcado pelo leitor')

    expect(document.querySelector('p.line-clamp-2')).toBeNull()
  })

  it('anotacao longa aparece truncada (classe line-clamp)', async () => {
    const longNote = 'Reflexao bem longa. '.repeat(20).trim()
    mocks.highlights = [highlightFixture({ id: 1, note: longNote })]

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Destaques/ }))

    const noteEl = await screen.findByText(longNote)
    expect(noteEl.className).toContain('line-clamp-2')
  })

  it('starts chapter groups collapsed and opens groups at the first navigable child', async () => {
    const onRead = vi.fn()

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={onRead}
        onOpenSettings={vi.fn()}
      />,
    )

    await screen.findByText('Part I')
    expect(screen.queryByText('Chapter 1')).toBeNull()
    expect(screen.queryByText('Agora')).toBeNull()

    fireEvent.click(screen.getByText('Part I'))

    await waitFor(() => {
      expect(onRead).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'chapter-1.xhtml')
    })
  })

  it('usa o mesmo indice expansivel da tela de leitura', async () => {
    mocks.liveQueryIndex = 0
    mocks.progress = null

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    await screen.findByText('Part I')
    expect(screen.queryByText('Chapter 1')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expandir' }))
    expect(screen.getByText('Chapter 1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Recolher' }))
    expect(screen.queryByText('Chapter 1')).toBeNull()
  })

  it('salva a fonte original do livro sem forcar override de fonte', async () => {
    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Aparencia do Leitor'))
    await screen.findByText('Fonte do livro')
    fireEvent.click(screen.getByText('Original do livro'))

    await waitFor(() => {
      expect(mocks.updateBookSettings).toHaveBeenCalledWith(1, {
        fontFamily: 'publisher',
        overrideBookFont: false,
      })
    })
  })

  it('mostra diagnostico de estilo e aplica modo confortavel', async () => {
    mocks.parseExtras.mockResolvedValue({
      description: null,
      language: 'pt-BR',
      toc: [],
      previewText: 'Trecho real do livro para preview.',
      styleDiagnostics: [
        { issue: 'small-font-size', label: 'Fonte pequena no EPUB' },
      ],
    })

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Aparencia do Leitor'))
    await screen.findByText('Estilos fortes detectados')

    expect(screen.getAllByText('Trecho real do livro para preview.').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar modo confortavel' }))

    await waitFor(() => {
      expect(mocks.updateBookSettings).toHaveBeenCalledWith(1, {
        fontFamily: 'classic',
        overrideBookFont: true,
        overrideBookColors: true,
      })
    })
  })

  it('mostra so os 3 primeiros diagnosticos de estilo e um badge "+N mais" quando ha mais', async () => {
    mocks.parseExtras.mockResolvedValue({
      description: null,
      language: 'pt-BR',
      toc: [],
      previewText: 'Trecho real do livro para preview.',
      styleDiagnostics: [
        { issue: 'small-font-size', label: 'Fonte pequena no EPUB' },
        { issue: 'tight-line-height', label: 'Espacamento apertado' },
        { issue: 'hardcoded-text-color', label: 'Cor de texto fixa' },
        { issue: 'hardcoded-background-color', label: 'Cor de fundo fixa' },
      ],
    })

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Aparencia do Leitor'))
    await screen.findByText('Estilos fortes detectados')

    expect(screen.getByText('Fonte pequena no EPUB')).toBeTruthy()
    expect(screen.getByText('Espacamento apertado')).toBeTruthy()
    expect(screen.getByText('Cor de texto fixa')).toBeTruthy()
    expect(screen.queryByText('Cor de fundo fixa')).toBeNull()
    expect(screen.getByText('+1 mais')).toBeTruthy()
  })

  it('aguarda salvar o tema do livro antes de abrir a leitura', async () => {
    const onRead = vi.fn()
    let resolveSave!: () => void
    mocks.updateBookSettings.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveSave = resolve
    }))

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={onRead}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Aparencia do Leitor'))
    await screen.findByText('Tema do leitor')
    fireEvent.click(screen.getByText('Papel'))

    await waitFor(() => {
      expect(mocks.updateBookSettings).toHaveBeenCalledWith(1, {
        readerTheme: 'paper',
        overrideBookColors: true,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Continuar leitura - 42%' }))
    expect(onRead).not.toHaveBeenCalled()

    await act(async () => {
      resolveSave()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(onRead).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), undefined)
    })
  })

  it('mostra informacoes enriquecidas na aba de detalhes', async () => {
    const longSynopsis = [
      'Sinopse enriquecida do livro com detalhes suficientes para validar o comportamento expansivel da interface.',
      'Este texto descreve personagens, contexto, temas e uma visao geral da obra para ocupar bastante espaco na tela.',
      'A apresentacao deve comecar recolhida para manter a aba escaneavel e permitir que o leitor abra o conteudo completo.',
      'Quando expandida, a sinopse revela a parte final do texto sem esconder as informacoes editoriais e os reviews.',
    ].join(' ')

    mocks.getStoredBookInfo.mockResolvedValue({
      ...emptyBookInfo(),
      synopsis: {
        value: longSynopsis,
        source: 'epub-metadata',
        confidence: 'high',
      },
      rating: {
        value: { average: 4.4, count: 18, scale: 5 },
        source: 'google-books',
        confidence: 'medium',
      },
      publishedDate: {
        value: '2008-08-01',
        source: 'google-books',
        confidence: 'medium',
      },
      publisher: {
        value: 'Prentice Hall',
        source: 'google-books',
        confidence: 'medium',
      },
      language: {
        value: 'en',
        source: 'epub-metadata',
        confidence: 'high',
      },
      pageCount: {
        value: 464,
        source: 'google-books',
        confidence: 'medium',
      },
      isbn10: {
        value: { kind: 'ISBN_10', value: '0132350882', raw: '0132350882' },
        source: 'google-books',
        confidence: 'high',
      },
      isbn13: {
        value: { kind: 'ISBN_13', value: '9780132350884', raw: '9780132350884' },
        source: 'google-books',
        confidence: 'high',
      },
      category: {
        value: [{ label: 'Computers / Software Development' }],
        source: 'google-books',
        confidence: 'medium',
      },
      subtitle: {
        value: 'A Handbook of Agile Software Craftsmanship',
        source: 'google-books',
        confidence: 'medium',
      },
      series: {
        value: 'Robert C. Martin Series',
        source: 'epub-metadata',
        confidence: 'medium',
      },
      edition: {
        value: '1st edition',
        source: 'open-library',
        confidence: 'medium',
      },
      reviews: {
        value: [{
          title: 'Review em video',
          url: 'https://www.youtube.com/watch?v=abc123',
          provider: 'youtube',
          channelTitle: 'Canal de livros',
        }],
        source: 'youtube',
        confidence: 'medium',
      },
    })

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Detalhes'))

    expect(await screen.findByText('2008')).toBeTruthy()
    expect(screen.getByText('Nota 4.4/5 (18)')).toBeTruthy()
    expect(await screen.findByText(/Sinopse enriquecida do livro/)).toBeTruthy()
    expect(screen.getByText('Diagnostico')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Atualizar informacoes' })).toBeTruthy()
    expect(screen.queryByText('Sinopse')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leia mais' }))
    expect(screen.getByText(/Quando expandida/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mostrar menos' })).toBeTruthy()
    expect(screen.getByText('4.4/5 (18)')).toBeTruthy()
    expect(screen.queryByText('Review em video')).toBeNull()
    expect(screen.getByText('Editora')).toBeTruthy()
    expect(screen.getByText('Prentice Hall')).toBeTruthy()
    expect(screen.getAllByText('Idioma').length).toBeGreaterThan(0)
    expect(screen.getByText('en')).toBeTruthy()
    expect(screen.getByText('ISBN-10')).toBeTruthy()
    expect(screen.getByText('0132350882')).toBeTruthy()
    expect(screen.getByText('ISBN-13')).toBeTruthy()
    expect(screen.getByText('9780132350884')).toBeTruthy()
    expect(screen.getByText('Genero/Categoria')).toBeTruthy()
    expect(screen.getByText('Computers / Software Development')).toBeTruthy()
    expect(screen.getByText('Subtitulo')).toBeTruthy()
    expect(screen.getByText('A Handbook of Agile Software Craftsmanship')).toBeTruthy()
    expect(screen.getByText('Serie')).toBeTruthy()
    expect(screen.getByText('Robert C. Martin Series')).toBeTruthy()
    expect(screen.getByText('Edicao')).toBeTruthy()
    expect(screen.getByText('1st edition')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Reviews/ }))

    expect(screen.getByText('Review em video')).toBeTruthy()
    expect(screen.getByText('Canal de livros')).toBeTruthy()
  }, SLOW_BOOK_DETAILS_TEST_TIMEOUT_MS)

  it('coleta informacoes usando titulo e autor salvos quando livro antigo ainda nao tem bookInfo', async () => {
    const collected = {
      ...emptyBookInfo(),
      rating: {
        value: { average: 4.8, scale: 5 as const },
        source: 'google-books' as const,
        confidence: 'medium' as const,
      },
    }
    mocks.getStoredBookInfo.mockResolvedValue(undefined)
    mocks.collectBookInfo.mockResolvedValue(collected)
    mocks.saveBookInfo.mockResolvedValue(collected)

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Detalhes'))

    expect(await screen.findByText('4.8/5')).toBeTruthy()
    expect(mocks.collectBookInfo).toHaveBeenCalledWith(book.fileBlob, {
      lookupHints: {
        title: 'Livro de teste',
        author: 'Autor',
        identifiers: [],
      },
    })
    expect(mocks.saveBookInfo).toHaveBeenCalledWith(1, collected)
    expect(FeatureQuotaService.getSnapshot('book-intelligence', { isPro: false }).used).toBe(1)
  })

  it('bloqueia nova busca de reviews quando quota Free acaba e nao ha cache', async () => {
    const onOpenPaywall = vi.fn()
    for (let index = 0; index < 5; index += 1) {
      FeatureQuotaService.consume('book-intelligence', {
        isPro: false,
        subjectKey: `book:used-${index}`,
      })
    }
    mocks.getStoredBookInfo.mockResolvedValue(undefined)

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenPaywall={onOpenPaywall}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Reviews/ }))

    expect(await screen.findByText('Novas buscas pausadas este mes')).toBeTruthy()
    expect(screen.getByText(/Restam 0 de 5 buscas/)).toBeTruthy()
    expect(screen.getByText(/Reviews ja carregados continuam disponiveis/)).toBeTruthy()
    expect(mocks.collectBookInfo).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Ver NeoReader Pro' }))
    expect(onOpenPaywall).toHaveBeenCalledTimes(1)
  })

  it('mantem leitura, nota em cache e bookmarks locais disponiveis para Free', async () => {
    const onRead = vi.fn()
    for (let index = 0; index < 5; index += 1) {
      FeatureQuotaService.consume('book-intelligence', {
        isPro: false,
        subjectKey: `book:used-${index}`,
      })
      FeatureQuotaService.consume('nyt-discovery', { isPro: false })
    }
    mocks.bookmarks = [{
      id: 77,
      bookId: 1,
      cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)',
      label: 'Capitulo salvo',
      percentage: 32,
      snippet: 'Trecho salvo localmente',
      color: 'indigo',
      syncKey: 'bookmark-key',
      syncedAt: null,
      syncError: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      deletedAt: null,
    }]
    mocks.getStoredBookInfo.mockResolvedValue({
      ...emptyBookInfo(),
      rating: {
        value: { average: 4.7, scale: 5 as const },
        source: 'google-books',
        confidence: 'medium',
      },
    })

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={onRead}
        onOpenSettings={vi.fn()}
        onOpenPaywall={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))
    expect(screen.getByText('Capitulo salvo')).toBeTruthy()

    fireEvent.click(screen.getByText('Capitulo salvo'))
    await waitFor(() => {
      expect(onRead).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Detalhes'))
    expect(await screen.findByText('4.7/5')).toBeTruthy()
    expect(mocks.collectBookInfo).not.toHaveBeenCalled()
  })

  function pendingBookmarkFixture(overrides: Partial<Bookmark> = {}): Bookmark {
    return {
      id: 77,
      bookId: 1,
      cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)',
      label: 'Capitulo salvo',
      percentage: 32,
      snippet: 'Trecho salvo localmente',
      color: 'indigo',
      syncKey: 'bookmark-key',
      syncedAt: null,
      syncError: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    }
  }

  it('icone de bookmark pendente/com erro fica tocavel pra usuario Pro', async () => {
    mocks.useEntitlements.mockReturnValue({
      isPro: true,
      isLoading: false,
      expiresAt: undefined,
      activeProductId: 'pro-lifetime',
      refresh: vi.fn(),
    })
    mocks.bookmarks = [pendingBookmarkFixture()]

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} onOpenPaywall={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))

    expect(await screen.findByRole('button', { name: 'Sincronizar marcacoes' })).toBeTruthy()
  })

  it('icone de bookmark ja sincronizado (sem erro) nao e tocavel', async () => {
    mocks.useEntitlements.mockReturnValue({
      isPro: true,
      isLoading: false,
      expiresAt: undefined,
      activeProductId: 'pro-lifetime',
      refresh: vi.fn(),
    })
    mocks.bookmarks = [pendingBookmarkFixture({ syncedAt: new Date('2026-05-01T00:05:00.000Z'), syncError: null })]

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} onOpenPaywall={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))
    await screen.findByText('Capitulo salvo')

    expect(screen.queryByRole('button', { name: 'Sincronizar marcacoes' })).toBeNull()
  })

  it('mostra no maximo 5 marcadores e um botao para ver os demais', async () => {
    mocks.bookmarks = Array.from({ length: 7 }, (_, index) => pendingBookmarkFixture({
      id: index + 1,
      label: `Marcador ${index + 1}`,
    }))

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} onOpenPaywall={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))
    await screen.findByText('Marcador 1')

    for (let index = 1; index <= 5; index += 1) {
      expect(screen.getByText(`Marcador ${index}`)).toBeTruthy()
    }
    expect(screen.queryByText('Marcador 6')).toBeNull()
    expect(screen.queryByText('Marcador 7')).toBeNull()
    expect(screen.getByRole('button', { name: 'Mostrar mais marcadores (2)' })).toBeTruthy()
  })

  it('ao clicar em mostrar mais, revela todos os marcadores restantes', async () => {
    mocks.bookmarks = Array.from({ length: 7 }, (_, index) => pendingBookmarkFixture({
      id: index + 1,
      label: `Marcador ${index + 1}`,
    }))

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} onOpenPaywall={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))
    await screen.findByText('Marcador 1')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar mais marcadores (2)' }))

    for (let index = 1; index <= 7; index += 1) {
      expect(screen.getByText(`Marcador ${index}`)).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: /Mostrar mais marcadores/ })).toBeNull()
  })

  it('sem mais de 5 marcadores, nao mostra o botao de ver mais', async () => {
    mocks.bookmarks = Array.from({ length: 5 }, (_, index) => pendingBookmarkFixture({
      id: index + 1,
      label: `Marcador ${index + 1}`,
    }))

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} onOpenPaywall={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))
    await screen.findByText('Marcador 1')

    expect(screen.queryByRole('button', { name: /Mostrar mais marcadores/ })).toBeNull()
  })

  it('tocar no icone reseta o status e agenda a sincronizacao do livro', async () => {
    mocks.useEntitlements.mockReturnValue({
      isPro: true,
      isLoading: false,
      expiresAt: undefined,
      activeProductId: 'pro-lifetime',
      refresh: vi.fn(),
    })
    mocks.bookmarks = [pendingBookmarkFixture({ syncError: 'permission-denied:403' })]

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} onOpenPaywall={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sincronizar marcacoes' }))

    await waitFor(() => {
      expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(1)
    })
    expect(mocks.setBookmarkDriveSyncStatus).toHaveBeenCalledWith('pending-offline')
    // Status cacheado default (beforeEach) e 'pending-offline', nao
    // 'permission-error' — nao deve tentar reconectar o Drive.
    expect(mocks.refreshDriveToken).not.toHaveBeenCalled()
  })

  it('toque com status permission-error reconecta o Drive antes de agendar a sincronizacao', async () => {
    mocks.useEntitlements.mockReturnValue({
      isPro: true,
      isLoading: false,
      expiresAt: undefined,
      activeProductId: 'pro-lifetime',
      refresh: vi.fn(),
    })
    mocks.bookmarks = [pendingBookmarkFixture({ syncError: 'missing-token' })]
    mocks.getCachedBookmarkDriveSyncStatus.mockReturnValue({ code: 'permission-error' })
    mocks.refreshDriveToken.mockResolvedValue('refreshed')

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} onOpenPaywall={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sincronizar marcacoes' }))

    await waitFor(() => {
      expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(1)
    })
    expect(mocks.refreshDriveToken).toHaveBeenCalledWith({ userInitiated: true })
    expect(mocks.setBookmarkDriveSyncStatus).toHaveBeenCalledWith('pending-offline')
  })

  it('toque com status permission-error nao agenda sincronizacao se a reconexao nao renovar o token', async () => {
    mocks.useEntitlements.mockReturnValue({
      isPro: true,
      isLoading: false,
      expiresAt: undefined,
      activeProductId: 'pro-lifetime',
      refresh: vi.fn(),
    })
    mocks.bookmarks = [pendingBookmarkFixture({ syncError: 'missing-token' })]
    mocks.getCachedBookmarkDriveSyncStatus.mockReturnValue({ code: 'permission-error' })
    mocks.refreshDriveToken.mockResolvedValue('failed')

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} onOpenPaywall={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sincronizar marcacoes' }))

    await waitFor(() => {
      expect(mocks.refreshDriveToken).toHaveBeenCalledWith({ userInitiated: true })
    })
    expect(mocks.scheduleBookmarkDriveSync).not.toHaveBeenCalled()
    expect(mocks.setBookmarkDriveSyncStatus).not.toHaveBeenCalled()
  })

  it('mostra estado de sincronizando enquanto a promise esta pendente', async () => {
    mocks.useEntitlements.mockReturnValue({
      isPro: true,
      isLoading: false,
      expiresAt: undefined,
      activeProductId: 'pro-lifetime',
      refresh: vi.fn(),
    })
    mocks.bookmarks = [pendingBookmarkFixture()]
    let resolveSync: () => void = () => {}
    mocks.scheduleBookmarkDriveSync.mockImplementation(() => new Promise<void>((resolve) => {
      resolveSync = resolve
    }))

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} onOpenPaywall={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sincronizar marcacoes' }))

    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sincronizar marcacoes' })).toBeNull()

    resolveSync()

    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull()
    })
  })

  it('toque duplicado enquanto sincroniza dispara a sincronizacao so 1 vez', async () => {
    mocks.useEntitlements.mockReturnValue({
      isPro: true,
      isLoading: false,
      expiresAt: undefined,
      activeProductId: 'pro-lifetime',
      refresh: vi.fn(),
    })
    mocks.bookmarks = [pendingBookmarkFixture()]
    let resolveSync: () => void = () => {}
    mocks.scheduleBookmarkDriveSync.mockImplementation(() => new Promise<void>((resolve) => {
      resolveSync = resolve
    }))

    render(
      <BookDetailsScreen book={book} onBack={vi.fn()} onRead={vi.fn()} onOpenSettings={vi.fn()} onOpenPaywall={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcacoes/ }))
    const syncButton = await screen.findByRole('button', { name: 'Sincronizar marcacoes' })
    // 2 cliques na mesma tick, sem await entre eles — simula o toque duplo
    // rápido acontecendo antes do React re-renderizar (o state `syncingBookmarks`
    // sozinho não pegaria isso a tempo; o guard real é o ref síncrono).
    fireEvent.click(syncButton)
    fireEvent.click(syncButton)
    resolveSync()

    await waitFor(() => {
      expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledTimes(1)
    })
  })

  it('mostra nota indisponivel no cabecalho quando nenhuma fonte retorna rating', async () => {
    mocks.getStoredBookInfo.mockResolvedValue({
      ...emptyBookInfo(),
      synopsis: {
        value: 'Sinopse sem rating externo.',
        source: 'google-books',
        confidence: 'medium',
      },
    })

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    expect(await screen.findByText('Nota indisponivel')).toBeTruthy()
  })

  it('recoleta quando existe bookInfo salvo mas sem campos exibiveis', async () => {
    const emptyStored = emptyBookInfo()
    const collected = {
      ...emptyBookInfo(),
      pageCount: {
        value: 320,
        source: 'google-books' as const,
        confidence: 'medium' as const,
      },
    }
    mocks.getStoredBookInfo.mockResolvedValue(emptyStored)
    mocks.collectBookInfo.mockResolvedValue(collected)
    mocks.saveBookInfo.mockResolvedValue(collected)

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Detalhes'))

    expect(await screen.findByText('320')).toBeTruthy()
    expect(mocks.collectBookInfo).toHaveBeenCalledWith(book.fileBlob, {
      lookupHints: {
        title: 'Livro de teste',
        author: 'Autor',
        identifiers: [],
      },
    })
  })

  it('recoleta quando o schema de metadados salvo esta desatualizado', async () => {
    const staleStored: StoredBookInfo = {
      ...emptyBookInfo(),
      metadataSchemaVersion: 1,
      rating: {
        value: { average: 4.1, scale: 5 },
        source: 'google-books',
        confidence: 'medium',
      },
    }
    const collected = {
      ...emptyBookInfo(),
      publisher: {
        value: 'Editora nova',
        source: 'google-books' as const,
        confidence: 'medium' as const,
      },
    }
    mocks.getStoredBookInfo.mockResolvedValue(staleStored)
    mocks.collectBookInfo.mockResolvedValue(collected)
    mocks.saveBookInfo.mockResolvedValue(collected)

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Detalhes'))

    expect(await screen.findByText('Editora nova')).toBeTruthy()
    expect(mocks.collectBookInfo).toHaveBeenCalledWith(book.fileBlob, {
      lookupHints: {
        title: 'Livro de teste',
        author: 'Autor',
        identifiers: [],
      },
    })
  })

  it('mostra estado vazio e permite atualizar manualmente quando nenhuma fonte retorna dados', async () => {
    mocks.getStoredBookInfo.mockResolvedValue(emptyBookInfo())
    mocks.collectBookInfo.mockResolvedValue(emptyBookInfo())
    mocks.saveBookInfo.mockResolvedValue(emptyBookInfo())

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Detalhes'))

    expect(await screen.findByText('Nenhuma informacao editorial encontrada')).toBeTruthy()
    expect(screen.getByText('Diagnostico')).toBeTruthy()
    expect(screen.getByText('Fontes consultadas')).toBeTruthy()
    expect(screen.getByText('API key Google Books: configurada')).toBeTruthy()
    expect(screen.getByText('Query "Livro de teste Autor" retornou HTTP 200, totalItems=0, encontrado=nao.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar informacoes' }))

    await waitFor(() => {
      expect(mocks.collectBookInfo).toHaveBeenCalledTimes(2)
    })
  })

  it('mostra banner quando provider premium selecionado nao tem key', async () => {
    window.localStorage.clear()
    mocks.bookSettings = {
      bookId: 1,
      ttsProvider: 'elevenlabs',
      ttsRate: 1,
    } as BookSettings

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Narracao'))

    expect(await screen.findByText('Voz premium aguardando API key')).toBeTruthy()
    expect(screen.getByText(/continua lendo com TTS nativo/)).toBeTruthy()
  })

  it('nao mostra banner quando provider premium selecionado tem key', async () => {
    window.localStorage.clear()

    render(
      <BookDetailsScreen
        book={book}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))
    fireEvent.click(await screen.findByText('Narracao'))

    expect(await screen.findByText('Ativo')).toBeTruthy()
    expect(screen.queryByText('Voz premium aguardando API key')).toBeNull()
  })
})

describe('BookDetailsScreen voice settings', () => {
  beforeEach(() => {
    mocks.liveQueryIndex = 0
    mocks.bookSettings = {
      bookId: 1,
      ttsProvider: 'speechify',
      ttsRate: 1,
    } as BookSettings
    mocks.progress = null
    mocks.updateBookSettings.mockReset()
    mocks.getStoredBookInfo.mockReset()
    mocks.saveBookInfo.mockReset()
    mocks.patchBookInfo.mockReset()
    mocks.collectBookInfo.mockReset()
    mocks.getStoredBookInfo.mockResolvedValue(emptyBookInfo())
    mocks.collectBookInfo.mockResolvedValue(emptyBookInfo())
    mocks.parseExtras.mockResolvedValue({
      description: null,
      language: 'pt-BR',
      toc: [],
      previewText: null,
      styleDiagnostics: [],
    })
    mocks.capacitorListeners.backButton = null
    mocks.listSpeechifyVoices.mockResolvedValue([
      {
        id: 'luna',
        label: 'Luna',
        locale: 'pt-BR',
        provider: 'speechify',
        previewUrl: 'https://cdn.example/luna.mp3',
        avatarUrl: null,
        meta: 'female',
      },
      {
        id: 'carlos',
        label: 'Carlos',
        locale: 'pt-BR',
        provider: 'speechify',
        previewUrl: 'https://cdn.example/carlos.mp3',
        avatarUrl: null,
        meta: 'male',
      },
    ])
    FakeAudio.reset()
    vi.stubGlobal('Audio', FakeAudio)
  })

  it('filtra a lista de vozes por nome', async () => {
    await openVoiceSheet()

    fireEvent.change(screen.getByPlaceholderText('Pesquisar voz por nome'), {
      target: { value: 'car' },
    })

    expect(screen.getByText('Carlos')).toBeTruthy()
    expect(screen.queryByText('Luna')).toBeNull()
  }, SLOW_BOOK_DETAILS_TEST_TIMEOUT_MS)

  it('toca amostra da voz sem selecionar a voz', async () => {
    await openVoiceSheet()

    fireEvent.click(screen.getByLabelText('Ouvir amostra de Luna'))

    await waitFor(() => {
      expect(FakeAudio.instances[0]?.play).toHaveBeenCalledOnce()
    })
    expect(FakeAudio.instances[0]?.src).toBe('https://cdn.example/luna.mp3')
    expect(mocks.updateBookSettings).not.toHaveBeenCalled()
  })
})
