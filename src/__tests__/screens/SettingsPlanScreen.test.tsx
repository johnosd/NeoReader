import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPlanScreen } from '@/screens/SettingsPlanScreen'
import { FeatureQuotaService } from '@/services/FeatureQuotaService'

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

describe('SettingsPlanScreen', () => {
  beforeEach(() => {
    mocks.useEntitlements.mockReturnValue(freeEntitlements())
    FeatureQuotaService.reset()
  })

  it('mostra quotas restantes de Book Intelligence e NYT Discovery', () => {
    FeatureQuotaService.consume('book-intelligence', { isPro: false, subjectKey: 'book:1' })

    render(<SettingsPlanScreen onBack={vi.fn()} onOpenPaywall={vi.fn()} />)

    expect(screen.getByText('Review e Autor')).toBeTruthy()
    expect(screen.getByText(/Restam 4 de 5 livros este mes/)).toBeTruthy()
    expect(screen.getByText('Descubra/NYT')).toBeTruthy()
    expect(screen.getByText(/Restam 5 de 5 atualizacoes este mes/)).toBeTruthy()
  })

  it('mostra badge Ativo pra usuario Pro e abre Paywall ao tocar em NeoReader Pro', () => {
    mocks.useEntitlements.mockReturnValue({
      isPro: true,
      isLoading: false,
      expiresAt: undefined,
      activeProductId: 'pro-lifetime',
      refresh: vi.fn(),
    })
    const onOpenPaywall = vi.fn()

    render(<SettingsPlanScreen onBack={vi.fn()} onOpenPaywall={onOpenPaywall} />)

    expect(screen.getByText('Ativo')).toBeTruthy()
    fireEvent.click(screen.getByText('NeoReader Pro'))
    expect(onOpenPaywall).toHaveBeenCalledTimes(1)
  })
})
