import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: vi.fn(() => ({})),
  WebPlugin: class {},
}))

vi.mock('@/hooks/useLibraryCatalog', () => ({
  useLibraryCatalog: () => ({
    isLoading: false,
    books: [],
    filteredBooks: [],
    tags: [],
    collections: [],
    search: '',
    setSearch: vi.fn(),
    activeFilter: 'all',
    setActiveFilter: vi.fn(),
    sort: 'recent',
    setSort: vi.fn(),
  }),
}))

vi.mock('@/hooks/useImportActivity', () => ({
  useIsImportActive: () => false,
}))

vi.mock('@/hooks/useCapacitorAppListener', () => ({
  useCapacitorBackButton: () => undefined,
}))

vi.mock('@/services/NativeLibraryImportService', () => ({
  consumePendingNativeFolderSelection: vi.fn().mockResolvedValue(null),
  consumePendingNativeFileSelection: vi.fn().mockResolvedValue(null),
  selectNativeEpubFolder: vi.fn().mockResolvedValue(null),
  selectNativeEpubFile: vi.fn().mockResolvedValue(null),
}))

import { LibraryScreen } from '@/screens/LibraryScreen'

describe('LibraryScreen (empty state)', () => {
  it('mostra o atalho de baixar classico gratis e chama onOpenDiscover ao tocar', () => {
    const onOpenDiscover = vi.fn()

    render(
      <LibraryScreen
        onOpenBook={vi.fn()}
        onOpenHome={vi.fn()}
        onOpenDiscover={onOpenDiscover}
        onOpenProfile={vi.fn()}
      />,
    )

    const shortcut = screen.getByText('Baixar um classico gratis')
    fireEvent.click(shortcut)

    expect(onOpenDiscover).toHaveBeenCalledTimes(1)
  })
})
