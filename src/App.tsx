import { useEffect, useState, type ReactNode } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { HomeScreen } from './screens/HomeScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { BookDetailsScreen } from './screens/BookDetailsScreen'
import { ReaderScreen } from './screens/ReaderScreen'
import { VocabularyScreen } from './screens/VocabularyScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SettingsPlanScreen } from './screens/SettingsPlanScreen'
import { SettingsLanguageScreen } from './screens/SettingsLanguageScreen'
import { SettingsAppearanceScreen } from './screens/SettingsAppearanceScreen'
import { SettingsWordLensScreen } from './screens/SettingsWordLensScreen'
import { SettingsNarrationScreen } from './screens/SettingsNarrationScreen'
import { SettingsIntegrationsScreen } from './screens/SettingsIntegrationsScreen'
import { SettingsSyncScreen } from './screens/SettingsSyncScreen'
import { OpdsCatalogSettingsScreen } from './screens/OpdsCatalogSettingsScreen'
import { OpdsCatalogBrowseScreen } from './screens/OpdsCatalogBrowseScreen'
import { PublicDomainCatalogScreen } from './screens/PublicDomainCatalogScreen'
import { DiscoverScreen } from './screens/DiscoverScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'
import { LoginScreen } from './screens/LoginScreen'
import { PaywallScreen } from './screens/PaywallScreen'
import { ErrorBoundary, Spinner, Toast } from './components/ui'
import { useAuth } from './hooks/useAuth'
import { AdsService } from './services/AdsService'
import { BillingService } from './services/BillingService'
import { BookImportService } from './services/BookImportService'
import {
  addExternalEpubIntentListener,
  cleanupNativeImportTemp,
  consumePendingExternalEpubIntent,
} from './services/NativeLibraryImportService'
import { createFlowId, getDiagnosticsNowMs, logEvent } from './services/DiagnosticsLogger'
import { cleanupExpiredTtsVoiceCaches } from './db/ttsVoiceCaches'
import { getBookById } from './db/books'
import { scheduleVocabularyDriveSync } from './services/VocabularyDriveSyncService'
import { clearWordLensDictionaryPartitionsCache } from './services/WordLensDataService'
import type { Book } from './types/book'
import type { LibraryFilter } from './hooks/useLibraryCatalog'

type Route =
  | { name: 'home' }
  | { name: 'library'; initialFilter?: LibraryFilter }
  | { name: 'book-details'; book: Book }
  | { name: 'reader'; book: Book; startHref?: string; readerOpenFlowId?: string; readerOpenStartedAt?: number }
  | { name: 'vocabulary'; bookId?: number }
  | { name: 'discover' }
  | { name: 'profile' }
  | { name: 'settings' }
  | { name: 'settings-plan' }
  | { name: 'settings-language' }
  | { name: 'settings-appearance' }
  | { name: 'settings-word-lens' }
  | { name: 'settings-narration' }
  | { name: 'settings-integrations' }
  | { name: 'settings-sync' }
  | { name: 'opds-catalog-settings' }
  | { name: 'opds-catalog-browse'; catalogId: number; initialFolder?: { title: string; url: string } }
  | { name: 'public-domain-catalog' }
  | { name: 'paywall' }

const WELCOME_SEEN_KEY = 'neoreader:welcome-seen'

function getWelcomeSeen() {
  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function setWelcomeSeen() {
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, '1')
  } catch {
    // localStorage pode estar indisponivel em ambientes restritos; o fluxo continua em memoria.
  }
}

function App() {
  const auth = useAuth()
  const [authScreen, setAuthScreen] = useState<'welcome' | 'login'>(() => (
    getWelcomeSeen() ? 'login' : 'welcome'
  ))
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }])
  const [externalImporting, setExternalImporting] = useState(false)
  const [externalImportError, setExternalImportError] = useState<string | null>(null)
  const [externalIntentSignal, setExternalIntentSignal] = useState(0)
  const current = stack[stack.length - 1]

  const push = (route: Route) => setStack((prev) => [...prev, route])
  const pop = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  const openHome = () => setStack([{ name: 'home' }])
  const openLibrary = (initialFilter?: LibraryFilter) => setStack([{ name: 'home' }, { name: 'library', initialFilter }])
  const openDiscover = () => setStack([{ name: 'home' }, { name: 'discover' }])
  const openProfile = () => setStack([{ name: 'home' }, { name: 'profile' }])

  // Inicializa Billing (RevenueCat) e Ads (AdMob) apos o login Firebase.
  // Billing usa uid como appUserID. Ambos viram no-op silencioso em web/dev
  // sem env keys configuradas.
  const signedInUid = auth.state.status === 'signed-in' ? auth.state.user.uid : null
  useEffect(() => {
    if (!signedInUid) return
    void BillingService.init(signedInUid).catch((err) => {
      console.warn('[Billing] Falha ao inicializar:', err)
    })
    void AdsService.init().catch((err) => {
      console.warn('[Ads] Falha ao inicializar:', err)
    })
    void cleanupExpiredTtsVoiceCaches().catch((err) => {
      console.warn('[TTS] Falha ao limpar cache de vozes:', err)
    })
    // Sincroniza vocabulário imediatamente ao logar — garante status 'connected'
    // mesmo antes do usuário adicionar ou deletar palavras.
    scheduleVocabularyDriveSync()
  }, [signedInUid])

  // Garante que cada conta usa seu próprio banco IndexedDB.
  // Quando o uid muda, grava o novo uid no localStorage e recarrega —
  // o banco é escolhido em database.ts antes do React renderizar.
  //
  // Lógica de banco legado (backward compat com usuários antes do update):
  //   - rawStoredUid === null → primeira abertura após update (ou install limpo)
  //     → o banco atual é 'NeoReaderDB' (legado, pode ter dados do usuário)
  //     → ao detectar o uid, gravamos 'neoreader:db-name:{uid}' = 'NeoReaderDB'
  //       para que esse usuário continue abrindo o banco legado nas próximas cargas.
  //   - rawStoredUid !== null → já inicializado, usa o banco mapeado normalmente.
  const authStatus = auth.state.status
  useEffect(() => {
    if (authStatus === 'loading') return
    const currentUid = signedInUid ?? 'guest'
    const rawStoredUid = localStorage.getItem('neoreader:active-uid')
    const storedUid = rawStoredUid ?? 'guest'
    if (storedUid !== currentUid) {
      if (rawStoredUid === null) {
        // Primeira inicialização: DB já é NeoReaderDB, só salvar o mapeamento.
        // NÃO recarregar — interromperia o fluxo de login e zeraria o token Drive,
        // causando double-login e quebrando todos os syncs.
        if (currentUid !== 'guest') {
          localStorage.setItem(`neoreader:db-name:${currentUid}`, 'NeoReaderDB')
          localStorage.setItem('neoreader:active-uid', currentUid)
        }
        return
      }
      // Troca de conta ou logout: recarregar para abrir o banco correto.
      localStorage.setItem('neoreader:active-uid', currentUid)
      window.location.reload()
    }
  }, [authStatus, signedInUid])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    void cleanupNativeImportTemp().catch(() => undefined)

    let disposed = false
    const listenerPromise = CapApp.addListener('appStateChange', (state) => {
      if (!disposed && !state.isActive) {
        BookImportService.cancelActiveImport('app-backgrounded')
        // App em background: libera o cache de partições do dicionário do
        // Word Lens (não tinha nenhum gatilho de liberação fora de testes).
        clearWordLensDictionaryPartitionsCache()
      }
    })

    return () => {
      disposed = true
      void listenerPromise
        .then((listener) => listener.remove())
        .catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let disposed = false
    let listener: { remove: () => Promise<void> } | null = null
    void addExternalEpubIntentListener(() => {
      if (!disposed) setExternalIntentSignal((value) => value + 1)
    })
      .then((handle) => {
        listener = handle
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      void Promise.resolve(listener?.remove()).catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || authStatus !== 'signed-in') return

    let active = true
    void (async () => {
      if (BookImportService.isImportInProgress()) return

      const nativeFile = await consumePendingExternalEpubIntent()
      if (!active || !nativeFile) return

      setExternalImporting(true)
      setExternalImportError(null)
      try {
        const bookId = await BookImportService.importNativeEpub(nativeFile, { importSource: 'local' })
        const book = await getBookById(bookId)
        if (!active) return
        if (!book) throw new Error('Livro importado nao encontrado.')

        const flowId = createFlowId('reader-open')
        const startedAt = getDiagnosticsNowMs()
        logEvent('reader.open.start', {
          flowId,
          screen: 'external-epub-intent',
          status: 'start',
          details: {
            bookId: book.id,
            storageMode: book.storageMode,
            hasStartHref: false,
            targetType: 'saved-progress',
          },
        })
        setStack((prev) => [...prev, { name: 'reader', book, readerOpenFlowId: flowId, readerOpenStartedAt: startedAt }])
      } catch (error) {
        if (active) setExternalImportError(externalImportErrorMessage(error))
      } finally {
        if (active) setExternalImporting(false)
      }
    })().catch((error) => {
      if (active) setExternalImportError(externalImportErrorMessage(error))
    })

    return () => {
      active = false
    }
  }, [authStatus, externalIntentSignal])

  function completeWelcome() {
    setWelcomeSeen()
    setAuthScreen('login')
  }

  function openReader(book: Book, startHref?: string) {
    const flowId = createFlowId('reader-open')
    const startedAt = getDiagnosticsNowMs()
    logEvent('reader.open.start', {
      flowId,
      screen: 'book-details',
      status: 'start',
      details: {
        bookId: book.id,
        storageMode: book.storageMode,
        hasStartHref: Boolean(startHref),
        targetType: startHref?.startsWith('epubcfi(') ? 'cfi' : startHref ? 'href' : 'saved-progress',
      },
    })
    push({ name: 'reader', book, startHref, readerOpenFlowId: flowId, readerOpenStartedAt: startedAt })
  }

  function renderWithExternalImportFeedback(content: ReactNode) {
    return (
      <>
        {content}
        {externalImporting && (
          <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-bg-base/70">
            <Spinner tone="purple" label="Importando EPUB" />
          </div>
        )}
        {externalImportError && (
          <Toast tone="error" durationMs={6000} onDismiss={() => setExternalImportError(null)}>
            {externalImportError}
          </Toast>
        )}
      </>
    )
  }

  if (auth.state.status === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-base">
        <Spinner tone="purple" label="Carregando" />
      </div>
    )
  }

  if (auth.state.status !== 'signed-in') {
    if (authScreen === 'welcome') {
      return (
        <ErrorBoundary key="welcome" screen="welcome">
          <WelcomeScreen onComplete={completeWelcome} />
        </ErrorBoundary>
      )
    }

    return (
      <ErrorBoundary key="login" screen="login">
        <LoginScreen
          configured={auth.state.configured}
          error={auth.state.error}
          onSignInWithGoogle={auth.signInWithGoogle}
        />
      </ErrorBoundary>
    )
  }

  return renderWithExternalImportFeedback((() => {
    switch (current.name) {
    case 'book-details':
      return (
        <ErrorBoundary key="book-details" screen="book-details">
          <BookDetailsScreen
            book={current.book}
            onBack={pop}
            onRead={openReader}
            onOpenSettings={() => push({ name: 'settings' })}
            onOpenPaywall={() => push({ name: 'paywall' })}
          />
        </ErrorBoundary>
      )

    case 'reader':
      return (
        <ErrorBoundary key="reader" screen="reader">
          <ReaderScreen
            book={current.book}
            startHref={current.startHref}
            readerOpenFlowId={current.readerOpenFlowId}
            readerOpenStartedAt={current.readerOpenStartedAt}
            onBack={pop}
            onOpenVocabulary={() => push({ name: 'vocabulary', bookId: current.book.id })}
            onOpenSettings={() => push({ name: 'settings' })}
          />
        </ErrorBoundary>
      )

    case 'vocabulary':
      return (
        <ErrorBoundary key="vocabulary" screen="vocabulary">
          <VocabularyScreen onBack={pop} bookId={current.bookId} />
        </ErrorBoundary>
      )

    case 'discover':
      return (
        <ErrorBoundary key="discover" screen="discover">
          <DiscoverScreen
            onBack={pop}
            onOpenHome={openHome}
            onOpenLibrary={openLibrary}
            onOpenProfile={openProfile}
            onOpenPaywall={() => push({ name: 'paywall' })}
            onOpenBook={(book) => push({ name: 'book-details', book })}
            onOpenOpdsCatalogBrowse={(catalogId, initialFolder) => push({ name: 'opds-catalog-browse', catalogId, initialFolder })}
            onOpenPublicDomainCatalog={() => push({ name: 'public-domain-catalog' })}
            onOpenOpdsCatalogSettings={() => push({ name: 'opds-catalog-settings' })}
          />
        </ErrorBoundary>
      )

    case 'profile':
      return (
        <ErrorBoundary key="profile" screen="profile">
          <ProfileScreen
            authUser={auth.state.user}
            onBack={pop}
            onOpenHome={openHome}
            onOpenLibrary={openLibrary}
            onOpenDiscover={openDiscover}
            onOpenSettings={() => push({ name: 'settings' })}
            onSignOut={auth.signOut}
          />
        </ErrorBoundary>
      )

    case 'settings':
      return (
        <ErrorBoundary key="settings" screen="settings">
          <SettingsScreen
            onBack={pop}
            onOpenPlan={() => push({ name: 'settings-plan' })}
            onOpenLanguage={() => push({ name: 'settings-language' })}
            onOpenAppearance={() => push({ name: 'settings-appearance' })}
            onOpenWordLens={() => push({ name: 'settings-word-lens' })}
            onOpenNarration={() => push({ name: 'settings-narration' })}
            onOpenIntegrations={() => push({ name: 'settings-integrations' })}
            onOpenOpdsCatalogs={() => push({ name: 'opds-catalog-settings' })}
            onOpenSync={() => push({ name: 'settings-sync' })}
          />
        </ErrorBoundary>
      )

    case 'settings-plan':
      return (
        <ErrorBoundary key="settings-plan" screen="settings-plan">
          <SettingsPlanScreen onBack={pop} onOpenPaywall={() => push({ name: 'paywall' })} />
        </ErrorBoundary>
      )

    case 'settings-language':
      return (
        <ErrorBoundary key="settings-language" screen="settings-language">
          <SettingsLanguageScreen onBack={pop} />
        </ErrorBoundary>
      )

    case 'settings-appearance':
      return (
        <ErrorBoundary key="settings-appearance" screen="settings-appearance">
          <SettingsAppearanceScreen onBack={pop} />
        </ErrorBoundary>
      )

    case 'settings-word-lens':
      return (
        <ErrorBoundary key="settings-word-lens" screen="settings-word-lens">
          <SettingsWordLensScreen onBack={pop} />
        </ErrorBoundary>
      )

    case 'settings-narration':
      return (
        <ErrorBoundary key="settings-narration" screen="settings-narration">
          <SettingsNarrationScreen onBack={pop} />
        </ErrorBoundary>
      )

    case 'settings-integrations':
      return (
        <ErrorBoundary key="settings-integrations" screen="settings-integrations">
          <SettingsIntegrationsScreen onBack={pop} />
        </ErrorBoundary>
      )

    case 'settings-sync':
      return (
        <ErrorBoundary key="settings-sync" screen="settings-sync">
          <SettingsSyncScreen onBack={pop} />
        </ErrorBoundary>
      )

    case 'opds-catalog-settings':
      return (
        <ErrorBoundary key="opds-catalog-settings" screen="opds-catalog-settings">
          <OpdsCatalogSettingsScreen
            onBack={pop}
            onOpenCatalog={(catalogId) => push({ name: 'opds-catalog-browse', catalogId })}
          />
        </ErrorBoundary>
      )

    case 'opds-catalog-browse':
      return (
        <ErrorBoundary key="opds-catalog-browse" screen="opds-catalog-browse">
          <OpdsCatalogBrowseScreen
            catalogId={current.catalogId}
            initialFolder={current.initialFolder}
            onBack={pop}
            onOpenBook={(book) => push({ name: 'book-details', book })}
          />
        </ErrorBoundary>
      )

    case 'public-domain-catalog':
      return (
        <ErrorBoundary key="public-domain-catalog" screen="public-domain-catalog">
          <PublicDomainCatalogScreen
            onBack={pop}
            onOpenBook={(book) => push({ name: 'book-details', book })}
          />
        </ErrorBoundary>
      )

    case 'paywall':
      return (
        <ErrorBoundary key="paywall" screen="paywall">
          <PaywallScreen onBack={pop} />
        </ErrorBoundary>
      )

    case 'library':
      return (
        <ErrorBoundary key="library" screen="library">
          <LibraryScreen
            onOpenBook={(book) => push({ name: 'book-details', book })}
            onOpenHome={openHome}
            onOpenDiscover={openDiscover}
            onOpenProfile={openProfile}
            initialFilter={current.initialFilter}
          />
        </ErrorBoundary>
      )

    default:
      return (
        <ErrorBoundary key="home" screen="home">
          <HomeScreen
            onOpenBook={(book) => push({ name: 'book-details', book })}
            onOpenBiblioteca={(genre) => openLibrary(genre ? `genre:${genre}` : undefined)}
            onOpenDiscover={openDiscover}
            onOpenProfile={openProfile}
            onOpenSettings={() => push({ name: 'settings' })}
          />
        </ErrorBoundary>
      )
    }
  })())
}

function externalImportErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('permiss')) {
    return 'Nao foi possivel acessar o EPUB recebido. Abra o arquivo novamente pelo Android.'
  }
  return message || 'Nao foi possivel importar o EPUB recebido.'
}

export default App
