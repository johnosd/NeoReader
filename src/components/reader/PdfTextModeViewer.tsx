// Modo texto do PDF (US2): o MESMO EpubViewer abrindo o livro sintético (DI-003), com a conversão
// localizador ↔ CFI feita aqui, na borda (DI-006). Para a ReaderScreen este componente fala só em
// localizadores "neopdf:", como a página fiel: progresso, marcadores e highlights gravados valem nos dois
// modos. Por dentro, o EpubViewer só vê CFIs do livro sintético.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react'
import { useI18n } from '@/i18n'
import type { PdfReaderSession } from '@/hooks/usePdfReaderSession'
import { PdfLocatorResolver, snapRangeToText } from '@/services/pdf/PdfLocatorResolver'
import { createPdfTextBook, type PdfTextBookSource } from '@/services/pdf/PdfTextBookBuilder'
import { renderPdfPageRegionToBlob } from '@/services/pdf/pdfPageRender'
import type { Highlight } from '@/types/highlight'
import { formatPdfRange, getPdfLocatorStart, isPdfLocator, parsePdfRange } from '@/utils/pdfLocator'
import { clampPercentage } from '@/utils/progress'
import { progressPercentage } from './pdfPage/pdfPageMapping'
import {
  EpubViewer,
  type EpubViewerHandle,
  type ReaderRelocatePayload,
  type VisibleReadingLocation,
} from './EpubViewer'

type EpubViewerProps = ComponentPropsWithoutRef<typeof EpubViewer>

export interface PdfTextModeViewerProps extends Omit<EpubViewerProps, 'openBook' | 'savedCfi' | 'initialTarget'> {
  session: PdfReaderSession
  // Localizador salvo (progresso, ou posição da página fiel ao alternar) e alvo inicial (localizador ou href).
  savedLocator: string | null
  initialTarget?: string | null
}

// Percentual pela página, igual ao da página fiel: o tamanho das seções sintéticas é só estimado.
function pageProgress(locator: string, pageCount: number): { fraction: number; percentage: number } | null {
  const point = getPdfLocatorStart(locator)
  if (!point) return null
  const exact = progressPercentage(point.pageIndex, 0, pageCount)
  return { fraction: exact / 100, percentage: clampPercentage(exact) }
}

export const PdfTextModeViewer = forwardRef<EpubViewerHandle, PdfTextModeViewerProps>(function PdfTextModeViewer(
  {
    session, savedLocator, initialTarget, book, bookmarks, highlights,
    onRelocate, onBookmarkParagraph, onRequestCreateHighlight, onDeleteHighlight, onEditHighlight,
    ...viewerProps
  },
  ref,
) {
  const { t } = useI18n()
  const innerRef = useRef<EpubViewerHandle>(null)

  const source = useMemo<PdfTextBookSource>(() => ({
    chunks: session.chunks,
    reconstructChunk: (chunk) => session.extractor.reconstructChunk(chunk),
    getPagesShownAsImage: (chunk) => session.extractor.getPagesShownAsImage(chunk),
    renderImage: async ({ pageIndex, region }) => {
      const page = await session.pdf.getPage(pageIndex + 1)
      try {
        return await renderPdfPageRegionToBlob(page, region)
      } finally {
        page.cleanup()
      }
    },
  }), [session])

  const bookOptions = useMemo(() => ({
    title: book.title,
    author: book.author,
    language: book.detectedLanguage ?? null,
    labels: {
      figure: (page: number) => t('pdf.textMode.figure', { page }),
      pageAsImage: (page: number) => t('pdf.textMode.pageAsImage', { page }),
    },
  }), [book.title, book.author, book.detectedLanguage, t])

  // Livro novo a cada abertura: o EpubViewer destrói o book ao desmontar, e o StrictMode monta duas vezes.
  const openBook = useCallback(() => Promise.resolve(createPdfTextBook(source, bookOptions)), [source, bookOptions])

  // A conversão usa uma instância própria, só estrutural (sem imagens), que nunca é destruída pelo viewer.
  const resolver = useMemo(
    () => new PdfLocatorResolver(createPdfTextBook({ ...source, renderImage: undefined }, bookOptions), session.chunks),
    [source, bookOptions, session.chunks],
  )
  useEffect(() => () => resolver.clear(), [resolver])

  // ── Entrada: localizadores → CFIs do livro sintético ───────────────────────

  // Posição inicial convertida antes de montar o EpubViewer (o setup dele lê savedCfi uma vez só).
  const [start, setStart] = useState<{ savedCfi: string | null; initialTarget: string | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const savedCfi = savedLocator ? await resolver.locatorToCfi(savedLocator) : null
      const target = initialTarget && isPdfLocator(initialTarget)
        ? await resolver.locatorToCfi(initialTarget)
        : initialTarget ?? null
      if (!cancelled) setStart({ savedCfi, initialTarget: target })
    })()
    return () => { cancelled = true }
    // Só na montagem: mudar de posição depois é navegação (goTo), não remontagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolver])

  const [viewerBookmarks, setViewerBookmarks] = useState<EpubViewerProps['bookmarks']>([])
  useEffect(() => {
    let cancelled = false
    void Promise.all(bookmarks.map(async (bookmark) => {
      const cfi = await resolver.locatorToCfi(bookmark.cfi)
      return cfi ? { ...bookmark, cfi } : null
    })).then((converted) => {
      if (!cancelled) setViewerBookmarks(converted.filter((b): b is NonNullable<typeof b> => b !== null))
    })
    return () => { cancelled = true }
  }, [bookmarks, resolver])

  // Highlight convertido → original (callbacks de editar/remover devolvem o objeto que o viewer recebeu).
  const originalHighlightsRef = useRef(new Map<number, Highlight>())
  const [viewerHighlights, setViewerHighlights] = useState<Highlight[]>([])
  useEffect(() => {
    let cancelled = false
    const list = highlights ?? []
    void Promise.all(list.map(async (highlight) => {
      const [cfi, paraCfi] = await Promise.all([
        resolver.locatorToCfi(highlight.cfi),
        highlight.paraCfi ? resolver.locatorToCfi(highlight.paraCfi) : Promise.resolve(null),
      ])
      return cfi ? { ...highlight, cfi, ...(paraCfi ? { paraCfi } : {}) } : null
    })).then((converted) => {
      if (cancelled) return
      originalHighlightsRef.current = new Map(list.filter((h) => h.id !== undefined).map((h) => [h.id!, h]))
      setViewerHighlights(converted.filter((h): h is Highlight => h !== null))
    })
    return () => { cancelled = true }
  }, [highlights, resolver])

  const toOriginalHighlight = (highlight: Highlight) =>
    (highlight.id !== undefined ? originalHighlightsRef.current.get(highlight.id) : undefined) ?? highlight

  // ── Saída: CFIs do viewer → localizadores ──────────────────────────────────

  const lastLocationRef = useRef<VisibleReadingLocation | null>(null)
  const lastVisibleRef = useRef<VisibleReadingLocation | null>(null)
  const relocateSeqRef = useRef(0)

  const handleRelocate = (payload: ReaderRelocatePayload) => {
    const seq = ++relocateSeqRef.current
    // Parágrafo no topo da tela (o mesmo que o EPUB usa ao sair/alternar), lido já: depois o DOM muda.
    const visibleCfi = innerRef.current?.getVisibleLocation().cfi ?? null
    void Promise.all([resolver.cfiToLocator(payload.cfi), resolver.cfiToLocator(visibleCfi)]).then(([locator, visible]) => {
      if (seq !== relocateSeqRef.current || !locator) return // chegou outro relocate enquanto convertia
      const progress = pageProgress(locator, session.pageCount)
      const converted: ReaderRelocatePayload = { ...payload, cfi: locator, ...(progress ?? {}) }
      lastLocationRef.current = converted
      lastVisibleRef.current = visible
        ? { ...converted, cfi: visible, ...(pageProgress(visible, session.pageCount) ?? {}) }
        : converted
      onRelocate(converted)
    })
  }

  const handleBookmarkParagraph: EpubViewerProps['onBookmarkParagraph'] = (payload) => {
    void resolver.cfiToLocator(payload.cfi).then((locator) => {
      if (!locator) return
      const progress = pageProgress(locator, session.pageCount)
      onBookmarkParagraph?.({
        ...payload,
        cfi: locator,
        percentage: progress?.percentage ?? payload.percentage,
        // Rótulo padrão do viewer é o percentual: refaz com o percentual da página.
        label: payload.label === `${payload.percentage}%` && progress ? `${progress.percentage}%` : payload.label,
      })
    })
  }

  // A conversão CFI → localizador é proporcional dentro do parágrafo e pode errar por alguns caracteres; num
  // highlight isso aparece na página fiel (letra a mais/a menos). Ajusta pelo texto bruto da página, quando o
  // intervalo cabe numa página só (snapRangeToText).
  const exactHighlightLocator = async (locator: string, text: string): Promise<string> => {
    const range = parsePdfRange(locator)
    if (!range || range.start.pageIndex !== range.end.pageIndex) return locator
    const raw = (await session.extractor.getPage(range.start.pageIndex)).rawText ?? ''
    const snapped = snapRangeToText(raw, { start: range.start.offset, end: range.end.offset }, text)
    if (!snapped) return locator
    const pageIndex = range.start.pageIndex
    return formatPdfRange({ start: { pageIndex, offset: snapped.start }, end: { pageIndex, offset: snapped.end } })
  }

  const handleRequestCreateHighlight: EpubViewerProps['onRequestCreateHighlight'] = (draft) => {
    void Promise.all([
      resolver.cfiToLocator(draft.cfi, draft.text).then((locator) => (locator ? exactHighlightLocator(locator, draft.text) : null)),
      resolver.cfiToLocator(draft.paraCfi),
    ]).then(([cfi, paraCfi]) => {
      if (!cfi) return
      onRequestCreateHighlight?.({
        ...draft,
        cfi,
        paraCfi: paraCfi ?? cfi,
        percentage: pageProgress(cfi, session.pageCount)?.percentage ?? draft.percentage,
      })
    })
  }

  // ── Handle: delega ao EpubViewer, trocando o que fala em posição ───────────

  useImperativeHandle(ref, () => {
    const inner = () => innerRef.current
    return {
      next: () => inner()?.next(),
      prev: () => inner()?.prev(),
      prevToEnd: () => inner()?.prevToEnd(),
      goToNextTtsSection: () => inner()?.goToNextTtsSection() ?? false,
      goTo: (target) => {
        // Localizador (lista de marcadores/destaques) vira CFI; href do sumário sintético passa direto.
        if (typeof target === 'string' && isPdfLocator(target)) {
          void resolver.locatorToCfi(target).then((cfi) => { if (cfi) inner()?.goTo(cfi) })
          return
        }
        inner()?.goTo(target)
      },
      // Síncrono por contrato (salvar ao sair): devolve a última posição já convertida.
      getVisibleLocation: () => lastVisibleRef.current ?? lastLocationRef.current ?? { cfi: null },
      getParagraphs: () => inner()?.getParagraphs() ?? [],
      getSentenceChunks: () => inner()?.getSentenceChunks() ?? [],
      getFirstVisibleParagraphIndex: () => inner()?.getFirstVisibleParagraphIndex() ?? 0,
      highlightTts: (paraIdx, wordStart, wordEnd) => inner()?.highlightTts(paraIdx, wordStart, wordEnd),
      clearTts: () => inner()?.clearTts(),
      scrollToParagraph: (idx) => inner()?.scrollToParagraph(idx),
      resetTtsScroll: (options) => inner()?.resetTtsScroll(options),
      showTranslationLoading: () => inner()?.showTranslationLoading() ?? null,
      injectTranslation: (text, selectionId, provider) => inner()?.injectTranslation(text, selectionId, provider),
      showWordLensDefinitionLoading: (target) => inner()?.showWordLensDefinitionLoading(target),
      injectWordLensDefinition: (target, entry) => inner()?.injectWordLensDefinition(target, entry),
      injectWordLensDefinitionError: (target) => inner()?.injectWordLensDefinitionError(target),
      clearTranslation: () => inner()?.clearTranslation(),
    }
  }, [resolver])

  if (!start) return null

  return (
    <EpubViewer
      ref={innerRef}
      {...viewerProps}
      book={book}
      openBook={openBook}
      savedCfi={start.savedCfi}
      initialTarget={start.initialTarget}
      bookmarks={viewerBookmarks}
      highlights={viewerHighlights}
      onRelocate={handleRelocate}
      onBookmarkParagraph={handleBookmarkParagraph}
      onRequestCreateHighlight={handleRequestCreateHighlight}
      onDeleteHighlight={onDeleteHighlight ? (highlight) => onDeleteHighlight(toOriginalHighlight(highlight)) : undefined}
      onEditHighlight={onEditHighlight ? (highlight) => onEditHighlight(toOriginalHighlight(highlight)) : undefined}
    />
  )
})
