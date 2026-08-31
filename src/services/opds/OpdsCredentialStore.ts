import { Capacitor, registerPlugin } from '@capacitor/core'

export interface OpdsCredential {
  username: string
  password: string
}

interface NeoReaderOpdsCredentialPlugin {
  storeOpdsCredential(options: { catalogId: number; username: string; password: string }): Promise<void>
  getOpdsCredential(options: { catalogId: number }): Promise<Partial<OpdsCredential>>
  deleteOpdsCredential(options: { catalogId: number }): Promise<void>
}

// Registra o mesmo plugin nativo ('NeoReaderLibrary') de novo, com uma
// interface local restrita só aos 3 métodos de credencial OPDS — evita
// acoplar este arquivo a NativeLibraryImportService.ts (que registra o
// plugin pra import de arquivo, domínio não relacionado). Mesmo plugin
// nativo, dois `registerPlugin` independentes é seguro no Capacitor.
const NeoReaderLibrary = registerPlugin<NeoReaderOpdsCredentialPlugin>('NeoReaderLibrary')

export const OpdsCredentialStore = {
  async store(catalogId: number, credential: OpdsCredential): Promise<void> {
    if (!Capacitor.isNativePlatform()) return
    if (typeof NeoReaderLibrary.storeOpdsCredential !== 'function') return
    await NeoReaderLibrary.storeOpdsCredential({ catalogId, ...credential })
  },

  async get(catalogId: number): Promise<OpdsCredential | null> {
    if (!Capacitor.isNativePlatform()) return null
    if (typeof NeoReaderLibrary.getOpdsCredential !== 'function') return null

    const result = await NeoReaderLibrary.getOpdsCredential({ catalogId })
    if (!result.username || !result.password) return null
    return { username: result.username, password: result.password }
  },

  async delete(catalogId: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) return
    if (typeof NeoReaderLibrary.deleteOpdsCredential !== 'function') return
    await NeoReaderLibrary.deleteOpdsCredential({ catalogId })
  },
}
