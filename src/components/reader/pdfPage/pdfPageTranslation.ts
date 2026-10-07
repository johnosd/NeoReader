// Painel de tradução/Word Lens da página fiel (US3), desenhado DENTRO do documento da página — como o bloco
// inline do EpubViewer e pelo mesmo motivo: overlays React sobre o iframe não recebem toque no Android.
// Também: destaque do parágrafo ativo e sublinhado passivo de vocabulário salvo na camada de texto.
//
// O documento da página não roda scripts (sandbox): botões funcionam porque os listeners vêm do documento
// pai (mesma origem). Tudo vai dentro de `.textLayer` (tamanho exato da página; o pdf.js a recria a cada
// render, e quem usa este módulo redesenha no evento PDF_PAGE_RENDERED_EVENT).
//
// O conteúdo da definição repete o do EpubViewer (renderWordLensDefinition, closure interna dele): extrair
// de lá mexeria no arquivo protegido por DI-003 — mesma justificativa dos menus (plan.md, Complexity Tracking).

import type { TranslateFn } from '@/i18n'
import type { WordLensDictionaryEntry } from '@/types/wordLens'
import { escapeHtml } from '@/utils/readerUtils'
import type { PdfWordLensTarget } from './pdfPageWords'

const PANEL_CLASS = 'nr-pdf-translation'
const ACTIVE_CLASS = 'nr-pdf-active'
const VOCAB_CLASS = 'nr-vocab'
const STYLE_ID = 'nr-pdf-translation-style'

export interface PdfPanelPalette {
  isDark: boolean
}

export interface PdfPanelAction {
  id: 'next' | 'speak' | 'bookmark' | 'save' | 'close'
  label: string
  primary?: boolean
  pressed?: boolean
  onSelect: (button: HTMLButtonElement) => void
}

export type PdfDefinitionState =
  | { status: 'loading' }
  | { status: 'ready'; entry: WordLensDictionaryEntry | null }
  | { status: 'error' }

export interface PdfTranslationPanel {
  // Faixa vertical da linha tocada, em % da página: o painel abre abaixo dela (ou acima, na metade de baixo).
  anchor: { topPct: number; bottomPct: number }
  palette: PdfPanelPalette
  translation: { status: 'loading' } | { status: 'ready'; text: string; providerLabel: string | null }
  wordLens: { target: PdfWordLensTarget; state: PdfDefinitionState } | null
  actions: PdfPanelAction[]
}

// Cores do acento do leitor (--color-indigo-primary). Dentro do iframe os tokens do Tailwind não existem.
const ACCENT = '#6366f1'

// Tamanhos em px "visuais": tudo é multiplicado por --nr-dpr, que o painel recalcula ao ser desenhado a partir
// da escala REAL até a tela (iframe da página encaixado na largura × transform da camada de texto). Não dá para
// supor só o devicePixelRatio: com a página reduzida para caber na tela o texto saía ilegível ou enorme.
const PANEL_CSS = `
/* ".textLayer > " de propósito: o pdf.js tem ".textLayer > :not(.markedContent) { font-size: calc(...); transform: ... }"
   para os itens de texto, que vence um seletor de classe simples e encolhia/escalava o painel. */
.textLayer > .${PANEL_CLASS} {
  position: absolute; left: 4%; width: 92%; z-index: 6; box-sizing: border-box; transform: none;
  max-height: 46%; overflow-y: auto;
  padding: calc(12px * var(--nr-dpr)); border-radius: calc(14px * var(--nr-dpr));
  font-family: system-ui, sans-serif; font-size: calc(15px * var(--nr-dpr)); line-height: 1.4;
  box-shadow: 0 calc(6px * var(--nr-dpr)) calc(20px * var(--nr-dpr)) rgba(0,0,0,0.35);
  user-select: text; cursor: auto; white-space: normal;
}
.${PANEL_CLASS}[data-tone="dark"] { background: #1e2230; color: #f1f5f9; border: calc(1px * var(--nr-dpr)) solid rgba(255,255,255,0.12); }
.${PANEL_CLASS}[data-tone="light"] { background: #ffffff; color: #0f172a; border: calc(1px * var(--nr-dpr)) solid rgba(15,23,42,0.12); }
.${PANEL_CLASS} * { color: inherit; }
/* O CSS da camada de texto do pdf.js faz ".textLayer span { position: absolute; color: transparent; white-space: pre }"
   — feito para os itens de texto. Sem estas regras, os spans do painel sumiam e os spans de Word Lens/vocabulário
   (dentro dos itens) saíam do fluxo e desalinhavam o resto da linha. */
.textLayer .${PANEL_CLASS} span, .textLayer .${PANEL_CLASS} br { position: static; color: inherit; white-space: normal; transform: none; cursor: auto; }
.textLayer span[data-nr-item] span { position: static; color: transparent; white-space: inherit; transform: none; }
.${PANEL_CLASS} .nr-wl { margin-bottom: calc(10px * var(--nr-dpr)); padding-bottom: calc(10px * var(--nr-dpr)); border-bottom: calc(1px * var(--nr-dpr)) solid rgba(127,127,127,0.3); }
.${PANEL_CLASS} .nr-wl-heading { display: flex; gap: calc(8px * var(--nr-dpr)); align-items: baseline; font-weight: 700; }
.${PANEL_CLASS} .nr-wl-level { font-size: 0.75em; padding: 0 calc(6px * var(--nr-dpr)); border-radius: calc(6px * var(--nr-dpr)); background: ${ACCENT}; color: #fff; }
.${PANEL_CLASS} .nr-wl-senses { margin: calc(6px * var(--nr-dpr)) 0 0; padding-left: 1.2em; }
.${PANEL_CLASS} .nr-wl-pos { font-style: italic; opacity: 0.75; margin-right: 0.4em; }
.${PANEL_CLASS} .nr-wl-example, .${PANEL_CLASS} .nr-wl-synonyms { display: block; opacity: 0.8; font-size: 0.9em; }
.${PANEL_CLASS} .nr-wl-status, .${PANEL_CLASS} .nr-wl-note, .${PANEL_CLASS} .nr-wl-attribution, .${PANEL_CLASS} .nr-wl-lemma { margin: calc(4px * var(--nr-dpr)) 0 0; font-size: 0.85em; opacity: 0.75; }
.${PANEL_CLASS} .nr-tr-text { margin: 0; }
.${PANEL_CLASS} .nr-tr-provider { margin: calc(4px * var(--nr-dpr)) 0 0; font-size: 0.8em; opacity: 0.7; }
.${PANEL_CLASS} .nr-tr-spinner { display: inline-block; width: calc(18px * var(--nr-dpr)); height: calc(18px * var(--nr-dpr)); border-radius: 50%;
  border: calc(2px * var(--nr-dpr)) solid rgba(127,127,127,0.35); border-top-color: ${ACCENT}; animation: nr-pdf-spin 0.8s linear infinite; }
@keyframes nr-pdf-spin { to { transform: rotate(360deg); } }
.${PANEL_CLASS} .nr-tr-actions { display: flex; flex-wrap: wrap; gap: calc(6px * var(--nr-dpr)); margin-top: calc(10px * var(--nr-dpr)); }
.${PANEL_CLASS} button { appearance: none; font: inherit; font-size: 0.85em; cursor: pointer;
  padding: calc(6px * var(--nr-dpr)) calc(10px * var(--nr-dpr)); border-radius: calc(8px * var(--nr-dpr));
  border: calc(1px * var(--nr-dpr)) solid rgba(127,127,127,0.35); background: transparent; }
.${PANEL_CLASS} button[data-primary="1"], .${PANEL_CLASS} button[aria-pressed="true"] { background: ${ACCENT}; border-color: ${ACCENT}; color: #fff; }
.textLayer span.${ACTIVE_CLASS} { background: rgba(99, 102, 241, 0.22); }
.textLayer .nr-word-lens { text-decoration: underline dotted; text-decoration-color: ${ACCENT}; text-decoration-thickness: calc(2px * var(--nr-dpr, 1)); text-underline-offset: 0.15em; }
.textLayer .${VOCAB_CLASS} { text-decoration: underline; text-decoration-color: #f59e0b; text-decoration-thickness: calc(2px * var(--nr-dpr, 1)); }
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = PANEL_CSS
  ;(doc.head ?? doc.documentElement).append(style)
  doc.documentElement.style.setProperty('--nr-dpr', String(doc.defaultView?.devicePixelRatio || 1))
}

// px de layout do painel → px na tela. Mede depois de anexar: escala interna (transform da camada) × escala do
// iframe (página encaixada na largura). Sem layout (jsdom) fica no devicePixelRatio de ensureStyles.
function applyVisualScale(doc: Document, el: HTMLElement): void {
  const frame = doc.defaultView?.frameElement as HTMLElement | null
  const docWidth = doc.documentElement.clientWidth
  if (!frame || !docWidth || !el.offsetWidth) return
  const frameScale = frame.getBoundingClientRect().width / docWidth
  const innerScale = el.getBoundingClientRect().width / el.offsetWidth
  const visualPerPx = frameScale * innerScale
  if (visualPerPx > 0 && Number.isFinite(visualPerPx)) el.style.setProperty('--nr-dpr', String(1 / visualPerPx))
}

function definitionHtml(target: PdfWordLensTarget, state: PdfDefinitionState, t: TranslateFn): string {
  const lemma = target.surface.toLowerCase() !== target.lemma
    ? `<p class="nr-wl-lemma">${escapeHtml(t('reader.wordLens.lemma', { lemma: target.lemma }))}</p>`
    : ''
  const heading = `<div class="nr-wl-heading" role="heading" aria-level="3"><span>${escapeHtml(target.surface)}</span><span class="nr-wl-level">${escapeHtml(target.level)}</span></div>${lemma}`
  const attribution = `<p class="nr-wl-attribution">${escapeHtml(t('reader.wordLens.attribution'))}</p>`
  if (state.status === 'loading') return `${heading}<p class="nr-wl-status">${escapeHtml(t('reader.wordLens.loading'))}</p>`
  if (state.status === 'error') return `${heading}<p class="nr-wl-status">${escapeHtml(t('reader.wordLens.error'))}</p>${attribution}`
  const entry = state.entry
  if (!entry || entry.senses.length === 0) return `${heading}<p class="nr-wl-status">${escapeHtml(t('reader.wordLens.empty'))}</p>${attribution}`

  const visible = entry.senses.slice(0, 3)
  const senses = visible.map((sense) => {
    const example = sense.examples[0]
      ? `<span class="nr-wl-example">${escapeHtml(t('reader.wordLens.example', { example: sense.examples[0] }))}</span>`
      : ''
    const synonyms = sense.synonyms.length > 0
      ? `<span class="nr-wl-synonyms">${escapeHtml(t('reader.wordLens.synonyms', { synonyms: sense.synonyms.slice(0, 4).join(', ') }))}</span>`
      : ''
    return `<li><span class="nr-wl-pos">${escapeHtml(sense.partOfSpeech)}</span><span>${escapeHtml(sense.definition)}</span>${example}${synonyms}</li>`
  }).join('')
  const note = entry.senses.length > 1
    ? `<p class="nr-wl-note">${escapeHtml(t('reader.wordLens.multipleSenses', { count: entry.senses.length, shown: visible.length }))}</p>`
    : ''
  return `${heading}<ol class="nr-wl-senses">${senses}</ol>${note}${attribution}`
}

export function hideTranslationPanel(doc: Document): void {
  doc.querySelectorAll(`.${PANEL_CLASS}`).forEach((el) => el.remove())
}

export function hasTranslationPanel(doc: Document): boolean {
  return doc.querySelector(`.${PANEL_CLASS}`) !== null
}

/** (Re)desenha o painel com o estado atual; substitui o anterior. */
export function renderTranslationPanel(doc: Document, panel: PdfTranslationPanel, t: TranslateFn): HTMLElement | null {
  const layer = doc.querySelector<HTMLElement>('.textLayer')
  if (!layer) return null
  ensureStyles(doc)
  hideTranslationPanel(doc)

  const el = doc.createElement('div')
  el.className = PANEL_CLASS
  // data-nr-ui: o Word Lens (wordLensDom) não marca palavras dentro da interface.
  el.setAttribute('data-nr-ui', '1')
  el.setAttribute('role', 'dialog')
  el.dataset.tone = panel.palette.isDark ? 'dark' : 'light'
  // Metade de baixo da página: abre acima da linha, para não ser cortado pelo fim da página.
  if (panel.anchor.topPct > 55) el.style.bottom = `${100 - panel.anchor.topPct + 0.5}%`
  else el.style.top = `${panel.anchor.bottomPct + 0.5}%`

  const definition = panel.wordLens
    ? `<section class="nr-wl" aria-live="polite">${definitionHtml(panel.wordLens.target, panel.wordLens.state, t)}</section>`
    : ''
  const translation = panel.translation.status === 'loading'
    ? '<span class="nr-tr-spinner" aria-hidden="true"></span>'
    : `<p class="nr-tr-text">${escapeHtml(panel.translation.text)}</p>${panel.translation.providerLabel
      ? `<p class="nr-tr-provider">${escapeHtml(t('reader.translation.via', { provider: panel.translation.providerLabel }))}</p>`
      : ''}`
  el.innerHTML = `${definition}<div class="nr-tr-panel" aria-live="polite">${translation}</div><div class="nr-tr-actions"></div>`

  const actions = el.querySelector<HTMLElement>('.nr-tr-actions')!
  for (const action of panel.actions) {
    const button = doc.createElement('button')
    button.type = 'button'
    button.dataset.nrAction = action.id
    button.textContent = action.label
    if (action.primary) button.dataset.primary = '1'
    if (action.pressed !== undefined) button.setAttribute('aria-pressed', String(action.pressed))
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      action.onSelect(button)
    })
    actions.append(button)
  }
  // Toque dentro do painel não é toque na página (não fecha, não traduz, não alterna o chrome).
  el.addEventListener('click', (event) => event.stopPropagation())
  layer.append(el)
  applyVisualScale(doc, el)
  return el
}

/** Destaca os spans do parágrafo ativo (índices de item da camada de texto). */
export function highlightTextItems(doc: Document, itemIndexes: readonly number[]): void {
  ensureStyles(doc)
  clearTextItemHighlight(doc)
  for (const index of itemIndexes) {
    doc.querySelector(`.textLayer span[data-nr-item="${index}"]`)?.classList.add(ACTIVE_CLASS)
  }
}

export function clearTextItemHighlight(doc: Document): void {
  doc.querySelectorAll(`.${ACTIVE_CLASS}`).forEach((el) => el.classList.remove(ACTIVE_CLASS))
}

/**
 * Sublinhado passivo do vocabulário salvo (equivalente ao injectVocabHighlight do EpubViewer). Na página
 * fiel cada span é um pedaço de linha: só expressões que cabem numa linha são achadas.
 */
export function markVocabularyInTextLayer(doc: Document, phrases: readonly string[]): void {
  ensureStyles(doc)
  doc.querySelectorAll(`.textLayer .${VOCAB_CLASS}`).forEach((el) => el.replaceWith(...Array.from(el.childNodes)))
  const words = phrases.map((p) => p.trim()).filter((p) => p.length > 1)
  if (words.length === 0) return
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(?<![\\p{L}\\p{M}])(${escaped.join('|')})(?![\\p{L}\\p{M}])`, 'giu')

  for (const span of doc.querySelectorAll<HTMLElement>('.textLayer span[data-nr-item]')) {
    for (const node of Array.from(span.childNodes)) {
      if (node.nodeType !== Node.TEXT_NODE) continue
      const text = node.textContent ?? ''
      pattern.lastIndex = 0
      if (!pattern.test(text)) continue
      pattern.lastIndex = 0
      const fragment = doc.createDocumentFragment()
      let last = 0
      for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
        if (m.index > last) fragment.append(text.slice(last, m.index))
        const mark = doc.createElement('span')
        mark.className = VOCAB_CLASS
        mark.textContent = m[0]
        fragment.append(mark)
        last = m.index + m[0].length
      }
      if (last < text.length) fragment.append(text.slice(last))
      node.replaceWith(fragment)
    }
  }
}
