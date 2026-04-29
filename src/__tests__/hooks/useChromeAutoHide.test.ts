import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChromeAutoHide } from '@/hooks/useChromeAutoHide'

describe('useChromeAutoHide', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('começa com chrome visível', () => {
    const { result } = renderHook(() => useChromeAutoHide())
    expect(result.current.chromeVisible).toBe(true)
  })

  it('resetAutoHide esconde o chrome após o delay configurado', () => {
    const { result } = renderHook(() => useChromeAutoHide(1000))

    act(() => { result.current.resetAutoHide() })
    expect(result.current.chromeVisible).toBe(true)

    act(() => { vi.advanceTimersByTime(999) })
    expect(result.current.chromeVisible).toBe(true)

    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.chromeVisible).toBe(false)
  })

  it('handleCenterTap alterna visibilidade do chrome', () => {
    const { result } = renderHook(() => useChromeAutoHide())

    act(() => { result.current.handleCenterTap() })
    expect(result.current.chromeVisible).toBe(false)

    act(() => { result.current.handleCenterTap() })
    expect(result.current.chromeVisible).toBe(true)
  })

  it('handleCenterTap inicia auto-hide ao reabrir o chrome', () => {
    const { result } = renderHook(() => useChromeAutoHide(1000))

    // Fecha o chrome
    act(() => { result.current.handleCenterTap() })
    expect(result.current.chromeVisible).toBe(false)

    // Reabre — auto-hide deve iniciar
    act(() => { result.current.handleCenterTap() })
    expect(result.current.chromeVisible).toBe(true)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.chromeVisible).toBe(false)
  })

  it('handleCenterTap ao fechar o chrome não inicia auto-hide', () => {
    const { result } = renderHook(() => useChromeAutoHide(1000))

    // Fecha o chrome — não deve haver timer rodando
    act(() => { result.current.handleCenterTap() })
    expect(result.current.chromeVisible).toBe(false)

    // Avança muito tempo — chrome deve continuar fechado sem reabrir
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.chromeVisible).toBe(false)
  })

  it('resetAutoHide reinicia o timer cancelando o anterior', () => {
    const { result } = renderHook(() => useChromeAutoHide(1000))

    act(() => { result.current.resetAutoHide() })
    act(() => { vi.advanceTimersByTime(800) })

    // Reinicia — prazo se torna 1000ms a partir daqui
    act(() => { result.current.resetAutoHide() })
    act(() => { vi.advanceTimersByTime(800) })
    // Ainda visível — timer foi reiniciado
    expect(result.current.chromeVisible).toBe(true)

    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current.chromeVisible).toBe(false)
  })

  it('setChromeVisible força visibilidade diretamente', () => {
    const { result } = renderHook(() => useChromeAutoHide())

    act(() => { result.current.setChromeVisible(false) })
    expect(result.current.chromeVisible).toBe(false)

    act(() => { result.current.setChromeVisible(true) })
    expect(result.current.chromeVisible).toBe(true)
  })
})
