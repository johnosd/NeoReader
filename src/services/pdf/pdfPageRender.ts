// Renderização de uma página PDF dentro do documento (iframe) do foliate-fxl: imagem da página (desenhada
// num canvas do documento pai) + camada de texto + camada de anotações (links).
//
// Adaptado de foliate-js/pdf.js (MIT, Copyright (c) 2022 John Factotum), conforme o pacote
// vendorizado em node_modules/foliate-js (fork readest/foliate-js, licença MIT do próprio repositório).
// Mudanças: tipado em TypeScript, pdf.js carregado sob demanda, sem globais soltas.

import { loadPdfjs, pdfjsPath, type PdfPageProxy } from './pdfjs'
import { dataUrlToBlob } from '../../utils/dataUrl'

// Disparado no documento da página quando um render termina (a camada de texto foi refeita). Quem desenha
// overlays dentro da página (balão, marcadores) redesenha ao ouvi-lo, porque o pdf.js limpa a camada a cada zoom.
export const PDF_PAGE_RENDERED_EVENT = 'nr-pdf-rendered'

// Render em andamento por documento: um zoom novo cancela o render anterior.
const activeRenderTasks = new WeakMap<Document, { cancel(): void }>()

// A página é EXIBIDA como <img>, não como <canvas> (R-030): o iframe da página roda com sandbox sem
// allow-scripts (vite.config.ts → hardenFoliateIframeSandbox), e num documento com scripts desabilitados o
// <canvas> mostra só o conteúdo de fallback — a página saía em branco no APK. O desenho continua num canvas do
// documento pai; o resultado vira PNG (data: URL) para o <img>.
//
// Por que toDataURL e não toBlob (R-034): no WebView do Android o toBlob (PNG/JPEG, e também o
// OffscreenCanvas.convertToBlob) só codifica em "tempo ocioso" da thread principal e levava 4–13 s por página
// no celular (medido num SM-S911B, 1080×1532); o toDataURL é síncrono e levou 30–42 ms para a mesma página, sem
// perda. Bônus: data: URL não precisa ser revogada.
const canvasToPngDataUrl = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/png')
// "Geração" por documento: detecta render obsoleto depois de cada await.
const renderGenerations = new WeakMap<Document, number>()

// Teto do bitmap da página (2^24 px, o mesmo `maxCanvasPixels` do viewer do pdf.js). Em 400% com dpr 3 a página
// passaria de 24 milhões de px: memória demais para o WebView e segundos de thread principal travada.
export const MAX_PAGE_BITMAP_PIXELS = 16_777_216
// Páginas fora da tela esperam este tempo antes de redesenhar no zoom: o desenho do pdf.js roda na thread
// principal, e redesenhar todas juntas travava o app por ~2,3 s em 290% (medido no device).
const OFFSCREEN_RENDER_DELAY_MS = 700

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Escala do bitmap: zoom × dpr (nítido em tela densa), reduzida para caber em MAX_PAGE_BITMAP_PIXELS. */
export function pageBitmapScale(zoom: number, dpr: number, pageWidthPt: number, pageHeightPt: number): number {
  const scale = zoom * dpr
  const pixels = pageWidthPt * scale * pageHeightPt * scale
  return pixels > MAX_PAGE_BITMAP_PIXELS ? scale * Math.sqrt(MAX_PAGE_BITMAP_PIXELS / pixels) : scale
}

function isFrameOnScreen(doc: Document): boolean {
  const frame = doc.defaultView?.frameElement
  if (!frame) return true
  const rect = frame.getBoundingClientRect()
  return rect.bottom > 0 && rect.top < window.innerHeight
}

// Pan por arraste e seleção de texto, instalados uma vez por documento de página.
const panInitialized = new WeakSet<Document>()

export function setupPanningEvents(doc: Document) {
  if (panInitialized.has(doc)) return
  panInitialized.add(doc)

  const container = doc.querySelector<HTMLElement>('.textLayer')
  if (!container) return

  let isPanning = false
  let startX = 0
  let startY = 0
  let scrollLeft = 0
  let scrollTop = 0
  let scrollParent: HTMLElement | Window | null = null

  // Sobe pelo DOM (atravessando o shadow root do foliate) até o primeiro ancestral rolável.
  const findScrollableParent = (element: Element): HTMLElement | Window => {
    let current: Element | null = element
    while (current) {
      if (current !== document.body && current.nodeType === 1) {
        const style = window.getComputedStyle(current)
        if (/(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX)) {
          if (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth) {
            return current as HTMLElement
          }
        }
      }
      if (current.parentElement) current = current.parentElement
      else if ((current.parentNode as ShadowRoot | null)?.host) current = (current.parentNode as ShadowRoot).host
      else break
    }
    return window
  }

  const stopPanning = () => {
    isPanning = false
    scrollParent = null
    container.style.cursor = 'grab'
  }

  container.onpointerdown = (e) => {
    // Só mouse: no toque a rolagem já é nativa. Com dedos este pan era instalado por ponteiro — na pinça cada
    // dedo virava um "arrasto" que gravava scrollLeft/scrollTop com o próprio deslocamento, e a página fugia
    // de baixo dos dedos (zoom out "se perdia" no device).
    if (e.pointerType !== 'mouse') return
    const selection = doc.getSelection()
    const hasTextSelection = !!selection && selection.toString().length > 0
    const under = doc.elementFromPoint(e.clientX, e.clientY)
    const hasTextUnderneath =
      !!under && (under.tagName === 'SPAN' || under.tagName === 'P') && (under.textContent ?? '').trim().length > 0

    if (!hasTextUnderneath && !hasTextSelection) {
      isPanning = true
      startX = e.screenX
      startY = e.screenY
      const iframe = doc.defaultView?.frameElement
      if (iframe) {
        scrollParent = findScrollableParent(iframe)
        if (scrollParent === window) {
          scrollLeft = window.scrollX || window.pageXOffset
          scrollTop = window.scrollY || window.pageYOffset
        } else {
          scrollLeft = (scrollParent as HTMLElement).scrollLeft
          scrollTop = (scrollParent as HTMLElement).scrollTop
        }
        container.style.cursor = 'grabbing'
      }
    } else {
      container.classList.add('selecting')
    }
  }

  container.onpointermove = (e) => {
    if (!isPanning || !scrollParent) return
    e.preventDefault()
    const dx = e.screenX - startX
    const dy = e.screenY - startY
    if (scrollParent === window) {
      window.scrollTo(scrollLeft - dx, scrollTop - dy)
    } else {
      ;(scrollParent as HTMLElement).scrollLeft = scrollLeft - dx
      ;(scrollParent as HTMLElement).scrollTop = scrollTop - dy
    }
  }

  container.onpointerup = () => {
    if (isPanning) stopPanning()
    else container.classList.remove('selecting')
  }
  container.onpointerleave = () => {
    if (isPanning) stopPanning()
  }

  doc.addEventListener('selectionchange', () => {
    const selection = doc.getSelection()
    if (selection && selection.toString().length > 0) container.style.cursor = 'text'
    else if (!isPanning) container.style.cursor = 'grab'
  })

  container.style.cursor = 'grab'
}

/** Desenha (ou redesenha, no zoom) a página `page` no documento `doc` na escala `zoom`. */
export async function renderPdfPage(page: PdfPageProxy, doc: Document, zoom: number, pageColors?: unknown) {
  // Tudo até o 1º await roda junto com o redimensionamento do foliate (mesmo frame), sem a página "pular".
  const generation = (renderGenerations.get(doc) ?? 0) + 1
  renderGenerations.set(doc, generation)

  const existing = activeRenderTasks.get(doc)
  if (existing) {
    existing.cancel()
    activeRenderTasks.delete(doc)
  }

  // Layout em resolução de tela (zoom × devicePixelRatio) e documento reduzido com transform 1/dpr, para o
  // texto ficar nítido em telas densas. O bitmap pode ser menor que o layout (teto de pixels): aí é esticado.
  const scale = zoom * devicePixelRatio
  const viewport = page.getViewport({ scale })
  const base = page.getViewport({ scale: 1 })
  const bitmapViewport = page.getViewport({ scale: pageBitmapScale(zoom, devicePixelRatio, base.width, base.height) })

  // A imagem anterior (zoom antigo) passa JÁ para o tamanho novo, esticada: sem isto ela ficava com o tamanho
  // antigo até o novo render terminar — no device, metade da página por ~2 s no zoom in e cortada/ampliada no
  // zoom out. Fica um pouco suave até a versão nítida substituí-la.
  const previous = doc.querySelector<HTMLImageElement>('#canvas img')
  if (previous) Object.assign(previous.style, { width: `${viewport.width}px`, height: `${viewport.height}px` })

  const pdfjs = await loadPdfjs()
  // Fora da tela (zoom): deixa a página visível desenhar primeiro; um zoom novo nesse meio-tempo descarta este.
  if (previous && !isFrameOnScreen(doc)) {
    await sleep(OFFSCREEN_RENDER_DELAY_MS)
    if (renderGenerations.get(doc) !== generation || !doc.defaultView) return
  }

  doc.documentElement.style.transform = `scale(${1 / devicePixelRatio})`
  doc.documentElement.style.transformOrigin = 'top left'
  doc.documentElement.style.setProperty('--total-scale-factor', String(scale))
  // O TextLayer/AnnotationLayer do pdf.js dimensionam a camada com `calc(var(--scale-factor) * <largura da página>)`.
  // O foliate só define --total-scale-factor; sem esta variável a largura/altura ficavam inválidas, a camada caía
  // em `inset: 0` do viewport do iframe e, em telas densas (documento reduzido por transform 1/dpr), ficava com
  // 1/dpr do tamanho da página — texto selecionável desalinhado do texto desenhado.
  doc.documentElement.style.setProperty('--scale-factor', String(scale))
  doc.documentElement.style.setProperty('--user-unit', '1')
  doc.documentElement.style.setProperty('--scale-round-x', '1px')
  doc.documentElement.style.setProperty('--scale-round-y', '1px')

  // O canvas precisa ser criado no document PAI (onde as fontes do pdf.js são carregadas).
  const canvas = document.createElement('canvas')
  canvas.height = bitmapViewport.height
  canvas.width = bitmapViewport.width
  const canvasContext = canvas.getContext('2d')
  if (!canvasContext) return
  const renderTask = page.render({ canvasContext, viewport: bitmapViewport, pageColors })
  activeRenderTasks.set(doc, renderTask)

  // Liberar o bitmap de um canvas descartado: canvas grande segura memória até o GC.
  const release = (c: HTMLCanvasElement) => {
    c.width = 0
    c.height = 0
  }

  try {
    await renderTask.promise
  } catch {
    release(canvas) // cancelado ou falhou
    return
  } finally {
    if (activeRenderTasks.get(doc) === renderTask) activeRenderTasks.delete(doc)
  }

  // Outro render começou, ou o iframe saiu da tela, durante o await.
  if (renderGenerations.get(doc) !== generation || !doc.defaultView) {
    release(canvas)
    return
  }

  const canvasHolder = doc.querySelector('#canvas')
  if (!canvasHolder) {
    release(canvas)
    return
  }

  // Canvas → PNG (data: URL) → <img> (ver canvasToPngDataUrl).
  const dataUrl = canvasToPngDataUrl(canvas)
  release(canvas)
  const img = doc.createElement('img')
  img.alt = ''
  img.draggable = false
  // Tamanho do LAYOUT (zoom × dpr; o documento inteiro já é reduzido por transform 1/dpr). Igual ao bitmap,
  // exceto acima do teto de pixels, quando o bitmap menor é esticado.
  Object.assign(img.style, { display: 'block', width: `${viewport.width}px`, height: `${viewport.height}px`, userSelect: 'none' })
  img.src = dataUrl
  // Decodifica antes de trocar: no zoom, a página antiga continua na tela até a nova estar pronta (sem piscar).
  const decoded = await img.decode().then(() => true, () => false)
  if (!decoded || renderGenerations.get(doc) !== generation || !doc.defaultView) return
  canvasHolder.replaceChildren(img)

  // Camada de texto (seleção, Word Lens, highlights): limpa antes de refazer para não acumular DOM.
  const textContainer = doc.querySelector<HTMLElement>('.textLayer')
  if (!textContainer) return
  textContainer.replaceChildren()
  const textLayer = new pdfjs.TextLayer({
    textContentSource: page.streamTextContent(),
    container: textContainer,
    viewport,
  })
  await textLayer.render()
  if (renderGenerations.get(doc) !== generation) return

  // Marca cada span com o índice do TextItem de origem: é a ponte entre um toque/seleção na página e o
  // texto bruto do localizador (pdfLocator.buildRawPage.itemStarts), sem depender de heurística de texto.
  textLayer.textDivs.forEach((div, i) => {
    div.dataset.nrItem = String(i)
  })

  // O TextLayer cria canvases auxiliares no document pai; esconde para não vazarem para a tela.
  for (const hidden of document.querySelectorAll<HTMLElement>('.hiddenCanvasElement')) {
    Object.assign(hidden.style, { position: 'absolute', top: '0', left: '0', width: '0', height: '0', display: 'none' })
  }

  // Correção de seleção de texto recomendada pelo pdf.js (text_layer_builder.js).
  const endOfContent = document.createElement('div')
  endOfContent.className = 'endOfContent'
  textContainer.append(endOfContent)

  setupPanningEvents(doc)

  const annotationDiv = doc.querySelector<HTMLElement>('.annotationLayer')
  if (!annotationDiv) {
    doc.dispatchEvent(new CustomEvent(PDF_PAGE_RENDERED_EVENT))
    return
  }
  annotationDiv.replaceChildren()
  const linkService = {
    goToDestination: () => {},
    getDestinationHash: (dest: unknown) => JSON.stringify(dest),
    getAnchorUrl: () => '',
    executeNamedAction: () => {},
    addLinkAttributes: (link: HTMLAnchorElement, url: string) => {
      link.href = url
    },
  }
  // pdf.js lê linkService em render(), não no constructor. O adapter antigo do foliate passava
  // no constructor e links internos disparavam getDestinationHash de undefined (R-042).
  await new pdfjs.AnnotationLayer({ page, viewport, div: annotationDiv }).render({
    annotations: await page.getAnnotations(),
    linkService,
  })
  if (renderGenerations.get(doc) === generation) doc.dispatchEvent(new CustomEvent(PDF_PAGE_RENDERED_EVENT))
}

let textLayerCss: string | null = null
let annotationLayerCss: string | null = null
const fetchText = async (url: string) => (await fetch(url)).text()

export interface PdfPageSource {
  src: string // blob: URL do HTML base da página
  data: string
  onZoom: (args: { doc: Document; scale: number; pageColors?: unknown }) => Promise<void>
}

/** HTML-base de uma página (canvas + camadas vazias) e o callback de zoom. */
export async function buildPdfPageSource(page: PdfPageProxy): Promise<PdfPageSource> {
  const viewport = page.getViewport({ scale: 1 })
  textLayerCss ??= await fetchText(pdfjsPath('text_layer_builder.css'))
  annotationLayerCss ??= await fetchText(pdfjsPath('annotation_layer_builder.css'))
  const data = `
    <!DOCTYPE html>
    <html lang="en">
    <meta charset="utf-8">
    <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}">
    <style>
    html, body { margin: 0; padding: 0; }
    ${textLayerCss}
    ${annotationLayerCss}
    </style>
    <div id="canvas"></div>
    <div class="textLayer"></div>
    <div class="annotationLayer"></div>
  `
  const src = URL.createObjectURL(new Blob([data], { type: 'text/html' }))
  const onZoom = ({ doc, scale, pageColors }: { doc: Document; scale: number; pageColors?: unknown }) =>
    renderPdfPage(page, doc, scale, pageColors)
  return { src, data, onZoom }
}

/** Renderiza a página inteira num Blob de imagem (capa, e placeholder de figura no modo texto). */
export async function renderPdfPageToBlob(page: PdfPageProxy, scale = 1): Promise<Blob | null> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.height = viewport.height
  canvas.width = viewport.width
  const canvasContext = canvas.getContext('2d')
  if (!canvasContext) return null
  await page.render({ canvasContext, viewport }).promise
  // toDataURL + decodificação do base64, e não toBlob: no WebView do Android o toBlob atrasava cada capa em
  // 4–13 s (ver canvasToPngDataUrl / R-034).
  const dataUrl = canvasToPngDataUrl(canvas)
  // Libera o bitmap assim que o PNG existe.
  canvas.width = 0
  canvas.height = 0
  return dataUrlToBlob(dataUrl)
}

// Largura-alvo das imagens do modo texto (figura recortada / página "como na original"): nítida num
// celular DPR 3 sem gerar bitmaps enormes por trecho.
const TEXT_MODE_IMAGE_WIDTH_PX = 1200
const TEXT_MODE_IMAGE_MAX_SCALE = 2
// Folga em volta da faixa da figura (pt), para não cortar legenda/borda.
const FIGURE_REGION_PADDING_PT = 6

/**
 * Imagem de uma página para o modo texto (FR-009): a faixa vertical da figura (`region`, coordenadas do
 * PDF com y para cima) ou a página inteira. JPEG via toDataURL (R-034: toBlob trava no WebView do Android).
 */
export async function renderPdfPageRegionToBlob(
  page: PdfPageProxy,
  region?: { yTop: number; yBottom: number } | null,
): Promise<Blob | null> {
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(TEXT_MODE_IMAGE_MAX_SCALE, TEXT_MODE_IMAGE_WIDTH_PX / base.width)
  const viewport = page.getViewport({ scale })
  const pageCanvas = document.createElement('canvas')
  pageCanvas.width = Math.round(viewport.width)
  pageCanvas.height = Math.round(viewport.height)
  const pageContext = pageCanvas.getContext('2d')
  if (!pageContext) return null
  await page.render({ canvasContext: pageContext, viewport }).promise

  let output = pageCanvas
  if (region) {
    // y do PDF cresce para cima; no canvas, para baixo a partir do topo da página.
    const top = Math.max(0, Math.floor((base.height - region.yTop - FIGURE_REGION_PADDING_PT) * scale))
    const bottom = Math.min(pageCanvas.height, Math.ceil((base.height - region.yBottom + FIGURE_REGION_PADDING_PT) * scale))
    if (bottom - top > 1) {
      output = document.createElement('canvas')
      output.width = pageCanvas.width
      output.height = bottom - top
      output.getContext('2d')?.drawImage(pageCanvas, 0, top, pageCanvas.width, bottom - top, 0, 0, output.width, output.height)
    }
  }

  const dataUrl = output.toDataURL('image/jpeg', 0.85)
  // Libera os bitmaps assim que a imagem existe.
  for (const canvas of new Set([pageCanvas, output])) {
    canvas.width = 0
    canvas.height = 0
  }
  return dataUrlToBlob(dataUrl)
}
