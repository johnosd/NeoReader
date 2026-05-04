import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '@/types/book'
import type { ResolvedBookInfo } from '@/types/bookInfo'

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  getSettings: vi.fn(),
  saveBookInfo: vi.fn(),
  bookInfoService: vi.fn(),
  youtubeProvider: vi.fn(),
}))

vi.mock('@/db/bookInfo', () => ({
  saveBookInfo: mocks.saveBookInfo,
}))

vi.mock('@/db/settings', () => ({
  getSettings: mocks.getSettings,
}))

vi.mock('@/services/bookInfo/BookInfoService', () => ({
  BookInfoService: vi.fn(function BookInfoServiceMock(providers, options) {
    mocks.bookInfoService(providers, options)
    return { collect: mocks.collect }
  }),
}))

vi.mock('@/services/bookInfo/EpubBookInfoProvider', () => ({
  EpubBookInfoProvider: vi.fn(function EpubBookInfoProviderMock() {}),
}))

vi.mock('@/services/bookInfo/GoogleBooksProvider', () => ({
  GoogleBooksProvider: vi.fn(function GoogleBooksProviderMock() {}),
}))

vi.mock('@/services/bookInfo/OpenLibraryProvider', () => ({
  OpenLibraryProvider: vi.fn(function OpenLibraryProviderMock() {}),
}))

vi.mock('@/services/bookInfo/YouTubeReviewsProvider', () => ({
  YouTubeReviewsProvider: vi.fn(function YouTubeReviewsProviderMock(options) {
    mocks.youtubeProvider(options)
  }),
}))

import { BookInfoRefreshService } from '@/services/bookInfo/BookInfoRefreshService'

const book: Book = {
  id: 42,
  title: 'Let Them',
  author: 'Mel Robbins',
  fileBlob: new Blob(['epub']),
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  addedAt: new Date('2026-05-01T00:00:00.000Z'),
  isFavorite: false,
}

describe('BookInfoRefreshService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue({
      appSettings: {
        youtubeApiKey: 'yt-key',
      },
    })
  })

  it('collects fresh book info with saved app settings and persists it', async () => {
    const collected: ResolvedBookInfo = {
      category: null,
      rating: null,
      synopsis: null,
      pageCount: null,
      publishedDate: null,
      universalIdentifier: null,
      reviews: null,
      lookupHints: {
        title: 'Let Them',
        author: 'Mel Robbins',
        identifiers: [],
      },
    }
    const saved = {
      ...collected,
      bookId: 42,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-02T00:00:00.000Z'),
    }
    mocks.collect.mockResolvedValue(collected)
    mocks.saveBookInfo.mockResolvedValue(saved)

    await expect(BookInfoRefreshService.refreshBookInfo(book)).resolves.toBe(saved)

    expect(mocks.youtubeProvider).toHaveBeenCalledWith({ apiKey: 'yt-key' })
    expect(mocks.collect).toHaveBeenCalledWith(book.fileBlob, {
      lookupHints: {
        title: 'Let Them',
        author: 'Mel Robbins',
        identifiers: [],
      },
    })
    expect(mocks.saveBookInfo).toHaveBeenCalledWith(42, collected)
  })
})
