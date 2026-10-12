import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginOpdsDownload,
  completeOpdsDownload,
  failOpdsDownload,
  forgetOpdsDownloadsForBook,
  getOpdsDownloadState,
  subscribeOpdsDownloads,
} from '@/services/opds/OpdsDownloadCoordinator'

describe('OpdsDownloadCoordinator', () => {
  beforeEach(() => {
    // Cada teste usa catalogId/entryId diferentes pra não vazar estado do
    // singleton entre casos (mesmo cuidado do PublicDomainDownloadCoordinator).
  })

  it('começa idle e transiciona pra downloading/success', () => {
    expect(getOpdsDownloadState(1, 'a').status).toBe('idle')
    expect(beginOpdsDownload(1, 'a')).toBe(true)
    expect(getOpdsDownloadState(1, 'a').status).toBe('downloading')

    completeOpdsDownload(1, 'a', 99)
    expect(getOpdsDownloadState(1, 'a')).toEqual({ key: '1:a', status: 'success', bookId: 99 })
  })

  it('ignora um segundo begin enquanto já está downloading (toque duplicado)', () => {
    expect(beginOpdsDownload(2, 'b')).toBe(true)
    expect(beginOpdsDownload(2, 'b')).toBe(false)
  })

  it('permite retry após erro', () => {
    beginOpdsDownload(3, 'c')
    failOpdsDownload(3, 'c', 'falhou')
    expect(getOpdsDownloadState(3, 'c').status).toBe('error')
    expect(beginOpdsDownload(3, 'c')).toBe(true)
  })

  it('distingue catálogos diferentes com o mesmo entryId', () => {
    beginOpdsDownload(4, 'same')
    expect(getOpdsDownloadState(5, 'same').status).toBe('idle')
  })

  // R06: livro excluído não pode continuar aparecendo como "já baixado".
  it('forgetOpdsDownloadsForBook volta pra idle só as entries daquele livro', () => {
    completeOpdsDownload(8, 'x', 500)
    completeOpdsDownload(9, 'y', 500)
    completeOpdsDownload(8, 'z', 501)
    const listener = vi.fn()
    const unsubscribe = subscribeOpdsDownloads(listener)

    forgetOpdsDownloadsForBook(500)

    expect(getOpdsDownloadState(8, 'x').status).toBe('idle')
    expect(getOpdsDownloadState(9, 'y').status).toBe('idle')
    expect(getOpdsDownloadState(8, 'z')).toMatchObject({ status: 'success', bookId: 501 })
    expect(listener).toHaveBeenCalledTimes(1)

    // Livro sem estado em memória: nada muda, nenhum aviso.
    forgetOpdsDownloadsForBook(12345)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(beginOpdsDownload(8, 'x')).toBe(true)
  })

  it('notifica listeners a cada mudança', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeOpdsDownloads(listener)

    beginOpdsDownload(6, 'd')
    completeOpdsDownload(6, 'd', 1)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    failOpdsDownload(6, 'd', 'erro')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
