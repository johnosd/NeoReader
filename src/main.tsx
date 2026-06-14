import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fontes do design system — @fontsource copia os arquivos para o bundle,
// então funciona offline no Capacitor.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/900.css'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/800.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'

import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n'
import { disableCapacitorBridgePayloadLogging } from './services/CapacitorBridgeLogging'
import { installGlobalDiagnosticsHandlers } from './services/DiagnosticsLogger'

disableCapacitorBridgePayloadLogging()
installGlobalDiagnosticsHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
