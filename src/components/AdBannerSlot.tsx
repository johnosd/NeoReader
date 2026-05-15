import { useEffect } from 'react'
import { AdsService } from '../services/AdsService'
import { logImportDiagnostic } from '../services/ImportDiagnostics'
import { useEntitlements } from '../hooks/useEntitlements'
import { useIsImportActive } from '../hooks/useImportActivity'

// Altura aproximada do banner adaptativo no Android (50-60dp tipico).
const BANNER_HEIGHT_PX = 60

interface AdBannerSlotProps {
  /** Margin em dp acima da borda inferior da tela.
   * Use 64 em telas com BottomNav para o banner ficar acima dela.
   * Default 0 (banner colado no bottom). */
  marginAboveBottomDp?: number
  suspended?: boolean
}

/**
 * Componente que controla o ciclo de vida do banner ad para a tela em que esta montado.
 * - Em telas onde aparece: <AdBannerSlot /> no final do scroll/container.
 * - Em telas onde NAO deve aparecer (reader, paywall, login): nao monte o slot.
 *
 * AdMob renderiza o banner como overlay nativo (nao DOM), entao este componente
 * serve para:
 * 1. Disparar showBanner/hideBanner conforme o componente monta/desmonta.
 * 2. Reservar espaco visual equivalente para evitar conteudo escondido atras do banner.
 */
export function AdBannerSlot({ marginAboveBottomDp = 0, suspended = false }: AdBannerSlotProps = {}) {
  const { isPro, isLoading } = useEntitlements()
  const importActive = useIsImportActive()
  const isSuspended = suspended || importActive

  useEffect(() => {
    // Enquanto status nao confirmou, nao mostramos nada - evita flash de banner antes
    // do RevenueCat responder. isPro permanece null no cold start.
    if (isLoading) return

    if (isSuspended) {
      logImportDiagnostic('ads', 'ad-banner-slot-suspended', { marginAboveBottomDp, importActive })
      void AdsService.hideBanner()
      return
    }

    if (isPro) {
      logImportDiagnostic('ads', 'ad-banner-slot-pro-hidden', { marginAboveBottomDp })
      void AdsService.hideBanner()
      return
    }

    logImportDiagnostic('ads', 'ad-banner-slot-show-requested', { marginAboveBottomDp })
    void AdsService.showBanner({ marginDp: marginAboveBottomDp })

    return () => {
      // Ao desmontar (trocar de tela), escondemos o banner.
      // Outra tela com AdBannerSlot vai re-mostrar via seu proprio effect.
      logImportDiagnostic('ads', 'ad-banner-slot-unmounted', { marginAboveBottomDp })
      void AdsService.hideBanner()
    }
  }, [isPro, isLoading, marginAboveBottomDp, isSuspended, importActive])

  // Reservamos a altura sempre - o banner nativo do AdMob eh overlay, nao DOM,
  // entao quem da o "padding-bottom" pro conteudo somos nos. Mesmo em Pro reservamos
  // pra evitar layout shift quando o status muda em runtime.
  return <div style={{ height: BANNER_HEIGHT_PX }} aria-hidden="true" />
}
