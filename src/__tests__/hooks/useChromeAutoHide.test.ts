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

  it('scheduleInitialAutoHide esconde o chrome após o delay configurado', () => {
    const { result } = renderHook(() => useChromeAutoHide(1000))

    act(() => { result.current.scheduleInitialAutoHide() })
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

  it('handleCenterTap ao reabrir o chrome NÃO agenda auto-hide (regressão: chrome não deve sumir sozinho)', () => {
    const { result } = renderHook(() => useChromeAutoHide(1000))

    // Fecha o chrome
    act(() => { result.current.handleCenterTap() })
    expect(result.current.chromeVisible).toBe(false)

    // Reabre — nenhum timer deve iniciar
    act(() => { result.current.handleCenterTap() })
    expect(result.current.chromeVisible).toBe(true)

    // Passa bem mais que o delay configurado — chrome permanece visível
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(result.current.chromeVisible).toBe(true)
  })

  it('handleCenterTap ao fechar o chrome não inicia auto-hide', () => {
    const { result } = renderHook(() => useChromeAutoHide(1000))

    act(() => { result.current.handleCenterTap() })
    expect(result.current.chromeVisible).toBe(false)

    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.chromeVisible).toBe(false)
  })

  it('handleCenterTap cancela um auto-hide inicial ainda pendente', () => {
    const { result } = renderHook(() => useChromeAutoHide(1000))

    act(() => { result.current.scheduleInitialAutoHide() })

    // Fecha e reabre manualmente antes do timer inicial disparar
    act(() => { vi.advanceTimersByTime(400) })
    act(() => { result.current.handleCenterTap() })
    act(() => { result.current.handleCenterTap() })
    expect(result.current.chromeVisible).toBe(true)

    // Se o timer antigo (agendado para 1000ms desde o schedule) não tivesse
    // sido cancelado, o chrome sumiria sozinho aqui.
    act(() => { vi.advanceTimersByTime(700) })
    expect(result.current.chromeVisible).toBe(true)
  })

  it('setChromeVisible força visibilidade diretamente e cancela auto-hide pendente', () => {
    const { result } = renderHook(() => useChromeAutoHide(1000))

    act(() => { result.current.scheduleInitialAutoHide() })
    act(() => { result.current.setChromeVisible(false) })
    expect(result.current.chromeVisible).toBe(false)

    act(() => { result.current.setChromeVisible(true) })
    expect(result.current.chromeVisible).toBe(true)

    // Timer inicial foi cancelado pelo setChromeVisible — não deve reaparecer escondido sozinho
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.chromeVisible).toBe(true)
  })
})
