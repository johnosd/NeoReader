export type TranslationProvider = 'mymemory' | 'deepl' | 'openai' | 'google'
export type PremiumTranslationProvider = Exclude<TranslationProvider, 'mymemory'>

export type TranslationApiKeyValidationCode =
  | 'valid'
  | 'invalid'
  | 'permission_denied'
  | 'quota_exceeded'
  | 'billing_required'
  | 'network_error'
  | 'unavailable'

export interface TranslationApiKeyValidationResult {
  isValid: boolean
  code: TranslationApiKeyValidationCode
  message: string
}

// Reaproveita as mesmas 7 categorias da validação de chave (FR-002) pros
// erros de chamada de tradução em runtime (FR-007) — exclui 'valid', que só
// faz sentido no contexto de "Testar chave".
export type TranslationFailureCode = Exclude<TranslationApiKeyValidationCode, 'valid'>

export interface TranslationResult {
  translatedText: string
  detectedSourceLang?: string
  // Provedor que efetivamente gerou este texto — pode divergir do provider
  // pedido quando `TranslationService.translate()` cai pro MyMemory (FR-007).
  // Usado pelo selo "via {provedor}" no painel de tradução (FR-008).
  provider: TranslationProvider
}
