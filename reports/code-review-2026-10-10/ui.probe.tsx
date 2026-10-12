import { act, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useOpdsCatalogBrowse } from '@/hooks/useOpdsCatalogBrowse'
import type { OpdsFeedPage } from '@/types/opds'

const mocks = vi.hoisted(() => ({ fetchPage: vi.fn() }))
vi.mock('@/services/opds/OpdsCatalogService', () => ({ OpdsCatalogService: {
  fetchPage: mocks.fetchPage,
  resolveEntryCovers: async (_catalog: unknown, entries: unknown) => entries,
} }))

const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }) }

// Passing probes assert faulty behavior, not acceptance of a future correction.
describe('Review probes: UI state boundaries', () => {
  it('R16: a closed sheet remains an accessible dialog with focusable children', () => {
    render(<BottomSheet open={false} onClose={() => undefined} title="Closed"><button>Hidden action</button></BottomSheet>)
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    const button = screen.getByRole('button', { name: 'Hidden action' })
    button.focus()
    expect(document.activeElement).toBe(button)
  })

  it('R17: a late pagination response from folder A appends entries to folder B', async () => {
    let resolveOld: (page: OpdsFeedPage) => void = () => undefined
    mocks.fetchPage.mockReset()
      .mockResolvedValueOnce({ entries: [], nextPageUrl: 'https://catalog.example/A/2' })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce({ entries: [{ id: 'B', title: 'B', kind: 'navigation' }] })
    const catalog = { id: 5, name: 'Synthetic', baseUrl: 'https://catalog.example/A', hasCredential: false, isDefault: false, createdAt: new Date(), updatedAt: new Date() }
    const { result } = renderHook(() => useOpdsCatalogBrowse(catalog, 'Root', () => undefined))
    await flush()
    act(() => result.current.loadMore())
    act(() => result.current.navigateTo({ id: 'folder-B', title: 'Folder B', kind: 'navigation', navigationUrl: 'https://catalog.example/B' }))
    await flush()
    expect(result.current.entries.map((entry) => entry.id)).toEqual(['B'])
    await act(async () => resolveOld({ entries: [{ id: 'A-old', title: 'A old', kind: 'navigation' }], nextPageUrl: 'https://catalog.example/A/3' }))
    await flush()
    expect(result.current.entries.map((entry) => entry.id)).toEqual(['B', 'A-old'])
    expect(result.current.hasMore).toBe(true)
  })
})
