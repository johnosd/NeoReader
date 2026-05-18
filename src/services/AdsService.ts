import { Capacitor } from '@capacitor/core'
import {
  AdMob,
  BannerAdPosition,
  BannerAdSize,
  MaxAdContentRating,
} from '@capacitor-community/admob'
import { BillingService } from './BillingService'
import { isImportInProgress } from './ImportCoordinator'
import { errorImportDiagnostic, logImportDiagnostic } from './ImportDiagnostics'

// Test ad unit oficial do Google para Android banner. Usado em DEV para evitar
// risco de ban por cliques na conta de producao.
// https://developers.google.com/admob/android/test-ads
const ANDROID_TEST_BANNER_UNIT = 'ca-app-pub-3940256099942544/6300978111'

function getBannerUnitId(): string {
  if (import.meta.env.DEV) return ANDROID_TEST_BANNER_UNIT
  const id = (import.meta.env.VITE_ADMOB_BANNER_UNIT_ID_ANDROID ?? '').trim()
  return id || ANDROID_TEST_BANNER_UNIT
}

function isAdsAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (Capacitor.getPlatform() !== 'android') return false
  // Sem App ID configurado no manifest, o AdMob crasha no initialize.
  // Em produção isso vem do AndroidManifest.xml; aqui só sinalizamos a intent.
  const appId = (import.meta.env.VITE_ADMOB_APP_ID_ANDROID ?? '').trim()
  return Boolean(appId)
}

let initialized = false
let initInFlight: Promise<void> | null = null
let bannerShown = false
let currentMarginDp = 0

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return ''
}

function isMissingBannerError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes('banner') && (
    message.includes('never shown') ||
    message.includes('not shown') ||
    message.includes('not visible') ||
    message.includes('no banner')
  )
}

export interface ShowBannerOptions {
  /** Distancia em dp entre o banner e a borda inferior da tela.
   * Use 64 nas telas com BottomNav para o banner ficar acima dela. */
  marginDp?: number
}

export const AdsService = {
  isAvailable(): boolean {
    return isAdsAvailable()
  },

  /**
   * Inicializa o SDK do AdMob. Idempotente. Chamar uma vez no bootstrap
   * (App.tsx, após login). Em web/dev sem app id, vira no-op silencioso.
   */
  async init(): Promise<void> {
    if (!isAdsAvailable()) {
      logImportDiagnostic('ads', 'ads-init-skipped', { reason: 'unavailable' })
      return
    }
    if (initialized) {
      logImportDiagnostic('ads', 'ads-init-skipped', { reason: 'already-initialized' })
      return
    }
    if (initInFlight) {
      logImportDiagnostic('ads', 'ads-init-await-existing')
      await initInFlight
      return
    }
    initInFlight = (async () => {
      logImportDiagnostic('ads', 'ads-init-start', {
        dev: import.meta.env.DEV,
      })
      try {
        await AdMob.initialize({
          initializeForTesting: import.meta.env.DEV,
          // Conteudo do app eh leitura - rating "Teen" eh seguro e permite anuncios mais relevantes.
          maxAdContentRating: MaxAdContentRating.Teen,
        })
        initialized = true
        logImportDiagnostic('ads', 'ads-init-finished')
      } catch (error) {
        errorImportDiagnostic('ads', 'ads-init-failed', error)
        throw error
      }
    })()
    try {
      await initInFlight
    } finally {
      initInFlight = null
    }
  },

  /**
   * Mostra o banner adaptativo na parte de baixo da tela.
   * Checa o status Pro - se for Pro, nao faz nada.
   * Se ja exibido com a mesma margin, vira no-op. Se a margin mudou (troca de tela
   * com BottomNav vs sem), recria o banner com a nova margin.
   */
  async showBanner(options: ShowBannerOptions = {}): Promise<void> {
    if (!isAdsAvailable()) {
      logImportDiagnostic('ads', 'ads-show-skipped', { reason: 'unavailable' })
      return
    }
    if (BillingService.getCachedStatus().isPro) {
      logImportDiagnostic('ads', 'ads-show-skipped', { reason: 'pro-user' })
      return
    }
    if (isImportInProgress()) {
      logImportDiagnostic('ads', 'ads-show-skipped', { reason: 'import-active' })
      return
    }
    if (!initialized) await AdsService.init()

    const marginDp = options.marginDp ?? 0
    if (bannerShown && marginDp === currentMarginDp) {
      logImportDiagnostic('ads', 'ads-show-skipped', { reason: 'already-visible', marginDp })
      return
    }
    if (bannerShown) {
      try { await AdMob.removeBanner() } catch { /* ignora */ }
      bannerShown = false
    }

    logImportDiagnostic('ads', 'ads-show-start', { marginDp, dev: import.meta.env.DEV })
    try {
      await AdMob.showBanner({
        adId: getBannerUnitId(),
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        // margin em dp: distancia do banner ate o bottom da tela.
        // 64 = altura da BottomNav. Em telas sem nav, 0.
        margin: marginDp,
        isTesting: import.meta.env.DEV,
      })
      bannerShown = true
      currentMarginDp = marginDp
      logImportDiagnostic('ads', 'ads-show-finished', { marginDp })
    } catch (error) {
      errorImportDiagnostic('ads', 'ads-show-failed', error, { marginDp })
      throw error
    }
  },

  /**
   * Esconde o banner sem destruir - rapido pra re-mostrar depois.
   */
  async hideBanner(): Promise<void> {
    if (!isAdsAvailable()) {
      logImportDiagnostic('ads', 'ads-hide-skipped', { reason: 'unavailable' })
      return
    }
    if (!bannerShown) {
      logImportDiagnostic('ads', 'ads-hide-skipped', { reason: 'not-visible' })
      return
    }
    logImportDiagnostic('ads', 'ads-hide-start')
    try {
      await AdMob.hideBanner()
      bannerShown = false
      logImportDiagnostic('ads', 'ads-hide-finished')
    } catch (error) {
      if (isMissingBannerError(error)) {
        bannerShown = false
        logImportDiagnostic('ads', 'ads-hide-skipped', { reason: 'native-banner-missing' })
        return
      }
      errorImportDiagnostic('ads', 'ads-hide-failed', error)
      throw error
    }
  },

  /**
   * Destroi o banner completamente. Use ao trocar de tela onde nao queremos ad.
   */
  async removeBanner(): Promise<void> {
    if (!isAdsAvailable() || !bannerShown) return
    logImportDiagnostic('ads', 'ads-remove-start')
    try {
      await AdMob.removeBanner()
      logImportDiagnostic('ads', 'ads-remove-finished')
    } catch (error) {
      if (isMissingBannerError(error)) {
        logImportDiagnostic('ads', 'ads-remove-skipped', { reason: 'native-banner-missing' })
      } else {
        errorImportDiagnostic('ads', 'ads-remove-failed', error)
      }
      // Remocao de banner nao pode quebrar fluxo de tela/importacao.
    }
    bannerShown = false
  },
}
