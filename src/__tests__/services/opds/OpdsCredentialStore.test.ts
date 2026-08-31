import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  storeOpdsCredential: vi.fn(),
  getOpdsCredential: vi.fn(),
  deleteOpdsCredential: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  registerPlugin: vi.fn(() => ({
    storeOpdsCredential: mocks.storeOpdsCredential,
    getOpdsCredential: mocks.getOpdsCredential,
    deleteOpdsCredential: mocks.deleteOpdsCredential,
  })),
}))

import { OpdsCredentialStore } from '@/services/opds/OpdsCredentialStore'

describe('OpdsCredentialStore', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReset()
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.storeOpdsCredential.mockReset()
    mocks.getOpdsCredential.mockReset()
    mocks.deleteOpdsCredential.mockReset()
  })

  it('guarda a credencial via o plugin nativo', async () => {
    await OpdsCredentialStore.store(1, { username: 'a', password: 'b' })
    expect(mocks.storeOpdsCredential).toHaveBeenCalledWith({ catalogId: 1, username: 'a', password: 'b' })
  })

  it('lê a credencial guardada', async () => {
    mocks.getOpdsCredential.mockResolvedValue({ username: 'a', password: 'b' })
    const credential = await OpdsCredentialStore.get(1)
    expect(credential).toEqual({ username: 'a', password: 'b' })
  })

  it('devolve null quando não há credencial guardada pra esse catalogId (objeto vazio, não erro)', async () => {
    mocks.getOpdsCredential.mockResolvedValue({})
    const credential = await OpdsCredentialStore.get(1)
    expect(credential).toBeNull()
  })

  it('remove a credencial', async () => {
    await OpdsCredentialStore.delete(1)
    expect(mocks.deleteOpdsCredential).toHaveBeenCalledWith({ catalogId: 1 })
  })

  it('não chama o plugin nativo fora do Android nativo', async () => {
    mocks.isNativePlatform.mockReturnValue(false)
    const credential = await OpdsCredentialStore.get(1)
    expect(credential).toBeNull()
    expect(mocks.getOpdsCredential).not.toHaveBeenCalled()

    await OpdsCredentialStore.store(1, { username: 'a', password: 'b' })
    expect(mocks.storeOpdsCredential).not.toHaveBeenCalled()
  })
})
