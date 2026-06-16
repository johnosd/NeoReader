import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PaywallScreen } from '@/screens/PaywallScreen'

const mocks = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  getOffering: vi.fn(),
  purchasePackage: vi.fn(),
  restore: vi.fn(),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}))

vi.mock('@/services/BillingService', () => ({
  BillingService: {
    isAvailable: mocks.isAvailable,
    getOffering: mocks.getOffering,
    purchasePackage: mocks.purchasePackage,
    restore: mocks.restore,
  },
}))

function packageFixture(
  packageType: 'MONTHLY' | 'ANNUAL' | 'LIFETIME',
  identifier: string,
  priceString: string,
  subscriptionPeriod: string | null,
  pricePerMonthString: string | null = null,
) {
  return {
    identifier: `$rc_${packageType.toLowerCase()}`,
    packageType,
    offeringIdentifier: 'default',
    presentedOfferingContext: { offeringIdentifier: 'default', placementIdentifier: null, targetingContext: null },
    product: {
      identifier,
      title: identifier,
      description: identifier,
      price: 0,
      priceString,
      pricePerMonthString,
      subscriptionPeriod,
    },
  }
}

const monthlyPackage = packageFixture('MONTHLY', 'pro_monthly', 'R$ 4,90', 'P1M')
const annualPackage = packageFixture('ANNUAL', 'pro_annual', 'R$ 39,90', 'P1Y', 'R$ 3,33')
const lifetimePackage = packageFixture('LIFETIME', 'pro_lifetime', 'R$ 99,90', null)

function offeringFixture() {
  return {
    identifier: 'default',
    serverDescription: 'Default',
    metadata: {},
    monthly: monthlyPackage,
    annual: annualPackage,
    lifetime: lifetimePackage,
    sixMonth: null,
    threeMonth: null,
    twoMonth: null,
    weekly: null,
    availablePackages: [monthlyPackage, annualPackage, lifetimePackage],
  }
}

describe('PaywallScreen', () => {
  beforeEach(() => {
    mocks.isAvailable.mockReturnValue(true)
    mocks.getOffering.mockResolvedValue(offeringFixture())
    mocks.purchasePackage.mockResolvedValue({ isPro: true, expiresAt: new Date(), activeProductId: 'pro_monthly' })
    mocks.restore.mockResolvedValue({ isPro: true, expiresAt: new Date(), activeProductId: 'pro_monthly' })
    vi.clearAllMocks()
  })

  it('carrega somente os planos mensal e anual do offering', async () => {
    render(<PaywallScreen onBack={vi.fn()} />)

    expect(await screen.findByText('Mensal')).toBeTruthy()
    expect(screen.getByText('Anual')).toBeTruthy()
    expect(screen.getByText('R$ 4,90')).toBeTruthy()
    expect(screen.getByText('R$ 39,90')).toBeTruthy()
    expect(screen.getByText('Equivale a R$ 3,33/mes')).toBeTruthy()
    expect(screen.queryByText(/Vitalicio/i)).toBeNull()
  })

  it('compra o package mensal e mostra sucesso quando o entitlement ativa', async () => {
    render(<PaywallScreen onBack={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: /Assinar mensal/i }))

    await waitFor(() => expect(mocks.purchasePackage).toHaveBeenCalledWith(monthlyPackage))
    expect(await screen.findByText('NeoReader Pro ativado.')).toBeTruthy()
  })

  it('restaura compras pelo BillingService', async () => {
    render(<PaywallScreen onBack={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: /Restaurar compra/i }))

    await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Compra Pro restaurada.')).toBeTruthy()
  })

  it('mostra aviso seguro quando billing esta indisponivel', async () => {
    mocks.isAvailable.mockReturnValue(false)

    render(<PaywallScreen onBack={vi.fn()} />)

    expect(await screen.findByText('Compras indisponiveis neste ambiente')).toBeTruthy()
    expect(mocks.getOffering).not.toHaveBeenCalled()
  })
})
