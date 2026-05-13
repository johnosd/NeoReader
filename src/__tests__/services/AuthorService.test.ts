import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthorCacheRecord } from '@/types/author'

const mocks = vi.hoisted(() => ({
  getCachedAuthorRecord: vi.fn(),
  setCachedAuthor: vi.fn(),
  fetchWithTimeout: vi.fn(),
}))

vi.mock('@/db/authors', () => ({
  getCachedAuthorRecord: mocks.getCachedAuthorRecord,
  setCachedAuthor: mocks.setCachedAuthor,
}))

vi.mock('@/services/http', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}))

import { getAuthorData } from '@/services/AuthorService'

function cachedAuthor(overrides: Partial<AuthorCacheRecord> = {}): AuthorCacheRecord {
  return {
    authorName: 'Autor',
    bookIds: [42],
    data: {
      name: 'Autor',
      bio: 'Bio persistida',
      otherBooks: [],
      videos: [],
    },
    fetchedAt: new Date('2024-01-01T00:00:00.000Z'),
    videosFetchedAt: null,
    ...overrides,
  }
}

describe('AuthorService', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mocks.getCachedAuthorRecord.mockReset()
    mocks.setCachedAuthor.mockReset()
    mocks.fetchWithTimeout.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('usa dados estaveis persistidos sem buscar rede quando videos ainda estao frescos', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T00:00:00.000Z'))
    mocks.getCachedAuthorRecord.mockResolvedValue(cachedAuthor({
      videosFetchedAt: new Date('2026-05-01T00:00:00.000Z'),
    }))

    const data = await getAuthorData('Autor', 42, 'youtube-key')

    expect(data?.bio).toBe('Bio persistida')
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
    expect(mocks.setCachedAuthor).not.toHaveBeenCalled()
  })

  it('atualiza apenas videos quando o TTL de 7 dias expirou', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'))
    mocks.getCachedAuthorRecord.mockResolvedValue(cachedAuthor({
      videosFetchedAt: new Date('2026-05-01T00:00:00.000Z'),
    }))
    mocks.fetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({
      items: [
        {
          id: { videoId: 'abc123' },
          snippet: {
            title: 'Entrevista',
            channelTitle: 'Canal',
            thumbnails: { default: { url: 'https://cdn.example/thumb.jpg' } },
          },
        },
      ],
    }), { status: 200 }))

    const data = await getAuthorData('Autor', 42, 'youtube-key')

    expect(data?.bio).toBe('Bio persistida')
    expect(data?.videos).toEqual([
      {
        id: 'abc123',
        title: 'Entrevista',
        channelName: 'Canal',
        thumbnailUrl: 'https://cdn.example/thumb.jpg',
      },
    ])
    expect(mocks.setCachedAuthor).toHaveBeenCalledWith('Autor', expect.objectContaining({
      bio: 'Bio persistida',
      videos: data?.videos,
    }), 42, {
      videosFetchedAt: new Date('2026-05-10T00:00:00.000Z'),
    })
  })
})
