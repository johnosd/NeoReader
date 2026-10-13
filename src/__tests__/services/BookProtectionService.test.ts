import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookProtectionRecord } from '@/types/bookProtection'

const mocks = vi.hoisted(() => ({
  store: { current: undefined as BookProtectionRecord | undefined },
  clearAllBooksProtected: vi.fn(async () => undefined),
  isNativePlatform: vi.fn(() => true),
  deviceConfirm: vi.fn(),
  reauthWeb: vi.fn(),
  transaction: vi.fn(async (_mode: string, _a: unknown, _b: unknown, task: () => Promise<void>) => task()),
}))

vi.mock('@/db/bookProtection', () => ({
  getBookProtection: vi.fn(async () => mocks.store.current),
  saveBookProtection: vi.fn(async (record: BookProtectionRecord) => { mocks.store.current = record }),
  clearBookProtection: vi.fn(async () => { mocks.store.current = undefined }),
}))
vi.mock('@/db/books', () => ({ clearAllBooksProtected: mocks.clearAllBooksProtected }))
vi.mock('@/db/database', () => ({
  db: { books: {}, bookProtection: {}, transaction: mocks.transaction },
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.isNativePlatform } }))
vi.mock('@/services/DeviceCredentialService', () => ({ DeviceCredentialService: { confirm: mocks.deviceConfirm } }))
vi.mock('@/services/FirebaseAuthService', () => ({ reauthenticateGoogleOnWeb: mocks.reauthWeb }))

import { BookProtectionService } from '@/services/BookProtectionService'

const NOW = 5_000_000

describe('BookProtectionService', () => {
  beforeEach(() => {
    mocks.store.current = undefined
    mocks.clearAllBooksProtected.mockClear()
    mocks.transaction.mockClear()
  })

  afterEach(() => vi.restoreAllMocks())

  it('cria o PIN e verifica', async () => {
    expect(await BookProtectionService.hasPin()).toBe(false)
    await BookProtectionService.createPin('1234')
    expect(await BookProtectionService.hasPin()).toBe(true)
    expect(await BookProtectionService.verify('1234', NOW)).toEqual({ ok: true })
  })

  it('o registro nunca contém o PIN em texto', async () => {
    await BookProtectionService.createPin('4821')
    expect(JSON.stringify(mocks.store.current)).not.toContain('4821')
  })

  it('recusa PIN com formato inválido', async () => {
    await expect(BookProtectionService.createPin('12')).rejects.toThrow()
    expect(mocks.store.current).toBeUndefined()
  })

  it('PIN errado conta tentativas restantes', async () => {
    await BookProtectionService.createPin('1234')
    const result = await BookProtectionService.verify('0000', NOW)
    expect(result).toEqual({ ok: false, attemptsLeft: 4, lockedUntil: 0 })
  })

  it('5 erros seguidos persistem a espera e a tentativa durante ela não é verificada', async () => {
    await BookProtectionService.createPin('1234')
    let last = await BookProtectionService.verify('0000', NOW)
    for (let i = 0; i < 4; i++) last = await BookProtectionService.verify('0000', NOW)

    expect(last).toMatchObject({ ok: false, attemptsLeft: 0 })
    expect(mocks.store.current?.lockedUntil).toBe(NOW + 30_000)

    // PIN CORRETO durante a espera continua rejeitado (SC-004).
    const during = await BookProtectionService.verify('1234', NOW + 1_000)
    expect(during).toMatchObject({ ok: false, attemptsLeft: 0 })
    expect(mocks.store.current?.lockedUntil).toBe(NOW + 30_000)

    // Depois da espera o PIN correto volta a valer e zera tudo.
    const after = await BookProtectionService.verify('1234', NOW + 30_001)
    expect(after).toEqual({ ok: true })
    expect(mocks.store.current).toMatchObject({ failedAttempts: 0, lockRound: 0, lockedUntil: 0 })
  })

  it('getLockoutStatus informa o tempo restante', async () => {
    await BookProtectionService.createPin('1234')
    for (let i = 0; i < 5; i++) await BookProtectionService.verify('0000', NOW)
    const status = await BookProtectionService.getLockoutStatus(NOW + 10_000)
    expect(status.remainingMs).toBe(20_000)
  })

  it('replacePin troca o PIN, zera a espera e mantém createdAt', async () => {
    await BookProtectionService.createPin('1234')
    const createdAt = mocks.store.current!.createdAt
    for (let i = 0; i < 5; i++) await BookProtectionService.verify('0000', NOW)

    await BookProtectionService.replacePin('5678')

    expect(mocks.store.current).toMatchObject({ failedAttempts: 0, lockRound: 0, lockedUntil: 0 })
    expect(mocks.store.current?.createdAt).toBe(createdAt)
    expect(await BookProtectionService.verify('1234', NOW)).toMatchObject({ ok: false })
    expect(await BookProtectionService.verify('5678', NOW)).toEqual({ ok: true })
  })

  it('sem registro, verify libera (não tranca o usuário)', async () => {
    expect(await BookProtectionService.verify('0000', NOW)).toEqual({ ok: true })
  })

  it('disable desprotege os livros e apaga o registro numa transação', async () => {
    await BookProtectionService.createPin('1234')
    await BookProtectionService.disable()
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.clearAllBooksProtected).toHaveBeenCalledTimes(1)
    expect(mocks.store.current).toBeUndefined()
  })

  describe('confirmOwnership (esqueci o PIN)', () => {
    const LABELS = { title: 't', description: 'd' }

    beforeEach(() => {
      mocks.isNativePlatform.mockReturnValue(true)
      mocks.deviceConfirm.mockReset()
      mocks.reauthWeb.mockReset()
    })

    it('Android: credencial do aparelho confirmada → confirmed', async () => {
      mocks.deviceConfirm.mockResolvedValue('confirmed')

      await expect(BookProtectionService.confirmOwnership(LABELS)).resolves.toBe('confirmed')
      expect(mocks.deviceConfirm).toHaveBeenCalledWith(LABELS)
      expect(mocks.reauthWeb).not.toHaveBeenCalled()
    })

    it('Android: cancelada → cancelled', async () => {
      mocks.deviceConfirm.mockResolvedValue('cancelled')

      await expect(BookProtectionService.confirmOwnership(LABELS)).resolves.toBe('cancelled')
    })

    it('Android sem bloqueio de tela → no-device-lock (a UI pede confirmação explícita)', async () => {
      mocks.deviceConfirm.mockResolvedValue('unsupported')

      await expect(BookProtectionService.confirmOwnership(LABELS)).resolves.toBe('no-device-lock')
    })

    it('web: usa a reautenticação Google e nunca a credencial do aparelho', async () => {
      mocks.isNativePlatform.mockReturnValue(false)
      mocks.reauthWeb.mockResolvedValue('different-account')

      await expect(BookProtectionService.confirmOwnership(LABELS)).resolves.toBe('different-account')
      expect(mocks.deviceConfirm).not.toHaveBeenCalled()
    })
  })

  it('não registra o PIN em console durante criar/verificar', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
    ]
    await BookProtectionService.createPin('4821')
    await BookProtectionService.verify('4821', NOW)
    await BookProtectionService.verify('0000', NOW)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
