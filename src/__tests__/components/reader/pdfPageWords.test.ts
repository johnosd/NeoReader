import { describe, expect, it } from 'vitest'

import {
  approximateBlockOffset,
  findWordNear,
  nextSentenceInBlock,
  resolveTapInBlock,
  wordAtRawOffset,
  wordLensTargetAt,
} from '@/components/reader/pdfPage/pdfPageWords'
import type { WordLensData } from '@/types/wordLens'
import type { PdfBlock } from '@/utils/pdfParagraphs'

// Texto bruto como o pdf.js entrega: quebra de linha "\n" depois de item com hasEOL e hífen de quebra no fim.
const RAW = 'The traveller described the extraordinary responsibil-\nity of the author. Then the com-\nmittee left.\n'
const BLOCK: PdfBlock = {
  kind: 'paragraph',
  text: 'The traveller described the extraordinary responsibility of the author. Then the committee left.',
  pageIndex: 3,
  ranges: [{ pageIndex: 3, start: 0, end: RAW.length - 1 }],
}

describe('wordAtRawOffset', () => {
  it('acha a palavra que contém o offset', () => {
    expect(wordAtRawOffset(RAW, RAW.indexOf('described') + 3)?.word).toBe('described')
  })

  it('junta a palavra hifenizada entre linhas tocando em qualquer metade', () => {
    expect(wordAtRawOffset(RAW, RAW.indexOf('responsibil') + 2)?.word).toBe('responsibility')
    expect(wordAtRawOffset(RAW, RAW.indexOf('ity of') + 1)?.word).toBe('responsibility')
    expect(wordAtRawOffset(RAW, RAW.indexOf('mittee') + 1)?.word).toBe('committee')
  })

  it('toque no espaço logo depois da palavra fica com ela; fora de palavra devolve null', () => {
    expect(wordAtRawOffset(RAW, RAW.indexOf('The ') + 3)?.word).toBe('The')
    expect(wordAtRawOffset('  .  ', 2)).toBeNull()
  })
})

describe('mapeamento para o texto reconstruído', () => {
  it('posição proporcional fica perto da palavra e findWordNear acerta a ocorrência', () => {
    const point = { pageIndex: 3, offset: RAW.indexOf('author') }
    const approx = approximateBlockOffset(BLOCK, point)
    expect(Math.abs(approx - BLOCK.text.indexOf('author'))).toBeLessThan(5)
    // "the" aparece 4×: pega a mais próxima da posição.
    expect(findWordNear(BLOCK.text, 'the', BLOCK.text.indexOf('the author'))).toBe(BLOCK.text.indexOf('the author'))
    // Palavra inteira: "the" não casa dentro de "Then".
    expect(findWordNear('Then the', 'the', 0)).toBe(5)
  })

  it('resolveTapInBlock devolve a frase tocada sem quebras e a palavra dehifenizada', () => {
    const tap = resolveTapInBlock(BLOCK, { pageIndex: 3, offset: RAW.indexOf('ity of') }, RAW)
    expect(tap.word).toBe('responsibility')
    expect(BLOCK.text.slice(tap.textOffset, tap.textOffset + 14)).toBe('responsibility')
    expect(tap.sentence).toBe('The traveller described the extraordinary responsibility of the author.')
    expect(tap.sentence).not.toContain('\n')

    const second = resolveTapInBlock(BLOCK, { pageIndex: 3, offset: RAW.indexOf('mittee') }, RAW)
    expect(second.sentence).toBe('Then the committee left.')
    expect(second.sentenceStart).toBe(BLOCK.text.indexOf('Then'))
  })

  it('próxima frase do bloco e fim do bloco', () => {
    const first = 'The traveller described the extraordinary responsibility of the author.'
    expect(nextSentenceInBlock(BLOCK.text, 0, first)).toEqual({ sentence: 'Then the committee left.', start: BLOCK.text.indexOf('Then') })
    expect(nextSentenceInBlock(BLOCK.text, BLOCK.text.indexOf('Then'), 'Then the committee left.')).toBeNull()
  })
})

describe('wordLensTargetAt', () => {
  const data: WordLensData = { levels: { responsibility: 4, traveller: 2, committee: 5 }, lemmas: {} }

  it('palavra acima do nível do leitor vira alvo, com offset relativo à frase', () => {
    const tap = resolveTapInBlock(BLOCK, { pageIndex: 3, offset: RAW.indexOf('mittee') }, RAW)
    expect(wordLensTargetAt(tap, BLOCK.text, 'B1', data)).toEqual({ surface: 'committee', lemma: 'committee', level: 'C1', offset: 'Then the '.length })
  })

  it('hifenizada entre linhas também (responsibility, B2 para leitor B1)', () => {
    const tap = resolveTapInBlock(BLOCK, { pageIndex: 3, offset: RAW.indexOf('responsibil') }, RAW)
    expect(wordLensTargetAt(tap, BLOCK.text, 'B1', data)?.surface).toBe('responsibility')
  })

  it('palavra no nível do leitor ou sem dados não abre definição', () => {
    const tap = resolveTapInBlock(BLOCK, { pageIndex: 3, offset: RAW.indexOf('traveller') }, RAW)
    expect(wordLensTargetAt(tap, BLOCK.text, 'B1', data)).toBeNull()
    expect(wordLensTargetAt(tap, BLOCK.text, 'B1', null)).toBeNull()
  })
})
