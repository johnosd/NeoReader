import { Capacitor } from '@capacitor/core'
import {
  Purchases,
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from '@revenuecat/purchases-capacitor'

// Identifier do Entitlement criado no painel do RevenueCat.
// Case-sensitive. Mudar aqui se renomear o entitlement no dashboard.
export const PRO_ENTITLEMENT_ID = 'NeoReader Pro'

export interface BillingStatus {
  // null quando ainda nao inicializou (cold start) ou plugin indisponivel (web sem config).
  isPro: boolean | null
  // Data de renovacao do periodo atual (se assinatura). undefined para lifetime ou free.
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
    // expirationDate vem como string ISO. Lifetime nao tem expiracao.
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
      emit(DISABLED_STATUS)
      return
    }
    if (initialized) {
      // Se ja inicializado, so atualiza o app user id (caso usuario tenha trocado de conta).
      await Purchases.logIn({ appUserID: firebaseUid })
      await BillingService.refresh()
      return
    }
    if (initInFlight) {
      await initInFlight
      return
    }

    initInFlight = (async () => {
      if (import.meta.env.DEV) {
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG })
      }
      await Purchases.configure({
        apiKey: getApiKey(),
        appUserID: firebaseUid,
      })
      // Listener nativo - dispara sempre que o RC recebe novo CustomerInfo.
      await Purchases.addCustomerInfoUpdateListener((info) => {
        emit(toBillingStatus(info))
      })
      initialized = true
      await BillingService.refresh()
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
      emit(DISABLED_STATUS)
      return DISABLED_STATUS
    }
    const { customerInfo } = await Purchases.getCustomerInfo()
    const next = toBillingStatus(customerInfo)
    emit(next)
    return next
  },

  /** Devolve a oferta default configurada no painel RevenueCat (pacotes Mensal/Anual/Lifetime). */
  async getOffering(): Promise<PurchasesOffering | null> {
    if (!isBillingAvailable()) return null
    const result = await Purchases.getOfferings()
    return result.current ?? null
  },

  /** Inicia compra de um package. RC abre o sheet nativo do Google Play. */
  async purchasePackage(pkg: PurchasesPackage): Promise<BillingStatus> {
    if (!isBillingAvailable()) throw new Error('Billing indisponivel neste dispositivo.')
    const result = await Purchases.purchasePackage({ aPackage: pkg })
    const next = toBillingStatus(result.customerInfo)
    emit(next)
    return next
  },

  /** Restaura compras feitas em outro device com a mesma conta Google. */
  async restore(): Promise<BillingStatus> {
    if (!isBillingAvailable()) return DISABLED_STATUS
    const { customerInfo } = await Purchases.restorePurchases()
    const next = toBillingStatus(customerInfo)
    emit(next)
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
}
