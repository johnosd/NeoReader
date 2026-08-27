import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  getPlatform: vi.fn(() => 'android'),
  start: vi.fn(),
  stop: vi.fn(),
  updateMetadata: vi.fn(),
  updatePlaybackState: vi.fn(),
  addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
  },
  registerPlugin: vi.fn(() => ({
    start: mocks.start,
    stop: mocks.stop,
    updateMetadata: mocks.updateMetadata,
    updatePlaybackState: mocks.updatePlaybackState,
    addListener: mocks.addListener,
  })),
}))

import { TtsPlaybackSessionService } from '@/services/TtsPlaybackSessionService'

describe('TtsPlaybackSessionService', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('android')
    mocks.start.mockReset()
    mocks.stop.mockReset()
    mocks.updateMetadata.mockReset()
    mocks.updatePlaybackState.mockReset()
    mocks.addListener.mockReset()
  })

  it('inicia a sessao nativa no Android com os parametros corretos', async () => {
    await TtsPlaybackSessionService.start({ bookId: 42, title: 'Dom Casmurro' })

    expect(mocks.start).toHaveBeenCalledWith({ bookId: 42, title: 'Dom Casmurro' })
  })

  it('para a sessao nativa no Android', async () => {
    await TtsPlaybackSessionService.stop()

    expect(mocks.stop).toHaveBeenCalled()
  })

  it('atualiza metadata (capa/titulo/capitulo) no Android', async () => {
    await TtsPlaybackSessionService.updateMetadata({ title: 'Dom Casmurro', chapterLabel: 'Capítulo 1', coverBase64: 'YWJj' })

    expect(mocks.updateMetadata).toHaveBeenCalledWith({ title: 'Dom Casmurro', chapterLabel: 'Capítulo 1', coverBase64: 'YWJj' })
  })

  it('atualiza o estado de reproducao (play/pause) no Android', async () => {
    await TtsPlaybackSessionService.updatePlaybackState({ state: 'paused' })

    expect(mocks.updatePlaybackState).toHaveBeenCalledWith({ state: 'paused' })
  })

  it('registra um listener de playbackControl e chama o handler', async () => {
    let registeredHandler: ((event: { action: string }) => void) | undefined
    const remove = vi.fn(async () => undefined)
    mocks.addListener.mockImplementation(async (_eventName: string, handler: (event: { action: string }) => void) => {
      registeredHandler = handler
      return { remove }
    })

    const handler = vi.fn()
    const cleanup = TtsPlaybackSessionService.onPlaybackControl(handler)

    await Promise.resolve()
    await Promise.resolve()

    registeredHandler?.({ action: 'play' })
    expect(handler).toHaveBeenCalledWith({ action: 'play' })

    cleanup()
    await Promise.resolve()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('nao registra listener de playbackControl fora de plataforma nativa Android', () => {
    mocks.isNativePlatform.mockReturnValue(false)

    const cleanup = TtsPlaybackSessionService.onPlaybackControl(vi.fn())

    expect(mocks.addListener).not.toHaveBeenCalled()
    expect(() => cleanup()).not.toThrow()
  })

  it('nao chama o plugin fora de plataforma nativa Android', async () => {
    mocks.isNativePlatform.mockReturnValue(false)
    await TtsPlaybackSessionService.start({ bookId: 1, title: 'Livro' })
    expect(mocks.start).not.toHaveBeenCalled()

    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('ios')
    await TtsPlaybackSessionService.start({ bookId: 1, title: 'Livro' })
    await TtsPlaybackSessionService.stop()
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.stop).not.toHaveBeenCalled()
  })

  it('nao propaga falhas do plugin pra reproducao', async () => {
    mocks.start.mockRejectedValue(new Error('native failure'))
    mocks.stop.mockRejectedValue(new Error('native failure'))
    mocks.updateMetadata.mockRejectedValue(new Error('native failure'))
    mocks.updatePlaybackState.mockRejectedValue(new Error('native failure'))

    await expect(TtsPlaybackSessionService.start({ bookId: 1, title: 'Livro' })).resolves.toBeUndefined()
    await expect(TtsPlaybackSessionService.stop()).resolves.toBeUndefined()
    await expect(TtsPlaybackSessionService.updateMetadata({ title: 'Livro' })).resolves.toBeUndefined()
    await expect(TtsPlaybackSessionService.updatePlaybackState({ state: 'playing' })).resolves.toBeUndefined()
  })
})
