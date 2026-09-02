import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateAppSettings: vi.fn(),
  updateReaderDefaults: vi.fn(),
}))

vi.mock('@/db/settings', () => ({
  getSettings: mocks.getSettings,
  updateAppSettings: mocks.updateAppSettings,
  updateReaderDefaults: mocks.updateReaderDefaults,
}))

import { useUserSettings } from '@/hooks/useUserSettings'

function settingsFixture() {
  return {
    appSettings: {
      appLocale: 'auto' as const,
      speechifyApiKey: '',
      elevenLabsApiKey: '',
      fishAudioApiKey: '',
      translationTargetLang: 'pt-BR',
      youtubeApiKey: '',
    },
    readerDefaults: {
      defaultFontSize: 'md' as const,
      lineHeight: 'comfortable' as const,
      readerTheme: 'dark' as const,
      fontFamily: 'classic' as const,
      overrideBookFont: true,
      overrideBookColors: true,
      wordLensEnabled: true,
      wordLensLevel: 'B1' as const,
    },
    updatedAt: new Date(),
  }
}

describe('useUserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue(settingsFixture())
    mocks.updateAppSettings.mockResolvedValue(undefined)
    mocks.updateReaderDefaults.mockResolvedValue(undefined)
  })

  it('comeca com settings null e popula apos getSettings resolver', async () => {
    const { result } = renderHook(() => useUserSettings())

    expect(result.current.settings).toBeNull()

    await waitFor(() => {
      expect(result.current.settings).not.toBeNull()
    })
    expect(result.current.settings?.appSettings.translationTargetLang).toBe('pt-BR')
  })

  it('saveAppSettings persiste o patch e atualiza o estado local', async () => {
    const { result } = renderHook(() => useUserSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())

    await act(async () => {
      await result.current.saveAppSettings({ translationTargetLang: 'es' })
    })

    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ translationTargetLang: 'es' })
    expect(result.current.settings?.appSettings.translationTargetLang).toBe('es')
  })

  it('saveReaderDefaults persiste o patch e atualiza o estado local', async () => {
    const { result } = renderHook(() => useUserSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())

    await act(async () => {
      await result.current.saveReaderDefaults({ wordLensLevel: 'C2' })
    })

    expect(mocks.updateReaderDefaults).toHaveBeenCalledWith({ wordLensLevel: 'C2' })
    expect(result.current.settings?.readerDefaults.wordLensLevel).toBe('C2')
  })
})
