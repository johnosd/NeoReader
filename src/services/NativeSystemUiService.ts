import { Capacitor, registerPlugin } from '@capacitor/core'

interface NeoReaderLibrarySystemUiPlugin {
  setReaderImmersiveMode?(options: { enabled: boolean }): Promise<void>
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
