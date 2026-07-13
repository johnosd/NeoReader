import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadWordLensData,
  resetWordLensDataCacheForTests,
  resolveWordLensAssetUrl,
} from '@/services/WordLensDataService'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createDataFetch() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    if (url.endsWith('/manifest.json')) {
      return jsonResponse({
        schemaVersion: 1,
        packVersion: 'test',
        levelsPath: 'levels.json',
        lemmasPath: 'lemmas.json',
      })
    }
    if (url.endsWith('/levels.json')) return jsonResponse({ apple: 1, ubiquitous: 5 })
    if (url.endsWith('/lemmas.json')) return jsonResponse({ apples: 'apple' })
    return jsonResponse({}, 404)
  })
}

describe('WordLensDataService', () => {
  beforeEach(() => resetWordLensDataCacheForTests())

  it('resolve assets respeitando base path', () => {
    expect(resolveWordLensAssetUrl('manifest.json', '/neoreader/', 'https://app.test/books/1'))
      .toBe('https://app.test/neoreader/word-lens/manifest.json')
  })

  it.each(['https://evil.test/a.json', '//evil.test/a.json', '../a.json', '/a.json'])(
    'rejeita caminho externo ou fora do data pack: %s',
    (path) => expect(() => resolveWordLensAssetUrl(path)).toThrow(),
  )

  it('carrega os três assets uma vez e memoiza o resultado', async () => {
    const fetchImpl = createDataFetch()
    const options = { enabled: true, language: 'en-US', userLevel: 'B1' as const, fetchImpl }
    const first = await loadWordLensData(options)
    const second = await loadWordLensData(options)

    expect(first).toEqual({ levels: { apple: 1, ubiquitous: 5 }, lemmas: { apples: 'apple' } })
    expect(second).toBe(first)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it.each([
    { enabled: false, language: 'en', userLevel: 'B1' as const },
    { enabled: true, language: 'pt-BR', userLevel: 'B1' as const },
    { enabled: true, language: 'en', userLevel: 'C2' as const },
  ])('não faz fetch nos retornos antecipados: $userLevel/$language', async (options) => {
    const fetchImpl = createDataFetch()
    await expect(loadWordLensData({ ...options, fetchImpl })).resolves.toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('torna o recurso indisponível para a sessão quando um asset falha', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 500))
    const options = { enabled: true, language: 'en', userLevel: 'B1' as const, fetchImpl }

    await expect(loadWordLensData(options)).resolves.toBeNull()
    await expect(loadWordLensData(options)).resolves.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejeita schema inválido sem propagar erro ao leitor', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ schemaVersion: 99 }))
    await expect(loadWordLensData({ enabled: true, language: 'en', userLevel: 'B1', fetchImpl }))
      .resolves.toBeNull()
  })
})
