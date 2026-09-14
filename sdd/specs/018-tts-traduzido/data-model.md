# Data Model: TTS Traduzido

## Extensão de `BookSettings` (`src/types/book.ts`)

Tabela Dexie existente `bookSettings` (`'++id, bookId'`, `src/db/database.ts`
v19) — só `id`/`bookId` são indexados; os campos abaixo são novos atributos
não-indexados do objeto armazenado, mesmo padrão de `translationTargetLang`/
`translationProvider` já existentes. **Não exige nova `version()` do Dexie**
(confirmado: nenhum campo novo precisa de índice).

| Campo | Tipo | Default (ausente) | Descrição |
| --- | --- | --- | --- |
| `audiobookTranslationEnabled` | `boolean` | `false` | Se "ouvir traduzido" está ativo para este livro. Lido por `useReaderAppearance`/`ReaderScreen`, escrito por `BookDetailsScreen` (mesmo padrão de `applyBookSettingsPatch`/`updateBookSettings`). |
| `audiobookTranslationWarningDismissed` | `boolean` | `false` | Se o aviso de consumo (FR-013) já foi confirmado uma vez para este livro — impede reaparecer em ativações futuras do mesmo livro. |

## Sessão de leitura traduzida (efêmera, em memória — não persistida)

Vive inteiramente em `src/services/TranslatedAudiobookService.ts` +
`src/hooks/useTranslatedAudiobook.ts` (novos), enquanto uma reprodução
traduzida está ativa. Nunca gravada em Dexie — reconstruída do zero a cada
`play()`.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `sourceLang` | `string` | `bookLanguage` no momento em que a sessão começou. |
| `targetLang` | `string` | `translationTargetLang` no momento em que a sessão começou. |
| `requestedProvider` | `TranslationProvider` | Provider configurado no início da sessão (mymemory ou BYOK premium). |
| `stickyProvider` | `TranslationProvider \| null` | `null` até a primeira falha com fallback (FR-007 desta spec); depois disso, fixo pelo resto da sessão — nenhuma nova tentativa no `requestedProvider`. |
| `translatedChunksByParagraph` | `Map<number, TtsChunk[]>` | Cache em memória da sessão — evita retraduzir um parágrafo já processado (ex.: usuário volta uma frase). |
| `inFlightParagraph` | `number \| null` | Índice do parágrafo cuja tradução está em andamento (evita disparar prefetch duplicado do mesmo parágrafo). |
| `abortController` | `AbortController` | Cancelado (R-011/FR-011) ao trocar capítulo, livro, idioma-alvo ou provedor — substitui a instância inteira em vez de reusar. |

A sessão é descartada (não pausada/serializada) em qualquer transição de
capítulo/livro/idioma/provedor — consistente com a Decisão Invariante de que
não há fila/reordenação entre sessões diferentes.

## Sem novas entidades persistidas

Tradução em si continua na tabela `translations` já existente (feature
`017`/anterior), reusada via `TranslationService.translate()` sem alteração —
a chave de cache já inclui provider (FR-012 desta spec já coberto por
`hashText(text, langpair, provider)`, herdado).
