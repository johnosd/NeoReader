import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSyncRef } from '@/hooks/useSyncRef'

describe('useSyncRef', () => {
  it('ref.current começa com o valor inicial', () => {
    const { result } = renderHook(() => useSyncRef(42))
    expect(result.current.current).toBe(42)
  })

  it('ref.current atualiza quando o valor muda', () => {
    const { result, rerender } = renderHook(({ v }) => useSyncRef(v), {
      initialProps: { v: 'a' },
    })

    expect(result.current.current).toBe('a')

    act(() => { rerender({ v: 'b' }) })

    expect(result.current.current).toBe('b')
  })

  it('ref.current aceita funções e mantém referência atual', () => {
    const fn1 = () => 1
    const fn2 = () => 2

    const { result, rerender } = renderHook(({ fn }) => useSyncRef(fn), {
      initialProps: { fn: fn1 },
    })

    expect(result.current.current).toBe(fn1)

    act(() => { rerender({ fn: fn2 }) })

    expect(result.current.current).toBe(fn2)
  })
})
