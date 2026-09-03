import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLibraryScrollRestore } from '@/hooks/useLibraryScrollRestore'

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, configurable: true })
}

describe('useLibraryScrollRestore', () => {
  let scrollToSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    setScrollY(0)
  })

  it('comeca no topo quando nao ha posicao salva pra assinatura', () => {
    renderHook(() => useLibraryScrollRestore({ viewMode: 'list', activeFilter: 'all', search: '#no-saved', sort: 'recent' }))

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
  })

  it('restaura a posicao salva ao desmontar e remontar com a mesma assinatura', () => {
    const params = { viewMode: 'list' as const, activeFilter: 'all', search: '#restore', sort: 'recent' }
    const { unmount } = renderHook(() => useLibraryScrollRestore(params))

    setScrollY(450)
    window.dispatchEvent(new Event('scroll'))
    unmount()

    scrollToSpy.mockClear()
    renderHook(() => useLibraryScrollRestore(params))

    expect(scrollToSpy).toHaveBeenCalledWith(0, 450)
  })

  it('reseta pro topo e descarta a posicao salva quando a assinatura muda em runtime', () => {
    const { rerender } = renderHook(
      ({ activeFilter }) => useLibraryScrollRestore({ viewMode: 'list', activeFilter, search: '#reset', sort: 'recent' }),
      { initialProps: { activeFilter: 'all' } },
    )

    setScrollY(300)
    window.dispatchEvent(new Event('scroll'))
    scrollToSpy.mockClear()

    rerender({ activeFilter: 'favorites' })
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)

    // Remontar com a assinatura antiga ('all') nao deve reaproveitar os 300 —
    // foram descartados quando a assinatura mudou pra 'favorites' acima.
    scrollToSpy.mockClear()
    renderHook(() => useLibraryScrollRestore({ viewMode: 'list', activeFilter: 'all', search: '#reset', sort: 'recent' }))
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
  })

  it('viewModes diferentes tem caches de posicao independentes', () => {
    const listParams = { viewMode: 'list' as const, activeFilter: 'all', search: '#viewmode', sort: 'recent' }
    const gridParams = { viewMode: 'grid' as const, activeFilter: 'all', search: '#viewmode', sort: 'recent' }

    const { unmount: unmountList } = renderHook(() => useLibraryScrollRestore(listParams))
    setScrollY(200)
    window.dispatchEvent(new Event('scroll'))
    unmountList()

    scrollToSpy.mockClear()
    renderHook(() => useLibraryScrollRestore(gridParams))

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
  })
})
