import { Capacitor } from '@capacitor/core'
import {
  Purchases,
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from '@revenuecat/purchases-capacitor'
import { errorImportDiagnostic, logImportDiagnostic } from './ImportDiagnostics'

// Identifier do Entitlement criado no painel do RevenueCat.
// Case-sensitive. Mudar aqui se renomear o entitlement no dashboard.
export const PRO_ENTITLEMENT_ID = 'NeoReader Pro'

// Teto de espera por uma resposta de entitlement do RevenueCat antes de
// desistir e tratar como não-Pro (default seguro: nunca liberar feature paga
// sem confirmação). Ver waitForEntitlements.
const ENTITLEMENTS_TIMEOUT_MS = 8_000

export interface BillingStatus {
  // null quando ainda nao inicializou (cold start) ou plugin indisponivel (web sem config).
  isPro: boolean | null
  // Data de renovacao do periodo atual (se assinatura). undefined para free ou entitlement sem expiracao.
  expiresAt: Date | undefined
  // Produto ativo (ex: 'pro_monthly'). undefined se nao tem nada.
  activeProductId: string | undefined
}

type Listener = (status: BillingStatus) => void

const DISABLED_STATUS: BillingStatus = {
  isPro: false,
  expiresAt: undefined,
  activeProductId: undefined,
}

// Singleton de modulo (similar aos outros services do projeto).
let initialized = false
let initInFlight: Promise<void> | null = null
// Promessa persistente para getOffering() aguardar init() mesmo apos initInFlight virar null.
let initSettled: Promise<void> | null = null
let cachedStatus: BillingStatus = { isPro: null, expiresAt: undefined, activeProductId: undefined }
const listeners = new Set<Listener>()

function getApiKey(): string {
  return (import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY ?? '').trim()
}

// Billing so funciona em runtime nativo Android. No web (vite dev / preview) o plugin
// RevenueCat tenta inicializar via fetch e quebra. Detectamos e desabilitamos.
function isBillingAvailable(): boolean {
  if (!getApiKey()) return false
  if (typeof window === 'undefined') return false
  return Capacitor.getPlatform() === 'android'
}

function toBillingStatus(info: CustomerInfo): BillingStatus {
  const entitlement = info.entitlements.active[PRO_ENTITLEMENT_ID]
  if (!entitlement) {
    return { isPro: false, expiresAt: undefined, activeProductId: undefined }
  }
  return {
    isPro: true,
    // expirationDate vem como string ISO. Grants sem expiracao nao trazem data.
    expiresAt: entitlement.expirationDate ? new Date(entitlement.expirationDate) : undefined,
    activeProductId: entitlement.productIdentifier,
  }
}

function emit(next: BillingStatus) {
  cachedStatus = next
  for (const listener of listeners) listener(next)
}

export const BillingService = {
  /** Inicializa o SDK e linka com o uid do Firebase. Idempotente. */
  async init(firebaseUid: string): Promise<void> {
    if (!isBillingAvailable()) {
      logImportDiagnostic('billing', 'billing-init-skipped', { reason: 'unavailable' })
      emit(DISABLED_STATUS)
      return
    }
    if (initialized) {
      // Se ja inicializado, so atualiza o app user id (caso usuario tenha trocado de conta).
      logImportDiagnostic('billing', 'billing-login-start')
      await Purchases.logIn({ appUserID: firebaseUid })
      await BillingService.refresh()
      logImportDiagnostic('billing', 'billing-login-finished')
      return
    }
    if (initInFlight) {
      logImportDiagnostic('billing', 'billing-init-await-existing')
      await initInFlight
      return
    }

    initInFlight = initSettled = (async () => {
      logImportDiagnostic('billing', 'billing-init-start', { dev: import.meta.env.DEV })
      try {
        if (import.meta.env.DEV) {
          await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG })
        }
        await Purchases.configure({
          apiKey: getApiKey(),
          appUserID: firebaseUid,
        })
        // Listener nativo - dispara sempre que o RC recebe novo CustomerInfo (inclui resposta do configure).
        await Purchases.addCustomerInfoUpdateListener((info) => {
          const next = toBillingStatus(info)
          logImportDiagnostic('billing', 'billing-customer-info-updated', {
            isPro: next.isPro,
            activeProductId: next.activeProductId,
          })
          emit(next)
        })
        initialized = true
        logImportDiagnostic('billing', 'billing-init-finished')
        // refresh() em background — não bloqueia initSettled.
        // Se refresh travar (rede lenta/Google Play timeout), getOffering() ainda consegue prosseguir.
        void BillingService.refresh().catch((err) => {
          errorImportDiagnostic('billing', 'billing-refresh-after-init-failed', err)
        })
      } catch (error) {
        errorImportDiagnostic('billing', 'billing-init-failed', error)
        throw error
      }
    })()

    try {
      await initInFlight
    } finally {
      initInFlight = null
    }
  },

  /** Busca o status atual do servidor RevenueCat. */
  async refresh(): Promise<BillingStatus> {
    if (!isBillingAvailable()) {
      logImportDiagnostic('billing', 'billing-refresh-skipped', { reason: 'unavailable' })
      emit(DISABLED_STATUS)
      return DISABLED_STATUS
    }
    logImportDiagnostic('billing', 'billing-refresh-start')
    try {
      const { customerInfo } = await Purchases.getCustomerInfo()
      const next = toBillingStatus(customerInfo)
      emit(next)
      logImportDiagnostic('billing', 'billing-refresh-finished', {
        isPro: next.isPro,
        activeProductId: next.activeProductId,
      })
      return next
    } catch (error) {
      errorImportDiagnostic('billing', 'billing-refresh-failed', error)
      throw error
    }
  },

  /** Devolve a oferta default configurada no painel RevenueCat (pacotes Mensal/Anual/Lifetime). */
  async getOffering(): Promise<PurchasesOffering | null> {
    if (!isBillingAvailable()) return null
    // Aguarda o init() terminar para evitar "SDK not configured" caso o usuario abra o
    // Paywall antes do configure() completar (init e chamado com void no App.tsx).
    // Timeout de 12s garante que o spinner nunca trava se o init travar (ex: rede lenta).
    if (initSettled) {
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 12_000))
      await Promise.race([initSettled.catch(() => undefined), timeout])
    }
    if (!initialized) return null
    logImportDiagnostic('billing', 'billing-offering-start')
    try {
      const result = await Purchases.getOfferings()
      logImportDiagnostic('billing', 'billing-offering-finished', {
        hasCurrent: Boolean(result.current),
        packages: result.current?.availablePackages.length ?? 0,
      })
      return result.current ?? null
    } catch (error) {
      errorImportDiagnostic('billing', 'billing-offering-failed', error)
      throw error
    }
  },

  /** Inicia compra de um package. RC abre o sheet nativo do Google Play. */
  async purchasePackage(pkg: PurchasesPackage): Promise<BillingStatus> {
    if (!isBillingAvailable()) throw new Error('Billing indisponivel neste dispositivo.')
    const packageIdentifier = 'identifier' in pkg
      ? String((pkg as { identifier?: unknown }).identifier ?? '')
      : undefined
    logImportDiagnostic('billing', 'billing-purchase-start', {
      identifier: packageIdentifier,
    })
    const result = await Purchases.purchasePackage({ aPackage: pkg })
    const next = toBillingStatus(result.customerInfo)
    emit(next)
    logImportDiagnostic('billing', 'billing-purchase-finished', {
      isPro: next.isPro,
      activeProductId: next.activeProductId,
    })
    return next
  },

  /** Restaura compras feitas em outro device com a mesma conta Google. */
  async restore(): Promise<BillingStatus> {
    if (!isBillingAvailable()) return DISABLED_STATUS
    logImportDiagnostic('billing', 'billing-restore-start')
    const { customerInfo } = await Purchases.restorePurchases()
    const next = toBillingStatus(customerInfo)
    emit(next)
    logImportDiagnostic('billing', 'billing-restore-finished', {
      isPro: next.isPro,
      activeProductId: next.activeProductId,
    })
    return next
  },

  /** Status cacheado (sincrono). Util para hidratacao inicial sem flicker. */
  getCachedStatus(): BillingStatus {
    return cachedStatus
  },

  /** Subscreve mudancas de status. Devolve unsubscribe. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },

  /** Indica se o billing esta habilitado (api key + plataforma). Util para esconder paywall em dev web. */
  isAvailable(): boolean {
    return isBillingAvailable()
  },

  /**
   * Aguarda o init() terminar. ATENÇÃO: isto cobre apenas o `configure()` do
   * SDK — resolve em ~1ms e NÃO garante que `isPro` já tenha valor, porque o
   * `refresh()` que popula o status roda solto em background (ver init()).
   * Para ler `isPro`, use waitForEntitlements().
   */
  async waitForInit(): Promise<void> {
    if (initSettled) await initSettled.catch(() => undefined)
  },

  /**
   * Aguarda o entitlement ser CONHECIDO (`isPro !== null`), não só o SDK
   * configurado. Quem usava waitForInit() como porta de entrada para ler
   * `isPro` lia `null` na janela de ~500ms entre o configure() e a resposta do
   * refresh() — e `null === true` é `false`, então usuário Pro era tratado
   * como free, silenciosamente.
   *
   * Devolve o status assim que ele existir, ou o status corrente ao estourar
   * o timeout (mantendo o default seguro de negar feature paga sem confirmar).
   */
  async waitForEntitlements(timeoutMs = ENTITLEMENTS_TIMEOUT_MS): Promise<BillingStatus> {
    // Sem billing (web/dev, sem api key) não há o que esperar: init() já
    // emitiu DISABLED_STATUS ou nunca vai emitir nada.
    if (!isBillingAvailable()) return cachedStatus

    await BillingService.waitForInit()
    if (cachedStatus.isPro !== null) return cachedStatus

    // Espera o primeiro emit com status resolvido. `subscribe` devolve o
    // unsubscribe; guardamos numa variável externa para que tanto o timer
    // quanto o listener possam cancelar o outro.
    let unsubscribe: (() => void) | undefined
    const resolved = await new Promise<BillingStatus | null>((resolve) => {
      const timer = setTimeout(() => {
        unsubscribe?.()
        resolve(null)
      }, timeoutMs)

      unsubscribe = BillingService.subscribe((status) => {
        if (status.isPro === null) return
        clearTimeout(timer)
        unsubscribe?.()
        resolve(status)
      })
    })

    if (!resolved) {
      logImportDiagnostic('billing', 'billing-entitlements-timeout', { timeoutMs })
      return cachedStatus
    }

    return resolved
  },
}
