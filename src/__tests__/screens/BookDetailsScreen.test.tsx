import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookDetailsScreen } from '@/screens/BookDetailsScreen'
import type { Book, BookSettings, ReadingProgress } from '@/types/book'
import { BOOK_INFO_SCHEMA_VERSION, type StoredBookInfo } from '@/types/bookInfo'

const mocks = vi.hoisted(() => ({
  liveQueryIndex: 0,
  bookSettings: {
    bookId: 1,
    ttsProvider: 'speechify',
    ttsRate: 1,
  } as BookSettings,
  progress: null as ReadingProgress | null,
  updateBookSettings: vi.fn(),
  listSpeechifyVoices: vi.fn(),
  parseExtras: vi.fn(),
  getStoredBookInfo: vi.fn(),
  saveBookInfo: vi.fn(),
  patchBookInfo: vi.fn(),
  collectBookInfo: vi.fn(),
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => {
    const values = [undefined, mocks.progress, [], 0, mocks.bookSettings]
    const value = values[mocks.liveQueryIndex % values.length]
    mocks.liveQueryIndex += 1
    return value
  }),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
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
  await screen.findByText('Ativo')
  fireEvent.click(screen.getByRole('button', { name: /Voz/ }))
  await screen.findByText('Luna')
}

describe('BookDetailsScreen chapters', () => {
  beforeEach(() => {
    mocks.liveQueryIndex = 0
    mocks.progress = {
      bookId: 1,
      cfi: 'epubcfi(/6/4)',
      percentage: 42,
      fraction: 0.42,
      sectionHref: 'chapter-1.xhtml',
      sectionLabel: 'Chapter 1',
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    }
    mocks.updateBookSettings.mockReset()
    mocks.getStoredBookInfo.mockReset()
    mocks.saveBookInfo.mockReset()
    mocks.patchBookInfo.mockReset()
    mocks.collectBookInfo.mockReset()
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
    const expectedTabs = ['Capitulo', 'Marcacoes', 'Reviews', 'Autor', 'Configuracoes', 'Detalhes']

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

  it('shows nested chapters and opens groups at the first navigable child', async () => {
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
    expect(await screen.findByText('Chapter 1')).toBeTruthy()
    expect(screen.getByText('Parou aqui')).toBeTruthy()

    fireEvent.click(screen.getByText('Part I'))

    await waitFor(() => {
      expect(onRead).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'chapter-1.xhtml')
    })
  })

  it('keeps chapter groups collapsed when there is no saved chapter inside', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Expandir capitulo' }))

    expect(screen.getByText('Chapter 1')).toBeTruthy()
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

    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }))

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
  })

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

    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }))

    expect(await screen.findByText('4.8/5')).toBeTruthy()
    expect(mocks.collectBookInfo).toHaveBeenCalledWith(book.fileBlob, {
      lookupHints: {
        title: 'Livro de teste',
        author: 'Autor',
        identifiers: [],
      },
    })
    expect(mocks.saveBookInfo).toHaveBeenCalledWith(1, collected)
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

    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }))

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

    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }))

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

    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }))

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
})

describe('BookDetailsScreen voice settings', () => {
  beforeEach(() => {
    mocks.liveQueryIndex = 0
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
  })

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
