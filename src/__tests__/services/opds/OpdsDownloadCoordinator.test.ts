import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginOpdsDownload,
  completeOpdsDownload,
  failOpdsDownload,
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
