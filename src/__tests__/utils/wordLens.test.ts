import { describe, expect, it } from 'vitest'

import type { WordLensData } from '@/types/wordLens'
import {
  cefrLevelToOrdinal,
  cefrOrdinalToLevel,
  classifyWordLensText,
  normalizeWordLensToken,
  tokenizeWordLensText,
} from '@/utils/wordLens'

const data: WordLensData = {
  levels: {
    apple: 1,
    balance: 3,
    acquire: 3,
    elaborate: 4,
    ubiquitous: 5,
    aberration: 6,
    café: 4,
  },
  lemmas: {
    acquired: 'acquire',
    acquiring: 'acquire',
  },
}

describe('wordLens', () => {
  it('converte todos os níveis CEFR em ordinais e vice-versa', () => {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
    levels.forEach((level, index) => {
      const ordinal = (index + 1) as 1 | 2 | 3 | 4 | 5 | 6
      expect(cefrLevelToOrdinal(level)).toBe(ordinal)
      expect(cefrOrdinalToLevel(ordinal)).toBe(level)
    })
  })

  it('retorna somente termos estritamente acima do nível selecionado', () => {
    expect(classifyWordLensText('apple balance elaborate ubiquitous aberration unknown', 'B1', data))
      .toMatchObject([
        { text: 'elaborate', level: 'B2' },
        { text: 'ubiquitous', level: 'C1' },
        { text: 'aberration', level: 'C2' },
      ])
    expect(classifyWordLensText('aberration', 'C2', data)).toEqual([])
  })

  it('preserva texto e offsets com pontuação, Unicode, hifens e apóstrofos', () => {
    const text = "Café—UBIQUITOUS, reader's well-known idea."
    expect(tokenizeWordLensText(text)).toEqual([
      { text: 'Café', normalized: 'café', start: 0, end: 4 },
      { text: 'UBIQUITOUS', normalized: 'ubiquitous', start: 5, end: 15 },
      { text: "reader's", normalized: "reader's", start: 17, end: 25 },
      { text: 'well', normalized: 'well', start: 26, end: 30 },
      { text: 'known', normalized: 'known', start: 31, end: 36 },
      { text: 'idea', normalized: 'idea', start: 37, end: 41 },
    ])
    expect(normalizeWordLensToken('Reader’s')).toBe("reader's")
    expect(text).toBe("Café—UBIQUITOUS, reader's well-known idea.")
  })

  it('resolve flexões pelo mapa de lemas sem inventar formas', () => {
    expect(classifyWordLensText('Acquired acquiring acquires', 'A2', data)).toMatchObject([
      { text: 'Acquired', lemma: 'acquire', level: 'B1' },
      { text: 'acquiring', lemma: 'acquire', level: 'B1' },
    ])
  })

  it('mantém custo previsível em textos pequeno, médio e extremo', () => {
    const samples = [
      'ubiquitous',
      'ubiquitous '.repeat(1_000),
      'ubiquitous '.repeat(10_000),
    ]
    const durations = samples.map((sample) => {
      const startedAt = performance.now()
      classifyWordLensText(sample, 'B1', data)
      return performance.now() - startedAt
    })

    expect(durations[0]).toBeLessThan(50)
    expect(durations[1]).toBeLessThan(150)
    expect(durations[2]).toBeLessThan(500)
  })
})
