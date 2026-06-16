import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
}))

vi.mock('@/services/http', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}))

import { NytBooksService } from '@/services/NytBooksService'

const listPayload = {
  results: {
    display_name: 'Hardcover Fiction',
    updated: 'WEEKLY',
    books: [
      {
        rank: 1,
        title: 'Book A',
        author: 'Author A',
        book_image: 'https://cdn.example/book-a.jpg',
        description: 'Description',
        amazon_product_url: 'https://example.com/book-a',
        weeks_on_list: 3,
      },
    ],
  },
}

function writeCache(listName: string) {
  localStorage.setItem(`nyt_cache_${listName}`, JSON.stringify({
    timestamp: Date.now(),
    data: {
      display_name: 'Cached list',
      updated: 'CACHED',
      books: [],
    },
  }))
}

describe('NytBooksService', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    mocks.fetchWithTimeout.mockReset()
  })

  it('retorna cache valido mesmo quando rede esta bloqueada', async () => {
    writeCache('hardcover-fiction')

    const list = await NytBooksService.fetchList('hardcover-fiction', { allowNetwork: false })

    expect(list.display_name).toBe('Cached list')
    expect(NytBooksService.hasValidCache('hardcover-fiction')).toBe(true)
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('bloqueia rede quando nao existe cache e allowNetwork e false', async () => {
    await expect(NytBooksService.fetchList('hardcover-fiction', { allowNetwork: false }))
      .rejects.toThrow('NYT network blocked')

    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('busca e salva lista quando rede esta liberada', async () => {
    vi.stubEnv('VITE_NYT_API_KEY', 'nyt-key')
    mocks.fetchWithTimeout.mockResolvedValue(new Response(JSON.stringify(listPayload), { status: 200 }))

    const list = await NytBooksService.fetchList('hardcover-fiction')

    expect(list.display_name).toBe('Hardcover Fiction')
    expect(list.books).toHaveLength(1)
    expect(NytBooksService.hasValidCache('hardcover-fiction')).toBe(true)
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1)
  })
})
