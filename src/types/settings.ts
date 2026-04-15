export type FontSize = 'sm' | 'md' | 'lg' | 'xl'

export interface UserSettings {
  id?: number
  speechifyApiKey: string       // '' = não configurado
  translationTargetLang: string // 'pt-BR' por padrão
  defaultFontSize: FontSize
  updatedAt: Date
}

export const DEFAULT_SETTINGS: Omit<UserSettings, 'id'> = {
  speechifyApiKey: '',
  translationTargetLang: 'pt-BR',
  defaultFontSize: 'md',
  updatedAt: new Date(),
}
