import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpdsCatalog } from '@/types/opds'

const mocks = vi.hoisted(() => {
  let rows: OpdsCatalog[] = []
  let nextId = 1

  const table = {
    orderBy: vi.fn(() => ({
      toArray: vi.fn(async () => rows.map((row) => ({ ...row }))),
    })),
    get: vi.fn(async (id: number) => rows.find((row) => row.id === id)),
    where: vi.fn((field: string) => ({
      equals: vi.fn((value: string) => ({
        first: vi.fn(async () => (field === 'baseUrl' ? rows.find((row) => row.baseUrl === value) : undefined)),
      })),
    })),
    add: vi.fn(async (row: OpdsCatalog) => {
      const id = nextId++
      rows.push({ ...row, id })
      return id
    }),
    update: vi.fn(async (id: number, patch: Partial<OpdsCatalog>) => {
      const row = rows.find((candidate) => candidate.id === id)
      if (!row) return 0
      Object.assign(row, patch)
      return 1
    }),
    delete: vi.fn(async (id: number) => {
      rows = rows.filter((row) => row.id !== id)
    }),
    setRows(next: OpdsCatalog[]) {
      rows = next.map((row) => ({ ...row }))
      nextId = 1
    },
  }

  return { table, storeCredential: vi.fn(), deleteCredential: vi.fn() }
})

vi.mock('@/db/database', () => ({ db: { opdsCatalogs: mocks.table } }))
vi.mock('@/services/opds/OpdsCredentialStore', () => ({
  OpdsCredentialStore: { store: mocks.storeCredential, delete: mocks.deleteCredential },
}))

import { createCatalog, deleteCatalog, DuplicateCatalogUrlError, getCatalog, listCatalogs, updateCatalog } from '@/db/opdsCatalogs'

describe('opdsCatalogs', () => {
  beforeEach(() => {
    mocks.table.setRows([])
    mocks.storeCredential.mockReset()
    mocks.deleteCredential.mockReset()
  })

  it('cria catálogo sem credencial', async () => {
    const id = await createCatalog({ name: 'Gutenberg', baseUrl: 'https://example.com/opds' })
    expect(mocks.storeCredential).not.toHaveBeenCalled()

    const catalog = await getCatalog(id)
    expect(catalog?.hasCredential).toBe(false)
  })

  it('cria catálogo com credencial: guarda no secure storage e marca hasCredential', async () => {
    const id = await createCatalog({
      name: 'Meu Calibre',
      baseUrl: 'https://home.example.com/opds',
      credential: { username: 'u', password: 'p' },
    })

    expect(mocks.storeCredential).toHaveBeenCalledWith(id, { username: 'u', password: 'p' })
    const catalog = await getCatalog(id)
    expect(catalog?.hasCredential).toBe(true)
  })

  it('rejeita URL duplicada', async () => {
    await createCatalog({ name: 'A', baseUrl: 'https://dup.example.com/opds' })
    await expect(
      createCatalog({ name: 'B', baseUrl: 'https://dup.example.com/opds' }),
    ).rejects.toBeInstanceOf(DuplicateCatalogUrlError)
  })

  it('permite editar mantendo a mesma URL (não conflita consigo mesmo)', async () => {
    const id = await createCatalog({ name: 'A', baseUrl: 'https://same.example.com/opds' })
    await expect(
      updateCatalog(id, { name: 'A editado', baseUrl: 'https://same.example.com/opds' }),
    ).resolves.not.toThrow()
  })

  it('rejeita trocar pra uma URL já usada por outro catálogo', async () => {
    await createCatalog({ name: 'A', baseUrl: 'https://a.example.com/opds' })
    const idB = await createCatalog({ name: 'B', baseUrl: 'https://b.example.com/opds' })
    await expect(
      updateCatalog(idB, { baseUrl: 'https://a.example.com/opds' }),
    ).rejects.toBeInstanceOf(DuplicateCatalogUrlError)
  })

  it('remove a credencial ao editar com credential: null', async () => {
    const id = await createCatalog({
      name: 'A',
      baseUrl: 'https://cred.example.com/opds',
      credential: { username: 'u', password: 'p' },
    })

    await updateCatalog(id, { credential: null })

    expect(mocks.deleteCredential).toHaveBeenCalledWith(id)
    const catalog = await getCatalog(id)
    expect(catalog?.hasCredential).toBe(false)
  })

  it('remove a credencial no secure storage antes de apagar o catálogo (nunca deixa órfã)', async () => {
    const id = await createCatalog({
      name: 'A',
      baseUrl: 'https://del.example.com/opds',
      credential: { username: 'u', password: 'p' },
    })

    await deleteCatalog(id)

    expect(mocks.deleteCredential).toHaveBeenCalledWith(id)
    expect(await getCatalog(id)).toBeUndefined()
  })

  it('lista catálogos cadastrados', async () => {
    await createCatalog({ name: 'A', baseUrl: 'https://a2.example.com/opds' })
    await createCatalog({ name: 'B', baseUrl: 'https://b2.example.com/opds' })

    const catalogs = await listCatalogs()
    expect(catalogs).toHaveLength(2)
  })
})
