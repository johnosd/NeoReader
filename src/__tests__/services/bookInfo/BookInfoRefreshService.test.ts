import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '@/types/book'
import { BOOK_INFO_SCHEMA_VERSION, type ResolvedBookInfo } from '@/types/bookInfo'

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  getSettings: vi.fn(),
  saveBookInfo: vi.fn(),
  markYoutubeReviewsChecked: vi.fn(),
  bookInfoService: vi.fn(),
  youtubeProvider: vi.fn(),
}))

vi.mock('@/db/bookInfo', () => ({
  saveBookInfo: mocks.saveBookInfo,
  markYoutubeReviewsChecked: mocks.markYoutubeReviewsChecked,
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
import { EpubBookInfoProvider } from '@/services/bookInfo/EpubBookInfoProvider'
import { GoogleBooksProvider } from '@/services/bookInfo/GoogleBooksProvider'
import { OpenLibraryProvider } from '@/services/bookInfo/OpenLibraryProvider'
import { PdfBookInfoProvider } from '@/services/bookInfo/PdfBookInfoProvider'
import { YouTubeReviewsProvider } from '@/services/bookInfo/YouTubeReviewsProvider'

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
      metadataSchemaVersion: BOOK_INFO_SCHEMA_VERSION,
      category: null,
      rating: null,
      synopsis: null,
      pageCount: null,
      publishedDate: null,
      publisher: null,
      language: null,
      isbn10: null,
      isbn13: null,
      subtitle: null,
      series: null,
      edition: null,
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

  describe('lista de provedores por formato (feature 022, DI-013)', () => {
    const emptyInfo = { lookupHints: { title: null, author: null, identifiers: [] } }

    beforeEach(() => {
      mocks.collect.mockResolvedValue(emptyInfo)
      mocks.saveBookInfo.mockResolvedValue({ ...emptyInfo, bookId: 42 })
    })

    const providersOfLastCall = () => mocks.bookInfoService.mock.calls.at(-1)![0] as object[]

    it('EPUB usa exatamente a lista de sempre: Epub, Google Books, Open Library, YouTube', async () => {
      await BookInfoRefreshService.refreshBookInfo(book)
      const providers = providersOfLastCall()
      expect(providers).toHaveLength(4)
      expect(providers[0]).toBeInstanceOf(EpubBookInfoProvider)
      expect(providers[1]).toBeInstanceOf(GoogleBooksProvider)
      expect(providers[2]).toBeInstanceOf(OpenLibraryProvider)
      expect(providers[3]).toBeInstanceOf(YouTubeReviewsProvider)
      expect(providers.some((p) => p instanceof PdfBookInfoProvider)).toBe(false)
    })

    it('livro com format EPUB explícito segue a mesma lista', async () => {
      await BookInfoRefreshService.refreshBookInfo({ ...book, format: 'EPUB' })
      expect(providersOfLastCall()[0]).toBeInstanceOf(EpubBookInfoProvider)
    })

    it('PDF troca só o provedor local; os online ficam iguais', async () => {
      await BookInfoRefreshService.refreshBookInfo({ ...book, format: 'PDF' })
      const providers = providersOfLastCall()
      expect(providers).toHaveLength(4)
      expect(providers[0]).toBeInstanceOf(PdfBookInfoProvider)
      expect(providers.some((p) => p instanceof EpubBookInfoProvider)).toBe(false)
      expect(providers[1]).toBeInstanceOf(GoogleBooksProvider)
      expect(providers[2]).toBeInstanceOf(OpenLibraryProvider)
      expect(providers[3]).toBeInstanceOf(YouTubeReviewsProvider)
    })
  })
})
