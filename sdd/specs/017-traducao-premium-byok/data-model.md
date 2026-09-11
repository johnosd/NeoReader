# Data Model: Tradução Premium BYOK (DeepL, OpenAI, Google)

Nenhuma mudança aqui exige nova `version()` no Dexie (`src/db/database.ts`,
hoje v19) — todos os campos novos são não-indexados, adicionados a stores
já existentes (`settings`, `bookSettings`, `translations`). Confirmado
lendo `database.ts`: `translations: '++id, textHash, createdAt'` e
`bookSettings: '++id, bookId'` só indexam os campos citados; Dexie não
exige declarar campos extra do objeto armazenado.

## `src/types/translation.ts` (novo arquivo)

```ts
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

export interface TranslationResult {
  translatedText: string
  detectedSourceLang?: string
}
```

`'empty'` (chave em branco no campo) não entra nesse union — tratado na
tela, antes de chamar `validateApiKey`, igual ao padrão de TTS
(`SettingsNarrationScreen.validateTtsProviderKey`).

## `src/types/settings.ts` — `AppSettings` (campos novos)

```ts
deeplApiKey: string
openaiTranslationApiKey: string
googleTranslateApiKey: string
```

- `DEFAULT_APP_SETTINGS`: os 3 como `''`.
- `normalizeUserSettings`: mesmo padrão de merge dos campos de TTS já
  existentes (sem chave legada pra migrar — campo novo).
- **Nome do campo OpenAI**: `openaiTranslationApiKey` (não
  `openaiApiKey` puro) — evita colisão de nome se o app um dia tiver outra
  integração OpenAI (ex: já existe intenção declarada em `Assumptions` da
  spec de um segundo consumidor do serviço de tradução; não custa nada
  deixar o campo já desambiguado).

## `src/types/book.ts` — `BookSettings` (campo novo)

```ts
translationProvider?: TranslationProvider
```

Ausente/`undefined` = MyMemory (FR-006). Mesma posição/padrão de
`ttsProvider?: TtsProvider`.

## `src/types/vocabulary.ts` — `TranslationCache` (campo novo)

```ts
provider: TranslationProvider  // nova dimensão da chave de cache — FR-010
```

`textHash` (`TranslationService.hashText`) passa a foldar o provider no
input do hash (`` `${provider}::${langpair}::${text}` ``, em vez de só
`` `${langpair}::${text}` ``) — é o que garante FR-010 na prática (mesmo
texto+idioma com provider diferente cai em hash diferente, sem precisar
de índice composto novo no Dexie). O campo `provider` armazenado no
registro é só pra auditoria/debug; o isolamento real vem do hash.

**Consequência aceita**: entradas de cache já existentes (criadas antes
desta feature, todas implicitamente MyMemory) ficam com um hash "antigo"
que não bate com o novo formato — são cache misses únicos na primeira
tradução de cada texto depois do deploy, recalculadas e salvas no formato
novo normalmente. Não é uma migração de dados necessária (o cache é
best-effort, TTL de 30 dias já existente em `TRANSLATION_CACHE_TTL_MS`) —
registrar como nota, não como task.

## Key Entities → tabela Dexie

| Entidade da spec | Tabela | Campo(s) novo(s) |
| --- | --- | --- |
| Chave de Provedor de Tradução | `settings` (via `AppSettings`) | `deeplApiKey`, `openaiTranslationApiKey`, `googleTranslateApiKey` |
| Provedor de Tradução Selecionado (por livro) | `bookSettings` | `translationProvider` |
| Entrada de Cache de Tradução | `translations` | `provider` (+ hash já isolado) |
| Resultado de Tradução | — (não persistido; tipo de retorno) | `TranslationResult` |

Não há status de validação persistido por chave (ex: "última validação
foi X") — mesmo padrão de TTS hoje: a validação roda no mount da tela de
Configurações (`useEffect` que rechecka chaves já salvas, como em
`SettingsNarrationScreen.tsx:188-194`) e ao salvar uma nova chave; não
existe um campo `lastValidatedAt` persistido pra TTS, então não introduzir
um só pra tradução (consistência > completude não pedida).
