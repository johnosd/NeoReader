import { Capacitor, registerPlugin } from '@capacitor/core'

interface DeviceCredentialPluginResult {
  supported?: boolean
  confirmed?: boolean
}

interface NeoReaderDeviceCredentialPlugin {
  // Opcional (`?`): APKs antigos não têm o método; o chamador checa antes de usar.
  confirmDeviceCredential?(options: { title: string; description: string }): Promise<DeviceCredentialPluginResult>
}

// Mesmo plugin nativo ('NeoReaderLibrary') que NativeSystemUiService e OpdsCredentialStore já
// registram: dois `registerPlugin` independentes do mesmo nome é seguro no Capacitor.
// Registro preguiçoso (na 1ª chamada, não no import): este módulo entra no bundle de várias
// telas via useBookLock, e só quem usa "Esqueci o PIN" precisa do plugin.
let plugin: NeoReaderDeviceCredentialPlugin | null = null
function getPlugin(): NeoReaderDeviceCredentialPlugin {
  plugin ??= registerPlugin<NeoReaderDeviceCredentialPlugin>('NeoReaderLibrary')
  return plugin
}

export type DeviceCredentialOutcome = 'confirmed' | 'cancelled' | 'unsupported'

// Prova de que quem pede é o dono do aparelho, pela credencial de bloqueio de tela do
// Android (feature 024, "Esqueci o PIN"). `unsupported` = sem bloqueio de tela, fora do
// Android nativo ou APK sem o método nativo: quem chama decide o que fazer.
export const DeviceCredentialService = {
  async confirm(options: { title: string; description: string }): Promise<DeviceCredentialOutcome> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return 'unsupported'
    const NeoReaderLibrary = getPlugin()
    if (typeof NeoReaderLibrary.confirmDeviceCredential !== 'function') return 'unsupported'

    try {
      const result = await NeoReaderLibrary.confirmDeviceCredential(options)
      if (result.supported === false) return 'unsupported'
      return result.confirmed === true ? 'confirmed' : 'cancelled'
    } catch (error) {
      // Método ausente no APK instalado: o Capacitor rejeita com código UNIMPLEMENTED.
      if ((error as { code?: string } | null)?.code === 'UNIMPLEMENTED') return 'unsupported'
      return 'cancelled'
    }
  },
}
