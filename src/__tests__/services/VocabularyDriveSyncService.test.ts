import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleDriveAppDataFile } from '@/services/GoogleDriveAppDataService'

vi.mock('@/services/BillingService', () => ({
  BillingService: {
    waitForEntitlements: async () => undefined,
    waitForInit: async () => undefined,
    getCachedStatus: () => ({ isPro: true }),
  },
}))

import { db } from '@/db/database'
import {
  syncVocabulary,
  type VocabularyDriveSyncClient,
} from '@/services/VocabularyDriveSyncService'
import {
  VOCABULARY_DRIVE_FILE_NAME,
  type RemoteVocabFile,
  type RemoteVocabItem,
} from '@/services/VocabularyDriveSyncModel'

function remoteItem(sourceText: string): RemoteVocabItem {
  return {
    bookTitle: 'Livro',
    sourceText,
    translatedText: `${sourceText}-pt`,
    sourceLang: 'en',
    targetLang: 'pt-BR',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

// Drive falso em memória: guarda o último JSON publicado.
function makeDrive(initial: unknown | null) {
  const state = { remote: initial }
  const file: GoogleDriveAppDataFile = { id: 'remote-vocab', name: VOCABULARY_DRIVE_FILE_NAME }
  const client = {
    list: vi.fn(async () => (state.remote === null ? [] : [file])),
    getJson: vi.fn(async () => state.remote),
    updateJson: vi.fn(async (_id: string, data: unknown) => { state.remote = data; return file }),
    createJson: vi.fn(async (_name: string, data: unknown) => { state.remote = data; return file }),
  }
  return { state, client: client as unknown as VocabularyDriveSyncClient & typeof client }
}

async function addLocal(sourceText: string) {
  await db.vocabulary.add({
    bookId: 7,
    bookTitle: 'Livro',
    sourceText,
    translatedText: `${sourceText}-pt`,
    sourceLang: 'en',
    targetLang: 'pt-BR',
    createdAt: new Date('2026-02-01T00:00:00Z'),
  })
}

function remoteTexts(remote: unknown): string[] {
  return (remote as RemoteVocabFile).items.map((i) => i.sourceText).sort()
}

async function localTexts(): Promise<string[]> {
  return (await db.vocabulary.toArray()).map((i) => i.sourceText).sort()
}

describe('syncVocabulary — merge com o remoto antes de publicar (bug R01)', () => {
  beforeEach(async () => {
    await db.vocabulary.clear()
    localStorage.clear()
  })

  it('device novo com tabela vazia restaura o remoto em vez de apagá-lo', async () => {
    const drive = makeDrive({ schemaVersion: 1, updatedAt: '', items: [remoteItem('remote-only')] })

    await syncVocabulary({ isPro: () => true, driveClient: drive.client })

    expect(drive.client.getJson).toHaveBeenCalled()
    expect(remoteTexts(drive.state.remote)).toEqual(['remote-only'])
    expect(await localTexts()).toEqual(['remote-only'])
    const restored = (await db.vocabulary.toArray())[0]
    expect(restored.bookId).toBe(0)
    expect(restored.createdAt).toBeInstanceOf(Date)
  })

  it('adições offline nos dois lados sobrevivem (publica a união)', async () => {
    await addLocal('local-only')
    const drive = makeDrive({ schemaVersion: 1, updatedAt: '', items: [remoteItem('remote-only')] })

    await syncVocabulary({ isPro: () => true, driveClient: drive.client })

    expect(remoteTexts(drive.state.remote)).toEqual(['local-only', 'remote-only'])
    expect(await localTexts()).toEqual(['local-only', 'remote-only'])
  })

  it('exclusão feita neste device propaga e não ressuscita', async () => {
    await addLocal('keep')
    await addLocal('delete-me')
    const drive = makeDrive(null)
    await syncVocabulary({ isPro: () => true, driveClient: drive.client })
    expect(remoteTexts(drive.state.remote)).toEqual(['delete-me', 'keep'])

    // Usuário exclui localmente; o remoto ainda tem o item publicado antes.
    const toDelete = (await db.vocabulary.toArray()).find((i) => i.sourceText === 'delete-me')!
    await db.vocabulary.delete(toDelete.id!)
    await syncVocabulary({ isPro: () => true, driveClient: drive.client })

    expect(remoteTexts(drive.state.remote)).toEqual(['keep'])
    expect(await localTexts()).toEqual(['keep'])
  })

  it('item adicionado por outro device depois do último sync é restaurado', async () => {
    await addLocal('mine')
    const drive = makeDrive(null)
    await syncVocabulary({ isPro: () => true, driveClient: drive.client })

    // Outro device publica a união com um item novo.
    const current = drive.state.remote as RemoteVocabFile
    drive.state.remote = { ...current, items: [...current.items, remoteItem('from-other-device')] }
    await syncVocabulary({ isPro: () => true, driveClient: drive.client })

    expect(await localTexts()).toEqual(['from-other-device', 'mine'])
    expect(remoteTexts(drive.state.remote)).toEqual(['from-other-device', 'mine'])
  })

  it('falha ao ler o remoto não sobrescreve o arquivo', async () => {
    const drive = makeDrive({ schemaVersion: 1, updatedAt: '', items: [remoteItem('remote-only')] })
    drive.client.getJson.mockRejectedValueOnce(new Error('network'))

    await syncVocabulary({ isPro: () => true, driveClient: drive.client })

    expect(drive.client.updateJson).not.toHaveBeenCalled()
    expect(drive.client.createJson).not.toHaveBeenCalled()
    expect(remoteTexts(drive.state.remote)).toEqual(['remote-only'])
  })

  it('item remoto com campos faltando é restaurado (não some do Drive) e não duplica', async () => {
    // Mesmo payload do probe R01 do code review: só sourceText.
    const drive = makeDrive({ items: [{ sourceText: 'remote-only-term' }] })

    await syncVocabulary({ isPro: () => true, driveClient: drive.client })
    await syncVocabulary({ isPro: () => true, driveClient: drive.client })

    expect(remoteTexts(drive.state.remote)).toEqual(['remote-only-term'])
    expect(await localTexts()).toEqual(['remote-only-term'])
  })

  it('remoto com formato inválido não é sobrescrito', async () => {
    await addLocal('local-only')
    const drive = makeDrive({ unexpected: true })

    await syncVocabulary({ isPro: () => true, driveClient: drive.client })

    expect(drive.client.updateJson).not.toHaveBeenCalled()
    expect(drive.state.remote).toEqual({ unexpected: true })
  })

  it('sem arquivo remoto cria o arquivo com o vocabulário local', async () => {
    await addLocal('local-only')
    const drive = makeDrive(null)

    await syncVocabulary({ isPro: () => true, driveClient: drive.client })

    expect(drive.client.getJson).not.toHaveBeenCalled()
    expect(drive.client.createJson).toHaveBeenCalledTimes(1)
    expect(remoteTexts(drive.state.remote)).toEqual(['local-only'])
  })
})
