import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  getPlatform: vi.fn(() => 'android'),
  setReaderImmersiveMode: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
  },
  registerPlugin: vi.fn(() => ({
    setReaderImmersiveMode: mocks.setReaderImmersiveMode,
  })),
}))

import { setReaderImmersiveMode } from '@/services/NativeSystemUiService'

describe('NativeSystemUiService', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('android')
    mocks.setReaderImmersiveMode.mockReset()
  })

  it('ativa o modo imersivo nativo no Android', async () => {
    await setReaderImmersiveMode(true)

    expect(mocks.setReaderImmersiveMode).toHaveBeenCalledWith({ enabled: true })
  })

  it('restaura as barras nativas no Android', async () => {
    await setReaderImmersiveMode(false)

    expect(mocks.setReaderImmersiveMode).toHaveBeenCalledWith({ enabled: false })
  })

  it('nao chama o plugin fora de plataforma nativa Android', async () => {
    mocks.isNativePlatform.mockReturnValue(false)
    await setReaderImmersiveMode(true)
    expect(mocks.setReaderImmersiveMode).not.toHaveBeenCalled()

    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('ios')
    await setReaderImmersiveMode(true)
    expect(mocks.setReaderImmersiveMode).not.toHaveBeenCalled()
  })

  it('nao propaga falhas do plugin para a tela do leitor', async () => {
    mocks.setReaderImmersiveMode.mockRejectedValue(new Error('native failure'))

    await expect(setReaderImmersiveMode(true)).resolves.toBeUndefined()
  })
})
