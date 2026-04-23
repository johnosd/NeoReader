import { describe, expect, it } from 'vitest'
import { deriveReadingStatus, resolveProgressPercentage, resolveReadingState } from '@/utils/readingState'

describe('readingState', () => {
  it('usa fraction como fonte principal do percentual', () => {
    expect(resolveProgressPercentage({ fraction: 0.426, percentage: 99 })).toBe(43)
  })

  it('classifica unread, reading e finished corretamente', () => {
    expect(deriveReadingStatus(0)).toBe('unread')
    expect(deriveReadingStatus(1)).toBe('reading')
    expect(deriveReadingStatus(100)).toBe('finished')
  })

  it('preserva finished quando o livro ainda não tem progresso carregado', () => {
    expect(resolveReadingState({ readingStatus: 'finished' }, null)).toEqual({
      percentage: 0,
      readingStatus: 'finished',
    })
  })

  it('resolve reading quando há progresso parcial', () => {
    expect(resolveReadingState({ readingStatus: 'unread' }, { fraction: 0.5, percentage: 0 })).toEqual({
      percentage: 50,
      readingStatus: 'reading',
    })
  })
})
