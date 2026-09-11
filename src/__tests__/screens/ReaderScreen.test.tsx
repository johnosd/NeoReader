import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { ReaderScreen } from '@/screens/ReaderScreen'
import type { Book } from '@/types/book'
import type { Highlight } from '@/types/highlight'
import type { TtsChunk, HighlightDraftPayload } from '@/components/reader/EpubViewer'
import type { TtsProvider } from '@/types/tts'
import { getBookSettings, updateBookSettings } from '@/db/bookSettings'
import { getSettings, updateReaderDefaults } from '@/db/settings'
import { translate } from '@/services/TranslationService'
import { addVocabItem } from '@/db/vocabulary'
import { deleteBook } from '@/db/books'
import { setReaderImmersiveMode, setSelectionMenuSuppressed } from '@/services/NativeSystemUiService'
import { addHighlight, updateHighlightAppearance } from '@/db/highlights'

type MockTtsOptions = {
  onFinished?: () => void
  onParagraphChange?: (paraIdx: number) => void
  onProviderFallback?: (payload: { provider: TtsProvider; fallbackProvider: 'native'; reason: string }) => void
}

const mocks = vi.hoisted(() => {
  const viewerHandle = {
    goTo: vi.fn(),
    getVisibleLocation: vi.fn(() => ({ cfi: null })),
    getSentenceChunks: vi.fn<() => TtsChunk[]>(),
    getFirstVisibleParagraphIndex: vi.fn(() => 0),
    resetTtsScroll: vi.fn(),
    highlightTts: vi.fn(),
    scrollToParagraph: vi.fn(),
    clearTts: vi.fn(),
    goToNextTtsSection: vi.fn(() => false),
    showTranslationLoading: vi.fn(),
    injectTranslation: vi.fn(),
    showWordLensDefinitionLoading: vi.fn(),
    injectWordLensDefinition: vi.fn(),
    injectWordLensDefinitionError: vi.fn(),
  }

  return {
    viewerHandle,
    epubViewerProps: null as Record<string, unknown> | null,
    tocDrawerProps: null as Record<string, unknown> | null,
    readerProgress: {
      savedCfi: null as string | null,
      savedProgress: null as {
        sectionHref?: string
        sectionLabel?: string
      } | null,
      initialLoadDone: true,
      saveProgress: vi.fn(),
      flushProgress: vi.fn().mockResolvedValue(undefined),
    },
    readerStore: {
      cfi: '',
      percentage: 0,
      chapterPercentage: null as number | null,
      toc: [],
      tocLabel: '',
      setCfi: vi.fn(),
      setToc: vi.fn(),
      reset: vi.fn(),
    },
    ttsOptions: null as MockTtsOptions | null,
    // Mock posicional do useLiveQuery (ver vi.mock('dexie-react-hooks') abaixo):
    // só `bookmarks` (1ª chamada em ReaderScreen.tsx) é controlável por teste;
    // vocabWords/highlights (2ª/3ª) ficam sempre [].
    bookmarks: [] as Array<{ id: number; syncedAt: Date | null }>,
    liveQueryIndex: 0,
    scheduleBookmarkDriveSync: vi.fn(),
    getCachedBookmarkDriveSyncStatus: vi.fn(() => ({ code: 'connected' as string })),
    isNativePlatform: vi.fn(() => false),
    updateHighlightNote: vi.fn(),
    setReaderImmersiveMode: vi.fn().mockResolvedValue(undefined),
  setSelectionMenuSuppressed: vi.fn().mockResolvedValue(undefined),
    loadWordLensData: vi.fn().mockResolvedValue(null),
    loadWordLensDefinition: vi.fn().mockResolvedValue(null),
    ttsPlaybackSessionService: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      updateMetadata: vi.fn().mockResolvedValue(undefined),
      updatePlaybackState: vi.fn().mockResolvedValue(undefined),
      onPlaybackControl: vi.fn((handler: (event: { action: string }) => void) => {
        mocks.capacitorListeners.playbackControl = handler
        return vi.fn()
      }),
      onAudioFocusChange: vi.fn((handler: (event: { type: string }) => void) => {
        mocks.capacitorListeners.audioFocusChange = handler
        return vi.fn()
      }),
    },
    tts: {
      isPlaying: false,
      isPaused: false,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(true),
      stop: vi.fn().mockResolvedValue(undefined),
      speakOne: vi.fn().mockResolvedValue(undefined),
      lastChunkIdx: { current: 0 },
      resetPosition: vi.fn(),
      handleAudioFocusChange: vi.fn(),
    },
    capacitorListeners: {
      backButton: null as ((event?: unknown) => void) | null,
      appStateChange: null as ((state: { isActive: boolean }) => void) | null,
      playbackControl: null as ((event: { action: string }) => void) | null,
      audioFocusChange: null as ((event: { type: string }) => void) | null,
    },
  }
})

vi.mock('dexie-react-hooks', () => ({
  // Mock posicional: a ordem espelha os useLiveQuery em ReaderScreen.tsx
  // (bookmarks, vocabWords, highlights). Mexeu na ordem lá, mexe aqui.
  useLiveQuery: vi.fn(() => {
    const values = [mocks.bookmarks, [], []]
    const value = values[mocks.liveQueryIndex % values.length]
    mocks.liveQueryIndex += 1
    return value
  }),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (eventName: 'backButton' | 'appStateChange', handler: (payload: unknown) => void) => {
      if (eventName === 'backButton') {
        mocks.capacitorListeners.backButton = handler
      } else {
        mocks.capacitorListeners.appStateChange = handler as (state: { isActive: boolean }) => void
      }

      return {
        remove: vi.fn(),
      }
    }),
  },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  registerPlugin: vi.fn(() => ({})),
  WebPlugin: class {},
}))

vi.mock('@/hooks/useReaderProgress', () => ({
  useReaderProgress: vi.fn(() => mocks.readerProgress),
}))

vi.mock('@/store/readerStore', () => ({
  useReaderStore: vi.fn(() => mocks.readerStore),
}))

vi.mock('@/hooks/useTTS', () => ({
  useTTS: vi.fn((options: MockTtsOptions) => {
    mocks.ttsOptions = options
    return mocks.tts
  }),
}))

vi.mock('@/db/books', () => ({
  deleteBook: vi.fn(),
  updateLastOpened: vi.fn(),
}))

vi.mock('@/db/bookmarks', () => ({
  addBookmark: vi.fn(),
  restoreBookmark: vi.fn(),
  softDeleteBookmark: vi.fn(),
  updateBookmarkColor: vi.fn(),
}))

vi.mock('@/db/highlights', () => ({
  addHighlight: vi.fn(),
  deleteHighlight: vi.fn(),
  getHighlightsByBookId: vi.fn(async () => []),
  updateHighlightAppearance: vi.fn(),
  updateHighlightNote: mocks.updateHighlightNote,
}))

vi.mock('@/db/vocabulary', () => ({
  addVocabItem: vi.fn(),
}))

vi.mock('@/db/settings', () => ({
  getSettings: vi.fn(async () => ({
    appSettings: {
      speechifyApiKey: '',
      elevenLabsApiKey: '',
      fishAudioApiKey: '',
      translationTargetLang: 'pt-BR',
    },
    readerDefaults: {
      defaultFontSize: 'md',
      lineHeight: 'comfortable',
      readerTheme: 'dark',
      fontFamily: 'classic',
      overrideBookFont: true,
      overrideBookColors: true,
      wordLensEnabled: true,
      wordLensLevel: 'B1',
      lastHighlightColor: 'indigo',
      lastHighlightStyle: 'background',
    },
    updatedAt: new Date(),
  })),
  updateReaderDefaults: vi.fn(),
}))

vi.mock('@/db/bookSettings', () => ({
  getBookSettings: vi.fn(async () => ({})),
  updateBookSettings: vi.fn(),
}))

vi.mock('@/db/database', () => ({
  db: {
    bookmarks: {
      where: vi.fn(),
    },
  },
}))

vi.mock('@/services/SpeechifyService', () => ({
  SpeechifyService: {
    isConfigured: vi.fn(async () => false),
  },
}))

vi.mock('@/services/TranslationService', () => ({
  translate: vi.fn(async () => ({ translatedText: 'Texto traduzido', provider: 'mymemory' })),
}))

vi.mock('@/services/BookmarkDriveSyncService', () => ({
  scheduleBookmarkDriveSync: mocks.scheduleBookmarkDriveSync,
}))

vi.mock('@/services/BookmarkDriveSyncStatus', () => ({
  getCachedBookmarkDriveSyncStatus: mocks.getCachedBookmarkDriveSyncStatus,
}))

vi.mock('@/services/NativeSystemUiService', () => ({
  setReaderImmersiveMode: mocks.setReaderImmersiveMode,
  setSelectionMenuSuppressed: mocks.setSelectionMenuSuppressed,
}))

vi.mock('@/services/TtsPlaybackSessionService', () => ({
  TtsPlaybackSessionService: mocks.ttsPlaybackSessionService,
}))

vi.mock('@/db/bookCovers', () => ({
  getBookCover: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/WordLensDataService', () => ({
  loadWordLensData: mocks.loadWordLensData,
  loadWordLensDefinition: mocks.loadWordLensDefinition,
}))

vi.mock('@/services/EpubService', () => ({
  EpubService: {
    parseExtras: vi.fn(async () => ({
      description: null,
      language: 'fr',
      toc: [],
    })),
  },
}))

vi.mock('@/components/reader/EpubViewer', async () => {
  const React = await import('react')

  const EpubViewer = React.forwardRef((props: Record<string, unknown>, ref) => {
    React.useEffect(() => {
      mocks.epubViewerProps = props
    }, [props])
    React.useImperativeHandle(ref, () => mocks.viewerHandle)
    return <div data-testid="epub-viewer" />
  })

  return { EpubViewer }
})

vi.mock('@/components/reader/ReaderChrome', () => ({
  ReaderChrome: ({ onTtsToggle, onBack }: { onTtsToggle: () => void; onBack: () => void }) => (
    <>
      <button type="button" onClick={onTtsToggle}>
        toggle-tts
      </button>
      <button type="button" onClick={onBack}>
        go-back
      </button>
    </>
  ),
}))

vi.mock('@/components/reader/TtsMiniPlayer', () => ({
  TtsMiniPlayer: ({
    activeProvider,
    fallbackFromProvider,
    providerAvailability,
    ttsRate,
    bottomOffsetPx,
    onPrevParagraph,
    onPrevSentence,
    onNextSentence,
    onNextParagraph,
    onProviderChange,
    onRateChange,
    showBackToTtsLocation,
    onBackToTtsLocation,
    onStop,
  }: {
    activeProvider: TtsProvider
    fallbackFromProvider?: TtsProvider | null
    providerAvailability: Record<TtsProvider, boolean>
    ttsRate: number
    bottomOffsetPx?: number
    onPrevParagraph: () => void
    onPrevSentence: () => void
    onNextSentence: () => void
    onNextParagraph: () => void
    onProviderChange: (provider: TtsProvider) => void
    onRateChange: (rate: number) => void
    showBackToTtsLocation: boolean
    onBackToTtsLocation: () => void
    onStop: () => void
  }) => (
    <div data-testid="tts-mini-player">
      <span>{`provider:${activeProvider}`}</span>
      <span>{fallbackFromProvider ? `fallback:${fallbackFromProvider}` : 'fallback:none'}</span>
      <span>{`rate:${ttsRate.toFixed(1)}`}</span>
      <span>{`offset:${bottomOffsetPx ?? 0}`}</span>
      <span>{providerAvailability.speechify ? 'speechify:enabled' : 'speechify:disabled'}</span>
      <span>{providerAvailability.elevenlabs ? 'elevenlabs:enabled' : 'elevenlabs:disabled'}</span>
      {showBackToTtsLocation && (
        <button type="button" onClick={onBackToTtsLocation}>back-to-tts</button>
      )}
      <button type="button" onClick={onPrevParagraph}>prev</button>
      <button type="button" onClick={onPrevSentence}>prev-sentence</button>
      <button type="button" onClick={onNextSentence}>next-sentence</button>
      <button type="button" onClick={onNextParagraph}>next</button>
      <button type="button" onClick={() => onProviderChange('native')}>provider-native</button>
      <button type="button" onClick={() => onProviderChange('speechify')}>provider-speechify</button>
      <button type="button" onClick={() => onProviderChange('elevenlabs')}>provider-elevenlabs</button>
      <button type="button" onClick={() => onRateChange(1.1)}>speed-1.1</button>
      <button type="button" onClick={onStop}>stop</button>
    </div>
  ),
}))

vi.mock('@/components/reader/TocDrawer', () => ({
  TocDrawer: (props: Record<string, unknown>) => {
    mocks.tocDrawerProps = props
    return null
  },
}))

vi.mock('@/components/reader/BookmarkSheet', () => ({
  BookmarkSheet: () => null,
}))

const book: Book = {
  id: 1,
  title: 'Reader Test',
  author: 'Test Author',
  fileBlob: new Blob(['epub'], { type: 'application/epub+zip' }),
  addedAt: new Date(),
  lastOpenedAt: null,
}

function makeSettings(overrides: Partial<Awaited<ReturnType<typeof getSettings>>> = {}) {
  return {
    appSettings: {
      speechifyApiKey: '',
      elevenLabsApiKey: '',
      fishAudioApiKey: '',
      translationTargetLang: 'pt-BR',
    },
    readerDefaults: {
      defaultFontSize: 'md' as const,
      lineHeight: 'comfortable' as const,
      readerTheme: 'dark' as const,
      fontFamily: 'classic' as const,
      overrideBookFont: true,
      overrideBookColors: true,
      wordLensEnabled: true,
      wordLensLevel: 'B1' as const,
    },
    updatedAt: new Date(),
    ...overrides,
  }
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('ReaderScreen', () => {
  beforeEach(() => {
    mocks.epubViewerProps = null
    mocks.tocDrawerProps = null
    mocks.bookmarks = []
    mocks.liveQueryIndex = 0
    mocks.scheduleBookmarkDriveSync.mockClear()
    mocks.getCachedBookmarkDriveSyncStatus.mockClear()
    mocks.getCachedBookmarkDriveSyncStatus.mockReturnValue({ code: 'connected' })
    mocks.isNativePlatform.mockReset()
    mocks.isNativePlatform.mockReturnValue(false)
    mocks.updateHighlightNote.mockClear()
    vi.mocked(addHighlight).mockReset()
    mocks.capacitorListeners.backButton = null
    mocks.capacitorListeners.appStateChange = null
    mocks.capacitorListeners.playbackControl = null
    mocks.capacitorListeners.audioFocusChange = null
    mocks.ttsPlaybackSessionService.start.mockClear()
    mocks.ttsPlaybackSessionService.stop.mockClear()
    mocks.ttsPlaybackSessionService.updateMetadata.mockClear()
    mocks.ttsPlaybackSessionService.updatePlaybackState.mockClear()
    mocks.ttsPlaybackSessionService.onPlaybackControl.mockClear()
    mocks.ttsPlaybackSessionService.onAudioFocusChange.mockClear()
    mocks.readerProgress.savedCfi = null
    mocks.readerProgress.savedProgress = null
    mocks.readerProgress.initialLoadDone = true
    mocks.readerStore.percentage = 0
    mocks.readerStore.chapterPercentage = null
    mocks.readerStore.toc = []
    mocks.readerStore.tocLabel = ''
    mocks.setReaderImmersiveMode.mockClear()
    mocks.setSelectionMenuSuppressed.mockClear()
    mocks.loadWordLensData.mockClear()
    mocks.loadWordLensData.mockResolvedValue(null)
    mocks.loadWordLensDefinition.mockClear()
    mocks.loadWordLensDefinition.mockResolvedValue(null)
    mocks.readerProgress.saveProgress.mockClear()
    mocks.readerProgress.flushProgress.mockClear()
    mocks.readerStore.setCfi.mockClear()
    mocks.readerStore.setToc.mockClear()
    mocks.readerStore.reset.mockClear()
    mocks.tts.isPlaying = false
    mocks.tts.isPaused = false
    mocks.tts.play.mockClear()
    mocks.tts.pause.mockClear()
    mocks.tts.resume.mockClear()
    mocks.tts.resume.mockResolvedValue(true)
    mocks.tts.stop.mockClear()
    mocks.tts.speakOne.mockClear()
    mocks.tts.handleAudioFocusChange.mockClear()
    mocks.tts.resetPosition.mockClear()
    mocks.tts.lastChunkIdx.current = 0
    mocks.ttsOptions = null
    mocks.viewerHandle.goTo.mockClear()
    mocks.viewerHandle.getVisibleLocation.mockClear()
    mocks.viewerHandle.goToNextTtsSection.mockReset()
    mocks.viewerHandle.goToNextTtsSection.mockReturnValue(false)
    mocks.viewerHandle.getSentenceChunks.mockReset()
    mocks.viewerHandle.getSentenceChunks.mockReturnValue([])
    mocks.viewerHandle.getFirstVisibleParagraphIndex.mockReturnValue(0)
    mocks.viewerHandle.resetTtsScroll.mockClear()
    mocks.viewerHandle.scrollToParagraph.mockClear()
    mocks.viewerHandle.showWordLensDefinitionLoading.mockClear()
    mocks.viewerHandle.injectWordLensDefinition.mockClear()
    mocks.viewerHandle.injectWordLensDefinitionError.mockClear()
    vi.mocked(translate).mockClear()
    vi.mocked(addVocabItem).mockClear()
    vi.mocked(deleteBook).mockReset()
    vi.mocked(deleteBook).mockResolvedValue(undefined)
    vi.mocked(updateBookSettings).mockClear()
    vi.mocked(getSettings).mockResolvedValue(makeSettings())
    vi.mocked(getBookSettings).mockResolvedValue({})
  })

  it('bloqueia o reader e permite remover livro marcado como arquivo ausente', async () => {
    const onBack = vi.fn()

    render(
      <ReaderScreen
        book={{ ...book, missingFile: true }}
        onBack={onBack}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    expect(screen.queryByTestId('epub-viewer')).toBeNull()
    expect(screen.queryByTestId('reader-loading')).toBeNull()
    expect(screen.getByText('Arquivo nao encontrado')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('Remover da biblioteca'))
    })

    expect(deleteBook).toHaveBeenCalledWith(1)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('ao fechar o livro, sincroniza bookmarks pendentes automaticamente', async () => {
    mocks.bookmarks = [{ id: 1, syncedAt: null }]
    const onBack = vi.fn()

    render(
      <ReaderScreen
        book={book}
        onBack={onBack}
        onOpenVocabulary={vi.fn()}
      />,
    )
    await flushAsyncWork()

    await act(async () => {
      fireEvent.click(screen.getByText('go-back'))
    })

    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(1)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('ao fechar o livro com bookmark pendente e status permission-error, avisa em vez de tentar sincronizar', async () => {
    mocks.bookmarks = [{ id: 1, syncedAt: null }]
    mocks.getCachedBookmarkDriveSyncStatus.mockReturnValue({ code: 'permission-error' })
    const onBack = vi.fn()
    const onBookmarkSyncBlocked = vi.fn()

    render(
      <ReaderScreen
        book={book}
        onBack={onBack}
        onOpenVocabulary={vi.fn()}
        onBookmarkSyncBlocked={onBookmarkSyncBlocked}
      />,
    )
    await flushAsyncWork()

    await act(async () => {
      fireEvent.click(screen.getByText('go-back'))
    })

    expect(mocks.scheduleBookmarkDriveSync).not.toHaveBeenCalled()
    expect(onBookmarkSyncBlocked).toHaveBeenCalledWith(expect.any(String))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('ao fechar o livro, nao sincroniza se todos os bookmarks ja estao sincronizados', async () => {
    mocks.bookmarks = [{ id: 1, syncedAt: new Date() }]
    const onBack = vi.fn()

    render(
      <ReaderScreen
        book={book}
        onBack={onBack}
        onOpenVocabulary={vi.fn()}
      />,
    )
    await flushAsyncWork()

    await act(async () => {
      fireEvent.click(screen.getByText('go-back'))
    })

    expect(mocks.scheduleBookmarkDriveSync).not.toHaveBeenCalled()
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('ao fechar o livro sem nenhum bookmark, nao tenta sincronizar', async () => {
    mocks.bookmarks = []
    const onBack = vi.fn()

    render(
      <ReaderScreen
        book={book}
        onBack={onBack}
        onOpenVocabulary={vi.fn()}
      />,
    )
    await flushAsyncWork()

    await act(async () => {
      fireEvent.click(screen.getByText('go-back'))
    })

    expect(mocks.scheduleBookmarkDriveSync).not.toHaveBeenCalled()
    expect(onBack).toHaveBeenCalledOnce()
  })

  function makeTestHighlight(overrides: Partial<Highlight> = {}): Highlight {
    return {
      id: 9,
      bookId: 1,
      cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)',
      paraCfi: 'epubcfi(/6/8!/4/2/10/2:0)',
      text: 'texto selecionado',
      color: 'indigo',
      sectionIndex: 0,
      percentage: 10,
      createdAt: new Date('2026-09-06T00:00:00Z'),
      ...overrides,
    }
  }

  it('T016: onEditHighlight abre a caixa unificada pre-preenchida com cor/estilo/nota atuais, sem nota', async () => {
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await act(async () => {
      (mocks.epubViewerProps?.onEditHighlight as (h: Highlight) => void)(makeTestHighlight({ color: 'rose', style: 'underline' }))
    })

    expect(screen.getByLabelText('Cor Rosa').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Sublinhado').getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByPlaceholderText('Escreva sua anotacao...') as HTMLTextAreaElement).value).toBe('')
  })

  it('T016b: onEditHighlight com nota existente pre-preenche o campo de texto', async () => {
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await act(async () => {
      (mocks.epubViewerProps?.onEditHighlight as (h: Highlight) => void)(makeTestHighlight({ note: 'Reflexao existente' }))
    })

    expect((screen.getByPlaceholderText('Escreva sua anotacao...') as HTMLTextAreaElement).value).toBe('Reflexao existente')
  })

  it('T017: confirmar a edicao chama updateHighlightAppearance E updateHighlightNote com o id do highlight certo', async () => {
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await act(async () => {
      (mocks.epubViewerProps?.onEditHighlight as (h: Highlight) => void)(makeTestHighlight({ id: 9, color: 'indigo', style: 'background' }))
    })

    fireEvent.click(screen.getByLabelText('Cor Rosa'))
    fireEvent.click(screen.getByLabelText('Sublinhado'))
    await confirmComposer('Nova reflexao')

    expect(mocks.updateHighlightNote).toHaveBeenCalledWith(9, 'Nova reflexao')
    expect(updateHighlightAppearance).toHaveBeenCalledWith(9, { color: 'rose', style: 'underline' })
  })

  it('T018: cancelar a edicao nao chama updateHighlightNote nem updateHighlightAppearance', async () => {
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await act(async () => {
      (mocks.epubViewerProps?.onEditHighlight as (h: Highlight) => void)(makeTestHighlight())
    })

    fireEvent.click(screen.getByLabelText('Cor Rosa'))
    const textarea = screen.getByPlaceholderText('Escreva sua anotacao...')
    const dialog = textarea.closest('[role="dialog"]') as HTMLElement
    fireEvent.change(textarea, { target: { value: 'Rascunho descartado' } })
    fireEvent.click(within(dialog).getByText('Cancelar'))

    expect(mocks.updateHighlightNote).not.toHaveBeenCalled()
    expect(updateHighlightAppearance).not.toHaveBeenCalled()
  })

  function makeDraftPayload(overrides: Partial<HighlightDraftPayload> = {}): HighlightDraftPayload {
    return {
      cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)',
      paraCfi: 'epubcfi(/6/8!/4/2/10/2:0)',
      text: 'texto selecionado',
      sectionIndex: 0,
      percentage: 10,
      ...overrides,
    }
  }

  // "Destacar" (feature 016) so abre a caixa unificada — nao cria nada
  // sozinho. Precisa confirmar (Salvar) pra virar um highlight de verdade.
  async function openComposerForCreation(overrides: Partial<HighlightDraftPayload> = {}) {
    await act(async () => {
      (mocks.epubViewerProps?.onRequestCreateHighlight as (d: HighlightDraftPayload) => void)(makeDraftPayload(overrides))
    })
  }

  // handleSaveHighlightComposer e assincrono (await addHighlight/updateHighlightAppearance) —
  // precisa dar tempo do microtask rodar antes de checar os mocks.
  async function confirmComposer(note?: string) {
    if (note !== undefined) {
      fireEvent.change(screen.getByPlaceholderText('Escreva sua anotacao...'), { target: { value: note } })
    }
    const textarea = screen.getByPlaceholderText('Escreva sua anotacao...')
    const dialog = textarea.closest('[role="dialog"]') as HTMLElement
    fireEvent.click(within(dialog).getByText('Salvar'))
    await flushAsyncWork()
  }

  it('T006: onRequestCreateHighlight abre a caixa unificada com a cor/estilo default vindos de getSettings', async () => {
    // ReaderScreen faz 2 chamadas a getSettings() no mount (useReaderAppearance
    // + o efeito novo de lastHighlightColor/Style) — mockResolvedValueOnce
    // encadeado 2x cobre as duas, sem vazar pros testes seguintes (diferente
    // de mockResolvedValue, que persistiria).
    const customSettings = {
      appSettings: { speechifyApiKey: '', elevenLabsApiKey: '', fishAudioApiKey: '', translationTargetLang: 'pt-BR' } as never,
      readerDefaults: {
        defaultFontSize: 'md', lineHeight: 'comfortable', readerTheme: 'dark', fontFamily: 'classic',
        overrideBookFont: true, overrideBookColors: true, wordLensEnabled: true, wordLensLevel: 'B1',
        lastHighlightColor: 'rose', lastHighlightStyle: 'underline',
      } as never,
      updatedAt: new Date(),
    }
    vi.mocked(getSettings).mockResolvedValueOnce(customSettings).mockResolvedValueOnce(customSettings)
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await openComposerForCreation()

    expect(screen.getByLabelText('Cor Rosa').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Sublinhado').getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByPlaceholderText('Escreva sua anotacao...') as HTMLTextAreaElement).value).toBe('')
  })

  it('T008: cancelar a caixa em modo criacao nao chama addHighlight', async () => {
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await openComposerForCreation()
    const textarea = screen.getByPlaceholderText('Escreva sua anotacao...')
    const dialog = textarea.closest('[role="dialog"]') as HTMLElement
    fireEvent.click(within(dialog).getByText('Cancelar'))

    expect(addHighlight).not.toHaveBeenCalled()
  })

  it('T007: confirmar a caixa em modo criacao chama addHighlight e updateReaderDefaults com a cor/estilo escolhidos', async () => {
    vi.mocked(addHighlight).mockResolvedValueOnce(101)
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await openComposerForCreation()
    fireEvent.click(screen.getByLabelText('Cor Rosa'))
    fireEvent.click(screen.getByLabelText('Sublinhado'))
    await confirmComposer()

    expect(addHighlight).toHaveBeenCalledWith(expect.objectContaining({
      cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)',
      color: 'rose',
      style: 'underline',
    }))
    expect(updateReaderDefaults).toHaveBeenCalledWith({ lastHighlightColor: 'rose', lastHighlightStyle: 'underline' })
  })

  it('criar um highlight sem nota mostra o toast de atalho pra anotar (feature 015, FR-006)', async () => {
    vi.mocked(addHighlight).mockResolvedValueOnce(101)
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await openComposerForCreation()
    await confirmComposer()

    expect(screen.getByText('Highlight criado. Toque para anotar.')).toBeTruthy()
  })

  it('criar um highlight JA com nota na caixa NAO mostra o toast (FR-006)', async () => {
    vi.mocked(addHighlight).mockResolvedValueOnce(101)
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await openComposerForCreation()
    await confirmComposer('Ja anotado na hora')

    expect(addHighlight).toHaveBeenCalledWith(expect.objectContaining({ note: 'Ja anotado na hora' }))
    expect(screen.queryByText('Highlight criado. Toque para anotar.')).toBeNull()
  })

  it('tocar no toast abre a caixa em modo edicao, vazia, associada ao highlight recem-criado', async () => {
    vi.mocked(addHighlight).mockResolvedValueOnce(101)
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await openComposerForCreation()
    await confirmComposer()

    fireEvent.click(screen.getByText('Highlight criado. Toque para anotar.'))

    expect((screen.getByPlaceholderText('Escreva sua anotacao...') as HTMLTextAreaElement).value).toBe('')
    // Toast some ao abrir a caixa
    expect(screen.queryByText('Highlight criado. Toque para anotar.')).toBeNull()
  })

  it('salvar a partir do toast chama updateHighlightNote com o id do highlight recem-criado', async () => {
    vi.mocked(addHighlight).mockResolvedValueOnce(202)
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await openComposerForCreation()
    await confirmComposer()

    fireEvent.click(screen.getByText('Highlight criado. Toque para anotar.'))
    await confirmComposer('Anotado pelo atalho')

    expect(mocks.updateHighlightNote).toHaveBeenCalledWith(202, 'Anotado pelo atalho')
  })

  it('cancelar a partir do toast nao chama updateHighlightNote (identico ao fluxo de menu, FR-007)', async () => {
    vi.mocked(addHighlight).mockResolvedValueOnce(101)
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await openComposerForCreation()
    await confirmComposer()

    fireEvent.click(screen.getByText('Highlight criado. Toque para anotar.'))
    const textarea = screen.getByPlaceholderText('Escreva sua anotacao...')
    const dialog = textarea.closest('[role="dialog"]') as HTMLElement
    fireEvent.change(textarea, { target: { value: 'Rascunho descartado' } })
    fireEvent.click(within(dialog).getByText('Cancelar'))

    expect(mocks.updateHighlightNote).not.toHaveBeenCalled()
  })

  it('criar um segundo highlight substitui o toast do primeiro (FR-005, nunca dois ao mesmo tempo)', async () => {
    vi.mocked(addHighlight).mockResolvedValueOnce(101).mockResolvedValueOnce(202)
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await openComposerForCreation({ text: 'primeiro trecho' })
    await confirmComposer()
    await openComposerForCreation({ text: 'segundo trecho' })
    await confirmComposer()

    expect(screen.getAllByText('Highlight criado. Toque para anotar.')).toHaveLength(1)

    fireEvent.click(screen.getByText('Highlight criado. Toque para anotar.'))
    await confirmComposer('nota do mais recente')

    expect(mocks.updateHighlightNote).toHaveBeenCalledWith(202, 'nota do mais recente')
  })

  it('abrir a caixa pelo menu de gerenciamento (fluxo ja existente) some com o toast pendente', async () => {
    vi.mocked(addHighlight).mockResolvedValueOnce(101)
    render(<ReaderScreen book={book} onBack={vi.fn()} onOpenVocabulary={vi.fn()} />)
    await flushAsyncWork()

    await openComposerForCreation()
    await confirmComposer()
    expect(screen.getByText('Highlight criado. Toque para anotar.')).toBeTruthy()

    await act(async () => {
      (mocks.epubViewerProps?.onEditHighlight as (h: Highlight) => void)(makeTestHighlight({ id: 9 }))
    })

    expect(screen.queryByText('Highlight criado. Toque para anotar.')).toBeNull()
    expect((screen.getByPlaceholderText('Escreva sua anotacao...') as HTMLTextAreaElement).value).toBe('')
  })

  it('carrega Word Lens somente depois que o viewer fica interativo', async () => {
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )
    await flushAsyncWork()

    expect(mocks.epubViewerProps).not.toBeNull()
    expect(mocks.loadWordLensData).not.toHaveBeenCalled()

    await act(async () => {
      ;(mocks.epubViewerProps?.onLoad as () => void)()
      await Promise.resolve()
    })

    expect(mocks.loadWordLensData).toHaveBeenCalledWith({
      enabled: true,
      language: 'fr',
      userLevel: 'B1',
    })
    expect(mocks.epubViewerProps?.wordLensEnabled).toBe(true)
    expect(mocks.epubViewerProps?.wordLensLevel).toBe('B1')
    expect(mocks.epubViewerProps?.wordLensData).toBeNull()
  })

  it('carrega definicao offline sob demanda e atualiza somente a selecao recebida', async () => {
    const wordLensData = {
      levels: { ubiquitous: 5 as const },
      lemmas: {},
      packVersion: 'test',
      dictionaryPath: 'dictionary',
      dictionaryPartitions: ['ub'],
    }
    const entry = {
      partsOfSpeech: ['adjective'],
      senses: [{
        partOfSpeech: 'adjective',
        definition: 'being present everywhere at once',
        examples: [],
        synonyms: ['omnipresent'],
      }],
    }
    mocks.loadWordLensData.mockResolvedValueOnce(wordLensData)
    mocks.loadWordLensDefinition.mockResolvedValueOnce(entry)
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )
    await flushAsyncWork()
    await act(async () => {
      ;(mocks.epubViewerProps?.onLoad as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })
    const target = {
      selectionId: 'selection-1',
      surface: 'ubiquitous',
      lemma: 'ubiquitous',
      level: 'C1',
      offset: 2,
    }

    await act(async () => {
      ;(mocks.epubViewerProps?.onWordLensDefinition as (value: typeof target) => void)(target)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.viewerHandle.showWordLensDefinitionLoading).toHaveBeenCalledWith(target)
    expect(mocks.loadWordLensDefinition).toHaveBeenCalledWith('ubiquitous', wordLensData)
    expect(mocks.viewerHandle.injectWordLensDefinition).toHaveBeenCalledWith(target, entry)
    expect(mocks.viewerHandle.injectWordLensDefinitionError).not.toHaveBeenCalled()
  })

  it('usa o progresso salvo como marcador inicial do indice do leitor', async () => {
    mocks.readerProgress.savedCfi = 'epubcfi(/6/10!/4/2/1:0)'
    mocks.readerProgress.savedProgress = {
      sectionHref: 'chapter-2.xhtml',
      sectionLabel: 'Chapter 2',
    }

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    expect(mocks.tocDrawerProps?.currentHref).toBe('chapter-2.xhtml')
    expect(mocks.tocDrawerProps?.currentLabel).toBe('Chapter 2')
  })

  it('ativa modo imersivo nativo enquanto o leitor esta montado', async () => {
    const { unmount } = render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    expect(setReaderImmersiveMode).toHaveBeenCalledWith(true)

    unmount()

    expect(setReaderImmersiveMode).toHaveBeenCalledWith(false)
  })

  // T025 (US2): a supressão do menu de seleção do sistema é global à Activity,
  // então tem que acompanhar o ciclo de vida do leitor — se vazar, o menu do
  // sistema some em telas onde ele é legítimo (R-003).
  it('suprime o menu de selecao do sistema enquanto o leitor esta montado', async () => {
    const { unmount } = render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    expect(setSelectionMenuSuppressed).toHaveBeenCalledWith(true)
    expect(setSelectionMenuSuppressed).not.toHaveBeenCalledWith(false)

    unmount()

    expect(setSelectionMenuSuppressed).toHaveBeenCalledWith(false)
  })

  it('reaplica a supressao do menu de selecao quando o app volta para primeiro plano', async () => {
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()
    vi.mocked(setSelectionMenuSuppressed).mockClear()

    await act(async () => {
      mocks.capacitorListeners.appStateChange?.({ isActive: true })
      await Promise.resolve()
    })

    expect(setSelectionMenuSuppressed).toHaveBeenCalledWith(true)
  })

  it('reativa modo imersivo nativo quando o app volta para primeiro plano', async () => {
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()
    vi.mocked(setReaderImmersiveMode).mockClear()

    await act(async () => {
      mocks.capacitorListeners.appStateChange?.({ isActive: true })
      await Promise.resolve()
    })

    expect(setReaderImmersiveMode).toHaveBeenCalledWith(true)
  })

  it('nao pausa nem para o audiobook quando o app vai para segundo plano (US2)', async () => {
    mocks.viewerHandle.getSentenceChunks.mockReturnValue([
      { text: 'First paragraph.', paraIdx: 0, offsetInPara: 0 },
    ])

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    fireEvent.click(screen.getByText('toggle-tts'))
    mocks.tts.isPlaying = true
    mocks.readerProgress.flushProgress.mockClear()

    await act(async () => {
      mocks.capacitorListeners.appStateChange?.({ isActive: false })
      await Promise.resolve()
    })

    // Ir para segundo plano só salva o progresso — a narração deve seguir
    // tocando normalmente (o Service nativo é quem mantém isso vivo agora).
    expect(mocks.readerProgress.flushProgress).toHaveBeenCalled()
    expect(mocks.tts.stop).not.toHaveBeenCalled()
    expect(mocks.tts.pause).not.toHaveBeenCalled()
  })

  it('controle "pause" da notificacao pausa o audiobook (US3)', async () => {
    mocks.viewerHandle.getSentenceChunks.mockReturnValue([
      { text: 'First paragraph.', paraIdx: 0, offsetInPara: 0 },
    ])

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()
    fireEvent.click(screen.getByText('toggle-tts'))
    mocks.tts.isPlaying = true

    await act(async () => {
      mocks.capacitorListeners.playbackControl?.({ action: 'pause' })
      await Promise.resolve()
    })

    expect(mocks.tts.pause).toHaveBeenCalledTimes(1)
  })

  it('controle "play" da notificacao retoma o audiobook pausado (US3)', async () => {
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()
    mocks.tts.isPlaying = false
    mocks.tts.isPaused = true

    await act(async () => {
      mocks.capacitorListeners.playbackControl?.({ action: 'play' })
      await Promise.resolve()
    })

    expect(mocks.tts.resume).toHaveBeenCalledTimes(1)
  })

  it('controle "stop" da notificacao para o audiobook (US3)', async () => {
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    await act(async () => {
      mocks.capacitorListeners.playbackControl?.({ action: 'stop' })
      await Promise.resolve()
    })

    expect(mocks.tts.stop).toHaveBeenCalledTimes(1)
  })

  it('controles "skipNext"/"skipPrevious" da notificacao avancam/voltam de paragrafo (US3)', async () => {
    const chunks = [
      { text: 'First paragraph.', paraIdx: 0, offsetInPara: 0 },
      { text: 'Second paragraph.', paraIdx: 1, offsetInPara: 0 },
    ]
    mocks.viewerHandle.getSentenceChunks.mockReturnValue(chunks)

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()
    mocks.tts.lastChunkIdx.current = 0

    await act(async () => {
      mocks.capacitorListeners.playbackControl?.({ action: 'skipNext' })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.tts.stop).toHaveBeenCalledTimes(1)
    expect(mocks.tts.play).toHaveBeenLastCalledWith(chunks, 1)

    mocks.tts.lastChunkIdx.current = 1
    await act(async () => {
      mocks.capacitorListeners.playbackControl?.({ action: 'skipPrevious' })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.tts.stop).toHaveBeenCalledTimes(2)
    expect(mocks.tts.play).toHaveBeenLastCalledWith(chunks, 0)
  })

  it('atualiza a metadata nativa (titulo/capitulo) ao iniciar o audiobook (US3)', async () => {
    mocks.viewerHandle.getSentenceChunks.mockReturnValue([
      { text: 'First paragraph.', paraIdx: 0, offsetInPara: 0 },
    ])

    const { rerender } = render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()
    fireEvent.click(screen.getByText('toggle-tts'))
    // useTTS é mockado — simula a transição real de isPlaying pra false->true
    // que o hook de verdade faria dentro de play(), e força um rerender pra
    // o efeito que assina essa mudança rodar (mesmo padrão de outros testes aqui).
    mocks.tts.isPlaying = true
    rerender(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )
    await flushAsyncWork()

    expect(mocks.ttsPlaybackSessionService.updateMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ title: book.title }),
    )
  })

  it('repassa eventos de foco de audio pro useTTS (US4)', async () => {
    // A decisão de pausar/retomar (e o filtro "só pro provider nativo") mora
    // dentro de useTTS.ts::handleAudioFocusChange (testado em useTTS.test.tsx)
    // — o ReaderScreen só encaminha o evento, sem lógica própria.
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()
    mocks.tts.isPlaying = true

    await act(async () => {
      mocks.capacitorListeners.audioFocusChange?.({ type: 'lossTransient' })
      await Promise.resolve()
    })

    expect(mocks.tts.handleAudioFocusChange).toHaveBeenCalledWith('lossTransient')

    await act(async () => {
      mocks.capacitorListeners.audioFocusChange?.({ type: 'gain' })
      await Promise.resolve()
    })

    expect(mocks.tts.handleAudioFocusChange).toHaveBeenCalledWith('gain')

    await act(async () => {
      mocks.capacitorListeners.audioFocusChange?.({ type: 'loss' })
      await Promise.resolve()
    })

    expect(mocks.tts.handleAudioFocusChange).toHaveBeenCalledWith('loss')
  })

  it('mostra o footer fixo com capitulo atual e progresso do capitulo', async () => {
    mocks.readerStore.tocLabel = 'Chapter 7'
    mocks.readerStore.chapterPercentage = 64

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    expect(screen.getByTestId('reader-progress-footer')).toBeTruthy()
    expect(screen.getByText('Chapter 7')).toBeTruthy()
    expect(screen.getByText('Cap. 64%')).toBeTruthy()
  })

  it('usa o capitulo pai no footer quando o toc atual aponta para um subcapitulo', async () => {
    mocks.readerStore.toc = [
      {
        label: 'Part I',
        href: 'Text/chapter.xhtml#part',
        subitems: [
          { label: 'Chapter 1', href: 'Text/chapter.xhtml#chapter-1' },
          { label: 'Chapter 2', href: 'Text/chapter.xhtml#chapter-2' },
        ],
      },
    ]
    mocks.readerStore.tocLabel = 'Chapter 2'
    mocks.readerStore.chapterPercentage = 64
    mocks.readerProgress.savedProgress = {
      sectionHref: 'Text/chapter.xhtml',
      sectionLabel: 'Chapter 2',
    }

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    expect(screen.getByText('Part I')).toBeTruthy()
    expect(screen.queryByText('Chapter 2')).toBeNull()
    expect(screen.getByText('Cap. 64%')).toBeTruthy()
  })

  it('abre e fecha a visualizacao de imagem enviada pelo EpubViewer', async () => {
    const imageSrc = 'blob:reader-image-test'
    const imageAlt = 'Mapa do capitulo'

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    expect(typeof mocks.epubViewerProps?.onOpenImage).toBe('function')

    await act(async () => {
      ;(mocks.epubViewerProps?.onOpenImage as (payload: { src: string; alt?: string }) => void)({
        src: imageSrc,
        alt: imageAlt,
      })
    })

    expect(screen.getByRole('dialog', { name: 'Imagem do leitor' })).toBeTruthy()
    expect(screen.getByRole('img', { name: imageAlt })).toBeTruthy()
    expect(screen.getByLabelText('Fechar')).toBeTruthy()
    expect(document.querySelector(`img[src="${imageSrc}"]`)).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Fechar'))

    expect(document.querySelector(`img[src="${imageSrc}"]`)).toBeNull()
  })

  it('fecha a visualizacao de imagem pelo Back do Android antes de sair do leitor', async () => {
    const imageSrc = 'blob:reader-image-test'
    const onBack = vi.fn()

    render(
      <ReaderScreen
        book={book}
        onBack={onBack}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    await act(async () => {
      ;(mocks.epubViewerProps?.onOpenImage as (payload: { src: string }) => void)({ src: imageSrc })
    })

    expect(document.querySelector(`img[src="${imageSrc}"]`)).toBeTruthy()

    await act(async () => {
      mocks.capacitorListeners.backButton?.()
    })

    expect(document.querySelector(`img[src="${imageSrc}"]`)).toBeNull()
    expect(onBack).not.toHaveBeenCalled()
  })

  it('abrir a visualizacao de imagem nao salva progresso nem troca a localizacao do leitor', async () => {
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    const viewerNode = screen.getByTestId('epub-viewer')
    mocks.readerProgress.saveProgress.mockClear()
    mocks.readerProgress.flushProgress.mockClear()
    mocks.readerStore.setCfi.mockClear()
    mocks.readerStore.setToc.mockClear()
    mocks.viewerHandle.getVisibleLocation.mockClear()

    await act(async () => {
      ;(mocks.epubViewerProps?.onOpenImage as (payload: { src: string }) => void)({
        src: 'blob:reader-image-test',
      })
    })

    expect(screen.getByTestId('epub-viewer')).toBe(viewerNode)
    expect(mocks.readerProgress.saveProgress).not.toHaveBeenCalled()
    expect(mocks.readerProgress.flushProgress).not.toHaveBeenCalled()
    expect(mocks.readerStore.setCfi).not.toHaveBeenCalled()
    expect(mocks.readerStore.setToc).not.toHaveBeenCalled()
    expect(mocks.viewerHandle.getVisibleLocation).not.toHaveBeenCalled()
  })

  it('ignora o progresso salvo ate concluir a navegacao inicial por startHref', async () => {
    mocks.readerProgress.savedCfi = 'epubcfi(/6/8!/4/2/1:0)'

    render(
      <ReaderScreen
        book={book}
        startHref="chapter-2.xhtml#frag"
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    expect(mocks.epubViewerProps).not.toBeNull()
    expect(mocks.epubViewerProps?.savedCfi).toBeNull()
    expect(screen.getByTestId('reader-loading')).toBeTruthy()

    await act(async () => {
      ;(mocks.epubViewerProps?.onRelocate as (payload: unknown) => void)({
        cfi: 'epubcfi(/6/8!/4/2/1:0)',
        percentage: 5,
        tocLabel: 'Chapter 1',
        sectionHref: 'chapter-1.xhtml',
        fraction: 0.05,
        sectionIndex: 0,
      })
    })

    expect(mocks.readerStore.setCfi).not.toHaveBeenCalled()
    expect(mocks.readerProgress.saveProgress).not.toHaveBeenCalled()
    expect(screen.getByTestId('reader-loading')).toBeTruthy()

    await act(async () => {
      ;(mocks.epubViewerProps?.onLoad as () => void)()
    })

    // EpubViewer já navegou via initialTarget; onLoad apenas seta a flag, não chama goTo novamente
    expect(mocks.viewerHandle.goTo).not.toHaveBeenCalled()
    expect(screen.queryByTestId('reader-loading')).toBeNull()

    await act(async () => {
      ;(mocks.epubViewerProps?.onRelocate as (payload: unknown) => void)({
        cfi: 'epubcfi(/6/8!/4/2/1:0)',
        percentage: 8,
        tocLabel: 'Chapter 1',
        sectionHref: 'chapter-1.xhtml',
        fraction: 0.08,
        sectionIndex: 0,
      })
    })

    expect(mocks.readerStore.setCfi).not.toHaveBeenCalled()
    expect(mocks.readerProgress.saveProgress).not.toHaveBeenCalled()

    await act(async () => {
      ;(mocks.epubViewerProps?.onSectionReady as (sectionIndex: number, sectionHref?: string) => void)(0, 'chapter-1.xhtml')
    })

    expect(screen.queryByTestId('reader-loading')).toBeNull()

    await act(async () => {
      ;(mocks.epubViewerProps?.onSectionReady as (sectionIndex: number, sectionHref?: string) => void)(1, 'chapter-2.xhtml')
    })

    expect(screen.queryByTestId('reader-loading')).toBeNull()
    expect(mocks.readerStore.setCfi).not.toHaveBeenCalled()
    expect(mocks.readerProgress.saveProgress).not.toHaveBeenCalled()

    await act(async () => {
      ;(mocks.epubViewerProps?.onRelocate as (payload: unknown) => void)({
        cfi: 'epubcfi(/6/12!/4/2/1:0)',
        percentage: 48,
        tocLabel: 'Chapter 2',
        sectionHref: 'chapter-2.xhtml',
        fraction: 0.48,
        sectionIndex: 1,
      })
    })

    expect(mocks.readerStore.setCfi).toHaveBeenCalledWith('epubcfi(/6/12!/4/2/1:0)', 48, 'Chapter 2')
    expect(mocks.readerProgress.saveProgress).toHaveBeenCalledWith({
      cfi: 'epubcfi(/6/12!/4/2/1:0)',
      percentage: 48,
      fraction: 0.48,
      sectionHref: 'chapter-2.xhtml',
      sectionLabel: 'Chapter 2',
    })
  })

  it('conclui a navegacao inicial quando o href do indice e do reader usam prefixos diferentes', async () => {
    mocks.readerProgress.savedCfi = 'epubcfi(/6/8!/4/2/1:0)'

    render(
      <ReaderScreen
        book={book}
        startHref="OPS/Text/chapter-2.xhtml#frag"
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    await act(async () => {
      ;(mocks.epubViewerProps?.onLoad as () => void)()
    })

    // EpubViewer já navegou via initialTarget; onLoad apenas seta a flag, não chama goTo novamente
    expect(mocks.viewerHandle.goTo).not.toHaveBeenCalled()

    await act(async () => {
      ;(mocks.epubViewerProps?.onRelocate as (payload: unknown) => void)({
        cfi: 'epubcfi(/6/12!/4/2/1:0)',
        percentage: 48,
        tocLabel: 'Chapter 2',
        sectionHref: 'Text/chapter-2.xhtml',
        fraction: 0.48,
        sectionIndex: 1,
      })
    })

    expect(screen.queryByTestId('reader-loading')).toBeNull()
    expect(mocks.readerStore.setCfi).toHaveBeenCalledWith('epubcfi(/6/12!/4/2/1:0)', 48, 'Chapter 2')
    expect(mocks.readerProgress.saveProgress).toHaveBeenCalledWith({
      cfi: 'epubcfi(/6/12!/4/2/1:0)',
      percentage: 48,
      fraction: 0.48,
      sectionHref: 'Text/chapter-2.xhtml',
      sectionLabel: 'Chapter 2',
    })
  })

  it('libera o progresso depois de abrir um bookmark por CFI', async () => {
    const bookmarkCfi = 'epubcfi(/6/12!/4/2/1:0)'
    mocks.readerProgress.savedCfi = 'epubcfi(/6/8!/4/2/1:0)'

    render(
      <ReaderScreen
        book={book}
        startHref={bookmarkCfi}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    expect(mocks.epubViewerProps?.savedCfi).toBeNull()

    await act(async () => {
      ;(mocks.epubViewerProps?.onRelocate as (payload: unknown) => void)({
        cfi: 'epubcfi(/6/8!/4/2/1:0)',
        percentage: 5,
        tocLabel: 'Chapter 1',
        sectionHref: 'chapter-1.xhtml',
        fraction: 0.05,
        sectionIndex: 0,
      })
    })

    expect(mocks.readerStore.setCfi).not.toHaveBeenCalled()
    expect(mocks.readerProgress.saveProgress).not.toHaveBeenCalled()

    await act(async () => {
      ;(mocks.epubViewerProps?.onLoad as () => void)()
    })

    // EpubViewer já navegou via initialTarget; onLoad apenas seta a flag, não chama goTo novamente
    expect(mocks.viewerHandle.goTo).not.toHaveBeenCalled()
    expect(screen.queryByTestId('reader-loading')).toBeNull()

    await act(async () => {
      ;(mocks.epubViewerProps?.onRelocate as (payload: unknown) => void)({
        cfi: bookmarkCfi,
        percentage: 48,
        tocLabel: 'Chapter 2',
        sectionHref: 'chapter-2.xhtml',
        fraction: 0.48,
        sectionIndex: 1,
      })
    })

    expect(mocks.readerStore.setCfi).toHaveBeenCalledWith(bookmarkCfi, 48, 'Chapter 2')
    expect(mocks.readerProgress.saveProgress).toHaveBeenCalledWith({
      cfi: bookmarkCfi,
      percentage: 48,
      fraction: 0.48,
      sectionHref: 'chapter-2.xhtml',
      sectionLabel: 'Chapter 2',
    })
  })

  it('encerra o mini player quando o usuario pede proximo no fim do trecho', async () => {
    mocks.viewerHandle.getSentenceChunks.mockReturnValue([
      { text: 'First paragraph.', paraIdx: 0, offsetInPara: 0 },
      { text: 'Last paragraph.', paraIdx: 1, offsetInPara: 0 },
    ])

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    fireEvent.click(screen.getByText('toggle-tts'))
    expect(mocks.tts.play).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('tts-mini-player')).toBeTruthy()
    expect(screen.getByText('offset:22')).toBeTruthy()

    mocks.tts.lastChunkIdx.current = 1

    await act(async () => {
      fireEvent.click(screen.getByText('next'))
      await Promise.resolve()
    })

    expect(mocks.tts.stop).toHaveBeenCalledTimes(1)
    expect(mocks.tts.play).toHaveBeenCalledTimes(1)
    expect(mocks.tts.resetPosition).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('tts-mini-player')).toBeNull()
    expect(screen.getByText(/Fim do cap/i)).toBeTruthy()
  })

  it('continua o audiobook na proxima secao quando o TTS termina naturalmente', async () => {
    const firstSectionChunks = [
      { text: 'Last sentence in chapter one.', paraIdx: 0, offsetInPara: 0 },
    ]
    const nextSectionChunks = [
      { text: 'First sentence in chapter two.', paraIdx: 0, offsetInPara: 0 },
    ]
    mocks.viewerHandle.getSentenceChunks.mockReturnValue(firstSectionChunks)
    mocks.viewerHandle.goToNextTtsSection.mockReturnValue(true)

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    fireEvent.click(screen.getByText('toggle-tts'))
    expect(mocks.tts.play).toHaveBeenCalledWith(firstSectionChunks, 0)

    await act(async () => {
      mocks.ttsOptions?.onFinished?.()
      await Promise.resolve()
    })

    expect(mocks.viewerHandle.goToNextTtsSection).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('tts-mini-player')).toBeTruthy()
    expect(screen.queryByText(/Fim do cap/i)).toBeNull()

    mocks.viewerHandle.getSentenceChunks.mockReturnValue(nextSectionChunks)
    await act(async () => {
      ;(mocks.epubViewerProps?.onSectionReady as (sectionIndex: number) => void)(1)
      await Promise.resolve()
    })

    expect(mocks.tts.play).toHaveBeenCalledTimes(2)
    expect(mocks.tts.play).toHaveBeenLastCalledWith(nextSectionChunks, 0)
  })

  it('mostra disponibilidade dos providers e velocidade no mini player', async () => {
    vi.mocked(getSettings).mockResolvedValue(makeSettings({
      appSettings: {
        speechifyApiKey: 'speechify-key',
        elevenLabsApiKey: '',
        fishAudioApiKey: '',
        translationTargetLang: 'pt-BR',
      },
    }))
    vi.mocked(getBookSettings).mockResolvedValue({
      ttsProvider: 'speechify',
      ttsRate: 1.1,
    })
    mocks.viewerHandle.getSentenceChunks.mockReturnValue([
      { text: 'Long running paragraph.', paraIdx: 0, offsetInPara: 0 },
    ])

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    fireEvent.click(screen.getByText('toggle-tts'))

    expect(screen.getByText('provider:speechify')).toBeTruthy()
    expect(screen.getByText('rate:1.1')).toBeTruthy()
    expect(screen.getByText('speechify:enabled')).toBeTruthy()
    expect(screen.getByText('elevenlabs:disabled')).toBeTruthy()
  })

  it('troca velocidade durante reproducao e reinicia do chunk atual', async () => {
    const chunks = [
      { text: 'First paragraph.', paraIdx: 0, offsetInPara: 0 },
      { text: 'Current paragraph.', paraIdx: 1, offsetInPara: 0 },
    ]
    mocks.viewerHandle.getSentenceChunks.mockReturnValue(chunks)

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    fireEvent.click(screen.getByText('toggle-tts'))
    mocks.tts.isPlaying = true
    mocks.tts.lastChunkIdx.current = 1

    await act(async () => {
      fireEvent.click(screen.getByText('speed-1.1'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateBookSettings).toHaveBeenCalledWith(book.id, { ttsRate: 1.1 })
    expect(mocks.tts.stop).toHaveBeenCalledTimes(1)
    expect(mocks.tts.play).toHaveBeenLastCalledWith(chunks, 1)
  })

  it('troca provider durante reproducao, limpa fallback e reinicia do chunk atual', async () => {
    vi.mocked(getSettings).mockResolvedValue(makeSettings({
      appSettings: {
        speechifyApiKey: 'speechify-key',
        elevenLabsApiKey: '',
        fishAudioApiKey: '',
        translationTargetLang: 'pt-BR',
      },
    }))
    vi.mocked(getBookSettings).mockResolvedValue({ ttsProvider: 'native' })
    const chunks = [
      { text: 'First paragraph.', paraIdx: 0, offsetInPara: 0 },
      { text: 'Current paragraph.', paraIdx: 1, offsetInPara: 0 },
    ]
    mocks.viewerHandle.getSentenceChunks.mockReturnValue(chunks)

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    fireEvent.click(screen.getByText('toggle-tts'))
    mocks.tts.isPlaying = true
    mocks.tts.lastChunkIdx.current = 1

    await act(async () => {
      mocks.ttsOptions?.onProviderFallback?.({
        provider: 'speechify',
        fallbackProvider: 'native',
        reason: 'Falha de rede ao conectar com Speechify.',
      })
      await Promise.resolve()
    })
    expect(screen.getByText('fallback:speechify')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('provider-speechify'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateBookSettings).toHaveBeenCalledWith(book.id, { ttsProvider: 'speechify' })
    expect(mocks.tts.stop).toHaveBeenCalledTimes(1)
    expect(mocks.tts.play).toHaveBeenLastCalledWith(chunks, 1)
    expect(screen.getByText('fallback:none')).toBeTruthy()
  })

  it('mostra atalho para voltar ao trecho do TTS apos scroll manual', async () => {
    mocks.viewerHandle.getSentenceChunks.mockReturnValue([
      { text: 'First paragraph.', paraIdx: 0, offsetInPara: 0 },
      { text: 'Second paragraph.', paraIdx: 1, offsetInPara: 0 },
    ])

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    fireEvent.click(screen.getByText('toggle-tts'))

    await act(async () => {
      mocks.ttsOptions?.onParagraphChange?.(1)
      ;(mocks.epubViewerProps?.onTtsUserScrollAway as () => void)()
      await Promise.resolve()
    })

    const backButton = screen.getByText('back-to-tts')
    expect(backButton).toBeTruthy()

    fireEvent.click(backButton)

    expect(mocks.viewerHandle.resetTtsScroll).toHaveBeenCalledWith({ preservePlaybackSection: true })
    expect(mocks.viewerHandle.scrollToParagraph).toHaveBeenCalledWith(1)
    expect(screen.queryByText('back-to-tts')).toBeNull()
  })

  it('avisa quando o TTS selecionado falha e usa fallback nativo', async () => {
    mocks.viewerHandle.getSentenceChunks.mockReturnValue([
      { text: 'Speechify fallback test.', paraIdx: 0, offsetInPara: 0 },
    ])

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    fireEvent.click(screen.getByText('toggle-tts'))

    await act(async () => {
      mocks.ttsOptions?.onProviderFallback?.({
        provider: 'speechify',
        fallbackProvider: 'native',
        reason: 'API key do Speechify inválida, expirada ou sem permissão.',
      })
      await Promise.resolve()
    })

    expect(screen.getByText('TTS alternado')).toBeTruthy()
    expect(screen.getByText(/Speechify.*TTS nativo/i)).toBeTruthy()
    expect(screen.getByText('API key do Speechify inválida, expirada ou sem permissão.')).toBeTruthy()
    expect(screen.getByText('provider:native')).toBeTruthy()
    expect(screen.getByText('fallback:speechify')).toBeTruthy()
    expect(updateBookSettings).toHaveBeenCalledWith(book.id, {
      ttsProvider: 'native',
    })

    fireEvent.pointerUp(screen.getByText('OK'))

    expect(screen.queryByText('TTS alternado')).toBeNull()
  })

  it('mostra o aviso de fallback TTS apenas uma vez por provider', async () => {
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    await act(async () => {
      mocks.ttsOptions?.onProviderFallback?.({
        provider: 'speechify',
        fallbackProvider: 'native',
        reason: 'API key do Speechify inválida, expirada ou sem permissão.',
      })
      await Promise.resolve()
    })

    expect(screen.getByText('TTS alternado')).toBeTruthy()
    fireEvent.pointerUp(screen.getByText('OK'))
    expect(screen.queryByText('TTS alternado')).toBeNull()

    await act(async () => {
      mocks.ttsOptions?.onProviderFallback?.({
        provider: 'speechify',
        fallbackProvider: 'native',
        reason: 'Falha de rede ao conectar com Speechify.',
      })
      await Promise.resolve()
    })

    expect(screen.queryByText('TTS alternado')).toBeNull()
    expect(updateBookSettings).toHaveBeenCalledTimes(1)
    expect(updateBookSettings).toHaveBeenLastCalledWith(book.id, {
      ttsProvider: 'native',
    })
  })

  it('aplica defaults de leitura e usa o idioma efetivo do livro na traducao e no vocabulario', async () => {
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    expect(mocks.epubViewerProps?.lineHeight).toBe('comfortable')
    expect(mocks.epubViewerProps?.readerTheme).toBe('dark')
    expect(mocks.epubViewerProps?.fontFamily).toBe('classic')
    expect(mocks.epubViewerProps?.overrideBookFont).toBe(true)
    expect(mocks.epubViewerProps?.overrideBookColors).toBe(true)

    await act(async () => {
      await (mocks.epubViewerProps?.onTranslate as (text: string) => Promise<void>)('Bonjour')
    })

    expect(translate).toHaveBeenCalledWith('Bonjour', 'fr', 'pt-BR', expect.objectContaining({ provider: 'mymemory' }))

    await act(async () => {
      ;(mocks.epubViewerProps?.onSaveVocab as (source: string, translated: string) => void)('Bonjour', 'Ola')
    })

    expect(addVocabItem).toHaveBeenCalledWith(expect.objectContaining({
      sourceLang: 'fr',
      targetLang: 'pt-BR',
    }))
  })

  it('não monta o viewer nem traduz antes das preferências do leitor carregarem', async () => {
    let resolveSettings: ((value: Awaited<ReturnType<typeof getSettings>>) => void) | null = null
    vi.mocked(getSettings).mockImplementationOnce(() => new Promise((resolve) => {
      resolveSettings = resolve
    }))

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByTestId('reader-loading')).toBeTruthy()
    expect(mocks.epubViewerProps).toBeNull()
    expect(translate).not.toHaveBeenCalled()

    await act(async () => {
      resolveSettings?.(makeSettings())
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.epubViewerProps).not.toBeNull()

    await act(async () => {
      await (mocks.epubViewerProps?.onTranslate as (text: string) => Promise<void>)('Bonjour')
    })

    expect(translate).toHaveBeenCalledWith('Bonjour', 'fr', 'pt-BR', expect.objectContaining({ provider: 'mymemory' }))
  })

  it('usa o idioma de tradução configurado no livro quando houver override', async () => {
    vi.mocked(getBookSettings).mockResolvedValue({
      bookId: 1,
      translationTargetLang: 'es',
    })

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    await act(async () => {
      await (mocks.epubViewerProps?.onTranslate as (text: string) => Promise<void>)('Bonjour')
    })

    expect(translate).toHaveBeenCalledWith('Bonjour', 'fr', 'es', expect.objectContaining({ provider: 'mymemory' }))

    await act(async () => {
      ;(mocks.epubViewerProps?.onSaveVocab as (source: string, translated: string) => void)('Bonjour', 'Hola')
    })

    expect(addVocabItem).toHaveBeenCalledWith(expect.objectContaining({
      sourceLang: 'fr',
      targetLang: 'es',
    }))
  })

  it('usa o provedor de tradução premium selecionado para o livro (DeepL, no Android)', async () => {
    // DeepL bloqueia CORS fora do Android (R-006) — sem isso, cai pro
    // MyMemory mesmo com a chave configurada.
    mocks.isNativePlatform.mockReturnValue(true)
    vi.mocked(getBookSettings).mockResolvedValue({ bookId: 1, translationProvider: 'deepl' })
    vi.mocked(getSettings).mockResolvedValue(makeSettings({
      appSettings: {
        speechifyApiKey: '',
        elevenLabsApiKey: '',
        fishAudioApiKey: '',
        translationTargetLang: 'pt-BR',
        deeplApiKey: 'deepl-real-key',
      },
    }))
    vi.mocked(translate).mockResolvedValueOnce({ translatedText: 'Texto traduzido', provider: 'deepl' })

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    await act(async () => {
      await (mocks.epubViewerProps?.onTranslate as (text: string) => Promise<void>)('Bonjour')
    })

    expect(translate).toHaveBeenCalledWith('Bonjour', 'fr', 'pt-BR', expect.objectContaining({ provider: 'deepl' }))
    // FR-008: o selo "via {provedor}" depende do provider efetivo devolvido
    // por translate() ser propagado pro EpubViewer.
    expect(mocks.viewerHandle.injectTranslation).toHaveBeenCalledWith('Texto traduzido', undefined, 'deepl')
  })

  it('fora do Android, cai pro MyMemory mesmo com DeepL selecionado e chave configurada (R-006/CORS)', async () => {
    mocks.isNativePlatform.mockReturnValue(false)
    vi.mocked(getBookSettings).mockResolvedValue({ bookId: 1, translationProvider: 'deepl' })
    vi.mocked(getSettings).mockResolvedValue(makeSettings({
      appSettings: {
        speechifyApiKey: '',
        elevenLabsApiKey: '',
        fishAudioApiKey: '',
        translationTargetLang: 'pt-BR',
        deeplApiKey: 'deepl-real-key',
      },
    }))

    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    await act(async () => {
      await (mocks.epubViewerProps?.onTranslate as (text: string) => Promise<void>)('Bonjour')
    })

    expect(translate).toHaveBeenCalledWith('Bonjour', 'fr', 'pt-BR', expect.objectContaining({ provider: 'mymemory' }))
  })

  it('cancela a tradução anterior ao trocar de trecho antes da resposta voltar (FR-007)', async () => {
    render(
      <ReaderScreen
        book={book}
        onBack={vi.fn()}
        onOpenVocabulary={vi.fn()}
      />,
    )

    await flushAsyncWork()

    let firstSignal: AbortSignal | undefined
    await act(async () => {
      const onTranslate = mocks.epubViewerProps?.onTranslate as (text: string) => Promise<void>
      // Não espera a 1ª terminar antes de disparar a 2ª — mesmo padrão de
      // "trocar de trecho antes da resposta voltar".
      const firstCall = onTranslate('Bonjour')
      firstSignal = (translate as ReturnType<typeof vi.fn>).mock.calls[0][3].signal as AbortSignal
      await onTranslate('Au revoir')
      await firstCall
    })

    expect(firstSignal?.aborted).toBe(true)
  })
})
