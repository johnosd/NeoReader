import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWindowVirtualList } from '@/hooks/useWindowVirtualList'

describe('useWindowVirtualList', () => {
  it('renderiza uma fracao pequena dos itens totais, baseado na altura da janela', () => {
    const { result } = renderHook(() => useWindowVirtualList({ count: 500, estimateSize: () => 100, overscan: 5 }))

    const virtualItems = result.current.virtualizer.getVirtualItems()

    expect(virtualItems.length).toBeGreaterThan(0)
    // window.innerHeight do jsdom (768) / itens de 100px ~= 8 visiveis + overscan de 5 em cada ponta.
    expect(virtualItems.length).toBeLessThanOrEqual(30)
  })

  it('com poucos itens (menor que a janela), renderiza todos', () => {
    const { result } = renderHook(() => useWindowVirtualList({ count: 3, estimateSize: () => 100 }))

    expect(result.current.virtualizer.getVirtualItems().length).toBe(3)
  })
})
