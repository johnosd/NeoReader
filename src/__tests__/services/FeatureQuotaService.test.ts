import { beforeEach, describe, expect, it } from 'vitest'
import {
  FEATURE_QUOTA_LIMITS,
  FeatureQuotaService,
  formatFeatureQuotaMonth,
} from '@/services/FeatureQuotaService'

describe('FeatureQuotaService', () => {
  beforeEach(() => {
    window.localStorage.clear()
    FeatureQuotaService.reset()
  })

  it('define quotas mensais para book intelligence e NYT discovery', () => {
    expect(FEATURE_QUOTA_LIMITS['book-intelligence']).toBe(5)
    expect(FEATURE_QUOTA_LIMITS['nyt-discovery']).toBe(5)
  })

  it('consome quota local para usuario Free', () => {
    const now = new Date(2026, 5, 15)

    const first = FeatureQuotaService.consume('book-intelligence', { now, isPro: false })
    const second = FeatureQuotaService.consume('book-intelligence', { now, isPro: false })

    expect(first.consumed).toBe(true)
    expect(first.used).toBe(1)
    expect(first.remaining).toBe(4)
    expect(second.consumed).toBe(true)
    expect(second.used).toBe(2)
    expect(second.remaining).toBe(3)
  })

  it('consome 1 uso de book intelligence para cada livro novo no mes', () => {
    const now = new Date(2026, 5, 15)

    const firstBook = FeatureQuotaService.consume('book-intelligence', {
      now,
      isPro: false,
      subjectKey: 'book:101',
    })
    const secondBook = FeatureQuotaService.consume('book-intelligence', {
      now,
      isPro: false,
      subjectKey: 'book:102',
    })

    expect(firstBook.consumed).toBe(true)
    expect(firstBook.used).toBe(1)
    expect(firstBook.remaining).toBe(4)
    expect(secondBook.consumed).toBe(true)
    expect(secondBook.used).toBe(2)
    expect(secondBook.remaining).toBe(3)
  })

  it('bloqueia quando a quota mensal Free acaba', () => {
    const now = new Date(2026, 5, 15)

    for (let i = 0; i < 5; i += 1) {
      expect(FeatureQuotaService.consume('book-intelligence', { now, isPro: false }).consumed).toBe(true)
    }

    const blocked = FeatureQuotaService.consume('book-intelligence', { now, isPro: false })

    expect(blocked.allowed).toBe(false)
    expect(blocked.consumed).toBe(false)
    expect(blocked.used).toBe(5)
    expect(blocked.remaining).toBe(0)
    expect(blocked.blockedReason).toBe('quota-exhausted')
  })

  it('conta o mesmo livro apenas uma vez no mes', () => {
    const now = new Date(2026, 5, 15)

    const first = FeatureQuotaService.consume('book-intelligence', {
      now,
      isPro: false,
      subjectKey: 'book:42',
    })
    const second = FeatureQuotaService.consume('book-intelligence', {
      now,
      isPro: false,
      subjectKey: 'book:42',
    })

    expect(first.consumed).toBe(true)
    expect(first.used).toBe(1)
    expect(second.allowed).toBe(true)
    expect(second.consumed).toBe(false)
    expect(second.used).toBe(1)
    expect(second.remaining).toBe(4)
  })

  it('nao consome quota quando usuario e Pro', () => {
    const now = new Date(2026, 5, 15)

    const result = FeatureQuotaService.consume('book-intelligence', { now, isPro: true })
    const freeSnapshot = FeatureQuotaService.getSnapshot('book-intelligence', { now, isPro: false })

    expect(result.allowed).toBe(true)
    expect(result.consumed).toBe(false)
    expect(result.limit).toBeNull()
    expect(result.remaining).toBeNull()
    expect(freeSnapshot.used).toBe(0)
  })

  it('nao consome quota quando ha cache valido', () => {
    const now = new Date(2026, 5, 15)

    const result = FeatureQuotaService.consume('nyt-discovery', {
      now,
      isPro: false,
      hasValidCache: true,
    })
    const snapshot = FeatureQuotaService.getSnapshot('nyt-discovery', { now, isPro: false })

    expect(result.allowed).toBe(true)
    expect(result.consumed).toBe(false)
    expect(result.remaining).toBe(5)
    expect(snapshot.used).toBe(0)
  })

  it('reseta a quota automaticamente quando muda o mes', () => {
    const june = new Date(2026, 5, 30)
    const july = new Date(2026, 6, 1)

    FeatureQuotaService.consume('nyt-discovery', { now: june, isPro: false })

    const juneSnapshot = FeatureQuotaService.getSnapshot('nyt-discovery', { now: june, isPro: false })
    const julySnapshot = FeatureQuotaService.getSnapshot('nyt-discovery', { now: july, isPro: false })

    expect(juneSnapshot.monthKey).toBe(formatFeatureQuotaMonth(june))
    expect(juneSnapshot.used).toBe(1)
    expect(julySnapshot.monthKey).toBe(formatFeatureQuotaMonth(july))
    expect(julySnapshot.used).toBe(0)
    expect(julySnapshot.remaining).toBe(5)
  })
})
