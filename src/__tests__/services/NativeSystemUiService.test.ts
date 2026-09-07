import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  getPlatform: vi.fn(() => 'android'),
  setReaderImmersiveMode: vi.fn(),
  setSelectionMenuSuppressed: vi.fn(),
  shareText: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
  },
  registerPlugin: vi.fn(() => ({
    setReaderImmersiveMode: mocks.setReaderImmersiveMode,
    setSelectionMenuSuppressed: mocks.setSelectionMenuSuppressed,
    shareText: mocks.shareText,
  })),
}))

import { setReaderImmersiveMode, setSelectionMenuSuppressed, shareText } from '@/services/NativeSystemUiService'

describe('NativeSystemUiService', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('android')
    mocks.setReaderImmersiveMode.mockReset()
    mocks.setSelectionMenuSuppressed.mockReset()
    mocks.shareText.mockReset()
    mocks.shareText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
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

  // US2 — supressao da barra flutuante de selecao do Android (FR-010)
  it('liga e desliga a supressao do menu de selecao no Android', async () => {
    await setSelectionMenuSuppressed(true)
    expect(mocks.setSelectionMenuSuppressed).toHaveBeenCalledWith({ enabled: true })

    await setSelectionMenuSuppressed(false)
    expect(mocks.setSelectionMenuSuppressed).toHaveBeenCalledWith({ enabled: false })
  })

  // T025a: e a degradacao sa na web (FR-029) — nenhum caminho novo, so as guardas
  it('nao chama o plugin de supressao fora de plataforma nativa Android e nao lanca', async () => {
    mocks.isNativePlatform.mockReturnValue(false)
    await expect(setSelectionMenuSuppressed(true)).resolves.toBeUndefined()
    expect(mocks.setSelectionMenuSuppressed).not.toHaveBeenCalled()

    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('ios')
    await expect(setSelectionMenuSuppressed(true)).resolves.toBeUndefined()
    expect(mocks.setSelectionMenuSuppressed).not.toHaveBeenCalled()
  })

  it('nao propaga falhas da supressao do menu de selecao', async () => {
    mocks.setSelectionMenuSuppressed.mockRejectedValue(new Error('native failure'))

    await expect(setSelectionMenuSuppressed(true)).resolves.toBeUndefined()
  })

  // FR-003c/FR-003d — o WebView Android nao implementa Web Share de forma
  // confiavel (achado real em device), entao no Android usa o plugin nativo
  // (Intent.ACTION_SEND), nao navigator.share.
  describe('shareText', () => {
    it('compartilha via plugin nativo no Android, sem tocar em navigator.share', async () => {
      const webShare = vi.fn()
      Object.defineProperty(navigator, 'share', { value: webShare, configurable: true })

      await shareText('trecho selecionado')

      expect(mocks.shareText).toHaveBeenCalledWith({ text: 'trecho selecionado' })
      expect(webShare).not.toHaveBeenCalled()
    })

    it('fora do Android (web), cai para navigator.share do browser', async () => {
      mocks.isNativePlatform.mockReturnValue(false)
      const webShare = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'share', { value: webShare, configurable: true })

      await shareText('trecho selecionado')

      expect(mocks.shareText).not.toHaveBeenCalled()
      expect(webShare).toHaveBeenCalledWith({ text: 'trecho selecionado' })
    })

    it('sem plugin nativo nem navigator.share, nao lanca (FR-003d)', async () => {
      mocks.isNativePlatform.mockReturnValue(false)
      // navigator.share já é undefined pelo beforeEach

      await expect(shareText('trecho')).resolves.toBeUndefined()
    })

    it('usuario cancelando o sheet do sistema (web) nao lanca', async () => {
      mocks.isNativePlatform.mockReturnValue(false)
      const webShare = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
      Object.defineProperty(navigator, 'share', { value: webShare, configurable: true })

      await expect(shareText('trecho')).resolves.toBeUndefined()
    })

    it('nao propaga falha do plugin nativo', async () => {
      mocks.shareText.mockRejectedValue(new Error('native failure'))

      await expect(shareText('trecho')).resolves.toBeUndefined()
    })
  })
})
