import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookDetailsScreen } from '@/screens/BookDetailsScreen'
import type { Book, BookSettings, ReadingProgress } from '@/types/book'

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
})

describe('BookDetailsScreen voice settings', () => {
  beforeEach(() => {
    mocks.liveQueryIndex = 0
    mocks.progress = null
    mocks.updateBookSettings.mockReset()
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
