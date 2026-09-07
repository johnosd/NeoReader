import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  configure: vi.fn(async () => {}),
  setLogLevel: vi.fn(async () => {}),
  addCustomerInfoUpdateListener: vi.fn(async () => {}),
  getCustomerInfo: vi.fn(),
  logImportDiagnostic: vi.fn(),
  errorImportDiagnostic: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: mocks.getPlatform },
}))

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure: mocks.configure,
    setLogLevel: mocks.setLogLevel,
    addCustomerInfoUpdateListener: mocks.addCustomerInfoUpdateListener,
    getCustomerInfo: mocks.getCustomerInfo,
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
}))

vi.mock('@/services/ImportDiagnostics', () => ({
  logImportDiagnostic: mocks.logImportDiagnostic,
  errorImportDiagnostic: mocks.errorImportDiagnostic,
}))

function customerInfoResult(isPro: boolean) {
  return {
    customerInfo: {
      entitlements: {
        active: isPro ? { 'NeoReader Pro': { productIdentifier: 'pro_monthly' } } : {},
      },
    },
  }
}

// Deixa o event loop girar o suficiente para uma promise que fosse resolver
// "na hora" ter resolvido — usado para provar que waitForEntitlements NÃO
// resolve cedo demais.
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function importService() {
  vi.resetModules()
  vi.stubEnv('VITE_REVENUECAT_ANDROID_API_KEY', 'goog_test_key')
  return import('@/services/BillingService')
}

describe('BillingService.waitForEntitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mocks.getPlatform.mockReturnValue('android')
    mocks.configure.mockResolvedValue(undefined)
    mocks.setLogLevel.mockResolvedValue(undefined)
    mocks.addCustomerInfoUpdateListener.mockResolvedValue(undefined)
  })

  it('resolve imediatamente quando o entitlement ja e conhecido', async () => {
    const { BillingService } = await importService()
    mocks.getCustomerInfo.mockResolvedValue(customerInfoResult(true))

    await BillingService.init('uid-1')
    await BillingService.refresh()

    await expect(BillingService.waitForEntitlements()).resolves.toMatchObject({ isPro: true })
  })

  // Regressão do bug: waitForInit() resolve ~1ms após o configure(), mas isPro
  // só chega com a resposta do refresh(). Quem perguntava nessa janela lia
  // null e tratava usuário Pro como free, sem logar nada.
  it('nao resolve enquanto o refresh nao respondeu (corrida do cold start)', async () => {
    const { BillingService } = await importService()

    let releaseCustomerInfo: () => void = () => {}
    const gate = new Promise<void>((resolve) => { releaseCustomerInfo = resolve })
    mocks.getCustomerInfo.mockImplementation(async () => {
      await gate
      return customerInfoResult(true)
    })

    await BillingService.init('uid-1')

    // waitForInit() já resolveria aqui — e isPro ainda é null.
    await BillingService.waitForInit()
    expect(BillingService.getCachedStatus().isPro).toBeNull()

    let settled = false
    const pending = BillingService.waitForEntitlements(5_000).then((status) => {
      settled = true
      return status
    })

    await flush()
    expect(settled).toBe(false)

    releaseCustomerInfo()
    await expect(pending).resolves.toMatchObject({ isPro: true })
  })

  it('desiste no timeout mantendo o default seguro de nao liberar Pro', async () => {
    const { BillingService } = await importService()
    // Refresh que nunca responde (rede travada).
    mocks.getCustomerInfo.mockImplementation(() => new Promise(() => {}))

    await BillingService.init('uid-1')

    const status = await BillingService.waitForEntitlements(20)

    expect(status.isPro).toBeNull()
    expect(mocks.logImportDiagnostic).toHaveBeenCalledWith(
      'billing',
      'billing-entitlements-timeout',
      { timeoutMs: 20 },
    )
  })

  it('retorna na hora quando billing esta indisponivel, sem esperar o timeout', async () => {
    mocks.getPlatform.mockReturnValue('web')
    const { BillingService } = await importService()

    // Timeout altíssimo: se a espera fosse aplicada, o teste estouraria.
    await expect(BillingService.waitForEntitlements(60_000)).resolves.toMatchObject({
      isPro: null,
    })
  })
})
