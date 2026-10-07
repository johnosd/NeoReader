import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { View } from 'foliate-js/view.js'
import { useSyncRef } from '@/hooks/useSyncRef'
import { useI18n } from '@/i18n'
import type { PdfReaderSession } from '@/hooks/usePdfReaderSession'
import type { PdfTocItem } from '@/services/pdf/PdfBookFactory'
import type { Book, Bookmark } from '@/types/book'
import type { Highlight } from '@/types/highlight'
import { shareText } from '@/services/NativeSystemUiService'
import type { ReaderTheme } from '@/types/settings'
import type { TranslationProvider } from '@/types/translation'
import type { CefrLevel, WordLensData } from '@/types/wordLens'
import { getTranslationProviderLabel } from '@/services/TranslationProviderRegistry'
import type { PdfBlock } from '@/utils/pdfParagraphs'
import { scheduleWordLensDocument, type WordLensDocumentTask } from '@/utils/wordLensDom'
import { splitParagraphIntoTtsChunks } from '@/utils/ttsChunking'
import { findChunkForPage } from '@/utils/pdfChunks'
import {
  formatPdfPoint,
  formatPdfRange,
  getPdfLocatorStart,
  isPdfLocator,
  parsePdfRange,
  type PdfPoint,
} from '@/utils/pdfLocator'
import { clampPercentage } from '@/utils/progress'
import { getReaderThemePalette, PDF_ORIGINAL_BACKGROUND } from '@/utils/readerPreferences'
import type {
  EpubViewerHandle,
  HighlightDraftPayload,
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
import {
  blockItemIndexes,
  clearTtsHighlight,
  firstBlockEndingAfter,
  highlightTtsItems,
  markTtsWord,
  rawWordStart,
  sameBlockStart,
  ttsParagraphBlocks,
} from './pdfPage/pdfPageTts'
import {
  hidePdfMenus,
  highlightIdAt,
  itemSlices,
  menuActionAt,
  openPdfMenu,
  paintPageHighlights,
  rangeOnPage,
  renderPdfMenu,
  selectionBoundaryToRaw,
  type PdfMenuActionId,
} from './pdfPage/pdfPageHighlights'

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
  // US4 (TTS) — mesmos callbacks/semântica do EpubViewer. "Seção" = trecho (DI-009).
  onSectionReady?: (sectionIndex: number, sectionHref?: string) => void
  onParagraphTapForTts?: (idx: number) => void
  onTtsUserScrollAway?: () => void
  // Leitura contínua ativa (tocando ou pausada): tocar num parágrafo leva o TTS até ele em vez de traduzir.
  ttsGlobalActive?: boolean
  // US5 — highlights com localizador `neopdf:` de intervalo; mesmos callbacks do EpubViewer (a caixa unificada
  // HighlightComposerSheet fica na ReaderScreen).
  highlights?: Highlight[]
  onRequestCreateHighlight?: (draft: HighlightDraftPayload) => void
  onDeleteHighlight?: (highlight: Highlight) => void
  onEditHighlight?: (highlight: Highlight) => void
}

// Seleção que abriu o menu de seleção. Guardada porque no Android tocar num botão do menu desfaz a seleção
// nativa ANTES do clique chegar (mesmo achado de device do EpubViewer).
interface PendingPdfSelection {
  doc: Document
  pageIndex: number
  range: Range
}

// Menu de seleção sumindo junto com a seleção: com atraso, para o clique no botão (que desfaz a seleção no
// Android) ainda achar o menu.
const SELECTION_MENU_HIDE_DELAY_MS = 400

// Rolagem feita pelo próprio viewer (TTS acompanhando, salto de seção, zoom) não conta como "usuário rolou".
const PROGRAMMATIC_SCROLL_MS = 1200

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

  // TTS (US4). Seções = trechos; os parágrafos de cada uma são lidos de forma assíncrona (reconstrução) e
  // guardados aqui, porque getParagraphs/getSentenceChunks do contrato são síncronos.
  const ttsSectionsRef = useRef(new Map<number, PdfBlock[]>())
  // Trecho da página no topo da tela, e trecho que o TTS está lendo (fixado em resetTtsScroll, como no EPUB:
  // rolar a tela durante a leitura não troca os parágrafos que estão sendo lidos).
  const currentSectionIdxRef = useRef(0)
  const playbackSectionIdxRef = useRef<number | null>(null)
  const ttsActiveRef = useRef(false)
  const userScrolledRef = useRef(false)
  const programmaticScrollUntilRef = useRef(0)
  // Destaque atual (parágrafo + palavra), reaplicado quando uma página do parágrafo é (re)desenhada.
  const ttsHighlightRef = useRef<{ block: PdfBlock; wordStart: number; wordEnd: number } | null>(null)
  const ttsHighlightTokenRef = useRef(0)

  // US5 (highlights): seleção que abriu o menu e highlight cujo menu está aberto.
  const pendingSelectionRef = useRef<PendingPdfSelection | null>(null)
  const selectionMenuHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeHighlightMenuRef = useRef<{ doc: Document; id: number } | null>(null)

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
    // Navegação do app (marcador, sumário, tema, seção do TTS): não é "usuário rolou".
    programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS

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
    if (span && frame) {
      programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS
      scrollRendererToSpan(view.renderer, frame, span)
    }
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
    // "Seção" do PDF = trecho (DI-009). Já prepara os parágrafos dele para o TTS (acesso síncrono no contrato).
    const sectionIndex = findChunkForPage(session.chunks, pageIndex)?.index ?? 0
    currentSectionIdxRef.current = sectionIndex
    void loadTtsSection(sectionIndex)
    const payload: ReaderRelocatePayload = {
      cfi: formatPdfPoint({ pageIndex, offset }),
      // Fração precisa (navegação por fração); percentual inteiro como o do EPUB — é o que o chrome exibe.
      fraction: exactPercentage / 100,
      percentage: clampPercentage(exactPercentage),
      sectionIndex,
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
    return blockItemIndexes(block, pageIndex, extracted.itemStarts, extracted.items)
  }

  // ── TTS (US4) ──────────────────────────────────────────────────────────────

  // Parágrafos (blocos com texto) do trecho `index`, reconstruídos uma vez e guardados para o acesso síncrono.
  async function loadTtsSection(index: number): Promise<PdfBlock[]> {
    const cached = ttsSectionsRef.current.get(index)
    if (cached) return cached
    const { session } = propsRef.current
    const chunk = session.chunks[index]
    if (!chunk) return []
    const blocks = ttsParagraphBlocks(await session.extractor.reconstructChunk(chunk))
    ttsSectionsRef.current.set(index, blocks)
    // Guarda só o necessário: o trecho atual, o que está sendo lido e o próximo (livro grande tem centenas).
    for (const key of ttsSectionsRef.current.keys()) {
      const keep = key === index || key === currentSectionIdxRef.current || key === playbackSectionIdxRef.current ||
        key === currentSectionIdxRef.current + 1
      if (!keep) ttsSectionsRef.current.delete(key)
    }
    return blocks
  }

  function ttsSectionIndex(): number {
    return ttsActiveRef.current && playbackSectionIdxRef.current !== null
      ? playbackSectionIdxRef.current
      : currentSectionIdxRef.current
  }

  function ttsBlocks(): PdfBlock[] {
    return ttsSectionsRef.current.get(ttsSectionIndex()) ?? []
  }

  function clearTtsHighlightEverywhere() {
    for (const { doc } of viewRef.current?.renderer.getContents() ?? []) clearTtsHighlight(doc)
  }

  // Desenha o destaque guardado em ttsHighlightRef nas páginas do parágrafo que estão carregadas. Assíncrono
  // (texto bruto da página); um destaque mais novo descarta este.
  async function applyTtsHighlight() {
    const token = ++ttsHighlightTokenRef.current
    const state = ttsHighlightRef.current
    clearTtsHighlightEverywhere()
    if (!state) return
    const { session, readerTheme } = propsRef.current
    const background = getReaderThemePalette(readerTheme).ttsHighlight
    const pages = [...new Set(state.block.ranges.map((r) => r.pageIndex))]
    for (const pageIndex of pages) {
      const doc = getLoadedDoc(pageIndex)
      if (!doc || !hasRenderedText(doc)) continue // ainda não desenhada: onRendered reaplica
      const extracted = await session.extractor.getPage(pageIndex)
      if (token !== ttsHighlightTokenRef.current) return
      highlightTtsItems(doc, blockItemIndexes(state.block, pageIndex, extracted.itemStarts, extracted.items), background)
      if (state.wordEnd <= state.wordStart) continue
      // Karaokê: palavra lida → item → caracteres dentro do item.
      const word = rawWordStart(state.block, state.wordStart, state.wordEnd, extracted.rawText ?? '')
      if (!word || word.pageIndex !== pageIndex) continue
      const itemIndex = itemIndexAtOffset(extracted.itemStarts, extracted.items, word.start)
      if (itemIndex < 0) continue
      const startInItem = word.start - (extracted.itemStarts[itemIndex] ?? 0)
      markTtsWord(doc, itemIndex, startInItem, startInItem + word.length)
    }
  }

  // Acompanha a leitura: põe o parágrafo no meio da tela (como o EPUB) sem pular para o topo da página quando
  // ela já está carregada — a página só é trocada (renderer.goTo) se ainda não estiver montada.
  async function scrollToBlock(block: PdfBlock) {
    const view = viewRef.current
    const start = blockStartPoint(block)
    if (!view || !start) return
    const { session } = propsRef.current
    programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS
    const extracted = await session.extractor.getPage(start.pageIndex)
    const itemIndex = itemIndexAtOffset(extracted.itemStarts, extracted.items, start.offset)
    let doc = getLoadedDoc(start.pageIndex)
    if (!doc || !hasRenderedText(doc)) {
      await view.renderer.goTo({ index: start.pageIndex })
      doc = (await waitForRenderedPage(start.pageIndex, { needText: itemIndex >= 0 })) ?? undefined
    }
    const frame = doc?.defaultView?.frameElement as HTMLElement | null | undefined
    const span = itemIndex >= 0 ? doc?.querySelector<HTMLElement>(`.textLayer span[data-nr-item="${itemIndex}"]`) : null
    if (!frame || !span) return
    // Altura do parágrafo nesta página (do 1º ao último item dele) para centralizá-lo; maior que a tela → começo
    // dele a 15% do topo.
    const items = blockItemIndexes(block, start.pageIndex, extracted.itemStarts, extracted.items)
    const lastSpan = doc!.querySelector<HTMLElement>(`.textLayer span[data-nr-item="${items[items.length - 1] ?? itemIndex}"]`) ?? span
    const frameRect = frame.getBoundingClientRect()
    const scale = frame.offsetWidth ? frameRect.width / frame.offsetWidth : 1
    const top = frameRect.top + span.getBoundingClientRect().top * scale
    const bottom = frameRect.top + lastSpan.getBoundingClientRect().bottom * scale
    const host = view.renderer.getBoundingClientRect()
    const height = Math.max(0, bottom - top)
    const targetTop = height < host.height * 0.7 ? host.top + (host.height - height) / 2 : host.top + host.height * 0.15
    const delta = top - targetTop
    if (Math.abs(delta) < 4) return
    programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS
    view.renderer.scrollTop += delta
  }

  // Rolagem com o TTS ativo e fora da janela de rolagem programática = o usuário rolou: para de acompanhar e
  // avisa (a ReaderScreen mostra "voltar ao trecho lido"), mesma regra do EpubViewer.
  function handleRendererScroll() {
    if (!ttsActiveRef.current || Date.now() <= programmaticScrollUntilRef.current) return
    const wasFollowing = !userScrolledRef.current
    userScrolledRef.current = true
    if (wasFollowing) propsRef.current.onTtsUserScrollAway?.()
  }

  // Próximo trecho como seção do TTS: carrega os parágrafos, vai até o 1º e avisa onSectionReady — é quando a
  // ReaderScreen pede os chunks e continua a leitura (mesmo protocolo do EPUB).
  function goToNextTtsSectionInternal(): boolean {
    const { session } = propsRef.current
    const next = ttsSectionIndex() + 1
    const chunk = session.chunks[next]
    if (!chunk) return false
    programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS
    void (async () => {
      const blocks = await loadTtsSection(next)
      currentSectionIdxRef.current = next
      const start = blocks[0] ? blockStartPoint(blocks[0]) : null
      await navigateToPoint(start ?? { pageIndex: chunk.startPage, offset: 0 })
      programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS
      propsRef.current.onSectionReady?.(next, formatPdfPoint({ pageIndex: chunk.startPage, offset: 0 }))
    })()
    return true
  }

  // Toque num parágrafo com a leitura contínua ativa: o TTS passa a ler dele (em vez de abrir a tradução).
  async function handleTtsTap(block: PdfBlock, pageIndex: number) {
    const { session } = propsRef.current
    const chunk = findChunkForPage(session.chunks, block.pageIndex) ?? findChunkForPage(session.chunks, pageIndex)
    if (!chunk) return
    const blocks = await loadTtsSection(chunk.index)
    const idx = blocks.findIndex((candidate) => sameBlockStart(candidate, block))
    if (idx < 0) return
    playbackSectionIdxRef.current = chunk.index
    propsRef.current.onParagraphTapForTts?.(idx)
  }

  // ── Highlights (US5) ───────────────────────────────────────────────────────

  // Pinta nesta página os highlights cujo intervalo passa por ela (um intervalo pode atravessar páginas).
  async function paintHighlightsOnPage(doc: Document, pageIndex: number) {
    const ranges = (propsRef.current.highlights ?? [])
      .filter((h) => h.id !== undefined)
      .map((h) => ({ highlight: h, range: parsePdfRange(h.cfi) }))
      .filter((entry) => entry.range !== null && entry.range.start.pageIndex <= pageIndex && entry.range.end.pageIndex >= pageIndex)
    if (ranges.length === 0) {
      paintPageHighlights(doc, [])
      return
    }
    const { session } = propsRef.current
    const extracted = await session.extractor.getPage(pageIndex)
    const raw = extracted.rawText ?? ''
    // Só o texto de parágrafos é pintado: no texto bruto, cabeçalho corrido, número de página e rodapé caem
    // DENTRO de um intervalo que atravessa a virada (fim do corpo de uma página → começo da seguinte). A
    // reconstrução já os remove; os blocos desta página (inclusive a continuação de um parágrafo do trecho
    // anterior, DI-009) dizem o que é corpo.
    const textItems = new Set(await bodyItemIndexesOnPage(pageIndex, extracted.itemStarts, extracted.items))
    paintPageHighlights(doc, ranges.flatMap(({ highlight, range }) => {
      const onPage = rangeOnPage(range!, pageIndex, raw.length)
      if (!onPage) return []
      return [{
        id: highlight.id!,
        color: highlight.color,
        style: highlight.style ?? 'background',
        // Indicador de nota só no começo do trecho (não repete na continuação da página seguinte).
        hasNote: !!highlight.note?.trim() && pageIndex === range!.start.pageIndex,
        slices: itemSlices(onPage.start, onPage.end, extracted.itemStarts, extracted.items)
          .filter((slice) => textItems.has(slice.itemIndex)),
      }]
    }))
  }

  // Itens da camada de texto que são corpo (pertencem a algum parágrafo/título reconstruído) nesta página.
  async function bodyItemIndexesOnPage(
    pageIndex: number,
    itemStarts: readonly number[],
    items: ReadonlyArray<{ str: string }>,
  ): Promise<number[]> {
    const { session } = propsRef.current
    const chunk = findChunkForPage(session.chunks, pageIndex)
    if (!chunk) return []
    const blocks = [...await session.extractor.reconstructChunk(chunk)]
    // Página que abre um trecho pode ter a continuação de um parágrafo do trecho anterior.
    const previous = chunk.startPage === pageIndex ? session.chunks[chunk.index - 1] : undefined
    if (previous) blocks.push(...await session.extractor.reconstructChunk(previous))
    return blocks
      .filter((block) => block.kind !== 'figure')
      .flatMap((block) => blockItemIndexes(block, pageIndex, itemStarts, items))
  }

  // Seleção elegível para o menu: não vazia, dentro da camada de texto e fora da interface (painel, menu).
  function eligibleSelection(doc: Document): Range | null {
    const selection = doc.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    if (!range.toString().replace(/\s+/g, ' ').trim()) return null
    const container = range.commonAncestorContainer
    const element = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement
    if (!element?.closest('.textLayer') || element.closest('[data-nr-ui]')) return null
    return range
  }

  // Posição de um retângulo do documento da página em % da camada de texto (âncora dos menus).
  function anchorInLayer(doc: Document, rect: DOMRect): { topPct: number; bottomPct: number; leftPct: number } {
    const layer = doc.querySelector('.textLayer')?.getBoundingClientRect()
    if (!layer?.height || !layer.width) return { topPct: 50, bottomPct: 52, leftPct: 10 }
    return {
      topPct: ((rect.top - layer.top) / layer.height) * 100,
      bottomPct: ((rect.bottom - layer.top) / layer.height) * 100,
      leftPct: ((rect.left - layer.left) / layer.width) * 100,
    }
  }

  function closeMenus(doc: Document) {
    hidePdfMenus(doc)
    activeHighlightMenuRef.current = null
  }

  function showSelectionMenu(doc: Document, range: Range) {
    const t = tRef.current
    const { onRequestCreateHighlight } = propsRef.current
    activeHighlightMenuRef.current = null
    renderPdfMenu(doc, {
      kind: 'selection',
      anchor: anchorInLayer(doc, range.getBoundingClientRect()),
      actions: [
        { id: 'copy', label: t('reader.selectionMenu.copy') },
        { id: 'share', label: t('reader.selectionMenu.share') },
        { id: 'translate', label: t('reader.selectionMenu.translate') },
        ...(onRequestCreateHighlight ? [{ id: 'highlight' as const, label: t('reader.selectionMenu.highlight'), primary: true }] : []),
      ],
    }, t)
  }

  function showHighlightMenu(doc: Document, highlight: Highlight, mark: Element) {
    const t = tRef.current
    activeHighlightMenuRef.current = { doc, id: highlight.id! }
    renderPdfMenu(doc, {
      kind: 'highlight',
      anchor: anchorInLayer(doc, mark.getBoundingClientRect()),
      note: highlight.note?.trim() || undefined,
      actions: [
        { id: 'edit', label: t('reader.highlightMenu.edit'), primary: true },
        { id: 'remove', label: t('reader.highlightMenu.remove') },
      ],
    }, t)
  }

  // Seleção (nós do DOM) → intervalo no texto bruto da página → rascunho de highlight, no mesmo formato que o
  // modo texto entrega (cfi = intervalo `neopdf:`, paraCfi = início do parágrafo).
  async function draftFromSelection(selection: PendingPdfSelection): Promise<HighlightDraftPayload | null> {
    const { session } = propsRef.current
    const { doc, pageIndex, range } = selection
    const extracted = await session.extractor.getPage(pageIndex)
    const start = selectionBoundaryToRaw(doc, range.startContainer, range.startOffset, 'start', extracted.itemStarts, extracted.items)
    const end = selectionBoundaryToRaw(doc, range.endContainer, range.endOffset, 'end', extracted.itemStarts, extracted.items)
    if (start === null || end === null || end <= start) return null
    const chunk = findChunkForPage(session.chunks, pageIndex)
    if (!chunk) return null
    const startPoint = { pageIndex, offset: start }
    const block = findBlockAtPoint(await session.extractor.reconstructChunk(chunk), startPoint)
    const paragraphStart = (block && blockStartPoint(block)) ?? startPoint
    return {
      cfi: formatPdfRange({ start: startPoint, end: { pageIndex, offset: end } }),
      paraCfi: formatPdfPoint(paragraphStart),
      text: range.toString().replace(/\s+/g, ' ').trim(),
      sectionIndex: chunk.index,
      percentage: clampPercentage(progressPercentage(pageIndex, 0, session.pageCount)),
    }
  }

  // "Traduzir" do menu de seleção: abre o painel de tradução com o trecho selecionado, ancorado na seleção.
  async function translateSelection(selection: PendingPdfSelection, text: string) {
    const { session } = propsRef.current
    const { doc, pageIndex, range } = selection
    const extracted = await session.extractor.getPage(pageIndex)
    const start = selectionBoundaryToRaw(doc, range.startContainer, range.startOffset, 'start', extracted.itemStarts, extracted.items)
    const chunk = findChunkForPage(session.chunks, pageIndex)
    if (start === null || !chunk) return
    const block = findBlockAtPoint(await session.extractor.reconstructChunk(chunk), { pageIndex, offset: start })
    const blockStart = block ? blockStartPoint(block) : null
    if (!block || !blockStart) return
    const sentenceStart = Math.max(0, block.text.indexOf(text.slice(0, 24)))
    await startTranslation(doc, pageIndex, block, blockStart, { text, start: sentenceStart }, anchorInLayer(doc, range.getBoundingClientRect()), null)
  }

  function handleMenuAction(doc: Document, action: PdfMenuActionId) {
    const { highlights, onRequestCreateHighlight, onEditHighlight, onDeleteHighlight } = propsRef.current
    if (action === 'edit' || action === 'remove') {
      const active = activeHighlightMenuRef.current
      const highlight = active ? (highlights ?? []).find((h) => h.id === active.id) : undefined
      closeMenus(doc)
      if (!highlight) return
      if (action === 'edit') onEditHighlight?.(highlight)
      else onDeleteHighlight?.(highlight)
      return
    }

    const selection = pendingSelectionRef.current?.doc === doc ? pendingSelectionRef.current : null
    pendingSelectionRef.current = null
    doc.getSelection()?.removeAllRanges()
    closeMenus(doc)
    const text = selection?.range.toString().replace(/\s+/g, ' ').trim()
    if (!selection || !text) return
    if (action === 'copy') {
      // Sem clipboard disponível, apenas não copia (mesma regra do EPUB).
      void navigator.clipboard?.writeText(text).catch(() => undefined)
    } else if (action === 'share') {
      void shareText(text)
    } else if (action === 'translate') {
      void translateSelection(selection, text)
    } else if (action === 'highlight') {
      void draftFromSelection(selection).then((draft) => {
        if (draft) onRequestCreateHighlight?.(draft)
      })
    }
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

    // Leitura contínua ativa (tocando ou pausada): o toque navega o TTS, não abre tradução — como no EPUB.
    if (propsRef.current.ttsGlobalActive) {
      await handleTtsTap(block, pageIndex)
      return
    }

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
      const target = event.target as Element | null
      // Botões dos menus de seleção/highlight primeiro: no Android a seleção já foi desfeita por este toque.
      const menuAction = menuActionAt(target)
      if (menuAction) {
        event.preventDefault()
        event.stopPropagation()
        handleMenuAction(doc, menuAction)
        return
      }
      const selection = doc.getSelection()
      if (selection && !selection.isCollapsed) return // há seleção em andamento: não é um toque
      // Toque fora de um menu aberto só fecha o menu.
      if (openPdfMenu(doc)) {
        closeMenus(doc)
        pendingSelectionRef.current = null
        return
      }
      if (target?.closest('a[href], .nr-pdf-translation, .nr-pdf-bookmark-marker')) return

      // Toque num highlight (fora da leitura contínua, que tem prioridade como no EPUB): menu de gerenciar.
      const highlightId = propsRef.current.ttsGlobalActive ? null : highlightIdAt(target)
      const highlight = highlightId !== null ? propsRef.current.highlights?.find((h) => h.id === highlightId) : undefined
      if (highlight) {
        if (activeTranslationRef.current) clearActiveTranslation()
        showHighlightMenu(doc, highlight, target!.closest('span.nr-pdf-hl')!)
        return
      }

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

    // Menu de seleção acompanha a seleção nativa (abre, reancora, some). Ao desfazer, some com atraso: no
    // Android o toque no botão do menu desfaz a seleção antes do clique.
    const onSelectionChange = () => {
      if (selectionMenuHideTimerRef.current) clearTimeout(selectionMenuHideTimerRef.current)
      selectionMenuHideTimerRef.current = null
      const range = eligibleSelection(doc)
      if (range) {
        pendingSelectionRef.current = { doc, pageIndex, range: range.cloneRange() }
        showSelectionMenu(doc, range)
        return
      }
      if (openPdfMenu(doc) !== 'selection') return
      selectionMenuHideTimerRef.current = setTimeout(() => {
        selectionMenuHideTimerRef.current = null
        if (openPdfMenu(doc) === 'selection' && !eligibleSelection(doc)) closeMenus(doc)
      }, SELECTION_MENU_HIDE_DELAY_MS)
    }
    doc.addEventListener('selectionchange', onSelectionChange)

    const onRendered = () => {
      void drawBookmarkMarkers(doc, pageIndex)
      decoratePage(doc)
      // A camada de texto recriada perdeu a pintura dos highlights (e os menus, que viviam nela).
      void paintHighlightsOnPage(doc, pageIndex)
      if (activeHighlightMenuRef.current?.doc === doc) activeHighlightMenuRef.current = null
      // A camada de texto foi recriada (zoom/tema): redesenha a tradução aberta nesta página.
      const active = activeTranslationRef.current
      if (active?.doc === doc) {
        if (!hasTranslationPanel(doc)) renderActiveTranslation()
        void blockItemsOnPage(active.block, pageIndex).then((items) => {
          if (activeTranslationRef.current === active) highlightTextItems(doc, items)
        })
      }
      // A camada recriada perdeu o destaque do TTS; vale também para a continuação do parágrafo que acabou de
      // ser carregada na página seguinte.
      const tts = ttsHighlightRef.current
      if (tts && tts.block.ranges.some((r) => r.pageIndex === pageIndex)) void applyTtsHighlight()
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
      if (pendingSelectionRef.current?.doc === doc) pendingSelectionRef.current = null
      if (activeHighlightMenuRef.current?.doc === doc) activeHighlightMenuRef.current = null
      doc.removeEventListener('click', onClick)
      doc.removeEventListener('selectionchange', onSelectionChange)
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
    // O reposicionamento abaixo não é "usuário rolou" para o acompanhamento do TTS.
    programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS
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
    let rendererForCleanup: FxlRenderer | null = null
    const pageCleanups = pageCleanupsRef.current
    const ttsSections = ttsSectionsRef.current
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
        view.renderer.addEventListener('scroll', handleRendererScroll, { passive: true })
        rendererForCleanup = view.renderer
        view.renderer.shadowRoot.append(Object.assign(document.createElement('style'), { textContent: FXL_EXTRA_CSS }))
        applyTheme(propsRef.current.readerTheme, propsRef.current.overrideBookColors)

        propsRef.current.onTocReady(tocForViewer(session.pdfBook.toc))

        // Posição inicial: alvo explícito > progresso salvo > início. Navegar SEMPRE, inclusive para a página 0:
        // ao entrar no modo scroll o foliate calcula o "índice atual" com as páginas ainda sem altura (todas
        // empilhadas no topo) e rola para uma página do meio do livro; este goTo corrige isso.
        const start = getPdfLocatorStart(propsRef.current.initialTarget ?? propsRef.current.savedLocator)
        await navigateToPoint(start ?? { pageIndex: 0, offset: 0 })
        if (cancelled) return
        // Parágrafos do trecho inicial prontos antes do onLoad: o botão de TTS já funciona no primeiro toque.
        currentSectionIdxRef.current = findChunkForPage(session.chunks, start?.pageIndex ?? 0)?.index ?? 0
        await loadTtsSection(currentSectionIdxRef.current)
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
      if (selectionMenuHideTimerRef.current) clearTimeout(selectionMenuHideTimerRef.current)
      pendingSelectionRef.current = null
      detachHostPinch()
      rendererForCleanup?.removeEventListener('scroll', handleRendererScroll)
      for (const cleanup of pageCleanups.values()) cleanup()
      pageCleanups.clear()
      ttsSections.clear()
      ttsHighlightRef.current = null
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

  // Highlights: repinta nas páginas carregadas quando a lista muda (criar, editar cor/estilo/nota, remover —
  // inclusive no outro modo). Menu aberto de um highlight que mudou fica desatualizado: fecha.
  useEffect(() => {
    const contents = viewRef.current?.renderer.getContents() ?? []
    for (const { doc, index } of contents) {
      if (activeHighlightMenuRef.current?.doc === doc) closeMenus(doc)
      if (hasRenderedText(doc)) void paintHighlightsOnPage(doc, index)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.highlights])

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
    // US4 (TTS): "seção" = trecho (DI-009); false no último, como o EPUB no último capítulo.
    goToNextTtsSection: () => goToNextTtsSectionInternal(),
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

    // ── US4: TTS sobre os parágrafos reconstruídos do trecho ──
    getParagraphs: () => ttsBlocks().map((block) => block.text),
    // Mesmo chunking do EPUB (frases agrupadas, offsets no parágrafo para o karaokê).
    getSentenceChunks: (): TtsChunk[] => {
      const locale = propsRef.current.book.detectedLanguage ?? undefined
      const chunks: TtsChunk[] = []
      ttsBlocks().forEach((block, paraIdx) => {
        for (const { sentence, offset } of splitParagraphIntoTtsChunks(block.text, 40, locale)) {
          chunks.push({ text: sentence, paraIdx, offsetInPara: offset })
        }
      })
      return chunks
    },
    // Parágrafo que o leitor está vendo: o 1º que ainda não terminou no topo da tela (pode ter começado acima).
    getFirstVisibleParagraphIndex: () => {
      const { session } = propsRef.current
      const top = lastLocationRef.current ? getPdfLocatorStart(lastLocationRef.current.cfi) : null
      if (!top || findChunkForPage(session.chunks, top.pageIndex)?.index !== currentSectionIdxRef.current) return 0
      return firstBlockEndingAfter(ttsSectionsRef.current.get(currentSectionIdxRef.current) ?? [], top)
    },
    highlightTts: (paraIdx, wordStart, wordEnd) => {
      const block = ttsBlocks()[paraIdx]
      ttsHighlightRef.current = block ? { block, wordStart, wordEnd } : null
      void applyTtsHighlight()
    },
    clearTts: () => {
      ttsActiveRef.current = false
      playbackSectionIdxRef.current = null
      ttsHighlightRef.current = null
      ttsHighlightTokenRef.current++
      clearTtsHighlightEverywhere()
    },
    scrollToParagraph: (idx) => {
      // Usuário rolou durante a leitura: não puxa a tela de volta (ele usa "voltar ao trecho lido").
      if (userScrolledRef.current) return
      const block = ttsBlocks()[idx]
      if (block) void scrollToBlock(block)
    },
    resetTtsScroll: (options) => {
      userScrolledRef.current = false
      ttsActiveRef.current = true
      if (!options?.preservePlaybackSection) playbackSectionIdxRef.current = currentSectionIdxRef.current
    },

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
