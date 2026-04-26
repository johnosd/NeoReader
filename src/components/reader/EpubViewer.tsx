import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useSyncRef } from '../../hooks/useSyncRef'
import type { Book, Bookmark } from '../../types/book'
import type { View } from 'foliate-js/view.js'
import type { FontSize, ReaderFontFamily, ReaderLineHeight, ReaderTheme } from '../../types/settings'
import { getReaderFontFamilyValue, getReaderLineHeightValue, getReaderThemePalette } from '../../utils/readerPreferences'
import { getSentenceAt, escapeHtml } from '../../utils/readerUtils'
import { areCfisEquivalent, normalizeCfi } from '../../utils/cfi'
import { areTocHrefDocumentSuffixesEqual, normalizeTocHref } from '../../utils/toc'
import { fractionToPercentage } from '../../utils/progress'
import { splitParagraphIntoTtsChunks } from '../../utils/ttsChunking'

export type { FontSize, ReaderFontFamily, ReaderLineHeight, ReaderTheme } from '../../types/settings'

const BOOKMARK_ICON_GUTTER = 20
const BOOKMARK_ICON_LEFT = 4
const BOOKMARK_ICON_WIDTH = 10
const BOOKMARK_ICON_HEIGHT = 14
const TAP_SLOP_PX = 12
const TOP_CHROME_TAP_ZONE_PX = 140
const BOTTOM_CHROME_TAP_ZONE_PX = 156
const CHROME_TAP_ZONE_MAX_VIEWPORT_RATIO = 0.28
const RIGHT_CHROME_TAP_ZONE_MIN_PX = 48
const RIGHT_CHROME_TAP_ZONE_MAX_PX = 72

type FoliateTransformLoadDetail = {
  isScript?: boolean
  allow?: boolean
}

type FoliateTransformDataDetail = {
  data?: unknown
  type?: unknown
}

const SCRIPTABLE_EPUB_DOCUMENT_TYPES = new Set([
  'application/xhtml+xml',
  'text/html',
  'image/svg+xml',
])

const TRANSLATION_ICON = {
  bot: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="7" width="16" height="11" rx="4"></rect><path d="M12 3v4"></path><path d="M9 13h.01"></path><path d="M15 13h.01"></path><path d="M9 18v2"></path><path d="M15 18v2"></path></svg>',
  speak: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18 6a9 9 0 0 1 0 12"></path></svg>',
  bookmark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"></path></svg>',
  save: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.75 5.57 6.15.89-4.45 4.33 1.05 6.16L12 17.77l-5.5 2.91 1.05-6.16L3.1 9.46l6.15-.89z"></path></svg>',
} as const

function renderTranslationAction(action: 'speak' | 'bookmark' | 'save', label: string, icon: string, variant: 'default' | 'primary' = 'default'): string {
  return `
    <button type="button" data-nr-action="${action}" class="nr-tr-action nr-tr-action-${action}${variant === 'primary' ? ' is-primary' : ''}">
      <span class="nr-tr-action-tile">
        <span class="nr-tr-action-icon">${icon}</span>
      </span>
      <span class="nr-tr-action-label" data-nr-action-label="1">${escapeHtml(label)}</span>
    </button>`
}

function setTranslationActionLabel(actionBtn: Element | null | undefined, label: string): void {
  if (!(actionBtn instanceof HTMLElement)) return
  const labelEl = actionBtn.querySelector<HTMLElement>('[data-nr-action-label]')
  if (labelEl) labelEl.textContent = label
  else actionBtn.textContent = label
}

// Unidade mínima de leitura para o TTS.
// Texto é partido em frases (não parágrafos inteiros) para reduzir latência de API.
// offsetInPara: posição de início da frase no parágrafo completo — usada para
// alinhar o karaokê de palavras (offsets do Speechify são relativos ao chunk).
export interface TtsChunk {
  text: string
  paraIdx: number
  offsetInPara: number
}

// Divide um parágrafo em frases e agrupa as muito curtas (<minLen chars) com a próxima.
// Retorna array de { sentence, offset } onde offset é o índice de char no texto original.
function splitParagraphIntoChunks(text: string, minLen = 40, locale?: string): Array<{ sentence: string; offset: number }> {
  return splitParagraphIntoTtsChunks(text, minLen, locale)
}

// O TTS usa wrappers em nós de texto; innerHTML fica restrito aos blocos de ação controlados.

// Envolve apenas a frase `sentence` num <span class="nr-hl-sentence"> dentro do parágrafo.
// Usa Range + surroundContents: funciona quando a frase está dentro de um único nó de texto.
// Se a frase cruzar tags internas (ex: <em>), usa o fallback de colorir o parágrafo inteiro.
function highlightSentenceInParagraph(para: Element, sentence: string): void {
  const doc = para.ownerDocument!
  const fullText = para.textContent ?? ''
  const sentenceStart = fullText.indexOf(sentence)

  if (sentenceStart < 0) {
    para.classList.add('nr-hl')  // fallback: parágrafo inteiro
    return
  }

  // Encontra o nó de texto e offset exato dentro do parágrafo
  const range = doc.createRange()
  let charCount = 0
  let startSet = false
  const walker = doc.createTreeWalker(para, NodeFilter.SHOW_TEXT)
  let node: Node | null

  while ((node = walker.nextNode()) !== null) {
    const len = node.textContent?.length ?? 0
    if (!startSet && charCount + len > sentenceStart) {
      range.setStart(node, sentenceStart - charCount)
      startSet = true
    }
    if (startSet && charCount + len >= sentenceStart + sentence.length) {
      range.setEnd(node, sentenceStart + sentence.length - charCount)
      break
    }
    charCount += len
  }

  if (!startSet) {
    para.classList.add('nr-hl')
    return
  }

  try {
    const span = doc.createElement('span')
    span.className = 'nr-hl-sentence'
    range.surroundContents(span)  // lança se a frase cruzar tags HTML
  } catch {
    para.classList.add('nr-hl')  // fallback
  }
}

// Usa caretRangeFromPoint (Blink/WebKit) para encontrar em qual caractere
// do parágrafo o usuário tocou, depois devolve a frase naquela posição.
// Fallback para texto completo se a API não estiver disponível.
function getSentenceFromClick(ev: MouseEvent, para: Element): string {
  const fullText = para.textContent?.trim() ?? ''

  // caretRangeFromPoint: retorna um Range apontando para onde o cursor
  // seria inserido no ponto (x, y) — disponível no Chrome/Android WebView
  const range = (ev.target as Element).ownerDocument?.caretRangeFromPoint?.(ev.clientX, ev.clientY)
  if (!range) return fullText
  if (!para.contains(range.startContainer)) return fullText

  // Calcula o offset de char dentro do textContent completo do parágrafo.
  // O Range aponta para um nó de texto interno; precisamos somar os offsets
  // de todos os nós de texto anteriores dentro do parágrafo.
  let charOffset = range.startOffset
  // Usa o document do iframe (ownerDocument) — não o document externo do React
  const walker = para.ownerDocument!.createTreeWalker(para, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode()) !== null) {
    if (node === range.startContainer) break
    charOffset += (node.textContent?.length ?? 0)
  }

  return getSentenceAt(fullText, charOffset)
}

function getDocumentViewportHeight(doc: Document): number {
  return doc.defaultView?.innerHeight
    || doc.documentElement.clientHeight
    || doc.body?.clientHeight
    || 0
}

function getDocumentViewportWidth(doc: Document): number {
  return doc.defaultView?.innerWidth
    || doc.documentElement.clientWidth
    || doc.body?.clientWidth
    || 0
}

function getVisibleChromeTapZoneSize(viewportHeight: number, preferredSize: number): number {
  if (viewportHeight <= 0) return preferredSize

  return Math.min(
    preferredSize,
    Math.round(viewportHeight * CHROME_TAP_ZONE_MAX_VIEWPORT_RATIO),
  )
}

function isVisibleChromeTapZone(ev: MouseEvent, doc: Document): boolean {
  const viewportHeight = getDocumentViewportHeight(doc)
  const topZone = getVisibleChromeTapZoneSize(viewportHeight, TOP_CHROME_TAP_ZONE_PX)
  const bottomZone = getVisibleChromeTapZoneSize(viewportHeight, BOTTOM_CHROME_TAP_ZONE_PX)

  if (viewportHeight <= 0) return ev.clientY <= topZone

  return ev.clientY <= topZone || ev.clientY >= viewportHeight - bottomZone
}

function isRightChromeTapZone(ev: MouseEvent, doc: Document): boolean {
  const viewportWidth = getDocumentViewportWidth(doc)
  if (viewportWidth <= 0) return false

  const zoneWidth = Math.max(
    RIGHT_CHROME_TAP_ZONE_MIN_PX,
    Math.min(RIGHT_CHROME_TAP_ZONE_MAX_PX, Math.round(viewportWidth * 0.14)),
  )

  return ev.clientX >= viewportWidth - zoneWidth
}

type RendererNavigationTarget = {
  index: number
  anchor?: number | ((doc: Document) => Range | Element | number | null)
}

type ResolvedHrefNavigationTarget = RendererNavigationTarget & {
  matchType: 'exact' | 'suffix'
}

type NavigableSection = FoliateSection & {
  id?: string
}

function splitHrefTarget(target: string): { documentHref: string; fragment: string | null } {
  const normalized = normalizeTocHref(target)
  const [documentHref, fragment] = normalized.split('#', 2)

  return {
    documentHref: documentHref.toLocaleLowerCase(),
    fragment: fragment || null,
  }
}

function getSectionHrefCandidates(section: NavigableSection): string[] {
  return [section.id, section.href]
    .filter((value): value is string => Boolean(value))
}

function findFragmentTarget(doc: Document, rawFragment: string): Element | number {
  const candidates = [...new Set([
    rawFragment,
    (() => {
      try {
        return decodeURIComponent(rawFragment)
      } catch {
        return rawFragment
      }
    })(),
  ])]

  for (const fragment of candidates) {
    const byId = doc.getElementById(fragment)
    if (byId) return byId

    const byName = Array.from(doc.querySelectorAll<HTMLElement>('[name]'))
      .find((element) => element.getAttribute('name') === fragment)
    if (byName) return byName
  }

  return 0
}

function buildHrefNavigationTarget(
  sections: NavigableSection[] | undefined,
  target: string,
): ResolvedHrefNavigationTarget | null {
  if (!sections?.length) return null

  const { documentHref, fragment } = splitHrefTarget(target)
  if (!documentHref) return null

  const candidates = sections.flatMap((section, index) =>
    getSectionHrefCandidates(section).map((href) => ({ href, index })),
  )

  const exactMatch = candidates.find(({ href }) =>
    splitHrefTarget(href).documentHref === documentHref,
  )
  const suffixMatches = exactMatch ? [] : candidates.filter(({ href }) =>
    areTocHrefDocumentSuffixesEqual(href, target),
  )
  const suffixMatchIndexes = [...new Set(suffixMatches.map((candidate) => candidate.index))]
  const suffixMatch = suffixMatchIndexes.length === 1 ? suffixMatches[0] : null
  const match = exactMatch ?? suffixMatch
  if (!match) return null

  return {
    index: match.index,
    anchor: fragment ? (doc: Document) => findFragmentTarget(doc, fragment) : () => 0,
    matchType: exactMatch ? 'exact' : 'suffix',
  }
}

function toRendererNavigationTarget(target: ResolvedHrefNavigationTarget): RendererNavigationTarget {
  return {
    index: target.index,
    anchor: target.anchor,
  }
}

function isScriptableEpubDocumentType(type: unknown): type is DOMParserSupportedType {
  return typeof type === 'string' && SCRIPTABLE_EPUB_DOCUMENT_TYPES.has(type)
}

function stripExecutableEpubContent(data: unknown, type: unknown): unknown {
  if (typeof data !== 'string' || !isScriptableEpubDocumentType(type)) return data

  try {
    const doc = new DOMParser().parseFromString(data, type)
    let changed = false

    for (const script of Array.from(doc.querySelectorAll('script'))) {
      script.remove()
      changed = true
    }

    for (const element of Array.from(doc.querySelectorAll('*'))) {
      for (const attr of Array.from(element.attributes)) {
        const name = attr.name.toLowerCase()
        const value = attr.value.trim().toLowerCase()
        const isScriptUrl =
          (name === 'href' || name === 'src' || name === 'xlink:href') &&
          value.startsWith('javascript:')

        if (name.startsWith('on') || isScriptUrl) {
          element.removeAttribute(attr.name)
          changed = true
        }
      }
    }

    if (!changed) return data
    if (type === 'text/html') return `<!doctype html>\n${doc.documentElement.outerHTML}`
    return new XMLSerializer().serializeToString(doc)
  } catch {
    return data
  }
}

function installPassiveEpubContentTransform(view: View): () => void {
  const transformTarget = view.book?.transformTarget
  if (!transformTarget) return () => {}

  const handleLoad = (event: Event) => {
    const detail = (event as CustomEvent<FoliateTransformLoadDetail>).detail
    if (detail?.isScript) detail.allow = false
  }

  const handleData = (event: Event) => {
    const detail = (event as CustomEvent<FoliateTransformDataDetail>).detail
    if (!detail || !isScriptableEpubDocumentType(detail.type)) return

    detail.data = Promise.resolve(detail.data)
      .then((data) => stripExecutableEpubContent(data, detail.type))
  }

  transformTarget.addEventListener('load', handleLoad as EventListener)
  transformTarget.addEventListener('data', handleData as EventListener)

  return () => {
    transformTarget.removeEventListener('load', handleLoad as EventListener)
    transformTarget.removeEventListener('data', handleData as EventListener)
  }
}

// CSS injetado dentro do iframe do foliate para tema escuro + tamanho de fonte.
// Precisa usar !important porque o EPUB tem seus próprios estilos inline e no <link>.
// As classes .nr-* são usadas para highlight e tradução inline sem conflito com o EPUB.
function buildReaderCSS(
  fontSize: FontSize,
  lineHeight: ReaderLineHeight,
  readerTheme: ReaderTheme,
  fontFamily: ReaderFontFamily,
  overrideBookFont: boolean,
  overrideBookColors: boolean,
): string {
  const sizes: Record<FontSize, string> = {
    sm: '16px',
    md: '18px',
    lg: '22px',
    xl: '26px',
  }
  const palette = getReaderThemePalette(readerTheme)
  const lineHeightValue = getReaderLineHeightValue(lineHeight)
  const readerFontFamily = getReaderFontFamilyValue(fontFamily)
  const shouldOverrideFont = overrideBookFont && !!readerFontFamily
  const themeColorStyles = overrideBookColors
    ? `
      background-color: ${palette.background} !important;
      color: ${palette.text} !important;`
    : ''
  const textColorStyles = overrideBookColors
    ? `
      color: ${palette.text} !important;
      background-color: transparent !important;`
    : ''
  const headingColorStyles = overrideBookColors
    ? `
      color: ${palette.heading} !important;
      background-color: transparent !important;`
    : ''
  const fontFamilyStyles = shouldOverrideFont
    ? `
      font-family: ${readerFontFamily} !important;`
    : ''
  const actionTileBaseBackground = palette.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)'
  const actionTileBaseBorder = palette.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'
  const actionTileBaseShadow = palette.isDark ? '0 8px 18px rgba(0,0,0,0.22)' : '0 6px 14px rgba(15,23,42,0.10)'
  const actionPressedBackground = palette.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'
  const actionDisabledTile = palette.isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.08)'
  const actionDisabledBorder = palette.isDark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.14)'
  const actionLabelColor = palette.isDark ? '#cbd5e1' : palette.text
  const actionSpeakColor = palette.isDark ? '#ff8aa0' : '#dc2659'
  const actionSpeakBackground = palette.isDark ? 'rgba(255, 23, 68, 0.08)' : 'rgba(255, 23, 68, 0.06)'
  const actionSpeakBorder = palette.isDark ? 'rgba(255, 77, 109, 0.22)' : 'rgba(220, 38, 89, 0.18)'
  const actionBookmarkColor = palette.isDark ? '#ffbf66' : '#d97706'
  const actionBookmarkBackground = palette.isDark ? 'rgba(255, 106, 0, 0.08)' : 'rgba(255, 159, 28, 0.08)'
  const actionBookmarkBorder = palette.isDark ? 'rgba(255, 159, 28, 0.24)' : 'rgba(217, 119, 6, 0.20)'
  const actionSaveColor = palette.isDark ? '#68e7a1' : '#059669'
  const actionSaveBackground = palette.isDark ? 'rgba(0, 200, 83, 0.08)' : 'rgba(16, 185, 129, 0.08)'
  const actionSaveBorder = palette.isDark ? 'rgba(61, 220, 132, 0.22)' : 'rgba(5, 150, 105, 0.18)'
  return `
    html, body {
      ${themeColorStyles}
      ${fontFamilyStyles}
    }

    /* Aplica tema de leitura + tamanho de fonte SOMENTE em elementos de texto.
       Evitar usar * aqui: quebraria containers de imagem que usam em/% para
       dimensionamento, e removeria backgrounds necessários para capas de livro. */
    p, li, blockquote, span, td, th, pre, code,
    div, section, article, aside, main, nav, header, footer {
      font-size: ${sizes[fontSize]} !important;
      line-height: ${lineHeightValue} !important;
      ${textColorStyles}
      ${fontFamilyStyles}
    }
    h1, h2, h3, h4, h5, h6 {
      ${headingColorStyles}
      ${fontFamilyStyles}
    }
    a { ${overrideBookColors ? `color: ${palette.link} !important;` : ''} }
    pre, code, kbd, samp {
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace !important;
    }

    /* Imagens e SVGs: renderizam com suas dimensões naturais, sem override de cor.
       max-width garante que não vazem fora do viewport em qualquer tamanho de tela. */
    img, svg, figure, picture {
      max-width: 100% !important;
      height: auto !important;
    }

    /* Parágrafo selecionado para tradução (fallback quando frase ocupa o parágrafo todo) */
    .nr-hl {
      background-color: ${palette.paragraphHighlight} !important;
      border-radius: 3px !important;
    }
    /* Frase específica destacada dentro do parágrafo */
    .nr-hl-sentence {
      padding: .10em .28em !important;
      border-radius: 8px !important;
      color: inherit !important;
      background: ${palette.sentenceHighlight} !important;
      box-shadow:
        inset 0 0 0 1px ${palette.sentenceHighlightBorder} !important,
        0 0 0 4px ${palette.sentenceHighlightHalo} !important;
      -webkit-box-decoration-break: clone !important;
      box-decoration-break: clone !important;
    }
    /* Parágrafo sendo lido pelo TTS — fundo verde suave */
    .nr-tts-hl {
      background-color: ${palette.ttsHighlight} !important;
      border-radius: 3px !important;
    }
    /* Palavra atual no karaokê de palavras */
    .nr-tts-word {
      padding: .02em .12em !important;
      border-radius: 5px !important;
      background: rgba(250, 204, 21, 0.32) !important;
      box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.10) !important;
      color: inherit !important;
      font-weight: bold !important;
      text-decoration: underline !important;
      -webkit-box-decoration-break: clone !important;
      box-decoration-break: clone !important;
    }

    /* Bloco de tradução inline — injetado após o parágrafo selecionado */
    #nr-translation-block {
      margin: 14px 0 18px 0 !important;
      padding: 12px !important;
      border: 1px solid ${palette.translationBorder} !important;
      border-radius: 18px !important;
      background:
        linear-gradient(180deg, rgba(0, 229, 255, 0.08), transparent 26%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 80%),
        ${palette.translationSurface} !important;
      box-shadow:
        0 0 28px ${palette.translationGlow} !important,
        0 18px 40px rgba(0, 0, 0, 0.20) !important;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif !important;
      color: ${palette.heading} !important;
      position: relative !important;
      overflow: hidden !important;
    }
    #nr-translation-block * {
      box-sizing: border-box !important;
      font-family: inherit !important;
    }
    #nr-translation-block::after {
      content: '' !important;
      position: absolute !important;
      inset: 0 !important;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), transparent 42%) !important;
      pointer-events: none !important;
    }
    .nr-tr-panel {
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      position: relative !important;
      z-index: 1 !important;
    }
    .nr-tr-text {
      color: ${palette.heading} !important;
      font-size: 14px !important;
      line-height: 1.58 !important;
      margin: 0 !important;
      font-style: normal !important;
      letter-spacing: 0.01em !important;
    }
    .nr-tr-loading {
      display: flex !important;
      align-items: center !important;
      min-height: 16px !important;
    }
    .nr-tr-spinner {
      display: inline-block !important;
      width: 16px !important;
      height: 16px !important;
      border: 2px solid rgba(251, 146, 60, 0.95) !important;
      border-top-color: transparent !important;
      border-radius: 50% !important;
      animation: nr-spin 0.6s linear infinite !important;
      flex-shrink: 0 !important;
    }
    @keyframes nr-spin { to { transform: rotate(360deg); } }
    .nr-tr-actions {
      display: grid !important;
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      gap: 6px !important;
      margin-top: 12px !important;
      position: relative !important;
      z-index: 1 !important;
    }
    .nr-tr-action {
      appearance: none !important;
      min-height: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: 0 !important;
      cursor: pointer !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 5px !important;
      text-align: center !important;
      transition: transform 150ms ease, color 150ms ease !important;
      -webkit-tap-highlight-color: transparent !important;
      width: 100% !important;
    }
    .nr-tr-action-tile {
      width: 40px !important;
      height: 40px !important;
      max-width: 40px !important;
      min-width: 40px !important;
      aspect-ratio: 1 / 1 !important;
      border-radius: 7px !important;
      display: grid !important;
      place-items: center !important;
      border: 1px solid ${actionTileBaseBorder} !important;
      background: ${actionTileBaseBackground} !important;
      box-shadow: ${actionTileBaseShadow} !important;
      color: currentColor !important;
      transition: transform 150ms ease, background 150ms ease, border-color 150ms ease, box-shadow 150ms ease !important;
      flex-shrink: 0 !important;
    }
    .nr-tr-action-icon {
      width: 17px !important;
      height: 17px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: currentColor !important;
      flex-shrink: 0 !important;
    }
    .nr-tr-action-icon svg {
      width: 17px !important;
      height: 17px !important;
      display: block !important;
    }
    .nr-tr-action-label,
    .nr-tr-action [data-nr-action-label] {
      display: block !important;
      color: ${actionLabelColor} !important;
      font-size: 9.5px !important;
      font-weight: 500 !important;
      line-height: 1.05 !important;
      letter-spacing: 0.01em !important;
      opacity: 1 !important;
      margin-top: 0 !important;
      max-width: 100% !important;
    }
    .nr-tr-action:active {
      transform: scale(0.96) !important;
    }
    .nr-tr-action:active .nr-tr-action-tile {
      transform: scale(0.94) !important;
      background: ${actionPressedBackground} !important;
    }
    .nr-tr-action-speak {
      color: ${actionSpeakColor} !important;
    }
    .nr-tr-action-bookmark {
      color: ${actionBookmarkColor} !important;
    }
    .nr-tr-action-save {
      color: ${actionSaveColor} !important;
    }
    .nr-tr-action-speak .nr-tr-action-tile {
      background: ${actionSpeakBackground} !important;
      border-color: ${actionSpeakBorder} !important;
      box-shadow: inset 0 0 15px rgba(255, 23, 68, 0.10), ${actionTileBaseShadow} !important;
    }
    .nr-tr-action-bookmark .nr-tr-action-tile {
      background: ${actionBookmarkBackground} !important;
      border-color: ${actionBookmarkBorder} !important;
      box-shadow: inset 0 0 15px rgba(255, 159, 28, 0.10), ${actionTileBaseShadow} !important;
    }
    .nr-tr-action-save .nr-tr-action-tile {
      background: ${actionSaveBackground} !important;
      border-color: ${actionSaveBorder} !important;
      box-shadow: inset 0 0 15px rgba(16, 185, 129, 0.10), ${actionTileBaseShadow} !important;
    }
    .nr-tr-action.is-primary .nr-tr-action-tile,
    .nr-tr-action[data-nr-action="bookmark"][aria-pressed="true"] .nr-tr-action-tile {
      background: rgba(255, 159, 28, 0.16) !important;
      border-color: rgba(255, 159, 28, 0.32) !important;
      box-shadow: inset 0 0 25px rgba(255, 159, 28, 0.16), ${actionTileBaseShadow} !important;
    }
    .nr-tr-action[data-nr-flash="1"] .nr-tr-action-tile {
      background: rgba(16, 185, 129, 0.16) !important;
      border-color: rgba(52, 211, 153, 0.32) !important;
      box-shadow: inset 0 0 25px rgba(16, 185, 129, 0.16), ${actionTileBaseShadow} !important;
    }
    .nr-tr-action[disabled] {
      opacity: 0.65 !important;
      cursor: default !important;
    }
    .nr-tr-action[disabled] .nr-tr-action-tile {
      background: ${actionDisabledTile} !important;
      border-color: ${actionDisabledBorder} !important;
      box-shadow: none !important;
    }

    /* Marcador visual de bookmark no próprio livro.
       A fonte de verdade continua sendo o CFI salvo; isso é apenas projeção visual. */
    [data-nr-bookmark] {
      position: relative !important;
      padding-inline-start: ${BOOKMARK_ICON_GUTTER}px !important;
      overflow: visible !important;
    }
    [data-nr-bookmark]::before {
      content: '' !important;
      position: absolute !important;
      left: ${BOOKMARK_ICON_LEFT}px !important;
      top: calc(0.85em - ${Math.round(BOOKMARK_ICON_HEIGHT / 2)}px) !important;
      width: ${BOOKMARK_ICON_WIDTH}px !important;
      height: ${BOOKMARK_ICON_HEIGHT}px !important;
      border-radius: 3px 3px 1px 1px !important;
      background: #6366f1 !important;
      clip-path: polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%) !important;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
    }
    [data-nr-bookmark="emerald"]::before { background: #22c55e !important; }
    [data-nr-bookmark="amber"]::before { background: #f59e0b !important; }
    [data-nr-bookmark="rose"]::before { background: #f43f5e !important; }
  `
}

export interface EpubViewerHandle {
  next(): void
  prev(): void
  // Navega para o capítulo anterior e posiciona no final (último parágrafo)
  prevToEnd(): void
  goToNextTtsSection(): boolean
  goTo(target: string | number | { fraction: number }): void
  getVisibleLocation(): VisibleReadingLocation
  // TTS: retorna os textos puros de todos os parágrafos da seção atual
  getParagraphs(): string[]
  // TTS: retorna frases agrupadas com paraIdx e offsetInPara para karaokê preciso
  getSentenceChunks(): TtsChunk[]
  // TTS: retorna o índice do primeiro parágrafo visível na tela (para iniciar pelo ponto de leitura)
  getFirstVisibleParagraphIndex(): number
  // TTS: destaca parágrafo + palavra (wordStart === wordEnd === 0 → só parágrafo)
  highlightTts(paraIdx: number, wordStart: number, wordEnd: number): void
  // TTS: remove todos os destaques de audiobook
  clearTts(): void
  // TTS: rola suavemente para centralizar o parágrafo na tela (respeitando scroll do usuário)
  scrollToParagraph(idx: number): void
  // TTS: prepara scroll automático — limpa flag de "usuário rolou", chama no início do play
  resetTtsScroll(options?: { preservePlaybackSection?: boolean }): void
  // Tradução inline: injeta bloco com spinner logo após o parágrafo ativo
  showTranslationLoading(): void
  // Tradução inline: substitui spinner pelo texto traduzido + botões de ação
  injectTranslation(translatedText: string): void
  // Tradução inline: remove bloco e highlight do parágrafo ativo
  clearTranslation(): void
}

export interface ParagraphBookmarkPayload {
  cfi: string
  label: string
  percentage: number
  snippet: string
}

export interface VisibleReadingLocation {
  cfi: string | null
  tocLabel?: string
  sectionHref?: string
  fraction?: number
  percentage?: number
}

export interface ReaderRelocatePayload extends VisibleReadingLocation {
  cfi: string
  fraction: number
  percentage: number
  sectionIndex: number
}

interface LoadedSectionContent {
  index: number
  doc: Document
  paragraphs: Element[]
  paragraphTexts: string[]
}

interface EpubViewerProps {
  book: Book
  bookmarks: Bookmark[]
  fontSize: FontSize
  lineHeight: ReaderLineHeight
  readerTheme: ReaderTheme
  fontFamily: ReaderFontFamily
  overrideBookFont: boolean
  overrideBookColors: boolean
  savedCfi: string | null
  onRelocate: (payload: ReaderRelocatePayload) => void
  onTocReady: (toc: TocItem[]) => void
  onLoad: () => void
  onSectionReady?: (sectionIndex: number, sectionHref?: string) => void
  onError: (err: Error) => void
  // Chamado quando o usuário salva um par original/tradução via ⭐
  onSaveVocab: (sourceText: string, translatedText: string) => void
  // Chamado quando o tap cai nas zonas de menu ou fora da area de texto.
  onCenterTap: () => void
  chromeVisible: boolean
  // Tradução: emite o texto da frase tocada para o ReaderScreen traduzir e exibir
  // num painel React fora do iframe (evita problema de paginação no mobile)
  onTranslate: (sourceText: string) => void
  // TTS: lê um único parágrafo (acionado pelo botão 🔊 no bloco de tradução)
  onSpeakOne: (text: string) => void
  // TTS: quando audiobook está tocando, tap em parágrafo pula para ele
  onParagraphTapForTts: (idx: number) => void
  onTtsUserScrollAway?: () => void
  // TTS: true quando o modo leitura contínua está ativo — inclui pausado.
  // Quando true, tap em parágrafo navega o TTS em vez de abrir tradução.
  ttsGlobalActive: boolean
  // Capítulo: emitido quando o usuário chega ao fundo (ou sai do fundo) da seção atual.
  // hasNext: false quando é a última seção do livro.
  // nextLabel: rótulo da próxima seção quando disponível no TOC.
  // Bookmarks: remove o marcador ao tocar no ícone projetado no parágrafo.
  onBookmarkTap?: (bookmarkId: number) => void
  // Bookmarks: toggle no parágrafo atualmente selecionado no bloco de tradução inline.
  onBookmarkParagraph?: (payload: ParagraphBookmarkPayload) => void
}

// forwardRef: padrão React para expor métodos imperativos ao componente pai.
// Equivale a um "ref de objeto" que o pai chama com viewerRef.current.next().
export const EpubViewer = forwardRef<EpubViewerHandle, EpubViewerProps>(
  (
    {
      book, bookmarks, fontSize, lineHeight, readerTheme, fontFamily, overrideBookFont, overrideBookColors, savedCfi,
      onRelocate, onTocReady, onLoad, onSectionReady, onError,
      onSaveVocab, onCenterTap, onTranslate,
      onSpeakOne, onParagraphTapForTts, onTtsUserScrollAway, ttsGlobalActive,
      chromeVisible,
      onBookmarkTap, onBookmarkParagraph,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<View | null>(null)
    const currentDocRef = useRef<Document | null>(null)
    const loadedSectionsRef = useRef(new Map<number, LoadedSectionContent>())
    const trackedScrollDocRef = useRef<Document | null>(null)

    // Elementos e textos dos parágrafos da seção atual — atualizados no evento 'load'
    const ttsParagraphsRef = useRef<Element[]>([])
    const ttsParagraphTextsRef = useRef<string[]>([])
    const ttsPlaybackContentRef = useRef<LoadedSectionContent | null>(null)

    // Ref do parágrafo com highlight de tradução ativo — usado por clearTranslation()
    const activeTranslationParaRef = useRef<Element | null>(null)
    // Texto original e traduzido da frase ativa — usados pelos botões Ouvir/Salvar no iframe
    const activeSourceTextRef = useRef<string>('')
    const activeTranslatedTextRef = useRef<string>('')
    // Lock: bloqueia nova seleção enquanto a tradução HTTP anterior ainda está em voo.
    // Evita que dois parágrafos fiquem simultaneamente marcados com data-nr-active.
    const translationInProgressRef = useRef(false)

    // TTS scroll automático: controla se o auto-scroll deve seguir o TTS ou foi bloqueado
    // pelo usuário rolar manualmente durante a leitura
    const ttsActiveRef = useRef(false)       // true enquanto TTS está tocando
    const userScrolledRef = useRef(false)    // true se usuário rolou durante TTS
    // Janela de tempo em que scrolls são considerados programáticos (cobre animação smooth)
    const scrollingProgrammaticallyUntilRef = useRef(0)

    // Refs para os callbacks mais recentes — evita stale closure nos listeners do iframe.
    // Os listeners são criados uma vez por seção (no evento 'load'), mas os callbacks
    // podem mudar entre renders. useSyncRef mantém sempre a versão atual sem recriar o listener.
    const onSaveVocabRef = useSyncRef(onSaveVocab)
    const onCenterTapRef = useSyncRef(onCenterTap)
    const onTranslateRef = useSyncRef(onTranslate)
    const onSpeakOneRef = useSyncRef(onSpeakOne)
    const onParagraphTapForTtsRef = useSyncRef(onParagraphTapForTts)
    const onSectionReadyRef = useSyncRef(onSectionReady)
    const onTtsUserScrollAwayRef = useSyncRef(onTtsUserScrollAway)
    // ttsGlobalActive: modo leitura contínua ativo (inclui pausado) — gating do clique
    const ttsGlobalActiveRef = useSyncRef(ttsGlobalActive)
    const chromeVisibleRef = useSyncRef(chromeVisible)
    // Navegação entre capítulos: detecta fundo visual + swipe para avançar
    const currentSectionIdxRef = useRef(0)
    const totalSectionsRef = useRef(1)
    // Flag: próximo evento 'load' deve rolar a seção até o fundo (usado após prevToEnd)
    const scrollToBottomOnLoadRef = useRef(false)
    const lastRelocateRef = useRef<RelocateDetail | null>(null)
    const autoSkipChapterStubDirectionRef = useRef<-1 | 0 | 1>(0)
    const autoSkipChapterStubCountRef = useRef(0)
    const scrollListenerCleanupRef = useRef<(() => void) | null>(null)
    const pendingSectionRef = useRef<{ doc: Document; index: number; version: number } | null>(null)
    const pendingSectionVersionRef = useRef(0)
    const finalizedSectionVersionRef = useRef(0)
    const finalizeSectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const initialInteractiveReadyRef = useRef(false)
    const renderBookmarkMarkersRef = useRef<((doc?: Document | null) => void) | null>(null)
    const syncActiveTranslationBookmarkActionRef = useRef<((doc?: Document | null) => void) | null>(null)
    const BLOCK = 'p, li, blockquote, h1, h2, h3, h4, h5, h6'
    const bookmarksRef = useSyncRef(bookmarks)
    const onBookmarkTapRef = useSyncRef(onBookmarkTap)
    const onBookmarkParagraphRef = useSyncRef(onBookmarkParagraph)

    function pruneLoadedSections(): void {
      const liveIndices = new Set(
        viewRef.current?.renderer
          .getContents()
          .map((content) => content.index)
          .filter((index): index is number => typeof index === 'number') ?? [],
      )

      for (const index of Array.from(loadedSectionsRef.current.keys())) {
        if (!liveIndices.has(index)) loadedSectionsRef.current.delete(index)
      }
    }

    function buildLoadedSectionContent(index: number, doc: Document): LoadedSectionContent {
      const paragraphs = Array.from(doc.querySelectorAll(BLOCK))
        .filter((el) => (el.textContent?.trim().length ?? 0) > 2)
      paragraphs.forEach((para) => getOrCreateParagraphBookmarkCfi(para, index))
      return {
        index,
        doc,
        paragraphs,
        paragraphTexts: paragraphs.map((el) => el.textContent!.trim()),
      }
    }

    function registerLoadedSection(index: number, doc: Document): LoadedSectionContent {
      const content = buildLoadedSectionContent(index, doc)
      loadedSectionsRef.current.set(index, content)
      return content
    }

    function getLoadedSection(index = currentSectionIdxRef.current): LoadedSectionContent | null {
      pruneLoadedSections()
      return loadedSectionsRef.current.get(index) ?? null
    }

    function getSectionIndexForDocument(doc?: Document | null): number | null {
      if (!doc) return null
      pruneLoadedSections()
      for (const [index, content] of loadedSectionsRef.current.entries()) {
        if (content.doc === doc) return index
      }
      return null
    }

    function getSectionHref(index: number): string | undefined {
      const section = viewRef.current?.book?.sections?.[index] as NavigableSection | undefined
      return section?.href ?? section?.id
    }

    function activateSection(index: number): LoadedSectionContent | null {
      currentSectionIdxRef.current = index
      const content = getLoadedSection(index)
      if (!content) return null

      currentDocRef.current = content.doc
      ttsParagraphsRef.current = content.paragraphs
      ttsParagraphTextsRef.current = content.paragraphTexts

      return content
    }

    function getTtsPlaybackContent(): LoadedSectionContent | null {
      return ttsPlaybackContentRef.current ?? getLoadedSection(currentSectionIdxRef.current)
    }

    function getTtsPlaybackParagraphs(): Element[] {
      return getTtsPlaybackContent()?.paragraphs ?? ttsParagraphsRef.current
    }

    function createCollapsedRangeForElement(element: Element): Range {
      const range = element.ownerDocument.createRange()
      range.selectNodeContents(element)
      range.collapse(true)
      return range
    }

    function getParagraphsFromDocument(doc: Document): Element[] {
      return Array.from(doc.querySelectorAll(BLOCK))
        .filter((el) => !el.closest('#nr-translation-block'))
        .filter((el) => (el.textContent?.trim().length ?? 0) > 2)
    }

    function isReadableBlock(el: Element | null): el is HTMLElement {
      return !!el && !el.closest('#nr-translation-block') && (el.textContent?.trim().length ?? 0) > 2
    }

    function findClosestReadableBlock(doc: Document, clientX: number, clientY: number): HTMLElement | null {
      const blocks = getParagraphsFromDocument(doc) as HTMLElement[]
      let closestBlock: HTMLElement | null = null
      let closestDistance = Number.POSITIVE_INFINITY

      for (const block of blocks) {
        const rect = block.getBoundingClientRect()
        const hasLayoutBox = rect.width > 0 || rect.height > 0
        if (!hasLayoutBox) continue

        const closestX = Math.max(rect.left, Math.min(clientX, rect.right))
        const closestY = Math.max(rect.top, Math.min(clientY, rect.bottom))
        const dx = clientX - closestX
        const dy = clientY - closestY
        const distance = Math.hypot(dx, dy)

        if (distance < closestDistance) {
          closestDistance = distance
          closestBlock = block
        }
      }

      return closestBlock
    }

    function getTapReadableBlock(target: Element, doc: Document, clientX: number, clientY: number): HTMLElement | null {
      const directBlock = target.closest(BLOCK) as HTMLElement | null
      if (isReadableBlock(directBlock)) return directBlock

      return findClosestReadableBlock(doc, clientX, clientY)
    }

    function isPointInsideElement(element: Element, clientX: number, clientY: number): boolean {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false

      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      )
    }

    function getElementFromPoint(doc: Document, clientX: number, clientY: number): Element | null {
      return doc.elementFromPoint?.(clientX, clientY) ?? null
    }

    function getTranslationActionAtPoint(target: Element, doc: Document, clientX: number, clientY: number): HTMLElement | null {
      const directAction = target.closest('[data-nr-action]') as HTMLElement | null
      if (directAction) return directAction

      const hitAction = getElementFromPoint(doc, clientX, clientY)?.closest('[data-nr-action]') as HTMLElement | null
      if (hitAction) return hitAction

      return Array.from(doc.querySelectorAll<HTMLElement>('#nr-translation-block [data-nr-action]'))
        .find((button) => isPointInsideElement(button, clientX, clientY)) ?? null
    }

    function isTranslationBlockTap(target: Element, doc: Document, clientX: number, clientY: number): boolean {
      if (target.closest('#nr-translation-block')) return true
      if (getElementFromPoint(doc, clientX, clientY)?.closest('#nr-translation-block')) return true

      const block = doc.getElementById('nr-translation-block')
      return !!block && isPointInsideElement(block, clientX, clientY)
    }

    function unwrapElementPreservingChildren(el: Element): void {
      const parent = el.parentNode
      if (!parent) return

      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
      parent.normalize()
    }

    function clearTtsWordHighlights(root: Element): void {
      root.querySelectorAll('.nr-tts-word').forEach((el) => {
        unwrapElementPreservingChildren(el)
      })

      const htmlRoot = root as HTMLElement
      if (htmlRoot.dataset.originalHtml) delete htmlRoot.dataset.originalHtml
    }

    function wrapTextSegment(textNode: Text, startOffset: number, endOffset: number): boolean {
      const textLength = textNode.data.length
      const safeStart = Math.max(0, Math.min(startOffset, textLength))
      const safeEnd = Math.max(safeStart, Math.min(endOffset, textLength))
      if (safeEnd <= safeStart) return false

      const selectedNode = safeStart > 0 ? textNode.splitText(safeStart) : textNode
      const selectedLength = safeEnd - safeStart
      if (selectedLength < selectedNode.data.length) selectedNode.splitText(selectedLength)

      const parent = selectedNode.parentNode
      if (!parent) return false

      const mark = selectedNode.ownerDocument.createElement('mark')
      mark.className = 'nr-tts-word'
      parent.insertBefore(mark, selectedNode)
      mark.appendChild(selectedNode)
      return true
    }

    function highlightTextRangeByOffsets(root: Element, start: number, end: number): boolean {
      const textLength = root.textContent?.length ?? 0
      const safeStart = Math.max(0, Math.min(start, textLength))
      const safeEnd = Math.max(safeStart, Math.min(end, textLength))
      if (safeEnd <= safeStart) return false

      const segments: Array<{ node: Text; startOffset: number; endOffset: number }> = []
      const showText = root.ownerDocument.defaultView?.NodeFilter?.SHOW_TEXT ?? NodeFilter.SHOW_TEXT
      const walker = root.ownerDocument.createTreeWalker(root, showText)
      let textOffset = 0
      let node: Node | null

      while ((node = walker.nextNode()) !== null) {
        const nodeTextLength = node.textContent?.length ?? 0
        const nodeStart = textOffset
        const nodeEnd = nodeStart + nodeTextLength
        const overlapStart = Math.max(safeStart, nodeStart)
        const overlapEnd = Math.min(safeEnd, nodeEnd)

        if (overlapEnd > overlapStart) {
          segments.push({
            node: node as Text,
            startOffset: overlapStart - nodeStart,
            endOffset: overlapEnd - nodeStart,
          })
        }

        textOffset = nodeEnd
        if (textOffset >= safeEnd) break
      }

      return segments.reduce((wrapped, segment) => (
        wrapTextSegment(segment.node, segment.startOffset, segment.endOffset) || wrapped
      ), false)
    }

    function clearTtsHighlights(paragraphs: Element[]): void {
      paragraphs.forEach(el => {
        el.classList.remove('nr-tts-hl')
        clearTtsWordHighlights(el)
      })
    }

    function clearKnownTtsHighlights(): void {
      const paragraphs = new Set<Element>([
        ...ttsParagraphsRef.current,
        ...(ttsPlaybackContentRef.current?.paragraphs ?? []),
      ])
      clearTtsHighlights(Array.from(paragraphs))
    }

    function getParagraphIndexFromRange(range?: Range | null): number {
      const paras = ttsParagraphsRef.current
      if (!range || paras.length === 0) return 0

      const startNode = range.startContainer
      const startElement =
        startNode.nodeType === Node.ELEMENT_NODE
          ? (startNode as Element)
          : startNode.parentElement

      if (!startElement) return 0

      const directIdx = paras.findIndex((para) => para === startElement || para.contains(startNode))
      if (directIdx >= 0) return directIdx

      const block = startElement.closest(BLOCK)
      if (!block) return 0

      const blockIdx = paras.indexOf(block)
      return blockIdx >= 0 ? blockIdx : 0
    }

    function getVisibleParagraphInternal(): { para: Element | null; paraIndex: number } {
      const paras = ttsParagraphsRef.current
      if (paras.length === 0) return { para: null, paraIndex: 0 }

      const paraIndex = getParagraphIndexFromRange(lastRelocateRef.current?.range)
      return {
        para: paras[paraIndex] ?? null,
        paraIndex,
      }
    }

    function getFirstVisibleParagraphIndexInternal(): number {
      return getVisibleParagraphInternal().paraIndex
    }

    function getOrCreateParagraphBookmarkCfi(
      para: Element | null,
      sectionIndex = para ? (getSectionIndexForDocument(para.ownerDocument) ?? currentSectionIdxRef.current) : currentSectionIdxRef.current,
    ): string | null {
      const view = viewRef.current
      if (!view || !para) return null

      const cached = para.getAttribute('data-nr-para-cfi')
      if (cached) return cached

      const doc = para.ownerDocument!
      const range = doc.createRange()
      range.selectNodeContents(para)
      range.collapse(true)

      const cfi = normalizeCfi(view.getCFI(sectionIndex, range))
      if (!cfi) return null

      para.setAttribute('data-nr-para-cfi', cfi)
      return cfi
    }

    function getParagraphBookmarkPayload(
      para: Element | null,
      sectionIndex = para ? (getSectionIndexForDocument(para.ownerDocument) ?? currentSectionIdxRef.current) : currentSectionIdxRef.current,
    ): ParagraphBookmarkPayload | null {
      const view = viewRef.current
      if (!view || !para) return null

      const cfi = getOrCreateParagraphBookmarkCfi(para, sectionIndex)
      if (!cfi) return null

      const doc = para.ownerDocument!
      const range = doc.createRange()
      range.selectNodeContents(para)
      range.collapse(true)

      const progress = view.getProgressOf(sectionIndex, range)
      const location = lastRelocateRef.current ?? view.lastLocation
      const fractions = view.getSectionFractions()
      const sectionStart = fractions[sectionIndex] ?? location?.fraction ?? 0
      const sectionEnd = fractions[sectionIndex + 1] ?? location?.fraction ?? sectionStart
      const sectionContent = getLoadedSection(sectionIndex)
      const sectionParagraphs = sectionContent?.paragraphs ?? ttsParagraphsRef.current
      const paraIndex = Math.max(0, sectionParagraphs.indexOf(para))
      const paraFraction = sectionParagraphs.length > 1
        ? paraIndex / (sectionParagraphs.length - 1)
        : 0
      const percentage = Math.round((sectionStart + (sectionEnd - sectionStart) * paraFraction) * 100)
      const snippet = (para.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 150)

      return {
        cfi,
        label: progress.tocItem?.label ?? location?.tocItem?.label ?? `${percentage}%`,
        percentage,
        snippet,
      }
    }

    function findMatchingParagraphBookmark(paragraphCfi: string | null | undefined): Bookmark | undefined {
      if (!paragraphCfi) return undefined
      return [...bookmarksRef.current].reverse().find((bookmark) =>
        areCfisEquivalent(bookmark.cfi, paragraphCfi),
      )
    }

    function getParagraphBookmarkState(para: Element | null, sectionIndex?: number) {
      const payload = getParagraphBookmarkPayload(para, sectionIndex)
      if (!payload) return null

      const matchedBookmark = findMatchingParagraphBookmark(payload.cfi)
      return { payload, matchedBookmark }
    }

    function syncActiveTranslationBookmarkAction(doc = currentDocRef.current): void {
      const actionBtn = doc?.getElementById('nr-translation-block')?.querySelector<HTMLButtonElement>('[data-nr-action="bookmark"]')
      if (!actionBtn) return

      const bookmarkState = getParagraphBookmarkState(activeTranslationParaRef.current)
      const isBookmarked = !!bookmarkState?.matchedBookmark
      setTranslationActionLabel(actionBtn, isBookmarked ? 'Remover' : 'Marcar')
      actionBtn.setAttribute('aria-pressed', isBookmarked ? 'true' : 'false')
      actionBtn.removeAttribute('disabled')
      delete actionBtn.dataset.nrPending
    }

    function isChapterStubSection(doc: Document): boolean {
      const blockTexts = Array.from(doc.querySelectorAll('p, li, blockquote'))
        .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean)
      const headingCount = doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length
      const bodyBlockCount = blockTexts.length
      const longestBlockLength = blockTexts.reduce((max, text) => Math.max(max, text.length), 0)
      const textLength = doc.body?.textContent?.replace(/\s+/g, ' ').trim().length ?? 0
      const hasChapterMarker =
        !!doc.querySelector('[data-type="chapter"]') ||
        !!doc.querySelector('[epub\\:type~="chapter"]')
      const hasPartMarker =
        !!doc.querySelector('[data-type="part"]') ||
        !!doc.querySelector('[epub\\:type~="part"]') ||
        !!doc.querySelector('[data-pdf-bookmark^="Part "]')

      if (hasPartMarker) return true
      if (hasChapterMarker) return false
      return headingCount > 0 && bodyBlockCount <= 1 && longestBlockLength <= 40 && textLength > 0 && textLength <= 220
    }

    function getRendererScrollContainer(): HTMLElement | null {
      if (!(viewRef.current?.renderer instanceof HTMLElement)) return null
      return viewRef.current.renderer.shadowRoot?.getElementById('container') as HTMLElement | null
    }

    function getWindowScrollMetrics(doc: Document) {
      const win = doc.defaultView
      return {
        position: win?.scrollY ?? 0,
        viewport: win?.innerHeight ?? doc.documentElement.clientHeight,
        extent: doc.documentElement.scrollHeight,
        scrollToBottom: () => { win?.scrollTo(0, doc.documentElement.scrollHeight) },
        target: (win ?? doc) as EventTarget,
      }
    }

    function getScrollMetricSources(doc: Document) {
      const sources: Array<{
        position: number
        viewport: number
        extent: number
        scrollToBottom: () => void
        target: EventTarget
      }> = []

      const container = getRendererScrollContainer()
      if (container) {
        sources.push({
          position: container.scrollTop,
          viewport: container.clientHeight,
          extent: container.scrollHeight,
          scrollToBottom: () => { container.scrollTop = container.scrollHeight },
          target: container as EventTarget,
        })
      }

      sources.push(getWindowScrollMetrics(doc))
      return sources
    }

    function getScrollMetrics(doc: Document) {
      const sources = getScrollMetricSources(doc)
      return sources
        .slice()
        .sort((a, b) => {
          const aOverflow = Math.max(0, a.extent - a.viewport)
          const bOverflow = Math.max(0, b.extent - b.viewport)
          return bOverflow - aOverflow
        })[0] ?? getWindowScrollMetrics(doc)
    }

    function isCfiTarget(target: string): boolean {
      return /^epubcfi\(/i.test(target.trim())
    }

    function clearFinalizeSectionTimeout(): void {
      if (finalizeSectionTimeoutRef.current) {
        clearTimeout(finalizeSectionTimeoutRef.current)
        finalizeSectionTimeoutRef.current = null
      }
    }

    function scheduleSectionFinalization(reason: 'stabilized' | 'relocate'): void {
      const schedule =
        currentDocRef.current?.defaultView?.requestAnimationFrame?.bind(currentDocRef.current.defaultView) ??
        requestAnimationFrame
      schedule(() => finalizePendingSection(reason))
    }

    function setupScrollTracking(doc: Document): void {
      if (trackedScrollDocRef.current === doc && scrollListenerCleanupRef.current) return

      scrollListenerCleanupRef.current?.()
      trackedScrollDocRef.current = doc

      const getScrollState = () => {
        const sources = getScrollMetricSources(doc)
        const activeSources = sources.filter((source) => source.extent > source.viewport + 4)
        const relevantSources = activeSources.length > 0 ? activeSources : sources
        return {
          position: Math.max(0, ...relevantSources.map((source) => source.position)),
          atBottom: relevantSources.some(
            (source) => source.position + source.viewport >= source.extent - 20,
          ),
          targets: Array.from(new Set(relevantSources.map((source) => source.target))),
        }
      }

      const initialState = getScrollState()
      // Ignora scrolls automáticos logo após o load/estabilização da seção.
      scrollingProgrammaticallyUntilRef.current = Math.max(
        scrollingProgrammaticallyUntilRef.current,
        Date.now() + 300,
      )

      const onScroll = () => {
        if (ttsActiveRef.current && Date.now() > scrollingProgrammaticallyUntilRef.current) {
          const wasFollowing = !userScrolledRef.current
          userScrolledRef.current = true
          if (wasFollowing) onTtsUserScrollAwayRef.current?.()
        }
      }

      for (const target of initialState.targets) {
        target.addEventListener('scroll', onScroll as EventListener, { passive: true })
      }
      scrollListenerCleanupRef.current = () => {
        for (const target of initialState.targets) {
          target.removeEventListener('scroll', onScroll as EventListener)
        }
        if (trackedScrollDocRef.current === doc) trackedScrollDocRef.current = null
      }
    }

    function finalizePendingSection(_reason: 'stabilized' | 'relocate' | 'timeout'): void {
      void _reason
      const pendingSection = pendingSectionRef.current
      if (!pendingSection) return
      if (finalizedSectionVersionRef.current === pendingSection.version) return
      if (pendingSection.doc !== currentDocRef.current || pendingSection.index !== currentSectionIdxRef.current) return

      clearFinalizeSectionTimeout()

      const { doc, index, version } = pendingSection
      const hasNextSection = index < totalSectionsRef.current - 1
      const skipDirection = autoSkipChapterStubDirectionRef.current

      if (
        skipDirection !== 0 &&
        (skipDirection > 0 ? hasNextSection : index > 0) &&
        isChapterStubSection(doc) &&
        autoSkipChapterStubCountRef.current < 4
      ) {
        pendingSectionRef.current = null
        autoSkipChapterStubCountRef.current += 1
        doc.defaultView?.requestAnimationFrame(() => {
          goToAdjacentSection(skipDirection, skipDirection < 0 ? () => 1 : () => 0)
        })
        return
      }

      autoSkipChapterStubDirectionRef.current = 0
      autoSkipChapterStubCountRef.current = 0

      if (scrollToBottomOnLoadRef.current) {
        scrollToBottomOnLoadRef.current = false
        doc.defaultView?.requestAnimationFrame(() => {
          getScrollMetrics(doc).scrollToBottom()
        })
      }

      setupScrollTracking(doc)
      finalizedSectionVersionRef.current = version

      if (!initialInteractiveReadyRef.current) {
        initialInteractiveReadyRef.current = true
        onLoad()
      }
      onSectionReadyRef.current?.(index, getSectionHref(index))
    }

    function clearBookmarkMarkers(doc?: Document | null): void {
      doc?.querySelectorAll<HTMLElement>('[data-nr-bookmark]').forEach((el) => {
        el.removeAttribute('data-nr-bookmark')
        el.removeAttribute('data-nr-bookmark-id')
      })
    }

    function renderBookmarkMarkers(doc?: Document | null): void {
      const activeBookmarks = bookmarksRef.current
      const contents = doc
        ? [getLoadedSection(getSectionIndexForDocument(doc) ?? currentSectionIdxRef.current)].filter((content): content is LoadedSectionContent => !!content)
        : Array.from(loadedSectionsRef.current.values())

      for (const content of contents) {
        clearBookmarkMarkers(content.doc)
        if (activeBookmarks.length === 0) continue

        for (const para of content.paragraphs) {
          const bookmarkState = getParagraphBookmarkState(para, content.index)
          const matchedBookmark = bookmarkState?.matchedBookmark
          if (!matchedBookmark) continue

          const paraEl = para as HTMLElement
          paraEl.setAttribute('data-nr-bookmark', matchedBookmark.color ?? 'indigo')
          if (matchedBookmark.id !== undefined) {
            paraEl.setAttribute('data-nr-bookmark-id', String(matchedBookmark.id))
          }
        }
      }
    }
    syncActiveTranslationBookmarkActionRef.current = syncActiveTranslationBookmarkAction
    renderBookmarkMarkersRef.current = renderBookmarkMarkers

    function getAdjacentSectionIndex(direction: 1 | -1, fromIndex = currentSectionIdxRef.current): number | null {
      const sections = viewRef.current?.book?.sections as Array<FoliateSection & { linear?: string }> | undefined
      if (!sections?.length) return null

      for (let index = fromIndex + direction; index >= 0 && index < sections.length; index += direction) {
        if (sections[index]?.linear !== 'no') return index
      }
      return null
    }

    function goToAdjacentSection(direction: 1 | -1, anchor?: number | ((doc: Document) => Range | Element | number | null)): boolean {
      const view = viewRef.current
      if (!view) return false

      const targetIndex = getAdjacentSectionIndex(direction)
      if (targetIndex == null) return false

      if (typeof view.renderer.goTo === 'function') {
        void view.renderer.goTo(anchor == null ? { index: targetIndex } : { index: targetIndex, anchor })
        return true
      }

      scrollToBottomOnLoadRef.current = anchor === 1
      void view.goTo(targetIndex)
      return true
    }

    // Expõe API imperativa para o ReaderScreen via ref
    useImperativeHandle(ref, () => ({
      next: () => {
        autoSkipChapterStubDirectionRef.current = 1
        autoSkipChapterStubCountRef.current = 0
        goToAdjacentSection(1, () => 0)
      },
      prev: () => {
        autoSkipChapterStubDirectionRef.current = 0
        viewRef.current?.prev()
      },
      prevToEnd: () => {
        autoSkipChapterStubDirectionRef.current = -1
        autoSkipChapterStubCountRef.current = 0
        scrollingProgrammaticallyUntilRef.current = Date.now() + 800
        goToAdjacentSection(-1, () => 1)
      },
      goToNextTtsSection: () => {
        autoSkipChapterStubDirectionRef.current = 1
        autoSkipChapterStubCountRef.current = 0
        scrollingProgrammaticallyUntilRef.current = Date.now() + 800
        return goToAdjacentSection(1, () => 0)
      },
      goTo: (target) => {
        autoSkipChapterStubDirectionRef.current =
          typeof target === 'string' && !isCfiTarget(target) ? 1 : 0
        autoSkipChapterStubCountRef.current = 0
        const view = viewRef.current
        if (!view) return

        if (typeof target === 'string' && !isCfiTarget(target)) {
          const resolved = buildHrefNavigationTarget(view.book?.sections as NavigableSection[] | undefined, target)
          if (resolved?.matchType === 'exact') {
            void view.goTo(target).then((nativeResolved) => {
              if (!nativeResolved && typeof view.renderer.goTo === 'function') {
                return view.renderer.goTo(toRendererNavigationTarget(resolved))
              }
            })
            return
          }
          if (resolved && typeof view.renderer.goTo === 'function') {
            void view.renderer.goTo(toRendererNavigationTarget(resolved))
            return
          }
        }

        void view.goTo(target)
      },
      getVisibleLocation: () => {
        const view = viewRef.current
        const location = lastRelocateRef.current ?? view?.lastLocation
        if (!view || !location?.cfi) return { cfi: null }

        const fraction = location.fraction
        const percentage = fractionToPercentage(fraction)

        const { para } = getVisibleParagraphInternal()
        if (!para) {
          const sectionHref = location.tocItem?.href
            ?? getSectionHref(location.index ?? currentSectionIdxRef.current)
          return {
            cfi: location.cfi,
            tocLabel: location.tocItem?.label,
            sectionHref,
            fraction,
            percentage,
          }
        }

        const doc = para.ownerDocument!
        const range = doc.createRange()
        range.selectNodeContents(para)
        range.collapse(true)

        const cfi = view.getCFI(currentSectionIdxRef.current, range)
        const progress = view.getProgressOf(currentSectionIdxRef.current, range)
        const sectionHref = progress.tocItem?.href
          ?? location.tocItem?.href
          ?? getSectionHref(currentSectionIdxRef.current)

        return {
          cfi,
          tocLabel: progress.tocItem?.label ?? location.tocItem?.label,
          sectionHref,
          fraction,
          percentage,
        }
      },

      getParagraphs: () => ttsParagraphTextsRef.current,

      getSentenceChunks: (): TtsChunk[] => {
        const chunks: TtsChunk[] = []
        const content = ttsActiveRef.current ? getTtsPlaybackContent() : getLoadedSection(currentSectionIdxRef.current)
        const paragraphTexts = content?.paragraphTexts ?? ttsParagraphTextsRef.current
        const locale = content?.doc.documentElement.lang || currentDocRef.current?.documentElement.lang || undefined
        for (let paraIdx = 0; paraIdx < paragraphTexts.length; paraIdx++) {
          const text = paragraphTexts[paraIdx]
          for (const { sentence, offset } of splitParagraphIntoChunks(text, 40, locale)) {
            chunks.push({ text: sentence, paraIdx, offsetInPara: offset })
          }
        }
        return chunks
      },

      getFirstVisibleParagraphIndex: () => getFirstVisibleParagraphIndexInternal(),

      scrollToParagraph: (idx: number) => {
        // Usuário rolou manualmente durante o TTS: não override a posição dele
        if (userScrolledRef.current) return
        const content = getTtsPlaybackContent()
        const paragraphs = content?.paragraphs ?? ttsParagraphsRef.current
        const para = paragraphs[idx] as HTMLElement | undefined
        if (!para) return
        // Marca como scroll programático por 1s (cobre animação smooth)
        scrollingProgrammaticallyUntilRef.current = Date.now() + 1200

        const renderer = viewRef.current?.renderer
        const sectionIndex = content?.index ?? currentSectionIdxRef.current
        if (renderer?.goTo && sectionIndex !== currentSectionIdxRef.current) {
          void renderer.goTo({
            index: sectionIndex,
            anchor: (doc) => {
              const target = getParagraphsFromDocument(doc)[idx] ?? para
              return createCollapsedRangeForElement(target)
            },
          })
          return
        }

        const range = createCollapsedRangeForElement(para)
        if (renderer?.scrollToAnchor) {
          void renderer.scrollToAnchor(range, false, true)
          return
        }

        para.scrollIntoView({ block: 'center', behavior: 'smooth' })
      },

      resetTtsScroll: (options) => {
        userScrolledRef.current = false
        ttsActiveRef.current = true
        if (!options?.preservePlaybackSection) {
          ttsPlaybackContentRef.current = getLoadedSection(currentSectionIdxRef.current)
        }
      },

      highlightTts: (paraIdx, wordStart, wordEnd) => {
        // Remove destaques do parágrafo anterior (TTS e karaokê)
        clearKnownTtsHighlights()

        const para = getTtsPlaybackParagraphs()[paraIdx]
        if (!para) return

        // Destaca o parágrafo atual
        para.classList.add('nr-tts-hl')

        // Karaokê: wordStart === wordEnd === 0 significa "só muda o parágrafo"
        if (wordStart === 0 && wordEnd === 0) return

        highlightTextRangeByOffsets(para, wordStart, wordEnd)
      },

      clearTts: () => {
        ttsActiveRef.current = false
        clearKnownTtsHighlights()
        ttsPlaybackContentRef.current = null
      },

      showTranslationLoading: () => {
        const para = activeTranslationParaRef.current
        if (!para) return
        translationInProgressRef.current = true
        const doc = para.ownerDocument!
        doc.getElementById('nr-translation-block')?.remove()
        const block = doc.createElement('div')
        block.id = 'nr-translation-block'
        block.className = 'nr-translation-block'
        block.innerHTML = `
          <div class="nr-tr-panel">
            <div class="nr-tr-loading">
              <span class="nr-tr-spinner"></span>
            </div>
          </div>`
        para.after(block)

        // Se há texto após a frase destacada, move-o para um <p> temporário
        // abaixo do bloco — assim o bloco aparece logo após a frase, não ao
        // final do parágrafo inteiro.
        const span = para.querySelector('.nr-hl-sentence')
        if (span?.nextSibling) {
          const range = doc.createRange()
          range.setStartAfter(span)
          range.setEndAfter(para.lastChild!)
          const extracted = range.extractContents()
          if (extracted.textContent?.trim()) {
            const remainder = doc.createElement('p')
            remainder.id = 'nr-para-remainder'
            remainder.className = para.className
            const styleAttr = para.getAttribute('style')
            if (styleAttr) remainder.setAttribute('style', styleAttr)
            remainder.appendChild(extracted)
            block.after(remainder)
          }
        }

        // Rola o parágrafo para o topo para que frase + bloco fiquem visíveis.
        para.ownerDocument?.defaultView?.requestAnimationFrame(() => {
          para.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      },

      injectTranslation: (translatedText: string) => {
        translationInProgressRef.current = false
        const para = activeTranslationParaRef.current
        if (!para) return
        const block = para.ownerDocument?.getElementById('nr-translation-block')
        if (!block) return
        activeTranslatedTextRef.current = translatedText
        block.innerHTML = `
          <div class="nr-tr-panel">
            <p class="nr-tr-text">${escapeHtml(translatedText)}</p>
          </div>
          <div class="nr-tr-actions">
            ${renderTranslationAction('speak', 'Ouvir', TRANSLATION_ICON.speak)}
            ${renderTranslationAction('bookmark', 'Marcar', TRANSLATION_ICON.bookmark, 'primary')}
            ${renderTranslationAction('save', 'Salvar', TRANSLATION_ICON.save)}
          </div>`
        syncActiveTranslationBookmarkAction(para.ownerDocument)
      },

      clearTranslation: () => {
        translationInProgressRef.current = false
        const para = activeTranslationParaRef.current
        if (!para) return
        // Reintegra o texto extraído de volta ao parágrafo original antes de remover o bloco
        const remainder = para.ownerDocument?.getElementById('nr-para-remainder')
        if (remainder) {
          while (remainder.firstChild) para.appendChild(remainder.firstChild)
          remainder.remove()
        }
        para.ownerDocument?.getElementById('nr-translation-block')?.remove()
        para.removeAttribute('data-nr-active')
        para.classList.remove('nr-hl')
        const sentSpan = para.querySelector('.nr-hl-sentence')
        if (sentSpan) {
          const parent = sentSpan.parentNode!
          while (sentSpan.firstChild) parent.insertBefore(sentSpan.firstChild, sentSpan)
          sentSpan.remove()
        }
        activeSourceTextRef.current = ''
        activeTranslatedTextRef.current = ''
        activeTranslationParaRef.current = null
      },
    }))

    // Atualiza fonte sem recriar o view (efeito separado intencional)
    useEffect(() => {
      viewRef.current?.renderer?.setStyles?.(buildReaderCSS(
        fontSize,
        lineHeight,
        readerTheme,
        fontFamily,
        overrideBookFont,
        overrideBookColors,
      ))
    }, [fontSize, fontFamily, lineHeight, overrideBookColors, overrideBookFont, readerTheme])

    useEffect(() => {
      renderBookmarkMarkersRef.current?.()
      syncActiveTranslationBookmarkActionRef.current?.()
    }, [bookmarks])

    // Setup principal: cria o elemento foliate, abre o EPUB, configura renderer.
    // Roda apenas quando o bookId muda (novo livro), não a cada re-render.
    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const loadedSections = loadedSectionsRef.current

      loadedSections.clear()
      trackedScrollDocRef.current = null
      currentDocRef.current = null
      ttsParagraphsRef.current = []
      ttsParagraphTextsRef.current = []
      ttsPlaybackContentRef.current = null
      pendingSectionRef.current = null
      lastRelocateRef.current = null
      activeTranslationParaRef.current = null
      activeSourceTextRef.current = ''
      activeTranslatedTextRef.current = ''
      translationInProgressRef.current = false
      initialInteractiveReadyRef.current = false
      scrollToBottomOnLoadRef.current = false

      let cancelled = false
      let view: View | null = null
      let rendererStabilizedListener: EventListener | null = null
      let cleanupPassiveEpubContentTransform: (() => void) | null = null

      async function setup() {

        // Import dinâmico: registra o custom element como side-effect
        // e mantém o bundle do foliate fora do chunk inicial
        try {
          await import('foliate-js/view.js')
        } catch (err) {
          if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)))
          return
        }
        if (cancelled) return

        view = document.createElement('foliate-view') as unknown as View
        view.style.cssText = 'width:100%;height:100%;display:block'
        container!.appendChild(view)
        viewRef.current = view

        view.addEventListener('relocate', (e: CustomEvent<RelocateDetail>) => {
          const { cfi, fraction, tocItem, section } = e.detail
          // section?.current é o índice da spine atual; fallback para currentSectionIdxRef
          const sIdx =
            e.detail.index ??
            section?.current ??
            view?.renderer.primaryIndex ??
            currentSectionIdxRef.current
          lastRelocateRef.current = { ...e.detail, index: sIdx }
          const activeSection = activateSection(sIdx)
          const sectionHref = tocItem?.href ?? getSectionHref(sIdx)
          onRelocate({
            cfi,
            fraction,
            percentage: fractionToPercentage(fraction),
            tocLabel: tocItem?.label,
            sectionHref,
            sectionIndex: sIdx,
          })
          if (pendingSectionRef.current?.index === sIdx) {
            scheduleSectionFinalization('relocate')
          } else if (activeSection?.doc) {
            setupScrollTracking(activeSection.doc)
          }
        })

        // Cada seção do EPUB carrega num iframe separado. O evento 'load' expõe
        // o Document do iframe — toda a lógica de tradução inline acontece aqui.
        view.addEventListener('load', (e: CustomEvent<{ doc: Document; index: number }>) => {
          const { doc, index } = e.detail
          registerLoadedSection(index, doc)
          const primaryIndex = view?.renderer.primaryIndex ?? -1
          const shouldActivate =
            index === primaryIndex ||
            index === currentSectionIdxRef.current ||
            (currentDocRef.current == null && primaryIndex < 0)
          if (shouldActivate) activateSection(index)

          // Armazena parágrafos da seção para uso pelo TTS (audiobook e karaokê)

          // Rastreia seção atual e marca a nova seção como pendente até o renderer estabilizar.
          if (shouldActivate) {
            pendingSectionVersionRef.current += 1
            pendingSectionRef.current = {
              doc,
              index,
              version: pendingSectionVersionRef.current,
            }
            clearFinalizeSectionTimeout()
            finalizeSectionTimeoutRef.current = setTimeout(() => {
              finalizePendingSection('timeout')
            }, 400)
          }
          renderBookmarkMarkers(doc)

          // didScroll: Android WebView dispara 'click' mesmo após scroll curto.
          // Rastreamos touchmove para distinguir tap intencional de fim de scroll.
          // Navegação de capítulo por gesto foi removida do scroll mode para reduzir estados
          // implícitos e evitar travamentos em transições de seção.
          let touchStartY = 0
          let touchStartX = 0
          let didScroll = false
          doc.addEventListener('touchstart', (ev: TouchEvent) => {
            touchStartY = ev.touches[0].clientY
            touchStartX = ev.touches[0].clientX
            didScroll = false
          }, { passive: true })
          doc.addEventListener('touchmove', (ev: TouchEvent) => {
            // Tap slop: tolera um pequeno deslocamento do dedo sem transformar tap em scroll.
            const dy = Math.abs(ev.touches[0].clientY - touchStartY)
            const dx = Math.abs(ev.touches[0].clientX - touchStartX)
            if (dy > TAP_SLOP_PX || dx > TAP_SLOP_PX) didScroll = true
          }, { passive: true })
          doc.addEventListener('touchend', () => {}, { passive: true })

          doc.addEventListener('click', (ev: MouseEvent) => {
            // Ignora clicks que são resíduo de um gesto de scroll
            const target = ev.target instanceof Element ? ev.target : doc.documentElement
            const ownerDocument = target.ownerDocument ?? doc

            if (didScroll) return

            // Botoes do bloco inline tem prioridade sobre zonas de menu e selecao
            // de paragrafo.
            const actionBtn = getTranslationActionAtPoint(target, ownerDocument, ev.clientX, ev.clientY)
            if (actionBtn) {
              ev.preventDefault()
              ev.stopPropagation()
              const action = actionBtn.dataset.nrAction
              if (action === 'speak') {
                onSpeakOneRef.current(activeSourceTextRef.current)
              } else if (action === 'bookmark') {
                if (actionBtn.dataset.nrPending === '1') return
                const bookmarkState = getParagraphBookmarkState(activeTranslationParaRef.current)
                if (bookmarkState) {
                  actionBtn.dataset.nrPending = '1'
                  actionBtn.setAttribute('disabled', 'true')
                  const nextIsBookmarked = !bookmarkState.matchedBookmark
                  setTranslationActionLabel(actionBtn, nextIsBookmarked ? 'Remover' : 'Marcar')
                  actionBtn.setAttribute('aria-pressed', nextIsBookmarked ? 'true' : 'false')
                  onBookmarkParagraphRef.current?.(bookmarkState.payload)
                }
              } else if (action === 'save' && activeTranslatedTextRef.current) {
                onSaveVocabRef.current(activeSourceTextRef.current, activeTranslatedTextRef.current)
                setTranslationActionLabel(actionBtn, 'Salvo')
                actionBtn.dataset.nrFlash = '1'
                setTimeout(() => {
                  if (actionBtn.isConnected) {
                    setTranslationActionLabel(actionBtn, 'Salvar')
                    delete actionBtn.dataset.nrFlash
                  }
                }, 1500)
              }
              return
            }

            if (isTranslationBlockTap(target, ownerDocument, ev.clientX, ev.clientY)) return

            if (isVisibleChromeTapZone(ev, ownerDocument) || isRightChromeTapZone(ev, ownerDocument)) {
              onCenterTapRef.current()
              return
            }

            const targetSectionIndex = getSectionIndexForDocument(target.ownerDocument)
            if (targetSectionIndex != null) {
              const activeSection = activateSection(targetSectionIndex)
              if (activeSection?.doc) setupScrollTracking(activeSection.doc)
            }
            const para = getTapReadableBlock(target, ownerDocument, ev.clientX, ev.clientY)

            if (para?.hasAttribute('data-nr-bookmark') && para.dataset.nrBookmarkId) {
              const rect = para.getBoundingClientRect()
              const clickedBookmarkIcon =
                ev.clientX >= rect.left &&
                ev.clientX <= rect.left + BOOKMARK_ICON_GUTTER &&
                ev.clientY >= rect.top &&
                ev.clientY <= rect.top + Math.max(BOOKMARK_ICON_HEIGHT + 8, 24)

              if (clickedBookmarkIcon) {
                const bookmarkId = Number(para.dataset.nrBookmarkId)
                if (Number.isFinite(bookmarkId)) onBookmarkTapRef.current?.(bookmarkId)
                return
              }
            }

            // Tap no texto com o chrome aberto fecha os menus e continua a acao.
            if (chromeVisibleRef.current) onCenterTapRef.current()

            // Tap fora da area de texto e das zonas de menu alterna o chrome.
            if (!para) {
              if (!chromeVisibleRef.current) onCenterTapRef.current()
              return
            }

            // Modo leitura contínua ativo (tocando OU pausado): tap navega o TTS
            // ttsGlobalActive abrange os dois estados — evita abrir tradução por engano
            if (ttsGlobalActiveRef.current) {
              const targetContent = targetSectionIndex != null ? getLoadedSection(targetSectionIndex) : null
              if (targetContent) ttsPlaybackContentRef.current = targetContent
              const idx = (targetContent?.paragraphs ?? ttsParagraphsRef.current).indexOf(para)
              if (idx >= 0) onParagraphTapForTtsRef.current(idx)
              return
            }

            // Toggle off: parágrafo já destacado → limpa highlight e bloco de tradução inline
            if (para.hasAttribute('data-nr-active')) {
              para.ownerDocument?.getElementById('nr-translation-block')?.remove()
              para.removeAttribute('data-nr-active')
              para.classList.remove('nr-hl')
              const sentSpan = para.querySelector('.nr-hl-sentence')
              if (sentSpan) {
                const parent = sentSpan.parentNode!
                while (sentSpan.firstChild) parent.insertBefore(sentSpan.firstChild, sentSpan)
                sentSpan.remove()
              }
              activeTranslationParaRef.current = null
              activeSourceTextRef.current = ''
              activeTranslatedTextRef.current = ''
              return
            }

            // Bloqueia nova seleção enquanto a tradução anterior ainda está em voo
            if (translationInProgressRef.current) return

            // Limpa parágrafo anterior se o tap foi em um parágrafo diferente
            const prevPara = activeTranslationParaRef.current
            if (prevPara && prevPara !== para) {
              prevPara.ownerDocument?.getElementById('nr-translation-block')?.remove()
              prevPara.removeAttribute('data-nr-active')
              prevPara.classList.remove('nr-hl')
              const prevSpan = prevPara.querySelector('.nr-hl-sentence')
              if (prevSpan) {
                const parent = prevSpan.parentNode!
                while (prevSpan.firstChild) parent.insertBefore(prevSpan.firstChild, prevSpan)
                prevSpan.remove()
              }
            }

            // Toggle on: detecta a frase clicada, destaca no iframe e emite para o ReaderScreen.
            // O ReaderScreen injeta o bloco de tradução diretamente no iframe via showTranslationLoading/injectTranslation.
            const sourceText = getSentenceFromClick(ev, para)
            para.setAttribute('data-nr-active', '1')
            highlightSentenceInParagraph(para, sourceText)
            activeTranslationParaRef.current = para
            activeSourceTextRef.current = sourceText
            activeTranslatedTextRef.current = ''
            onTranslateRef.current(sourceText)
          })
        })

        // Se open()+init() não concluírem em 15 s, EPUB provavelmente está corrompido
        // ou em formato não suportado (foliate-js pode travar silenciosamente sem lançar).
        let loadTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
          loadTimeout = null
          if (!cancelled) {
            cancelled = true
            onError(new Error('Não foi possível abrir este livro. O arquivo pode estar corrompido ou em formato não suportado.'))
          }
        }, 8_000)

        try {
          await view.open(book.fileBlob)
          if (cancelled) { clearTimeout(loadTimeout!); return }
          cleanupPassiveEpubContentTransform = installPassiveEpubContentTransform(view)

          rendererStabilizedListener = () => {
            scheduleSectionFinalization('stabilized')
          }
          if (view.renderer?.addEventListener) {
            view.renderer.addEventListener('stabilized', rendererStabilizedListener)
          }

          // Total de seções: usado para checar se há próximo capítulo ao atingir o fundo
          totalSectionsRef.current = view.book?.sections?.length ?? 1

          // Configura o renderer (elemento filho do foliate-view)
          // flow 'scrolled': leitura contínua com scroll — sem paginação lateral
          view.renderer.setAttribute('flow', 'scrolled')
          view.renderer.removeAttribute('margin')
          view.renderer.setAttribute('margin-top', '48px')
          view.renderer.setAttribute('margin-right', '48px')
          view.renderer.setAttribute('margin-bottom', '28px')
          view.renderer.setAttribute('margin-left', '48px')
          view.renderer.setAttribute('animated', '')
          view.renderer.setStyles?.(buildReaderCSS(
            fontSize,
            lineHeight,
            readerTheme,
            fontFamily,
            overrideBookFont,
            overrideBookColors,
          ))

          onTocReady(view.book?.toc ?? [])

          // CFI com [Cover] = capa sem conteúdo legível → tela preta no tema escuro.
          // Tratamos como "sem posição salva" e começamos pelo primeiro texto real.
          const isAtCover = !!savedCfi?.match(/\[Cover\]/i)
          const initCfi = savedCfi && !isAtCover ? savedCfi : null
          await view.init(
            initCfi
              ? { lastLocation: initCfi }
              : { showTextStart: true },
          )

          if (loadTimeout) clearTimeout(loadTimeout)
        } catch (err) {
          if (loadTimeout) clearTimeout(loadTimeout)
          if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)))
        }
      }

      void setup()

      return () => {
        cancelled = true
        clearFinalizeSectionTimeout()
        scrollListenerCleanupRef.current?.()
        scrollListenerCleanupRef.current = null
        trackedScrollDocRef.current = null
        loadedSections.clear()
        pendingSectionRef.current = null
        currentDocRef.current = null
        lastRelocateRef.current = null
        ttsParagraphsRef.current = []
        ttsParagraphTextsRef.current = []
        activeTranslationParaRef.current = null
        activeSourceTextRef.current = ''
        activeTranslatedTextRef.current = ''
        translationInProgressRef.current = false
        initialInteractiveReadyRef.current = false
        scrollToBottomOnLoadRef.current = false
        autoSkipChapterStubDirectionRef.current = 0
        autoSkipChapterStubCountRef.current = 0
        if (rendererStabilizedListener) {
          view?.renderer.removeEventListener?.('stabilized', rendererStabilizedListener)
        }
        cleanupPassiveEpubContentTransform?.()
        cleanupPassiveEpubContentTransform = null
        view?.close()
        view?.remove()
        viewRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id]) // Apenas quando muda o livro. Callbacks são estáveis no ReaderScreen.

    return <div ref={containerRef} className="w-full h-full" />
  },
)

EpubViewer.displayName = 'EpubViewer'
