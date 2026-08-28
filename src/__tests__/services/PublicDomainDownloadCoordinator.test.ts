import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginPublicDomainDownload,
  completePublicDomainDownload,
  failPublicDomainDownload,
  getPublicDomainDownloadState,
  subscribePublicDomainDownloads,
} from '@/services/PublicDomainDownloadCoordinator'

describe('PublicDomainDownloadCoordinator', () => {
  const entryId = 'jane-austen_pride-and-prejudice'

  beforeEach(() => {
    // Estado e um singleton em modulo — força de volta pra idle entre testes
    // via um download+complete/fail neutro não é limpo o bastante, então
    // cada teste usa um entryId proprio pra nao vazar estado entre casos.
  })

  it('comeca idle para um entry nunca tocado', () => {
    expect(getPublicDomainDownloadState('nunca-tocado')).toEqual({
      entryId: 'nunca-tocado',
      status: 'idle',
    })
  })

  it('transiciona idle -> downloading -> success e notifica listeners', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePublicDomainDownloads(listener)

    const started = beginPublicDomainDownload(entryId)
    expect(started).toBe(true)
    expect(getPublicDomainDownloadState(entryId).status).toBe('downloading')
    expect(listener).toHaveBeenCalledTimes(1)

    completePublicDomainDownload(entryId, 99)
    expect(getPublicDomainDownloadState(entryId)).toEqual({
      entryId,
      status: 'success',
      bookId: 99,
    })
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('ignora um segundo begin enquanto o primeiro ainda esta downloading (FR-011)', () => {
    const secondEntryId = `${entryId}-dedupe`

    const first = beginPublicDomainDownload(secondEntryId)
    const second = beginPublicDomainDownload(secondEntryId)

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(getPublicDomainDownloadState(secondEntryId).status).toBe('downloading')
  })

  it('permite retry (novo begin) depois de um erro', () => {
    const retryEntryId = `${entryId}-retry`

    beginPublicDomainDownload(retryEntryId)
    failPublicDomainDownload(retryEntryId, 'Falha de rede')
    expect(getPublicDomainDownloadState(retryEntryId).status).toBe('error')

    const retried = beginPublicDomainDownload(retryEntryId)
    expect(retried).toBe(true)
    expect(getPublicDomainDownloadState(retryEntryId).status).toBe('downloading')
  })
})
