import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  getPlatform: vi.fn(() => 'android'),
  plugin: { confirmDeviceCredential: vi.fn() } as Record<string, unknown>,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
  },
  registerPlugin: vi.fn(() => mocks.plugin),
}))

import { DeviceCredentialService } from '@/services/DeviceCredentialService'

const LABELS = { title: 'Confirme', description: 'Digite a credencial' }

describe('DeviceCredentialService', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('android')
    mocks.plugin.confirmDeviceCredential = vi.fn()
  })

  it('suportado e confirmado → confirmed', async () => {
    mocks.plugin.confirmDeviceCredential = vi.fn(async () => ({ supported: true, confirmed: true }))

    await expect(DeviceCredentialService.confirm(LABELS)).resolves.toBe('confirmed')
    expect(mocks.plugin.confirmDeviceCredential).toHaveBeenCalledWith(LABELS)
  })

  it('suportado mas cancelado/errado → cancelled', async () => {
    mocks.plugin.confirmDeviceCredential = vi.fn(async () => ({ supported: true, confirmed: false }))

    await expect(DeviceCredentialService.confirm(LABELS)).resolves.toBe('cancelled')
  })

  it('aparelho sem bloqueio de tela → unsupported', async () => {
    mocks.plugin.confirmDeviceCredential = vi.fn(async () => ({ supported: false, confirmed: false }))

    await expect(DeviceCredentialService.confirm(LABELS)).resolves.toBe('unsupported')
  })

  it('método ausente (APK antigo) → unsupported', async () => {
    delete mocks.plugin.confirmDeviceCredential

    await expect(DeviceCredentialService.confirm(LABELS)).resolves.toBe('unsupported')
  })

  it('UNIMPLEMENTED do Capacitor → unsupported', async () => {
    mocks.plugin.confirmDeviceCredential = vi.fn(async () => {
      throw Object.assign(new Error('not implemented'), { code: 'UNIMPLEMENTED' })
    })

    await expect(DeviceCredentialService.confirm(LABELS)).resolves.toBe('unsupported')
  })

  it('outro erro → cancelled (nunca confirma por engano)', async () => {
    mocks.plugin.confirmDeviceCredential = vi.fn(async () => { throw new Error('boom') })

    await expect(DeviceCredentialService.confirm(LABELS)).resolves.toBe('cancelled')
  })

  it('na web (fora do Android nativo) → unsupported sem chamar o plugin', async () => {
    mocks.isNativePlatform.mockReturnValue(false)

    await expect(DeviceCredentialService.confirm(LABELS)).resolves.toBe('unsupported')
    expect(mocks.plugin.confirmDeviceCredential).not.toHaveBeenCalled()
  })
})
