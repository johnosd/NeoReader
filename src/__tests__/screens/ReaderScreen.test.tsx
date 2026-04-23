import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { ReaderScreen } from '@/screens/ReaderScreen'
import type { Book } from '@/types/book'
import type { TtsChunk } from '@/components/reader/EpubViewer'
import { getBookSettings } from '@/db/bookSettings'
import { translate } from '@/services/TranslationService'
import { addVocabItem } from '@/db/vocabulary'

const mocks = vi.hoisted(() => {
  const viewerHandle = {
    goTo: vi.fn(),
    getSentenceChunks: vi.fn<() => TtsChunk[]>(),
    getFirstVisibleParagraphIndex: vi.fn(() => 0),
    resetTtsScroll: vi.fn(),
    highlightTts: vi.fn(),
    scrollToParagraph: vi.fn(),
    clearTts: vi.fn(),
    showTranslationLoading: vi.fn(),
    injectTranslation: vi.fn(),
  }

  return {
    viewerHandle,
    epubViewerProps: null as Record<string, unknown> | null,
    readerProgress: {
      savedCfi: null as string | null,
      initialLoadDone: true,
      saveProgress: vi.fn(),
      flushProgress: vi.fn().mockResolvedValue(undefined),
    },
    readerStore: {
      cfi: '',
      percentage: 0,
      toc: [],
      setCfi: vi.fn(),
      setToc: vi.fn(),
      reset: vi.fn(),
    },
    tts: {
      isPlaying: false,
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      speakOne: vi.fn().mockResolvedValue(undefined),
      lastChunkIdx: { current: 0 },
      resetPosition: vi.fn(),
    },
  }
})

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => []),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({
      remove: vi.fn(),
    })),
  },
}))

vi.mock('@/hooks/useReaderProgress', () => ({
  useReaderProgress: vi.fn(() => mocks.readerProgress),
}))

vi.mock('@/store/readerStore', () => ({
  useReaderStore: vi.fn(() => mocks.readerStore),
}))

vi.mock('@/hooks/useTTS', () => ({
  useTTS: vi.fn(() => mocks.tts),
}))

vi.mock('@/db/books', () => ({
  updateLastOpened: vi.fn(),
}))

vi.mock('@/db/bookmarks', () => ({
  addBookmark: vi.fn(),
  restoreBookmark: vi.fn(),
  softDeleteBookmark: vi.fn(),
  updateBookmarkColor: vi.fn(),
}))

vi.mock('@/db/vocabulary', () => ({
  addVocabItem: vi.fn(),
}))

vi.mock('@/db/settings', () => ({
  getSettings: vi.fn(async () => ({
    appSettings: {
      speechifyApiKey: '',
      elevenLabsApiKey: '',
      translationTargetLang: 'pt-BR',
    },
    readerDefaults: {
      defaultFontSize: 'md',
      lineHeight: 'comfortable',
      readerTheme: 'dark',
    },
    updatedAt: new Date(),
  })),
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
  translate: vi.fn(async () => 'Texto traduzido'),
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
    mocks.epubViewerProps = props
    React.useImperativeHandle(ref, () => mocks.viewerHandle)
    return <div data-testid="epub-viewer" />
  })

  return { EpubViewer }
})

vi.mock('@/components/reader/ReaderChrome', () => ({
  ReaderChrome: ({ onTtsToggle }: { onTtsToggle: () => void }) => (
    <button type="button" onClick={onTtsToggle}>
      toggle-tts
    </button>
  ),
}))

vi.mock('@/components/reader/TtsMiniPlayer', () => ({
  TtsMiniPlayer: ({
    onPrev,
    onNext,
    onStop,
  }: {
    onPrev: () => void
    onNext: () => void
    onStop: () => void
  }) => (
    <div data-testid="tts-mini-player">
      <button type="button" onClick={onPrev}>prev</button>
      <button type="button" onClick={onNext}>next</button>
      <button type="button" onClick={onStop}>stop</button>
    </div>
  ),
}))

vi.mock('@/components/reader/TocDrawer', () => ({
  TocDrawer: () => null,
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

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('ReaderScreen', () => {
  beforeEach(() => {
    mocks.epubViewerProps = null
    mocks.readerProgress.savedCfi = null
    mocks.readerProgress.initialLoadDone = true
    mocks.readerProgress.saveProgress.mockClear()
    mocks.readerProgress.flushProgress.mockClear()
    mocks.readerStore.setCfi.mockClear()
    mocks.readerStore.setToc.mockClear()
    mocks.readerStore.reset.mockClear()
    mocks.tts.play.mockClear()
    mocks.tts.stop.mockClear()
    mocks.tts.speakOne.mockClear()
    mocks.tts.resetPosition.mockClear()
    mocks.tts.lastChunkIdx.current = 0
    mocks.viewerHandle.goTo.mockClear()
    mocks.viewerHandle.getSentenceChunks.mockReset()
    mocks.viewerHandle.getSentenceChunks.mockReturnValue([])
    mocks.viewerHandle.getFirstVisibleParagraphIndex.mockReturnValue(0)
    mocks.viewerHandle.resetTtsScroll.mockClear()
    vi.mocked(translate).mockClear()
    vi.mocked(addVocabItem).mockClear()
    vi.mocked(getBookSettings).mockResolvedValue({})
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

    expect(mocks.viewerHandle.goTo).toHaveBeenCalledWith('chapter-2.xhtml#frag')

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

    await act(async () => {
      await (mocks.epubViewerProps?.onTranslate as (text: string) => Promise<void>)('Bonjour')
    })

    expect(translate).toHaveBeenCalledWith('Bonjour', 'fr', 'pt-BR')

    await act(async () => {
      ;(mocks.epubViewerProps?.onSaveVocab as (source: string, translated: string) => void)('Bonjour', 'Ola')
    })

    expect(addVocabItem).toHaveBeenCalledWith(expect.objectContaining({
      sourceLang: 'fr',
      targetLang: 'pt-BR',
    }))
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

    expect(translate).toHaveBeenCalledWith('Bonjour', 'fr', 'es')

    await act(async () => {
      ;(mocks.epubViewerProps?.onSaveVocab as (source: string, translated: string) => void)('Bonjour', 'Hola')
    })

    expect(addVocabItem).toHaveBeenCalledWith(expect.objectContaining({
      sourceLang: 'fr',
      targetLang: 'es',
    }))
  })
})
