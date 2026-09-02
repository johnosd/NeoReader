import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from '@/screens/SettingsScreen'

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}))

const mocks = vi.hoisted(() => ({
  useEntitlements: vi.fn(),
}))

vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: mocks.useEntitlements,
  useRefreshEntitlementsOnFocus: () => undefined,
}))

function freeEntitlements() {
  return {
    isPro: false,
    isLoading: false,
    expiresAt: undefined,
    activeProductId: undefined,
    refresh: vi.fn(),
  }
}

function renderSettingsScreen(overrides: Partial<Record<
  'onBack' | 'onOpenPlan' | 'onOpenLanguage' | 'onOpenAppearance' | 'onOpenWordLens'
  | 'onOpenNarration' | 'onOpenIntegrations' | 'onOpenOpdsCatalogs' | 'onOpenSync',
  () => void
>> = {}) {
  return render(
    <SettingsScreen
      onBack={vi.fn()}
      onOpenPlan={vi.fn()}
      onOpenLanguage={vi.fn()}
      onOpenAppearance={vi.fn()}
      onOpenWordLens={vi.fn()}
      onOpenNarration={vi.fn()}
      onOpenIntegrations={vi.fn()}
      onOpenOpdsCatalogs={vi.fn()}
      onOpenSync={vi.fn()}
      {...overrides}
    />,
  )
}

describe('SettingsScreen (menu de categorias)', () => {
  beforeEach(() => {
    mocks.useEntitlements.mockReturnValue(freeEntitlements())
  })

  it('mostra as 8 categorias clicaveis no menu principal, incluindo Plano', () => {
    renderSettingsScreen()

    expect(screen.getByText('Plano')).toBeTruthy()
    expect(screen.getByText('Idioma')).toBeTruthy()
    expect(screen.getByText('Aparencia')).toBeTruthy()
    expect(screen.getByText('Word Lens')).toBeTruthy()
    expect(screen.getByText('Narracao')).toBeTruthy()
    expect(screen.getByText('Integracoes')).toBeTruthy()
    expect(screen.getByText('Catalogos OPDS')).toBeTruthy()
    expect(screen.getByText('Sincronizacao na nuvem')).toBeTruthy()
  })

  it('mostra badge Free ou PRO na linha Plano conforme o entitlement do usuario', () => {
    renderSettingsScreen()
    expect(screen.getByText('Free')).toBeTruthy()

    mocks.useEntitlements.mockReturnValue({
      isPro: true,
      isLoading: false,
      expiresAt: undefined,
      activeProductId: 'pro-lifetime',
      refresh: vi.fn(),
    })
    renderSettingsScreen()
    expect(screen.getByText('PRO')).toBeTruthy()
  })

  it('toca em cada categoria e dispara o callback onOpen* correspondente', () => {
    const onOpenPlan = vi.fn()
    const onOpenLanguage = vi.fn()
    const onOpenAppearance = vi.fn()
    const onOpenWordLens = vi.fn()
    const onOpenNarration = vi.fn()
    const onOpenIntegrations = vi.fn()
    const onOpenOpdsCatalogs = vi.fn()
    const onOpenSync = vi.fn()

    renderSettingsScreen({
      onOpenPlan,
      onOpenLanguage,
      onOpenAppearance,
      onOpenWordLens,
      onOpenNarration,
      onOpenIntegrations,
      onOpenOpdsCatalogs,
      onOpenSync,
    })

    fireEvent.click(screen.getByText('Plano'))
    expect(onOpenPlan).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Idioma'))
    expect(onOpenLanguage).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Aparencia'))
    expect(onOpenAppearance).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Word Lens'))
    expect(onOpenWordLens).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Narracao'))
    expect(onOpenNarration).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Integracoes'))
    expect(onOpenIntegrations).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Catalogos OPDS'))
    expect(onOpenOpdsCatalogs).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Sincronizacao na nuvem'))
    expect(onOpenSync).toHaveBeenCalledTimes(1)
  })
})
