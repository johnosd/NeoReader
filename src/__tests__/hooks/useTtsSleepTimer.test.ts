import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useTtsSleepTimer } from '@/hooks/useTtsSleepTimer'

describe('useTtsSleepTimer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('começa com timer desligado e sem contagem regressiva', () => {
    const { result } = renderHook(() => useTtsSleepTimer())
    expect(result.current.sleepTimerValue).toBe('off')
    expect(result.current.sleepRemainingSeconds).toBeNull()
  })

  it('inicia contagem regressiva ao definir um tempo', () => {
    const { result } = renderHook(() => useTtsSleepTimer())

    act(() => { result.current.handleSleepTimerChange('60', vi.fn()) })

    expect(result.current.sleepTimerValue).toBe('60')
    expect(result.current.sleepRemainingSeconds).toBe(60)
  })

  it('decrementa o contador a cada segundo', () => {
    const { result } = renderHook(() => useTtsSleepTimer())

    act(() => { result.current.handleSleepTimerChange('5', vi.fn()) })
    act(() => { vi.advanceTimersByTime(3000) })

    expect(result.current.sleepRemainingSeconds).toBe(2)
  })

  it('chama onExpire e reseta quando o tempo acaba', () => {
    const { result } = renderHook(() => useTtsSleepTimer())
    const onExpire = vi.fn()

    act(() => { result.current.handleSleepTimerChange('5', onExpire) })
    act(() => { vi.advanceTimersByTime(5000) })

    expect(onExpire).toHaveBeenCalledOnce()
    expect(result.current.sleepTimerValue).toBe('off')
    expect(result.current.sleepRemainingSeconds).toBeNull()
  })

  it('resetSleepTimer cancela o timer ativo e volta para off', () => {
    const { result } = renderHook(() => useTtsSleepTimer())
    const onExpire = vi.fn()

    act(() => { result.current.handleSleepTimerChange('60', onExpire) })
    act(() => { result.current.resetSleepTimer() })
    act(() => { vi.advanceTimersByTime(60000) })

    expect(onExpire).not.toHaveBeenCalled()
    expect(result.current.sleepTimerValue).toBe('off')
    expect(result.current.sleepRemainingSeconds).toBeNull()
  })

  it('trocar de timer cancela o anterior e inicia novo countdown', () => {
    const { result } = renderHook(() => useTtsSleepTimer())
    const onExpire = vi.fn()

    act(() => { result.current.handleSleepTimerChange('300', onExpire) })
    act(() => { result.current.handleSleepTimerChange('60', onExpire) })
    act(() => { vi.advanceTimersByTime(60000) })

    expect(onExpire).toHaveBeenCalledOnce()
    expect(result.current.sleepTimerValue).toBe('off')
  })

  it('definir "off" desliga o timer imediatamente', () => {
    const { result } = renderHook(() => useTtsSleepTimer())
    const onExpire = vi.fn()

    act(() => { result.current.handleSleepTimerChange('60', onExpire) })
    act(() => { result.current.handleSleepTimerChange('off', onExpire) })

    expect(result.current.sleepTimerValue).toBe('off')
    expect(result.current.sleepRemainingSeconds).toBeNull()
    act(() => { vi.advanceTimersByTime(60000) })
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('não dispara onExpire antes do prazo', () => {
    const { result } = renderHook(() => useTtsSleepTimer())
    const onExpire = vi.fn()

    act(() => { result.current.handleSleepTimerChange('10', onExpire) })
    act(() => { vi.advanceTimersByTime(9999) })

    expect(onExpire).not.toHaveBeenCalled()
    expect(result.current.sleepRemainingSeconds).toBeGreaterThan(0)
  })
})
