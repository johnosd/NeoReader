import { useEffect, useSyncExternalStore } from 'react'
import { BillingService, type BillingStatus } from '../services/BillingService'

// useSyncExternalStore: hook nativo do React 18+ que liga um store externo ao
// ciclo de render. Faz o componente re-renderizar quando o BillingService emite
// um novo status, sem precisar de Zustand pra este caso simples.
//
// subscribe(listener) -> retorna unsubscribe
// getSnapshot()       -> retorna estado atual (deve ser estavel/cacheado)

function subscribe(listener: () => void): () => void {
  return BillingService.subscribe(listener)
}

function getSnapshot(): BillingStatus {
  return BillingService.getCachedStatus()
}

export interface EntitlementsState {
  /** true: Pro confirmado. false: free. null: ainda nao inicializou (cold start). */
  isPro: boolean | null
  /** Para mostrar data de renovacao em Settings. undefined se lifetime ou free. */
  expiresAt: Date | undefined
  /** Para mostrar "voce tem o plano X" em Settings. */
  activeProductId: string | undefined
  /** true durante a primeira hidratacao. */
  isLoading: boolean
  /** Forca refresh manual (pull-to-refresh ou apos retorno do app). */
  refresh: () => Promise<void>
}

export function useEntitlements(): EntitlementsState {
  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    isPro: status.isPro,
    expiresAt: status.expiresAt,
    activeProductId: status.activeProductId,
    isLoading: status.isPro === null,
    refresh: () => BillingService.refresh().then(() => undefined),
  }
}

/**
 * Atalho para usar em features que tem gate Pro hard (ex: Drive Sync).
 * Usa false durante hidratacao para nao liberar feature antes da confirmacao.
 */
export function useIsPro(): boolean {
  const { isPro } = useEntitlements()
  return isPro === true
}

/**
 * Roda refresh quando o app volta do background. Util para refletir cancelamentos
 * feitos fora do app (ex: usuario abriu Google Play, cancelou, voltou).
 * Use em componentes top-level (ex: SettingsScreen).
 */
export function useRefreshEntitlementsOnFocus(): void {
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void BillingService.refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
}
