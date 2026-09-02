import { describe, expect, it, vi } from 'vitest'
import {
  GoogleDriveAppDataError,
  GoogleDriveAppDataService,
} from '@/services/GoogleDriveAppDataService'

// refreshAccessToken no-op por padrão — sem isso, o retry-once chamaria o
// refreshDriveToken real (Capacitor/Firebase) dentro destes testes unitários.
function makeService(
  fetchImpl: typeof fetch,
  token: string | null = 'drive-token',
  refreshAccessToken: () => Promise<void> = async () => {},
) {
  return new GoogleDriveAppDataService({
    fetchImpl,
    getAccessToken: () => token,
    refreshAccessToken,
  })
}

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

  it('falha sem token sem chamar fetch (apos tentar renovar)', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const refreshAccessToken = vi.fn(async () => {})
    const service = makeService(fetchImpl, null, refreshAccessToken)

    await expect(service.list()).rejects.toBeInstanceOf(GoogleDriveAppDataError)
    await expect(service.list()).rejects.toMatchObject({
      code: 'missing-token',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    // 2 chamadas de .list() acima, 1 renovacao cada — nunca mais que isso por tentativa.
    expect(refreshAccessToken).toHaveBeenCalledTimes(2)
  })

  it('mapeia HTTP 403 como permissao negada (apos tentar renovar)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 })) as unknown as typeof fetch
    const refreshAccessToken = vi.fn(async () => {})
    const service = makeService(fetchImpl, 'drive-token', refreshAccessToken)

    await expect(service.list()).rejects.toBeInstanceOf(GoogleDriveAppDataError)
    await expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    // 1 request original + 1 retry apos a renovacao — nunca mais que isso.
    expect(fetchImpl).toHaveBeenCalledTimes(2)
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

  it('token ausente: renova e repete a requisicao com sucesso', async () => {
    const getAccessToken = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValue('renewed-token')
    const refreshAccessToken = vi.fn(async () => {})
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ files: [] }))) as unknown as typeof fetch
    const service = new GoogleDriveAppDataService({ fetchImpl, getAccessToken, refreshAccessToken })

    await expect(service.list()).resolves.toEqual([])

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [, init] = vi.mocked(fetchImpl).mock.calls[0]
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer renewed-token')
  })

  it('HTTP 401/403: renova e repete a requisicao com sucesso', async () => {
    const refreshAccessToken = vi.fn(async () => {})
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }))) as unknown as typeof fetch
    const service = makeService(fetchImpl, 'drive-token', refreshAccessToken)

    await expect(service.list()).resolves.toEqual([])

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
