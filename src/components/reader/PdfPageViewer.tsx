import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { View } from 'foliate-js/view.js'
import { useSyncRef } from '@/hooks/useSyncRef'
import { useI18n } from '@/i18n'
import type { PdfReaderSession } from '@/hooks/usePdfReaderSession'
import type { PdfTocItem } from '@/services/pdf/PdfBookFactory'
import type { Book, Bookmark } from '@/types/book'
import type { ReaderTheme } from '@/types/settings'
import type { TranslationProvider } from '@/types/translation'
import type { CefrLevel, WordLensData } from '@/types/wordLens'
import { getTranslationProviderLabel } from '@/services/TranslationProviderRegistry'
import type { PdfBlock } from '@/utils/pdfParagraphs'
import { scheduleWordLensDocument, type WordLensDocumentTask } from '@/utils/wordLensDom'
import { findChunkForPage } from '@/utils/pdfChunks'
import {
  formatPdfPoint,
  getPdfLocatorStart,
  isPdfLocator,
  type PdfPoint,
} from '@/utils/pdfLocator'
import { clampPercentage } from '@/utils/progress'
import { getReaderThemePalette, PDF_ORIGINAL_BACKGROUND } from '@/utils/readerPreferences'
import type {
  EpubViewerHandle,
  ParagraphBookmarkPayload,
  ReaderRelocatePayload,
  TtsChunk,
  WordLensDefinitionTarget,
} from './EpubViewer'
import { attachPinchZoom, clampZoomPct, PDF_ZOOM_MAX_PCT, PDF_ZOOM_MIN_PCT } from './pdfPage/pdfPageGestures'
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
import { PDF_PAGE_RENDERED_EVENT, renderBookmarkMarkers } from './pdfPage/pdfPageOverlay'
import {
  clearTextItemHighlight,
  hasTranslationPanel,
  hideTranslationPanel,
  highlightTextItems,
  markVocabularyInTextLayer,
  renderTranslationPanel,
  type PdfDefinitionState,
  type PdfPanelAction,
} from './pdfPage/pdfPageTranslation'
import { nextSentenceInBlock, resolveTapInBlock, wordLensTargetAt, type PdfWordLensTarget } from './pdfPage/pdfPageWords'

// Página fiel de PDF (feature 022, DI-004): foliate-view sobre o renderer de layout fixo (foliate-fxl) em
// rolagem contínua. Implementa o mesmo contrato EpubViewerHandle do EpubViewer — ReaderScreen, useTTS e
// useTranslatedAudiobook o dirigem sem saber o formato. Tradução, Word Lens, TTS e highlights entram nas
// próximas fases (US4–US5); aqui valem leitura, zoom, tema, sumário, progresso, marcadores (US1) e Word Lens +
// tradução (US3): o toque traduz a frase tocada num painel dentro da página, como o bloco inline do EPUB.

export interface PdfPageViewerProps {
  book: Book
  session: PdfReaderSession
  bookmarks: Bookmark[]
  readerTheme: ReaderTheme
  overrideBookColors: boolean
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
  // US3 — mesmos callbacks/tipos do EpubViewer (a ReaderScreen usa os mesmos handlers nos dois viewers).
  wordLensEnabled?: boolean
  wordLensLevel?: CefrLevel
  wordLensData?: WordLensData | null
  vocabWords?: string[]
  onTranslate?: (sourceText: string) => void
  onWordLensDefinition?: (target: WordLensDefinitionTarget) => void
  onSaveVocab?: (sourceText: string, translatedText: string) => void
  onSpeakOne?: (text: string) => void
}

// Tradução aberta na página fiel. É estado (não só DOM) porque o pdf.js recria a camada de texto a cada
// render (zoom/tema) e o painel precisa ser redesenhado igual.
interface ActivePdfTranslation {
  selectionId: string
  doc: Document
  pageIndex: number
  block: PdfBlock
  blockStart: PdfPoint
  sentence: string
  sentenceStart: number
  anchor: { topPct: number; bottomPct: number }
  translation: { status: 'loading' } | { status: 'ready'; text: string; provider?: TranslationProvider }
  wordLens: { target: PdfWordLensTarget; state: PdfDefinitionState } | null
  saved: boolean
}

// Subconjunto do renderer foliate-fxl que usamos (não há .d.ts do fixed-layout).
interface FxlRenderer extends HTMLElement {
  readonly index: number // página no centro da tela (modo scroll)
  pageColors: { background?: string; foreground?: string }
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
  const activeTranslationRef = useRef<ActivePdfTranslation | null>(null)
  const translationSeqRef = useRef(0)
  const wordLensTasksRef = useRef(new Map<Document, WordLensDocumentTask>())

  // ── Localização ────────────────────────────────────────────────────────────

  // Página carregada (iframe montado e camada de texto desenhada) — undefined enquanto não houver.
  const getLoadedDoc = (pageIndex: number): Document | undefined => {
    const contents = viewRef.current?.renderer.getContents() ?? []
    return contents.find((c) => c.index === pageIndex)?.doc
  }

  const hasRenderedText = (doc: Document | undefined): boolean =>
    !!doc && doc.querySelector('.textLayer span[data-nr-item]') !== null

  // Página no TOPO da tela. O foliate-fxl informa (renderer.index) a página que cruza o MEIO da tela; usar
  // essa salvava a página seguinte à que se lê (o 1º texto dela, offset 0) e, ao reabrir, o parágrafo lido
  // ficava até meia tela acima. Sem página carregada mensurável (ex.: jsdom), cai no índice do foliate.
  function getTopVisiblePageIndex(): number {
    const view = viewRef.current
    if (!view) return 0
    const fallback = Math.max(0, view.renderer.index)
    const hostTop = view.renderer.getBoundingClientRect().top
    let topIndex: number | null = null
    let topRectTop = Infinity
    for (const { doc, index } of view.renderer.getContents()) {
      const rect = (doc.defaultView?.frameElement as HTMLElement | null | undefined)?.getBoundingClientRect()
      // Página com alguma parte abaixo do topo do host; das que sobram, a mais alta é a que está no topo
      // (inclui o caso do vão entre páginas: a próxima página é a do topo).
      if (!rect || rect.height <= 0 || rect.bottom <= hostTop + 1) continue
      if (rect.top < topRectTop) {
        topRectTop = rect.top
        topIndex = index
      }
    }
    return topIndex ?? fallback
  }

  // `needText`: quem vai procurar um <span> da página (ir até uma linha) precisa da camada de texto, que fica
  // pronta DEPOIS da imagem (~100 ms depois, medido). Sem isto, voltar a um marcador de página descartada da
  // memória achava a imagem, não achava o span e parava no topo da página (R-050).
  async function waitForRenderedPage(pageIndex: number, options: { needText?: boolean } = {}): Promise<Document | null> {
    const deadline = Date.now() + WAIT_FOR_PAGE_MS
    while (Date.now() < deadline) {
      const doc = getLoadedDoc(pageIndex)
      if (hasRenderedText(doc)) return doc ?? null
      // Página sem texto (escaneada) nunca terá spans: basta a imagem da página existir (R-030: <img>, não canvas).
      if (!options.needText && doc?.querySelector('#canvas img, #canvas canvas')) return doc ?? null
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
    // Ir até uma linha (offset > 0) numa página com texto exige a camada de texto, não só a imagem.
    const extracted = !options.alignEnd && point.offset > 0 ? await session.extractor.getPage(pageIndex) : null
    const itemIndex = extracted ? itemIndexAtOffset(extracted.itemStarts, extracted.items, point.offset) : -1
    const doc = await waitForRenderedPage(pageIndex, { needText: itemIndex >= 0 })
    if (!doc) return

    const frame = doc.defaultView?.frameElement as HTMLElement | null
    if (options.alignEnd) {
      frame?.scrollIntoView({ block: 'end' })
      return
    }
    // Rola até a linha do offset salvo: texto bruto da página → item → <span data-nr-item>.
    if (itemIndex < 0) return
    const span = doc.querySelector<HTMLElement>(`.textLayer span[data-nr-item="${itemIndex}"]`)
    if (span && frame) scrollRendererToSpan(view.renderer, frame, span)
  }

  // Põe o topo do span no topo do leitor. Conta explícita em vez de `span.scrollIntoView()`: chamado de dentro do
  // iframe da página (documento com transform 1/dpr), ele não rolava o renderer — o marcador do capítulo 3 de
  // O Milagre da Manhã abria no topo da página, com o parágrafo marcado 369 px abaixo (bug do device, R-050).
  function scrollRendererToSpan(renderer: FxlRenderer, frame: HTMLElement, span: HTMLElement) {
    const frameRect = frame.getBoundingClientRect()
    // Rect do span é relativo ao viewport do iframe e sem a escala que a página tem no documento pai.
    const scale = frame.offsetWidth ? frameRect.width / frame.offsetWidth : 1
    const spanTop = frameRect.top + span.getBoundingClientRect().top * scale
    renderer.scrollTop += spanTop - renderer.getBoundingClientRect().top
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
      if (viewRef.current) void handleRelocate(getTopVisiblePageIndex())
    }, 250)
  }

  async function handleRelocate(pageIndex: number) {
    if (!readyRef.current) return
    const token = ++relocateTokenRef.current
    const { session, onRelocate } = propsRef.current
    const { offset, fractionInPage } = await readPagePosition(pageIndex)
    if (token !== relocateTokenRef.current) return // chegou outro relocate enquanto lia o texto

    const exactPercentage = progressPercentage(pageIndex, fractionInPage, session.pageCount)
    const tocItem = tocItemForPage(session.pdfBook.toc, pageIndex)
    const payload: ReaderRelocatePayload = {
      cfi: formatPdfPoint({ pageIndex, offset }),
      // Fração precisa (navegação por fração); percentual inteiro como o do EPUB — é o que o chrome exibe.
      fraction: exactPercentage / 100,
      percentage: clampPercentage(exactPercentage),
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

  // Offset bruto exato do caractere tocado: caret dentro do span do item (que pode ter spans de Word Lens
  // dentro); sem caret (jsdom, toque fora da linha) vale o início do item.
  function caretOffsetInItem(doc: Document, span: HTMLElement, event: MouseEvent): number {
    let caret: Range | null = null
    try {
      caret = doc.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null
    } catch {
      caret = null
    }
    if (!caret || !span.contains(caret.startContainer)) return 0
    const before = doc.createRange()
    before.selectNodeContents(span)
    before.setEnd(caret.startContainer, caret.startOffset)
    return before.toString().length
  }

  // Itens da camada de texto que pertencem ao bloco nesta página (destaque do parágrafo ativo).
  async function blockItemsOnPage(block: PdfBlock, pageIndex: number): Promise<number[]> {
    const extracted = await propsRef.current.session.extractor.getPage(pageIndex)
    const ranges = block.ranges.filter((r) => r.pageIndex === pageIndex)
    const items: number[] = []
    extracted.items.forEach((item, index) => {
      const start = extracted.itemStarts[index] ?? 0
      const end = start + item.str.length
      if (item.str.trim() && ranges.some((r) => start < r.end && end > r.start)) items.push(index)
    })
    return items
  }

  // Faixa vertical da linha tocada, em % da página (o painel abre colado nela).
  function lineAnchor(doc: Document, span: HTMLElement): { topPct: number; bottomPct: number } {
    const layerRect = doc.querySelector('.textLayer')?.getBoundingClientRect()
    const rect = span.getBoundingClientRect()
    if (!layerRect?.height) return { topPct: 50, bottomPct: 52 }
    return {
      topPct: ((rect.top - layerRect.top) / layerRect.height) * 100,
      bottomPct: ((rect.bottom - layerRect.top) / layerRect.height) * 100,
    }
  }

  function bookmarkForBlock(blockStart: PdfPoint) {
    const locator = formatPdfPoint(blockStart)
    return propsRef.current.bookmarks.find((b) => !b.deletedAt && b.cfi === locator)
  }

  function toggleBookmark(block: PdfBlock, blockStart: PdfPoint) {
    const { session, onBookmarkParagraph, onBookmarkTap } = propsRef.current
    const existing = bookmarkForBlock(blockStart)
    if (existing?.id !== undefined) {
      onBookmarkTap?.(existing.id)
      return
    }
    // Inteiro, como no EPUB: a lista de marcadores exibe o valor gravado sem formatar.
    const percentage = clampPercentage(progressPercentage(blockStart.pageIndex, 0, session.pageCount))
    onBookmarkParagraph?.({
      cfi: formatPdfPoint(blockStart),
      label: tocLabelForPage(session.pdfBook.toc, blockStart.pageIndex) ?? `${Math.round(percentage)}%`,
      percentage,
      snippet: block.text.slice(0, 150),
    })
  }

  // Mesmas ações do bloco inline do EPUB (próxima, ouvir, marcar, salvar) + fechar.
  function panelActions(active: ActivePdfTranslation): PdfPanelAction[] {
    const t = tRef.current
    const { onSpeakOne, onSaveVocab } = propsRef.current
    const bookmarked = !!bookmarkForBlock(active.blockStart)
    const actions: PdfPanelAction[] = []
    if (active.translation.status === 'ready') {
      actions.push({ id: 'next', label: t('reader.translation.next'), onSelect: () => translateNextSentence() })
      if (onSpeakOne) actions.push({ id: 'speak', label: t('reader.translation.speak'), onSelect: () => onSpeakOne(active.sentence) })
    }
    actions.push({
      id: 'bookmark',
      label: bookmarked ? t('reader.translation.remove') : t('reader.translation.bookmark'),
      pressed: bookmarked,
      onSelect: () => toggleBookmark(active.block, active.blockStart),
    })
    if (active.translation.status === 'ready' && onSaveVocab) {
      const text = active.translation.text
      actions.push({
        id: 'save',
        label: active.saved ? t('reader.translation.saved') : t('reader.translation.save'),
        onSelect: () => {
          if (active.saved) return
          onSaveVocab(active.sentence, text)
          active.saved = true
          renderActiveTranslation()
        },
      })
    }
    actions.push({ id: 'close', label: t('pdf.translation.close'), onSelect: () => clearActiveTranslation() })
    return actions
  }

  function renderActiveTranslation() {
    const active = activeTranslationRef.current
    if (!active) return
    const { readerTheme, overrideBookColors } = propsRef.current
    const translation = active.translation
    // Selo "via {provedor}" só fora do MyMemory (FR-008 da feature 017, mesma regra do EPUB).
    const providerLabel = translation.status === 'ready' && translation.provider && translation.provider !== 'mymemory'
      ? getTranslationProviderLabel(translation.provider)
      : null
    renderTranslationPanel(active.doc, {
      anchor: active.anchor,
      // Modo Original: a página fica com as cores do PDF (fundo claro na prática) → painel claro.
      palette: { isDark: overrideBookColors && getReaderThemePalette(readerTheme).isDark },
      translation: translation.status === 'ready' ? { status: 'ready', text: translation.text, providerLabel } : { status: 'loading' },
      wordLens: active.wordLens,
      actions: panelActions(active),
    }, tRef.current)
  }

  function clearActiveTranslation() {
    const active = activeTranslationRef.current
    activeTranslationRef.current = null
    if (!active) return
    hideTranslationPanel(active.doc)
    clearTextItemHighlight(active.doc)
  }

  // Abre a tradução de uma frase do bloco. Mesmo fluxo do EPUB: o viewer emite a frase (onTranslate) e a
  // ReaderScreen chama showTranslationLoading/injectTranslation; a definição chega por onWordLensDefinition.
  async function startTranslation(
    doc: Document,
    pageIndex: number,
    block: PdfBlock,
    blockStart: PdfPoint,
    sentence: { text: string; start: number },
    anchor: { topPct: number; bottomPct: number },
    wordLensTarget: PdfWordLensTarget | null,
  ) {
    const previous = activeTranslationRef.current
    if (previous && previous.doc !== doc) {
      hideTranslationPanel(previous.doc)
      clearTextItemHighlight(previous.doc)
    }
    const selectionId = `pdf-tr-${++translationSeqRef.current}`
    const active: ActivePdfTranslation = {
      selectionId,
      doc,
      pageIndex,
      block,
      blockStart,
      sentence: sentence.text,
      sentenceStart: sentence.start,
      anchor,
      translation: { status: 'loading' },
      wordLens: wordLensTarget ? { target: wordLensTarget, state: { status: 'loading' } } : null,
      saved: false,
    }
    activeTranslationRef.current = active
    renderActiveTranslation()

    const { onTranslate, onWordLensDefinition } = propsRef.current
    onTranslate?.(sentence.text)
    if (wordLensTarget) onWordLensDefinition?.({ ...wordLensTarget, selectionId })

    const items = await blockItemsOnPage(block, pageIndex)
    if (activeTranslationRef.current === active) highlightTextItems(doc, items)
  }

  function translateNextSentence() {
    const active = activeTranslationRef.current
    if (!active) return
    const next = nextSentenceInBlock(active.block.text, active.sentenceStart, active.sentence)
    if (next) {
      void startTranslation(active.doc, active.pageIndex, active.block, active.blockStart, { text: next.sentence, start: next.start }, active.anchor, null)
      return
    }
    // Fim do parágrafo: 1ª frase do próximo parágrafo do trecho, se ele começa nesta mesma página.
    void (async () => {
      const { session } = propsRef.current
      const chunk = findChunkForPage(session.chunks, active.pageIndex)
      if (!chunk) return
      const blocks = await session.extractor.reconstructChunk(chunk)
      const index = blocks.indexOf(active.block)
      const following = blocks.slice(index + 1).find((b) => b.kind !== 'figure' && b.text.trim())
      const start = following ? blockStartPoint(following) : null
      if (index < 0 || !following || !start || start.pageIndex !== active.pageIndex) return
      const first = resolveTapInBlock(following, start, '')
      void startTranslation(active.doc, active.pageIndex, following, start, { text: first.sentence, start: first.sentenceStart }, active.anchor, null)
    })()
  }

  async function handleTextTap(doc: Document, pageIndex: number, span: HTMLElement, event: MouseEvent) {
    const { session, wordLensEnabled, wordLensLevel, wordLensData } = propsRef.current
    const itemIndex = Number(span.dataset.nrItem)
    const anchor = lineAnchor(doc, span)
    const caretOffset = caretOffsetInItem(doc, span, event)

    // Parágrafo tocado: item → offset bruto → bloco reconstruído do trecho (pdfParagraphs).
    const extracted = await session.extractor.getPage(pageIndex)
    const point: PdfPoint = { pageIndex, offset: offsetOfItem(extracted.itemStarts, itemIndex) + caretOffset }
    const chunk = findChunkForPage(session.chunks, pageIndex)
    if (!chunk) return
    const block = findBlockAtPoint(await session.extractor.reconstructChunk(chunk), point)
    const start = block ? blockStartPoint(block) : null
    if (!block || !start) return

    const tap = resolveTapInBlock(block, point, extracted.rawText ?? '')
    const target = wordLensEnabled && wordLensLevel
      ? wordLensTargetAt(tap, block.text, wordLensLevel, wordLensData ?? null)
      : null

    // Tocar de novo na mesma frase (sem outra palavra de Word Lens) fecha, como no EPUB.
    const active = activeTranslationRef.current
    if (active && active.doc === doc && active.sentenceStart === tap.sentenceStart &&
      active.blockStart.pageIndex === start.pageIndex && active.blockStart.offset === start.offset &&
      (!target || active.wordLens?.target.lemma === target.lemma)) {
      clearActiveTranslation()
      return
    }
    await startTranslation(doc, pageIndex, block, start, { text: tap.sentence, start: tap.sentenceStart }, anchor, target)
  }

  // ── Word Lens passivo e vocabulário salvo na camada de texto ───────────────

  function decoratePage(doc: Document) {
    const { wordLensEnabled, wordLensLevel, wordLensData, vocabWords } = propsRef.current
    markVocabularyInTextLayer(doc, vocabWords ?? [])
    wordLensTasksRef.current.get(doc)?.cancel()
    if (!wordLensLevel) return
    // Mesmo marcador do EPUB (wordLensDom): processa em lotes ociosos e ignora a interface ([data-nr-ui]).
    const task = scheduleWordLensDocument(doc, { enabled: !!wordLensEnabled, level: wordLensLevel, data: wordLensData ?? null })
    wordLensTasksRef.current.set(doc, task)
    void task.completed.then(() => {
      if (wordLensTasksRef.current.get(doc) === task) wordLensTasksRef.current.delete(doc)
    })
  }

  function updateDefinition(target: WordLensDefinitionTarget, state: PdfDefinitionState) {
    const active = activeTranslationRef.current
    if (!active?.wordLens || target.selectionId !== active.selectionId) return
    active.wordLens = { target: active.wordLens.target, state }
    renderActiveTranslation()
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

  // O foliate-fxl descarta as páginas longe da tela removendo o iframe, sem avisar. Sem esta varredura o Map
  // abaixo segurava o Document de toda página já visitada (camada de texto + closures): ~0,35 MB por página,
  // que nem o GC recuperava. Iframe fora do DOM (ou janela já fechada) = página descartada.
  function releaseDiscardedPages() {
    for (const [doc, cleanup] of pageCleanupsRef.current) {
      const frame = doc.defaultView?.frameElement
      if (frame?.isConnected) continue
      cleanup()
      pageCleanupsRef.current.delete(doc)
    }
  }

  // Handlers da pinça. `toViewport` converte o centro do gesto para coordenadas do documento pai, recebendo a
  // escala visual já aplicada: no documento da página o centro vem relativo ao iframe; no contêiner do pai já
  // está nelas. `coordsFollowViewScale`: o feedback visual (`scale()` no foliate-view) escala o próprio iframe,
  // então dentro dele a distância entre os dedos encolhe na proporção da escala já aplicada — sem compensar,
  // a razão medida convergia para a raiz da real (pedir ×1,5 dava ×1,22).
  function makePinchHandlers(
    toViewport: (point: { x: number; y: number }, appliedScale: number) => { x: number; y: number },
    options: { coordsFollowViewScale: boolean },
  ) {
    let appliedScale = 1
    // Ponto da tela entre os dedos no início do gesto: âncora fixa do zoom. Antes a origem era recalculada a cada
    // movimento a partir do retângulo JÁ escalado; o erro se acumulava, a origem ia parar fora da tela e o texto
    // "sumia" durante a pinça (bug do device, O Milagre da Manhã).
    let focal: { x: number; y: number } | null = null
    const resetVisualScale = () => {
      appliedScale = 1
      const view = viewRef.current
      if (!view) return
      view.style.transform = ''
      view.style.transformOrigin = ''
    }
    return {
      onStart: (center: { x: number; y: number }) => {
        resetVisualScale()
        // Sem escala aplicada ainda: a conversão para coordenadas do documento pai é exata aqui.
        focal = toViewport(center, 1)
        const view = viewRef.current
        if (view) {
          const viewRect = view.getBoundingClientRect()
          view.style.transformOrigin = `${focal.x - viewRect.left}px ${focal.y - viewRect.top}px`
        }
        return zoomPctRef.current
      },
      onChange: (rawRatio: number) => {
        // Feedback imediato sem re-renderizar: escala visual do host em torno do ponto fixo da pinça.
        const view = viewRef.current
        if (!view) return
        const ratio = options.coordsFollowViewScale ? rawRatio * appliedScale : rawRatio
        // Limita o feedback ao zoom permitido (100–400%): a prévia não promete o que o soltar não entrega.
        const base = zoomPctRef.current
        appliedScale = Math.min(PDF_ZOOM_MAX_PCT / base, Math.max(PDF_ZOOM_MIN_PCT / base, ratio))
        view.style.transform = `scale(${appliedScale})`
      },
      onEnd: (rawRatio: number) => {
        // Com compensação, a razão real já é a última aplicada (a `rawRatio` final é a do último movimento).
        const ratio = options.coordsFollowViewScale ? appliedScale : rawRatio
        resetVisualScale()
        applyZoom(clampZoomPct(zoomPctRef.current * ratio), focal)
        focal = null
      },
      onCancel: () => {
        resetVisualScale()
        focal = null
      },
    }
  }

  function setupPageDocument(doc: Document, pageIndex: number) {
    releaseDiscardedPages()
    if (pageCleanupsRef.current.has(doc)) return

    const onClick = (event: MouseEvent) => {
      const selection = doc.getSelection()
      if (selection && !selection.isCollapsed) return // há seleção em andamento: não é um toque
      const target = event.target as Element | null
      if (target?.closest('a[href], .nr-pdf-translation, .nr-pdf-bookmark-marker')) return

      const span = target?.closest<HTMLElement>('.textLayer span[data-nr-item]')
      if (span?.textContent?.trim()) {
        void handleTextTap(doc, pageIndex, span, event)
        return
      }
      // Fora do texto com tradução aberta: o toque só fecha o painel (não alterna o chrome).
      if (activeTranslationRef.current) {
        clearActiveTranslation()
        return
      }
      propsRef.current.onCenterTap()
    }
    doc.addEventListener('click', onClick)

    const onRendered = () => {
      void drawBookmarkMarkers(doc, pageIndex)
      decoratePage(doc)
      // A camada de texto foi recriada (zoom/tema): redesenha a tradução aberta nesta página.
      const active = activeTranslationRef.current
      if (active?.doc === doc) {
        if (!hasTranslationPanel(doc)) renderActiveTranslation()
        void blockItemsOnPage(active.block, pageIndex).then((items) => {
          if (activeTranslationRef.current === active) highlightTextItems(doc, items)
        })
      }
      // Zoom/tema refazem a camada de texto: a posição (offset do 1º texto visível) mudou de lugar na tela.
      if (viewRef.current && getTopVisiblePageIndex() === pageIndex) scheduleRelocate()
    }
    doc.addEventListener(PDF_PAGE_RENDERED_EVENT, onRendered)

    // O retângulo do iframe já vem transformado; o centro (coordenadas internas do iframe) escala junto.
    const detachPinch = attachPinchZoom(doc, makePinchHandlers((center, appliedScale) => {
      const frameRect = (doc.defaultView?.frameElement as HTMLElement | null)?.getBoundingClientRect()
      return frameRect
        ? { x: frameRect.left + center.x * appliedScale, y: frameRect.top + center.y * appliedScale }
        : center
    }, { coordsFollowViewScale: true }))

    pageCleanupsRef.current.set(doc, () => {
      wordLensTasksRef.current.get(doc)?.cancel()
      wordLensTasksRef.current.delete(doc)
      // Página descartada pelo foliate com a tradução aberta nela: o estado não pode segurar o Document.
      if (activeTranslationRef.current?.doc === doc) activeTranslationRef.current = null
      doc.removeEventListener('click', onClick)
      doc.removeEventListener(PDF_PAGE_RENDERED_EVENT, onRendered)
      detachPinch()
    })

    // A camada de texto pode já estar pronta quando o 'load' chega: desenha agora também.
    if (hasRenderedText(doc)) onRendered()
  }

  // Zoom em %: 100 = página na largura da tela. O foliate redimensiona as páginas na hora (render síncrono) e
  // rola para o topo da página do meio; aqui a rolagem é corrigida para o MESMO ponto da página continuar sob os
  // dedos (`focal`, coordenadas da tela) — como no zoom de qualquer leitor de PDF.
  function applyZoom(nextPct: number, focal: { x: number; y: number } | null) {
    const view = viewRef.current
    if (!view || nextPct === zoomPctRef.current) return
    const renderer = view.renderer
    // Antes do zoom: qual página está sob o ponto e em que fração dela (0–1 na largura e na altura).
    const target = focal ? pageUnderPoint(renderer, focal) : null
    const fx = target ? (focal!.x - target.rect.left) / target.rect.width : 0
    const fy = target ? (focal!.y - target.rect.top) / target.rect.height : 0

    zoomPctRef.current = nextPct
    // Com zoom > 100% a página passa da largura da tela: libera a rolagem horizontal do host (estilo inline
    // vence a regra :host([flow="scrolled"]) { overflow-x: hidden } do foliate). Antes do scale-factor, para o
    // scrollLeft abaixo já valer.
    renderer.style.overflowX = nextPct > PDF_ZOOM_MIN_PCT ? 'auto' : 'hidden'
    renderer.setAttribute('scale-factor', String(nextPct))

    if (target && focal) {
      // Depois do zoom: leva o mesmo ponto da página de volta para baixo dos dedos.
      const rect = target.el.getBoundingClientRect()
      renderer.scrollTop += rect.top + fy * rect.height - focal.y
      renderer.scrollLeft += rect.left + fx * rect.width - focal.x
    }
  }

  function pageUnderPoint(renderer: FxlRenderer, point: { x: number; y: number }) {
    const pages = [...renderer.shadowRoot.querySelectorAll<HTMLElement>('.scroll-page')]
    let best: { el: HTMLElement; rect: DOMRect } | null = null
    for (const el of pages) {
      const rect = el.getBoundingClientRect()
      if (rect.height <= 0) continue
      if (point.y >= rect.top && point.y <= rect.bottom) return { el, rect }
      // Ponto no vão entre páginas: fica com a mais próxima na vertical.
      const dist = Math.min(Math.abs(rect.top - point.y), Math.abs(rect.bottom - point.y))
      if (!best || dist < Math.min(Math.abs(best.rect.top - point.y), Math.abs(best.rect.bottom - point.y))) best = { el, rect }
    }
    return best
  }

  // ── Montagem do foliate-view ───────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const { session } = propsRef.current

    let cancelled = false
    let view: PdfFoliateView | null = null
    const pageCleanups = pageCleanupsRef.current
    // Pinça também no contêiner: logo depois de rolar os iframes estão sem pointer-events e o toque cai aqui.
    const detachHostPinch = attachPinchZoom(container, makePinchHandlers((center) => center, { coordsFollowViewScale: false }))

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
        // a página é medida aqui (a do topo da tela — ver getTopVisiblePageIndex).
        view.addEventListener<unknown>('relocate', () => {
          if (viewRef.current) void handleRelocate(getTopVisiblePageIndex())
        })
        view.addEventListener<{ doc: Document; index: number }>('load', (event) => {
          setupPageDocument(event.detail.doc, event.detail.index)
        })

        await view.open(session.pdfBook)
        if (cancelled) return

        // Rolagem contínua de páginas (foliate-fxl em flow=scrolled).
        view.renderer.setAttribute('flow', 'scrolled')
        view.renderer.shadowRoot.append(Object.assign(document.createElement('style'), { textContent: FXL_EXTRA_CSS }))
        applyTheme(propsRef.current.readerTheme, propsRef.current.overrideBookColors)

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
        void handleRelocate(getTopVisiblePageIndex())
      } catch (error) {
        if (!cancelled) propsRef.current.onError(error instanceof Error ? error : new Error(String(error)))
      }
    }
    void setup()

    return () => {
      cancelled = true
      readyRef.current = false
      if (relocateTimerRef.current) clearTimeout(relocateTimerRef.current)
      detachHostPinch()
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

  function applyTheme(theme: ReaderTheme, overrideBookColors: boolean) {
    const view = viewRef.current
    if (!view) return
    const palette = getReaderThemePalette(theme)
    // Original: objeto vazio devolve ao pdf.js as cores do próprio PDF; o setter do foliate redesenha páginas
    // já abertas. O tema escolhido continua salvo para quando o usuário voltar ao modo confortável.
    const background = overrideBookColors ? palette.background : PDF_ORIGINAL_BACKGROUND
    view.renderer.pageColors = overrideBookColors
      ? { background: palette.background, foreground: palette.text }
      : {}
    view.renderer.style.setProperty('--scroll-bg-color', background)
    view.style.backgroundColor = background
  }

  const themeAppliedRef = useRef(false)
  useEffect(() => {
    applyTheme(props.readerTheme, props.overrideBookColors)
    // Trocar pageColors refaz o layout e o foliate volta ao topo da página atual: reancora no texto visível.
    // Na montagem inicial quem posiciona é o setup (acima), não este efeito.
    if (themeAppliedRef.current) {
      const anchor = lastLocationRef.current ? getPdfLocatorStart(lastLocationRef.current.cfi) : null
      if (anchor) void sleep(WAIT_POLL_MS).then(() => navigateToPoint(anchor))
    }
    themeAppliedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyTheme/navigateToPoint só leem refs
  }, [props.readerTheme, props.overrideBookColors])

  // Marcadores: redesenha nas páginas carregadas quando a lista muda (criar/remover/sincronizar).
  useEffect(() => {
    const contents = viewRef.current?.renderer.getContents() ?? []
    for (const { doc, index } of contents) void drawBookmarkMarkers(doc, index)
    // O botão Marcar/Remover do painel aberto acompanha a lista.
    if (activeTranslationRef.current) renderActiveTranslation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.bookmarks])

  // Word Lens (liga/desliga, nível, dados carregados) e vocabulário salvo: remarca as páginas carregadas.
  useEffect(() => {
    const contents = viewRef.current?.renderer.getContents() ?? []
    for (const { doc } of contents) if (hasRenderedText(doc)) decoratePage(doc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.wordLensEnabled, props.wordLensLevel, props.wordLensData, props.vocabWords])

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

    // ── US3: tradução e Word Lens no painel da página ──
    showTranslationLoading: () => {
      const active = activeTranslationRef.current
      if (!active) return null
      active.translation = { status: 'loading' }
      renderActiveTranslation()
      return active.selectionId
    },
    injectTranslation: (text, selectionId, provider) => {
      const active = activeTranslationRef.current
      // Resposta de uma tradução já trocada por outra (toque novo antes de chegar): descarta.
      if (!active || (selectionId && selectionId !== active.selectionId)) return
      active.translation = { status: 'ready', text, provider }
      renderActiveTranslation()
    },
    showWordLensDefinitionLoading: (target) => updateDefinition(target, { status: 'loading' }),
    injectWordLensDefinition: (target, entry) => updateDefinition(target, { status: 'ready', entry }),
    injectWordLensDefinitionError: (target) => updateDefinition(target, { status: 'error' }),
    clearTranslation: () => clearActiveTranslation(),
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
