import { describe, expect, it, vi } from 'vitest'
import {
  GoogleDriveAppDataError,
  GoogleDriveAppDataService,
} from '@/services/GoogleDriveAppDataService'

// Padrão: renovação silenciosa indisponível (null), como no web.
function makeService(
  fetchImpl: typeof fetch,
  token: string | null = 'drive-token',
  renewAccessToken: () => Promise<string | null> = async () => null,
) {
  return new GoogleDriveAppDataService({
    fetchImpl,
    getAccessToken: () => token,
    renewAccessToken,
  })
}

const authHeaderOf = (fetchImpl: typeof fetch, call: number) =>
  (vi.mocked(fetchImpl).mock.calls[call][1]?.headers as Record<string, string>).Authorization

describe('GoogleDriveAppDataService', () => {
  it('lista JSONs no appDataFolder usando bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      files: [{ id: 'file-1', name: 'bookmarks.json', mimeType: 'application/json' }],
    }))) as unknown as typeof fetch
    const service = makeService(fetchImpl)

    await expect(service.list({ name: 'bookmarks.json' })).resolves.toEqual([
      { id: 'file-1', name: 'bookmarks.json', mimeType: 'application/json' },
    ])

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]
    const parsedUrl = new URL(String(url))
    expect(parsedUrl.origin).toBe('https://www.googleapis.com')
    expect(parsedUrl.pathname).toBe('/drive/v3/files')
    expect(parsedUrl.searchParams.get('spaces')).toBe('appDataFolder')
    expect(parsedUrl.searchParams.get('q')).toBe("name = 'bookmarks.json' and trashed = false")
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer drive-token')
  })

  it('baixa JSON por fileId com alt=media', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }))) as unknown as typeof fetch
    const service = makeService(fetchImpl)

    await expect(service.getJson('file-1')).resolves.toEqual({ ok: true })

    const [url] = vi.mocked(fetchImpl).mock.calls[0]
    const parsedUrl = new URL(String(url))
    expect(parsedUrl.pathname).toBe('/drive/v3/files/file-1')
    expect(parsedUrl.searchParams.get('alt')).toBe('media')
  })

  it('cria JSON no appDataFolder com upload multipart', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      id: 'file-1',
      name: 'bookmarks.json',
    }))) as unknown as typeof fetch
    const service = makeService(fetchImpl)

    await expect(service.createJson('bookmarks.json', { bookmarks: [] })).resolves.toEqual({
      id: 'file-1',
      name: 'bookmarks.json',
    })

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]
    const parsedUrl = new URL(String(url))
    expect(parsedUrl.origin).toBe('https://www.googleapis.com')
    expect(parsedUrl.pathname).toBe('/upload/drive/v3/files')
    expect(parsedUrl.searchParams.get('uploadType')).toBe('multipart')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>)['Content-Type']).toContain('multipart/related')
    expect(String(init?.body)).toContain('"parents":["appDataFolder"]')
    expect(String(init?.body)).toContain('"bookmarks":[]')
  })

  it('atualiza JSON existente por fileId', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      id: 'file-1',
      name: 'bookmarks.json',
    }))) as unknown as typeof fetch
    const service = makeService(fetchImpl)

    await service.updateJson('file-1', { bookmarks: [{ syncKey: 'a' }] })

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]
    const parsedUrl = new URL(String(url))
    expect(parsedUrl.pathname).toBe('/upload/drive/v3/files/file-1')
    expect(init?.method).toBe('PATCH')
    expect(String(init?.body)).not.toContain('"parents":["appDataFolder"]')
    expect(String(init?.body)).toContain('"syncKey":"a"')
  })

  it('sem token e sem renovacao possivel, falha com missing-token sem chamar fetch', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const renew = vi.fn(async () => null)
    const service = makeService(fetchImpl, null, renew)

    await expect(service.list()).rejects.toBeInstanceOf(GoogleDriveAppDataError)
    await expect(service.list()).rejects.toMatchObject({
      code: 'missing-token',
    })
    expect(renew).toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sem token (cold start apos o TTL), renova silenciosamente antes do primeiro request', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ files: [] }))) as unknown as typeof fetch
    const renew = vi.fn(async () => 'silent-token')
    const service = makeService(fetchImpl, null, renew)

    await expect(service.list()).resolves.toEqual([])
    expect(renew).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(authHeaderOf(fetchImpl, 0)).toBe('Bearer silent-token')
  })

  it('token recem-renovado que ainda da 401 nao renova de novo (sem loop)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    const renew = vi.fn(async () => 'silent-token')
    const service = makeService(fetchImpl, null, renew)

    await expect(service.list()).rejects.toMatchObject({ code: 'permission-denied', status: 401 })
    expect(renew).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('mapeia HTTP 403 como permissao negada quando a renovacao silenciosa nao e possivel', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 })) as unknown as typeof fetch
    const renew = vi.fn(async () => null)
    const service = makeService(fetchImpl, 'drive-token', renew)

    await expect(service.list()).rejects.toMatchObject({
      code: 'permission-denied',
      status: 403,
    })
    expect(renew).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('mapeia erro de rede como offline', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const service = makeService(fetchImpl)

    await expect(service.list()).rejects.toBeInstanceOf(GoogleDriveAppDataError)
    await expect(service.list()).rejects.toMatchObject({
      code: 'offline',
    })
  })

  it('usa o token corrente a cada request, sem cachear entre chamadas', async () => {
    const getAccessToken = vi.fn()
      .mockReturnValueOnce('old-token')
      .mockReturnValue('renewed-token')
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ files: [] }))) as unknown as typeof fetch
    const service = new GoogleDriveAppDataService({ fetchImpl, getAccessToken })

    await service.list()
    await service.list()

    const headerOf = (call: number) =>
      (vi.mocked(fetchImpl).mock.calls[call][1]?.headers as Record<string, string>).Authorization
    expect(headerOf(0)).toBe('Bearer old-token')
    expect(headerOf(1)).toBe('Bearer renewed-token')
  })

  it('HTTP 401 renova silenciosamente e repete a requisicao com o token novo', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"files":[]}', { status: 200 })) as unknown as typeof fetch
    const renew = vi.fn(async () => 'renewed-token')
    const service = makeService(fetchImpl, 'expired-token', renew)

    await expect(service.list()).resolves.toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(authHeaderOf(fetchImpl, 0)).toBe('Bearer expired-token')
    expect(authHeaderOf(fetchImpl, 1)).toBe('Bearer renewed-token')
  })

  it('upload repete o mesmo body multipart no retry apos 401', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"id":"file-1","name":"b.json"}')) as unknown as typeof fetch
    const service = makeService(fetchImpl, 'expired-token', async () => 'renewed-token')

    await service.updateJson('file-1', { bookmarks: [{ syncKey: 'a' }] })

    const bodyOf = (call: number) => String(vi.mocked(fetchImpl).mock.calls[call][1]?.body)
    expect(bodyOf(1)).toBe(bodyOf(0))
    expect(bodyOf(1)).toContain('"syncKey":"a"')
  })
})
