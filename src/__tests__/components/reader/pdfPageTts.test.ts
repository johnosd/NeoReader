import { describe, expect, it } from 'vitest'

import {
  blockItemIndexes,
  blockTextOffsetToRawPoint,
  clearTtsHighlight,
  firstBlockEndingAfter,
  highlightTtsItems,
  markTtsWord,
  rawWordStart,
  sameBlockStart,
  ttsParagraphBlocks,
} from '@/components/reader/pdfPage/pdfPageTts'
import type { PdfBlock } from '@/utils/pdfParagraphs'

// Parágrafo que começa no fim da página 0 e continua na página 1 (DI-009: pertence à página onde começa).
const RAW_0 = 'Introdução\nPrimeira frase do livro. Segunda\n'
const RAW_1 = 'frase continua aqui.\n'
const HEADING: PdfBlock = { kind: 'heading', text: 'Introdução', pageIndex: 0, ranges: [{ pageIndex: 0, start: 0, end: 10 }] }
const PARAGRAPH: PdfBlock = {
  kind: 'paragraph',
  text: 'Primeira frase do livro. Segunda frase continua aqui.',
  pageIndex: 0,
  ranges: [{ pageIndex: 0, start: 11, end: 43 }, { pageIndex: 1, start: 0, end: 20 }],
}
const FIGURE: PdfBlock = { kind: 'figure', text: '', pageIndex: 1, ranges: [] }

describe('pdfPageTts — mapeamento', () => {
  it('o TTS lê parágrafos e títulos com texto; figura fica de fora', () => {
    expect(ttsParagraphBlocks([HEADING, FIGURE, PARAGRAPH])).toEqual([HEADING, PARAGRAPH])
  })

  it('compara blocos pelo início (o cache do extrator pode devolver objetos novos)', () => {
    expect(sameBlockStart(PARAGRAPH, { ...PARAGRAPH, text: 'outro objeto' })).toBe(true)
    expect(sameBlockStart(PARAGRAPH, HEADING)).toBe(false)
  })

  it('primeiro parágrafo que ainda não terminou no topo da tela', () => {
    const blocks = [HEADING, PARAGRAPH]
    expect(firstBlockEndingAfter(blocks, { pageIndex: 0, offset: 0 })).toBe(0)
    // Topo da tela já passou do título: o parágrafo (que continua na página 1) é o visível.
    expect(firstBlockEndingAfter(blocks, { pageIndex: 0, offset: 20 })).toBe(1)
    expect(firstBlockEndingAfter(blocks, { pageIndex: 1, offset: 5 })).toBe(1)
    // Depois de tudo: volta ao 0 (o TTS começa do início do trecho).
    expect(firstBlockEndingAfter(blocks, { pageIndex: 9, offset: 0 })).toBe(0)
  })

  it('posição no texto do bloco → ponto no texto bruto, cruzando a virada de página', () => {
    expect(blockTextOffsetToRawPoint(PARAGRAPH, 0)).toEqual({ pageIndex: 0, offset: 11 })
    // A palavra que abre a página seguinte não pode ficar presa no fim da anterior.
    expect(blockTextOffsetToRawPoint(PARAGRAPH, PARAGRAPH.text.indexOf('frase continua'))?.pageIndex).toBe(1)
  })

  it('palavra lida pelo TTS → posição exata no texto bruto da página certa', () => {
    const segunda = PARAGRAPH.text.indexOf('Segunda')
    expect(rawWordStart(PARAGRAPH, segunda, segunda + 7, RAW_0)).toEqual({ pageIndex: 0, start: RAW_0.indexOf('Segunda'), length: 7 })

    // "frase" aparece nas duas páginas: a da 2ª ocorrência no parágrafo é a do começo da página 1.
    const second = PARAGRAPH.text.indexOf('frase continua')
    expect(rawWordStart(PARAGRAPH, second, second + 5, RAW_1)).toEqual({ pageIndex: 1, start: 0, length: 5 })
  })

  it('palavra fora do bloco (ex.: só existe no título) não vira karaokê', () => {
    const block: PdfBlock = { ...PARAGRAPH, text: 'Introdução Primeira' }
    expect(rawWordStart(block, 0, 10, RAW_0)).toBeNull()
  })

  it('itens da camada de texto que pertencem ao bloco em cada página', () => {
    const items0 = [{ str: 'Introdução' }, { str: 'Primeira frase do livro. Segunda' }]
    expect(blockItemIndexes(PARAGRAPH, 0, [0, 11], items0)).toEqual([1])
    expect(blockItemIndexes(PARAGRAPH, 1, [0], [{ str: 'frase continua aqui.' }])).toEqual([0])
  })
})

describe('pdfPageTts — destaque no documento da página', () => {
  function pageDoc(html: string): Document {
    const doc = document.implementation.createHTMLDocument('page')
    doc.body.innerHTML = `<div class="textLayer">${html}</div>`
    return doc
  }

  it('destaca o parágrafo, marca a palavra (mesmo com Word Lens dentro do item) e limpa tudo', () => {
    const doc = pageDoc('<span data-nr-item="0">Introdução</span><span data-nr-item="1">Primeira <span class="nr-word-lens">frase</span> do livro</span>')
    highlightTtsItems(doc, [1], 'rgba(1, 2, 3, 0.1)')
    expect(doc.querySelector('[data-nr-item="1"]')!.classList.contains('nr-pdf-tts')).toBe(true)
    expect(doc.querySelector('[data-nr-item="0"]')!.classList.contains('nr-pdf-tts')).toBe(false)
    expect(doc.documentElement.style.getPropertyValue('--nr-tts-bg')).toBe('rgba(1, 2, 3, 0.1)')

    // "frase" está dentro do span de Word Lens: a marca fica só nos caracteres certos.
    markTtsWord(doc, 1, 9, 14)
    const mark = doc.querySelector('.nr-pdf-tts-word')!
    expect(mark.textContent).toBe('frase')
    expect(doc.querySelector('[data-nr-item="1"]')!.textContent).toBe('Primeira frase do livro')

    clearTtsHighlight(doc)
    expect(doc.querySelector('.nr-pdf-tts, .nr-pdf-tts-word')).toBeNull()
    // O texto do item volta igual (a camada de texto continua alinhada e selecionável).
    expect(doc.querySelector('[data-nr-item="1"]')!.textContent).toBe('Primeira frase do livro')
    expect(doc.querySelector('.nr-word-lens')!.textContent).toBe('frase')
  })
})
