import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { View } from 'foliate-js/view.js'
import { useSyncRef } from '@/hooks/useSyncRef'
import { useI18n } from '@/i18n'
import type { PdfReaderSession } from '@/hooks/usePdfReaderSession'
import type { PdfTocItem } from '@/services/pdf/PdfBookFactory'
import type { Book, Bookmark } from '@/types/book'
import type { ReaderTheme } from '@/types/settings'
import { findChunkForPage } from '@/utils/pdfChunks'
import {
  formatPdfPoint,
  getPdfLocatorStart,
  isPdfLocator,
  type PdfPoint,
} from '@/utils/pdfLocator'
import { getReaderThemePalette } from '@/utils/readerPreferences'
import type {
  EpubViewerHandle,
  ParagraphBookmarkPayload,
  ReaderRelocatePayload,
  TtsChunk,
} from './EpubViewer'
import { attachPinchZoom, clampZoomPct, PDF_ZOOM_MIN_PCT } from './pdfPage/pdfPageGestures'
import {
  blockStartPoint,
  findBlockAtPoint,
  itemIndexAtOffset,
  offsetOfItem,
  pageForFraction,
  progressPercentage,
  tocItemForPage,
  tocLabelForPage,
} from './pdfPage/pdfPageMapping'
import {
  hideBubble,
  PDF_PAGE_RENDERED_EVENT,
  renderBookmarkMarkers,
  showBubble,
} from './pdfPage/pdfPageOverlay'

// Página fiel de PDF (feature 022, DI-004): foliate-view sobre o renderer de layout fixo (foliate-fxl) em
// rolagem contínua. Implementa o mesmo contrato EpubViewerHandle do EpubViewer — ReaderScreen, useTTS e
// useTranslatedAudiobook o dirigem sem saber o formato. Tradução, Word Lens, TTS e highlights entram nas
// próximas fases (US3–US5); aqui valem leitura, zoom, tema, sumário, progresso e marcadores (US1).

export interface PdfPageViewerProps {
  book: Book
  session: PdfReaderSession
  bookmarks: Bookmark[]
  readerTheme: ReaderTheme
  // Localizador `neopdf:` salvo (progresso) e alvo inicial (ex.: vindo da lista de destaques/sumário).
  savedLocator: string | null
  initialTarget?: string | null
  onRelocate: (payload: ReaderRelocatePayload) => void
  onTocReady: (toc: TocItem[]) => void
  onLoad: () => void
  onError: (error: Error) => void
  // Toque fora do texto: alterna o chrome (barra superior/inferior).
  onCenterTap: () => void
  onBookmarkTap?: (bookmarkId: number) => void
  onBookmarkParagraph?: (payload: ParagraphBookmarkPayload) => void
}

// Subconjunto do renderer foliate-fxl que usamos (não há .d.ts do fixed-layout).
interface FxlRenderer extends HTMLElement {
  readonly index: number // página no centro da tela (modo scroll)
  pageColors: { background: string; foreground: string }
  getContents(): Array<{ doc: Document; index: number }>
  goTo(target: { index: number }): Promise<void>
  next(distance?: number): Promise<void>
  prev(distance?: number): Promise<void>
  readonly shadowRoot: ShadowRoot
}

// <foliate-view> visto como o que usamos dele (não estende HTMLElement para evitar o conflito de sobrecargas
// de addEventListener; o elemento é anexado ao DOM com cast).
interface PdfFoliateView {
  style: CSSStyleDeclaration
  renderer: FxlRenderer
  open(book: unknown): Promise<void>
  close(): void
  remove(): void
  getBoundingClientRect(): DOMRect
  addEventListener<T>(type: string, listener: (event: CustomEvent<T>) => void): void
}

// Estilos injetados no shadow root do foliate-fxl: com zoom > 100% as páginas ficam mais largas que a tela e
// o container (flex, align-items:center) cortaria a borda esquerda, inalcançável por rolagem. Faz o container
// crescer até a página mais larga, e a rolagem horizontal do host (overflow-x:auto) cobre as duas bordas.
const FXL_EXTRA_CSS = `
  :host([flow="scrolled"]) .scroll-container { width: max-content; min-width: 100%; }
`

const WAIT_FOR_PAGE_MS = 4000
const WAIT_POLL_MS = 80

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const PdfPageViewer = forwardRef<EpubViewerHandle, PdfPageViewerProps>(function PdfPageViewer(props, ref) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<PdfFoliateView | null>(null)
  const propsRef = useSyncRef(props)
  const tRef = useSyncRef(t)

  const zoomPctRef = useRef(PDF_ZOOM_MIN_PCT)
  const lastLocationRef = useRef<ReaderRelocatePayload | null>(null)
  // Só emite onRelocate depois da navegação inicial: antes disso o foliate ainda está arrumando a rolagem e um
  // relocate precoce sobrescreveria o progresso salvo com a página errada.
  const readyRef = useRef(false)
  // Cada relocate é resolvido de forma assíncrona (extrai o texto da página); só o mais recente vale.
  const relocateTokenRef = useRef(0)
  const pageCleanupsRef = useRef(new Map<Document, () => void>())

  // ── Localização ────────────────────────────────────────────────────────────

  // Página carregada (iframe montado e camada de texto desenhada) — undefined enquanto não houver.
  const getLoadedDoc = (pageIndex: number): Document | undefined => {
    const contents = viewRef.current?.renderer.getContents() ?? []
    return contents.find((c) => c.index === pageIndex)?.doc
  }

  const hasRenderedText = (doc: Document | undefined): boolean =>
    !!doc && doc.querySelector('.textLayer span[data-nr-item]') !== null

  async function waitForRenderedPage(pageIndex: number): Promise<Document | null> {
    const deadline = Date.now() + WAIT_FOR_PAGE_MS
    while (Date.now() < deadline) {
      const doc = getLoadedDoc(pageIndex)
      // Página sem texto (escaneada) nunca terá spans: basta o canvas existir.
      if (hasRenderedText(doc) || doc?.querySelector('#canvas canvas')) return doc ?? null
      await sleep(WAIT_POLL_MS)
    }
    return getLoadedDoc(pageIndex) ?? null
  }

  async function navigateToPoint(point: PdfPoint, options: { alignEnd?: boolean } = {}) {
    const view = viewRef.current
    if (!view) return
    const { session } = propsRef.current
    const pageIndex = Math.min(Math.max(0, point.pageIndex), session.pageCount - 1)

    await view.renderer.goTo({ index: pageIndex })
    const doc = await waitForRenderedPage(pageIndex)
    if (!doc) return

    const frame = doc.defaultView?.frameElement as HTMLElement | null
    if (options.alignEnd) {
      frame?.scrollIntoView({ block: 'end' })
      return
    }
    if (point.offset <= 0) return

    // Rola até a linha do offset salvo: texto bruto da página → item → <span data-nr-item>.
    const extracted = await session.extractor.getPage(pageIndex)
    const itemIndex = itemIndexAtOffset(extracted.itemStarts, extracted.items, point.offset)
    if (itemIndex < 0) return
    doc.querySelector<HTMLElement>(`.textLayer span[data-nr-item="${itemIndex}"]`)?.scrollIntoView({ block: 'start' })
  }

  // Primeiro texto visível da página `pageIndex`: devolve o offset no texto bruto e a fração percorrida da página.
  async function readPagePosition(pageIndex: number): Promise<{ offset: number; fractionInPage: number }> {
    const view = viewRef.current
    // A página pode estar sendo (re)desenhada (zoom/tema): espera a camada de texto antes de medir.
    const doc = (await waitForRenderedPage(pageIndex)) ?? getLoadedDoc(pageIndex)
    const frame = doc?.defaultView?.frameElement as HTMLElement | null | undefined
    if (!view || !doc || !frame) return { offset: 0, fractionInPage: 0 }

    const hostRect = view.renderer.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    const fractionInPage = frameRect.height > 0 ? (hostRect.top - frameRect.top) / frameRect.height : 0

    // Primeiro span cuja base está abaixo do topo do host (rect do span é relativo ao viewport do iframe).
    let firstVisible: HTMLElement | null = null
    for (const span of doc.querySelectorAll<HTMLElement>('.textLayer span[data-nr-item]')) {
      if (!span.textContent?.trim()) continue
      const bottomInHost = frameRect.top + span.getBoundingClientRect().bottom
      if (bottomInHost > hostRect.top + 2) {
        firstVisible = span
        break
      }
    }
    if (!firstVisible) return { offset: 0, fractionInPage }

    const extracted = await propsRef.current.session.extractor.getPage(pageIndex)
    return { offset: offsetOfItem(extracted.itemStarts, Number(firstVisible.dataset.nrItem)), fractionInPage }
  }

  const relocateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Agrupa vários re-renders seguidos (páginas vizinhas, zoom) em um único relocate.
  function scheduleRelocate() {
    if (relocateTimerRef.current) clearTimeout(relocateTimerRef.current)
    relocateTimerRef.current = setTimeout(() => {
      relocateTimerRef.current = null
      if (viewRef.current) void handleRelocate(Math.max(0, viewRef.current.renderer.index))
    }, 250)
  }

  async function handleRelocate(pageIndex: number) {
    if (!readyRef.current) return
    const token = ++relocateTokenRef.current
    const { session, onRelocate } = propsRef.current
    const { offset, fractionInPage } = await readPagePosition(pageIndex)
    if (token !== relocateTokenRef.current) return // chegou outro relocate enquanto lia o texto

    const percentage = progressPercentage(pageIndex, fractionInPage, session.pageCount)
    const tocItem = tocItemForPage(session.pdfBook.toc, pageIndex)
    const payload: ReaderRelocatePayload = {
      cfi: formatPdfPoint({ pageIndex, offset }),
      fraction: percentage / 100,
      percentage,
      // "Seção" do PDF = trecho (DI-009).
      sectionIndex: findChunkForPage(session.chunks, pageIndex)?.index ?? 0,
      tocLabel: tocItem?.label,
      // O ReaderScreen marca o capítulo atual comparando este href com os do sumário (já localizadores).
      sectionHref: tocItem?.href,
    }
    lastLocationRef.current = payload
    onRelocate(payload)
  }

  // ── Toque ──────────────────────────────────────────────────────────────────

  async function handleTextTap(doc: Document, pageIndex: number, itemIndex: number, event: MouseEvent) {
    const { session, onBookmarkParagraph, readerTheme, bookmarks } = propsRef.current
    if (!onBookmarkParagraph) return

    const layer = doc.querySelector<HTMLElement>('.textLayer')
    if (!layer) return
    const rect = layer.getBoundingClientRect()
    const xPct = rect.width ? ((event.clientX - rect.left) / rect.width) * 100 : 50
    const yPct = rect.height ? ((event.clientY - rect.top) / rect.height) * 100 : 50

    // Parágrafo tocado: item → offset bruto → bloco reconstruído do trecho (pdfParagraphs).
    const extracted = await session.extractor.getPage(pageIndex)
    const point: PdfPoint = { pageIndex, offset: offsetOfItem(extracted.itemStarts, itemIndex) }
    const chunk = findChunkForPage(session.chunks, pageIndex)
    if (!chunk) return
    const block = findBlockAtPoint(await session.extractor.reconstructChunk(chunk), point)
    const start = block ? blockStartPoint(block) : null
    if (!block || !start) return

    const startLocator = formatPdfPoint(start)
    const existing = bookmarks.find((b) => !b.deletedAt && b.cfi === startLocator)
    const palette = getReaderThemePalette(readerTheme)
    const percentage = progressPercentage(start.pageIndex, 0, session.pageCount)

    showBubble(doc, {
      xPct,
      yPct,
      palette,
      actions: [
        existing
          ? { label: tRef.current('pdf.bookmark.remove'), onSelect: () => propsRef.current.onBookmarkTap?.(existing.id!) }
          : {
            label: tRef.current('pdf.bookmark.add'),
            onSelect: () =>
              onBookmarkParagraph({
                cfi: startLocator,
                label: tocLabelForPage(session.pdfBook.toc, start.pageIndex) ?? `${Math.round(percentage)}%`,
                percentage,
                snippet: block.text.slice(0, 150),
              }),
          },
      ],
    })
  }

  // ── Marcadores desenhados na margem ────────────────────────────────────────

  async function drawBookmarkMarkers(doc: Document, pageIndex: number) {
    const { session, bookmarks, onBookmarkTap } = propsRef.current
    const onPage = bookmarks.filter((b) => {
      if (b.deletedAt || b.id === undefined || !isPdfLocator(b.cfi)) return false
      return getPdfLocatorStart(b.cfi)?.pageIndex === pageIndex
    })
    if (onPage.length === 0) {
      renderBookmarkMarkers(doc, [], () => undefined)
      return
    }

    const extracted = await session.extractor.getPage(pageIndex)
    const markers = onPage.flatMap((bookmark) => {
      const point = getPdfLocatorStart(bookmark.cfi)!
      const itemIndex = itemIndexAtOffset(extracted.itemStarts, extracted.items, point.offset)
      const span = itemIndex >= 0 ? doc.querySelector<HTMLElement>(`.textLayer span[data-nr-item="${itemIndex}"]`) : null
      // Altura do span em % da página, pelos retângulos reais: o `top` inline do pdf.js é % só fora de
      // "marked content" (PDFs com tags) e vira calc() dentro dele.
      const layerRect = doc.querySelector('.textLayer')?.getBoundingClientRect()
      const top = span && layerRect?.height ? ((span.getBoundingClientRect().top - layerRect.top) / layerRect.height) * 100 : 0
      return [{ id: bookmark.id!, topPct: Math.min(100, Math.max(0, top)), color: bookmark.color }]
    })
    renderBookmarkMarkers(doc, markers, (id) => onBookmarkTap?.(id))
  }

  // ── Documento de cada página ───────────────────────────────────────────────

  function setupPageDocument(doc: Document, pageIndex: number) {
    if (pageCleanupsRef.current.has(doc)) return

    const onClick = (event: MouseEvent) => {
      const selection = doc.getSelection()
      if (selection && !selection.isCollapsed) return // há seleção em andamento: não é um toque
      const target = event.target as Element | null
      if (target?.closest('a[href], .nr-pdf-bubble, .nr-pdf-bookmark-marker')) return

      const span = target?.closest<HTMLElement>('.textLayer span[data-nr-item]')
      if (span?.textContent?.trim()) {
        void handleTextTap(doc, pageIndex, Number(span.dataset.nrItem), event)
        return
      }
      hideBubble(doc)
      propsRef.current.onCenterTap()
    }
    doc.addEventListener('click', onClick)

    const onRendered = () => {
      void drawBookmarkMarkers(doc, pageIndex)
      // Zoom/tema refazem a camada de texto: a posição (offset do 1º texto visível) mudou de lugar na tela.
      if (viewRef.current?.renderer.index === pageIndex) scheduleRelocate()
    }
    doc.addEventListener(PDF_PAGE_RENDERED_EVENT, onRendered)

    const detachPinch = attachPinchZoom(doc, {
      onStart: () => zoomPctRef.current,
      onChange: (ratio, center) => {
        // Feedback imediato sem re-renderizar: escala visual do host em torno do ponto da pinça.
        const view = viewRef.current
        const frame = doc.defaultView?.frameElement as HTMLElement | null
        if (!view || !frame) return
        const frameRect = frame.getBoundingClientRect()
        const viewRect = view.getBoundingClientRect()
        view.style.transformOrigin = `${frameRect.left + center.x - viewRect.left}px ${frameRect.top + center.y - viewRect.top}px`
        view.style.transform = `scale(${ratio})`
      },
      onEnd: (ratio) => {
        const view = viewRef.current
        if (view) {
          view.style.transform = ''
          view.style.transformOrigin = ''
        }
        void applyZoom(clampZoomPct(zoomPctRef.current * ratio))
      },
      onCancel: () => {
        const view = viewRef.current
        if (view) view.style.transform = ''
      },
    })

    pageCleanupsRef.current.set(doc, () => {
      doc.removeEventListener('click', onClick)
      doc.removeEventListener(PDF_PAGE_RENDERED_EVENT, onRendered)
      detachPinch()
    })

    // A camada de texto pode já estar pronta quando o 'load' chega: desenha agora também.
    if (hasRenderedText(doc)) onRendered()
  }

  // Zoom em %: 100 = página na largura da tela. O foliate refaz o layout e volta para o topo da página atual,
  // então reancora no mesmo ponto do texto que estava visível antes.
  async function applyZoom(nextPct: number) {
    const view = viewRef.current
    if (!view || nextPct === zoomPctRef.current) return
    const anchor = lastLocationRef.current ? getPdfLocatorStart(lastLocationRef.current.cfi) : null
    zoomPctRef.current = nextPct
    view.renderer.setAttribute('scale-factor', String(nextPct))
    // Com zoom > 100% a página passa da largura da tela: libera a rolagem horizontal do host (estilo inline
    // vence a regra :host([flow="scrolled"]) { overflow-x: hidden } do foliate).
    view.renderer.style.overflowX = nextPct > PDF_ZOOM_MIN_PCT ? 'auto' : 'hidden'
    if (anchor) {
      await sleep(WAIT_POLL_MS)
      await navigateToPoint(anchor)
    }
  }

  // ── Montagem do foliate-view ───────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const { session } = propsRef.current

    let cancelled = false
    let view: PdfFoliateView | null = null
    const pageCleanups = pageCleanupsRef.current

    async function setup() {
      try {
        // Import dinâmico registra <foliate-view> e mantém o foliate fora do bundle inicial.
        await import('foliate-js/view.js')
        if (cancelled) return

        view = document.createElement('foliate-view') as unknown as PdfFoliateView
        view.style.cssText = 'width:100%;height:100%;display:block'
        container!.appendChild(view as unknown as Node)
        viewRef.current = view

        // O detail do 'relocate' do foliate-view não traz o índice da página (só fração/seção do livro);
        // no modo scroll o renderer sabe qual página está no centro da tela.
        view.addEventListener<unknown>('relocate', () => {
          if (viewRef.current) void handleRelocate(Math.max(0, viewRef.current.renderer.index))
        })
        view.addEventListener<{ doc: Document; index: number }>('load', (event) => {
          setupPageDocument(event.detail.doc, event.detail.index)
        })

        await view.open(session.pdfBook)
        if (cancelled) return

        // Rolagem contínua de páginas (foliate-fxl em flow=scrolled).
        view.renderer.setAttribute('flow', 'scrolled')
        view.renderer.shadowRoot.append(Object.assign(document.createElement('style'), { textContent: FXL_EXTRA_CSS }))
        applyTheme(propsRef.current.readerTheme)

        propsRef.current.onTocReady(tocForViewer(session.pdfBook.toc))

        // Posição inicial: alvo explícito > progresso salvo > início. Navegar SEMPRE, inclusive para a página 0:
        // ao entrar no modo scroll o foliate calcula o "índice atual" com as páginas ainda sem altura (todas
        // empilhadas no topo) e rola para uma página do meio do livro; este goTo corrige isso.
        const start = getPdfLocatorStart(propsRef.current.initialTarget ?? propsRef.current.savedLocator)
        await navigateToPoint(start ?? { pageIndex: 0, offset: 0 })
        if (cancelled) return
        readyRef.current = true
        // onLoad depois de posicionar: o ReaderScreen esconde o "carregando" aqui, e a página 0 não pode piscar.
        propsRef.current.onLoad()
        void handleRelocate(Math.max(0, view.renderer.index))
      } catch (error) {
        if (!cancelled) propsRef.current.onError(error instanceof Error ? error : new Error(String(error)))
      }
    }
    void setup()

    return () => {
      cancelled = true
      readyRef.current = false
      if (relocateTimerRef.current) clearTimeout(relocateTimerRef.current)
      for (const cleanup of pageCleanups.values()) cleanup()
      pageCleanups.clear()
      viewRef.current = null
      try {
        view?.close()
      } catch {
        // close() destrói o renderer; se já foi destruído não há o que fazer.
      }
      view?.remove()
    }
    // O viewer é montado uma vez por sessão de PDF; as demais props são lidas via propsRef. Os handlers
    // (handleRelocate etc.) são recriados a cada render mas só leem refs — incluí-los remontaria o foliate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.session, propsRef])

  // ── Tema ───────────────────────────────────────────────────────────────────

  function applyTheme(theme: ReaderTheme) {
    const view = viewRef.current
    if (!view) return
    const palette = getReaderThemePalette(theme)
    // pdf.js recolore o texto/fundo da página (pageColors) e o foliate pinta o fundo entre as páginas.
    view.renderer.pageColors = { background: palette.background, foreground: palette.text }
    view.renderer.style.setProperty('--scroll-bg-color', palette.background)
    view.style.backgroundColor = palette.background
  }

  const themeAppliedRef = useRef(false)
  useEffect(() => {
    applyTheme(props.readerTheme)
    // Trocar pageColors refaz o layout e o foliate volta ao topo da página atual: reancora no texto visível.
    // Na montagem inicial quem posiciona é o setup (acima), não este efeito.
    if (themeAppliedRef.current) {
      const anchor = lastLocationRef.current ? getPdfLocatorStart(lastLocationRef.current.cfi) : null
      if (anchor) void sleep(WAIT_POLL_MS).then(() => navigateToPoint(anchor))
    }
    themeAppliedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyTheme/navigateToPoint só leem refs
  }, [props.readerTheme])

  // Marcadores: redesenha nas páginas carregadas quando a lista muda (criar/remover/sincronizar).
  useEffect(() => {
    const contents = viewRef.current?.renderer.getContents() ?? []
    for (const { doc, index } of contents) void drawBookmarkMarkers(doc, index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.bookmarks])

  // ── Contrato EpubViewerHandle ──────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    next: () => void viewRef.current?.renderer.next(),
    prev: () => void viewRef.current?.renderer.prev(),
    prevToEnd: () => {
      const { session } = propsRef.current
      const current = lastLocationRef.current ? getPdfLocatorStart(lastLocationRef.current.cfi) : null
      const chunk = current ? findChunkForPage(session.chunks, current.pageIndex) : null
      const previous = chunk ? session.chunks[chunk.index - 1] : null
      if (previous) void navigateToPoint({ pageIndex: previous.endPage, offset: 0 }, { alignEnd: true })
    },
    // US4 (TTS): "seção" = trecho. Sem TTS nesta fase, não há próxima seção para a leitura contínua.
    goToNextTtsSection: () => false,
    goTo: (target) => {
      const { session } = propsRef.current
      if (typeof target === 'number') {
        void navigateToPoint({ pageIndex: target, offset: 0 })
      } else if (typeof target === 'string') {
        const point = getPdfLocatorStart(target)
        if (point) void navigateToPoint(point)
      } else if (typeof target.fraction === 'number') {
        void navigateToPoint({ pageIndex: pageForFraction(target.fraction, session.pageCount), offset: 0 })
      }
    },
    getVisibleLocation: () => {
      const last = lastLocationRef.current
      return last
        ? { cfi: last.cfi, fraction: last.fraction, percentage: last.percentage, tocLabel: last.tocLabel }
        : { cfi: null }
    },

    // ── Fases seguintes: sem implementação ainda (US3 tradução/Word Lens, US4 TTS) ──
    getParagraphs: () => [],
    getSentenceChunks: (): TtsChunk[] => [],
    getFirstVisibleParagraphIndex: () => 0,
    highlightTts: () => undefined,
    clearTts: () => undefined,
    scrollToParagraph: () => undefined,
    resetTtsScroll: () => undefined,
    showTranslationLoading: () => null,
    injectTranslation: () => undefined,
    showWordLensDefinitionLoading: () => undefined,
    injectWordLensDefinition: () => undefined,
    injectWordLensDefinitionError: () => undefined,
    clearTranslation: () => undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  return <div ref={containerRef} className="absolute inset-0" data-testid="pdf-page-viewer" />
})

// O sumário do PDF chega com href = JSON do destino; o ReaderScreen navega por `viewer.goTo(href)`, então
// já entregamos o href como localizador de página (contrato: "hrefs chegam resolvidos para página").
function tocForViewer(toc: readonly PdfTocItem[] | null): TocItem[] {
  return (toc ?? []).map((item) => ({
    label: item.label,
    href: item.index === undefined ? '' : formatPdfPoint({ pageIndex: item.index, offset: 0 }),
    ...(item.subitems ? { subitems: tocForViewer(item.subitems) } : {}),
  }))
}

export type { View }
