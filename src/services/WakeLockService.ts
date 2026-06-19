import { KeepAwake } from '@capacitor-community/keep-awake'
import { Capacitor } from '@capacitor/core'

// Mantém a tela acesa durante a reprodução de TTS, se o usuário habilitou a opção.
// Usa localStorage para não exigir migração de schema no DB.
const STORAGE_KEY = 'neoreader:tts-keep-awake'

export const WakeLockService = {
  isEnabled(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  },

  setEnabled(value: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
      // localStorage indisponível — preferência não persiste
    }
  },

  async keepAwake(): Promise<void> {
    if (!this.isEnabled() || !Capacitor.isNativePlatform()) return
    try {
      await KeepAwake.keepAwake()
    } catch {
      // Plugin não suportado nesta plataforma — ignora silenciosamente
    }
  },

  async allowSleep(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return
    try {
      await KeepAwake.allowSleep()
    } catch {
      // Ignora silenciosamente
    }
  },
}
