import { Capacitor, registerPlugin } from '@capacitor/core'

interface NeoReaderLibrarySystemUiPlugin {
  setReaderImmersiveMode?(options: { enabled: boolean }): Promise<void>
  setSelectionMenuSuppressed?(options: { enabled: boolean }): Promise<void>
  shareText?(options: { text: string }): Promise<void>
}

const NeoReaderLibrary = registerPlugin<NeoReaderLibrarySystemUiPlugin>('NeoReaderLibrary')

export async function setReaderImmersiveMode(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return
  if (typeof NeoReaderLibrary.setReaderImmersiveMode !== 'function') return

  try {
    await NeoReaderLibrary.setReaderImmersiveMode({ enabled })
  } catch (error) {
    console.warn('[NativeSystemUi] Failed to update reader immersive mode.', error)
  }
}

// Suprime a barra flutuante de seleção do Android (Copiar / Compartilhar /
// Selecionar tudo) enquanto o leitor está aberto (FR-010). As duas guardas
// abaixo são também o que faz a feature degradar sã na web: fora do Android
// isto é no-op, e o menu de highlight continua funcionando (FR-029).
export async function setSelectionMenuSuppressed(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return
  if (typeof NeoReaderLibrary.setSelectionMenuSuppressed !== 'function') return

  try {
    await NeoReaderLibrary.setSelectionMenuSuppressed({ enabled })
  } catch (error) {
    console.warn('[NativeSystemUi] Failed to update selection menu suppression.', error)
  }
}

// Compartilha o trecho selecionado (FR-003c). No Android usa o plugin nativo
// (Intent.ACTION_SEND) — achado real em device: o Android System WebView, ao
// contrário do Chrome for Android, não implementa a Web Share API de forma
// confiável, e o botão simplesmente não fazia nada. Fora do Android (web,
// onde o Chrome de verdade roda) cai pro navigator.share do próprio browser,
// que funciona bem ali. FR-003d: sem nenhum dos dois disponíveis, ou o
// usuário cancelando o sheet do sistema, apenas não conclui — sem erro.
export async function shareText(text: string): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    && typeof NeoReaderLibrary.shareText === 'function') {
    try {
      await NeoReaderLibrary.shareText({ text })
    } catch (error) {
      console.warn('[NativeSystemUi] Failed to share text natively.', error)
    }
    return
  }

  try {
    await navigator.share?.({ text })
  } catch {
    // FR-003d: sem suporte, ou usuário cancelou o sheet — não é erro.
  }
}
