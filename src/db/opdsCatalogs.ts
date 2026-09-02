import { db } from './database'
import { OpdsCredentialStore, type OpdsCredential } from '../services/opds/OpdsCredentialStore'
import type { OpdsCatalog } from '../types/opds'

export class DuplicateCatalogUrlError extends Error {
  constructor() {
    super('Já existe um catálogo cadastrado com essa URL.')
    this.name = 'DuplicateCatalogUrlError'
  }
}

export async function listCatalogs(): Promise<OpdsCatalog[]> {
  return db.opdsCatalogs.orderBy('createdAt').toArray()
}

export async function getCatalog(id: number): Promise<OpdsCatalog | undefined> {
  return db.opdsCatalogs.get(id)
}

async function assertUrlNotDuplicate(baseUrl: string, excludeId?: number): Promise<void> {
  const existing = await db.opdsCatalogs.where('baseUrl').equals(baseUrl).first()
  if (existing && existing.id !== excludeId) throw new DuplicateCatalogUrlError()
}

export interface CreateCatalogInput {
  name: string
  baseUrl: string
  credential?: OpdsCredential
}

// Criação em 2 passos: insere sem credencial pra obter o id auto-incrementado,
// depois guarda a credencial no secure storage nativo (referenciada por esse
// id) e só então marca hasCredential — a credencial em si nunca fica no Dexie.
export async function createCatalog(input: CreateCatalogInput): Promise<number> {
  const baseUrl = input.baseUrl.trim()
  await assertUrlNotDuplicate(baseUrl)

  const now = new Date()
  const id = await db.opdsCatalogs.add({
    name: input.name.trim(),
    baseUrl,
    hasCredential: false,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  })

  if (input.credential) {
    await OpdsCredentialStore.store(id, input.credential)
    await db.opdsCatalogs.update(id, { hasCredential: true, updatedAt: new Date() })
  }

  return id
}

export interface UpdateCatalogInput {
  name?: string
  baseUrl?: string
  // undefined = não mexe na credencial; null = remove; objeto = guarda/troca
  credential?: OpdsCredential | null
}

export async function updateCatalog(id: number, input: UpdateCatalogInput): Promise<void> {
  if (input.baseUrl !== undefined) {
    await assertUrlNotDuplicate(input.baseUrl.trim(), id)
  }

  const patch: Partial<OpdsCatalog> = { updatedAt: new Date() }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl.trim()

  if (input.credential === null) {
    await OpdsCredentialStore.delete(id)
    patch.hasCredential = false
  } else if (input.credential !== undefined) {
    await OpdsCredentialStore.store(id, input.credential)
    patch.hasCredential = true
  }

  await db.opdsCatalogs.update(id, patch)
}

// Remove a credencial do secure storage nativo antes de apagar o registro —
// nunca deixa credencial órfã guardada pra um catalogId que não existe mais.
export async function deleteCatalog(id: number): Promise<void> {
  await OpdsCredentialStore.delete(id)
  await db.opdsCatalogs.delete(id)
}
