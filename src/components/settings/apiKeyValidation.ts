import type { TranslateFn } from '../../i18n'
import type { ApiKeyValidationCode } from '../../services/TtsProviderRegistry'

// Tipos e funções puras (sem componente) usados pelos campos de chave de API
// de Narração (TTS) e Integrações (YouTube) — separado de ApiKeyField.tsx
// porque um arquivo que mistura componente + não-componente quebra o Fast
// Refresh do Vite (regra react-refresh/only-export-components).

export type KeyValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid'

export interface KeyValidationState {
  status: KeyValidationStatus
  message?: string
}

export const IDLE_KEY_STATE: KeyValidationState = { status: 'idle' }

export function getApiKeyValidationMessage(code: ApiKeyValidationCode | undefined, t: TranslateFn): string {
  if (code === 'empty') return t('settings.apiKey.validation.empty')
  if (code === 'valid') return t('settings.apiKey.validation.valid')
  if (code === 'invalid') return t('settings.apiKey.validation.invalid')
  if (code === 'timeout') return t('settings.apiKey.validation.timeout')
  if (code === 'no_credits') return t('settings.apiKey.validation.noCredits')
  return t('settings.apiKey.validation.unavailable')
}

export function getEducationStatus(state: KeyValidationState, t: TranslateFn): {
  statusLabel: string
  statusTone: 'success' | 'warning' | 'neutral'
} {
  if (state.status === 'valid') return { statusLabel: t('settings.status.connected'), statusTone: 'success' }
  if (state.status === 'invalid') return { statusLabel: t('settings.status.invalid'), statusTone: 'warning' }
  if (state.status === 'validating') return { statusLabel: t('settings.status.validating'), statusTone: 'neutral' }
  return { statusLabel: t('settings.status.notConfigured'), statusTone: 'neutral' }
}
