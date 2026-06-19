import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeScreen } from '@/screens/HomeScreen'

const mocks = vi.hoisted(() => ({
  isPro: null as boolean | null,
  onOpenBook: vi.fn(),
  onOpenBiblioteca: vi.fn(),
  onOpenDiscover: vi.fn(),
  onOpenProfile: vi.fn(),
  onOpenSettings: vi.fn(),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
    minimizeApp: vi.fn(async () => undefined),
  },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}))

vi.mock('@/components/BottomNav', () => ({
  BottomNav: () => <nav data-testid="bottom-nav" />,
}))

vi.mock('@/components/QuickBookActionsSheet', () => ({
  QuickBookActionsSheet: () => null,
}))

vi.mock('@/hooks/useCapacitorAppListener', () => ({
  useCapacitorBackButton: vi.fn(),
}))

vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => ({
    isPro: mocks.isPro,
    expiresAt: undefined,
    activeProductId: undefined,
    isLoading: mocks.isPro === null,
    refresh: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/hooks/useImportActivity', () => ({
  useIsImportActive: () => false,
}))

vi.mock('@/hooks/useLibraryGroups', () => ({
  useLibraryGroups: () => ({
    isLoading: false,
    isEmpty: true,
    heroBook: null,
    inProgressBooks: [],
    recentBooks: [],
  }),
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/services/BookImportService', () => ({
  BookImportService: {
    importEpub: vi.fn(),
    importNativeEpub: vi.fn(),
    isImportInProgress: vi.fn(() => false),
  },
}))

vi.mock('@/services/ImportDiagnostics', () => ({
  logImportDiagnostic: vi.fn(),
}))

vi.mock('@/services/NativeLibraryImportService', () => ({
  consumePendingNativeFileSelection: vi.fn(async () => null),
  selectNativeEpubFile: vi.fn(async () => null),
}))

function renderHome(isPro: boolean | null) {
  mocks.isPro = isPro
  return render(
    <HomeScreen
      onOpenBook={mocks.onOpenBook}
      onOpenBiblioteca={mocks.onOpenBiblioteca}
      onOpenDiscover={mocks.onOpenDiscover}
      onOpenProfile={mocks.onOpenProfile}
      onOpenSettings={mocks.onOpenSettings}
    />,
  )
}

describe('HomeScreen Pro badge', () => {
  beforeEach(() => {
    mocks.isPro = null
    mocks.onOpenBook.mockClear()
    mocks.onOpenBiblioteca.mockClear()
    mocks.onOpenDiscover.mockClear()
    mocks.onOpenProfile.mockClear()
    mocks.onOpenSettings.mockClear()
  })

  it('mostra a marca PRO quando o entitlement esta confirmado', () => {
    const { container } = renderHome(true)

    expect(screen.getByText('PRO')).toBeTruthy()
    expect(container.querySelector('[aria-label="NeoReader Pro"]')).toBeTruthy()
  })

  it('nao mostra a marca PRO quando o usuario nao e Pro', () => {
    const { container } = renderHome(false)

    expect(screen.queryByText('PRO')).toBeNull()
    expect(container.querySelector('[aria-label="NeoReader"]')).toBeTruthy()
  })

  it('nao mostra a marca PRO enquanto o entitlement ainda esta carregando', () => {
    const { container } = renderHome(null)

    expect(screen.queryByText('PRO')).toBeNull()
    expect(container.querySelector('[aria-label="NeoReader"]')).toBeTruthy()
  })
})
