import { describe, expect, it } from 'vitest'

import {
  highlightIdAt,
  itemSlices,
  menuActionAt,
  paintPageHighlights,
  rangeOnPage,
  renderPdfMenu,
  selectionBoundaryToRaw,
} from '@/components/reader/pdfPage/pdfPageHighlights'
import type { TranslateFn } from '@/i18n'

// Página com 3 itens; o 2º tem um span de Word Lens dentro (a contagem de caracteres não pode se perder nele).
const ITEMS = [{ str: 'Primeira linha.' }, { str: 'Segunda linha do texto.' }, { str: 'Fim.' }]
const STARTS = [0, 16, 40]

function pageDoc(): Document {
  const doc = document.implementation.createHTMLDocument('page')
  doc.body.innerHTML = '<div class="textLayer">'
    + '<span data-nr-item="0">Primeira linha.</span>'
    + '<span data-nr-item="1">Segunda <span class="nr-word-lens">linha</span> do texto.</span>'
    + '<span data-nr-item="2">Fim.</span>'
    + '<div class="endOfContent"></div></div>'
  return doc
}

const t = ((key: string) => key) as TranslateFn

describe('pdfPageHighlights — mapeamento', () => {
  it('trecho do intervalo em cada página, inclusive atravessando páginas', () => {
    const range = { start: { pageIndex: 3, offset: 10 }, end: { pageIndex: 5, offset: 4 } }
    expect(rangeOnPage(range, 2, 100)).toBeNull()
    expect(rangeOnPage(range, 3, 100)).toEqual({ start: 10, end: 100 })
    expect(rangeOnPage(range, 4, 80)).toEqual({ start: 0, end: 80 }) // página do meio inteira
    expect(rangeOnPage(range, 5, 90)).toEqual({ start: 0, end: 4 })
    expect(rangeOnPage(range, 6, 90)).toBeNull()
  })

  it('pedaços de cada item cobertos pelo trecho (pula pedaço só de espaço)', () => {
    expect(itemSlices(8, 25, STARTS, ITEMS)).toEqual([
      { itemIndex: 0, from: 8, to: 15 },
      { itemIndex: 1, from: 0, to: 9 },
    ])
  })

  it('pontas da seleção → offsets do texto bruto, contando dentro de spans aninhados', () => {
    const doc = pageDoc()
    const lens = doc.querySelector('.nr-word-lens')!.firstChild! // "linha" dentro do item 1
    expect(selectionBoundaryToRaw(doc, lens, 2, 'start', STARTS, ITEMS)).toBe(16 + 'Segunda li'.length)
    // Ponta fora dos itens (no fim da camada): o fim vai para o fim do último item.
    const layer = doc.querySelector('.textLayer')!
    expect(selectionBoundaryToRaw(doc, layer, 4, 'end', STARTS, ITEMS)).toBe(40 + 'Fim.'.length)
    // Início entre itens: vai para o próximo item.
    expect(selectionBoundaryToRaw(doc, layer, 1, 'start', STARTS, ITEMS)).toBe(16)
  })
})

describe('pdfPageHighlights — pintura e menus', () => {
  it('pinta fundo, sublinhado e ondulado só nos caracteres do trecho; repintar não acumula', () => {
    const doc = pageDoc()
    paintPageHighlights(doc, [
      { id: 1, color: 'amber', style: 'background', hasNote: true, slices: [{ itemIndex: 0, from: 0, to: 8 }] },
      { id: 2, color: 'rose', style: 'underline', hasNote: false, slices: [{ itemIndex: 1, from: 8, to: 13 }] },
      { id: 3, color: 'cyan', style: 'squiggly', hasNote: false, slices: [{ itemIndex: 2, from: 0, to: 3 }] },
    ])
    const marks = [...doc.querySelectorAll<HTMLElement>('span.nr-pdf-hl')]
    expect(marks.map((m) => m.textContent)).toEqual(['Primeira', 'linha', 'Fim'])
    expect(marks[0].style.backgroundColor).toBe('rgba(245, 158, 11, 0.35)')
    expect(marks[0].classList.contains('nr-pdf-hl-note')).toBe(true) // indicador de nota
    expect(marks[1].style.textDecorationLine).toBe('underline')
    expect(marks[2].style.textDecorationStyle).toBe('wavy')
    // O texto dos itens não muda (a camada continua alinhada e os offsets valem).
    expect(doc.querySelector('[data-nr-item="1"]')!.textContent).toBe('Segunda linha do texto.')
    expect(highlightIdAt(marks[1])).toBe(2)

    paintPageHighlights(doc, [{ id: 1, color: 'amber', style: 'background', hasNote: false, slices: [{ itemIndex: 0, from: 0, to: 8 }] }])
    expect(doc.querySelectorAll('span.nr-pdf-hl')).toHaveLength(1)
    expect(doc.querySelector('.nr-word-lens')!.textContent).toBe('linha') // Word Lens intacto
  })

  it('menu dentro da camada de texto, com a nota do highlight e ações por atributo', () => {
    const doc = pageDoc()
    const menu = renderPdfMenu(doc, {
      kind: 'highlight',
      anchor: { topPct: 40, bottomPct: 42, leftPct: 10 },
      note: 'Minha nota <b>',
      actions: [{ id: 'edit', label: 'Editar', primary: true }, { id: 'remove', label: 'Remover' }],
    }, t)!
    expect(menu.closest('.textLayer')).not.toBeNull()
    expect(menu.querySelector('.nr-pdf-menu-note')!.textContent).toBe('Minha nota <b>') // escapado
    expect(menuActionAt(menu.querySelector('[data-nr-pdf-menu-action="remove"]'))).toBe('remove')
  })
})
