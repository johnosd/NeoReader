# Implementation Plan: Tradução Premium BYOK (DeepL, OpenAI, Google)

**Slug**: `017-traducao-premium-byok` | **Date**: 2026-09-11 | **Spec**: `sdd/specs/017-traducao-premium-byok/spec.md`

## Summary

Adicionar 3 provedores de tradução premium (DeepL, OpenAI, Google Cloud
Translation) configuráveis via BYOK, seguindo exatamente o padrão já em
produção pro BYOK de TTS premium neste mesmo repositório: chave + "Testar
chave" numa nova seção de Configurações, seleção de um único provedor
ativo por livro na tela de detalhes, e fallback transparente pro MyMemory
(gratuito, já existente) quando o provedor selecionado falhar. Sem cadeia
automática entre os 3 premium (descartada durante o `sdd-specify`), sem
backend/vault (chamadas diretas do app pro provedor), sem Pro-gating, sem
mudança de schema Dexie (campos novos são todos não-indexados).

## Technical Context

**Language/Version**: TypeScript 5.x + React 19 (já no projeto)

**Primary Dependencies**: `fetch` nativo (nenhuma lib de HTTP nova),
Dexie.js + `dexie-react-hooks` (persistência/reatividade), provider de
i18n local (`src/i18n/`)

**Storage**: IndexedDB via Dexie — tabelas já existentes `settings`,
`bookSettings`, `translations` (v19, sem bump necessário — ver
`data-model.md`)

**Testing**: Vitest + Testing Library, mocks de `fetch`/serviços por
provedor (mesmo padrão de `src/__tests__/services/BookmarkDriveSyncService.test.ts`
e afins)

**Target Platform**: Android (Capacitor) + Web

**Performance Goals**: tap-to-translate continua com resposta percebida
como imediata (loading state já existente); retry limitado a 2 tentativas
(research.md R5) evita atraso perceptível em falha transitória

**Constraints**: chamadas diretas do app pro provedor (constitution:
local-first, sem backend próprio); chave em IndexedDB puro, mesmo nível de
risco já aceito pro TTS (Fora de Escopo da spec); texto limitado a ~500
caracteres por chamada, igual ao MyMemory hoje (FR-013)

**Scale/Scope**: single-user por device; volume de chamadas = uso pontual
de tap-to-translate (não o volume alto e contínuo da ideia futura "TTS
Traduzido", fora de escopo — spec `## Assumptions`)

## Decisões Invariantes

- Um provedor selecionado por livro (nunca múltiplos simultâneos com
  fallback entre si) — `BookSettings.translationProvider`, análogo a
  `ttsProvider`. Reabrir isso exige reabrir o design (não é ajuste de
  task).
- Fallback automático só tem 1 destino possível: MyMemory. Nenhum código
  desta feature deve introduzir uma tentativa automática de "próximo
  provedor premium" — isso reintroduziria a cadeia descartada na spec.
- Nenhuma chamada de rede desta feature usa outro helper além de
  `fetchWithTimeout`/`fetch` direto com `AbortController` próprio (mesmo
  padrão de `SpeechifyService.ts`) — sem criar um cliente HTTP novo.
- `translate()` (`TranslationService.ts`) é o único ponto de entrada
  chamado pela UI (`ReaderScreen.handleTranslate`) — a UI nunca importa
  `DeepLService`/`OpenAiTranslationService`/`GoogleTranslateService`
  diretamente pra traduzir (só a tela de Configurações os importa
  diretamente, pra validar chave).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | Pass | Pass | Este `plan.md` é a proposta; aguarda leitura do usuário antes do `sdd-execute`. |
| II. Comentários só onde o "porquê" não é óbvio | Pass | Pass | Pontos não óbvios já identificados pra comentar na implementação: por que 2 hosts DeepL, por que OpenAI usa Structured Outputs em vez de prompt livre, por que Google usa query param em vez de header (ver `research.md`/`contracts/`). |
| III. Explícito antes de mágico | Pass | Pass | 3 serviços de provedor explícitos em vez de 1 módulo genérico parametrizado (research.md R1); nenhuma abstração nova além do que `TtsProviderRegistry.ts` já estabeleceu como padrão. |
| IV. Build limpo é a definição de "pronto" | Pass | Pass | Gate cross-cutting no Polish (tasks.md) e no `quickstart.md`; nada no design conflita. |
| V. Dependências novas exigem justificativa | Pass | Pass | Nenhuma dependência nova — só `fetch` nativo, confirmado na exploração (`SpeechifyService.ts` já faz chamadas HTTP diretas sem lib). |

Nenhuma violação — `## Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/017-traducao-premium-byok/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── deepl-translate.md
│   ├── openai-responses-translate.md
│   └── google-translate-basic-v2.md
└── tasks.md
```

### Source Code (repository — projeto único, sem separação backend/frontend)

```text
src/
├── types/
│   ├── translation.ts          # NOVO — TranslationProvider, códigos de validação, TranslationResult
│   ├── settings.ts             # MODIFICADO — AppSettings +3 campos de chave
│   ├── book.ts                 # MODIFICADO — BookSettings +translationProvider
│   └── vocabulary.ts           # MODIFICADO — TranslationCache +provider
├── services/
│   ├── TranslationService.ts          # MODIFICADO — translate() ganha provider+signal, delega pro registry, hash inclui provider
│   ├── TranslationProviderRegistry.ts # NOVO — espelha TtsProviderRegistry.ts
│   ├── DeepLService.ts                # NOVO
│   ├── OpenAiTranslationService.ts    # NOVO
│   ├── GoogleTranslateService.ts      # NOVO
│   └── http.ts, DiagnosticsLogger.ts  # SEM MUDANÇA — reusados como estão (research.md R4)
├── db/
│   ├── translations.ts         # SEM MUDANÇA DE ASSINATURA (provider já entra no hash calculado em TranslationService)
│   ├── bookSettings.ts         # SEM MUDANÇA (updateBookSettings já é genérico por patch)
│   └── settings.ts             # SEM MUDANÇA (updateAppSettings já é genérico por patch)
├── components/settings/
│   └── apiKeyValidation.ts     # MODIFICADO — +getTranslationApiKeyValidationMessage
├── screens/
│   ├── SettingsTranslationScreen.tsx  # NOVO — espelha SettingsNarrationScreen.tsx
│   ├── SettingsScreen.tsx             # MODIFICADO — +item de lista "Tradução"
│   ├── BookDetailsScreen.tsx           # MODIFICADO — seletor de provedor de tradução + banner de fallback (espelha o bloco de TTS já existente)
│   └── ReaderScreen.tsx                # MODIFICADO — handleTranslate resolve provider do livro + AbortController
├── hooks/
│   └── useReaderAppearance.ts   # MODIFICADO — expõe translationProvider/translationProviderAvailability (espelha ttsConfig/ttsProviderAvailability)
├── App.tsx                      # MODIFICADO — rota 'settings-translation'
└── i18n/messages.ts             # MODIFICADO — chaves pt-BR/en/es novas (settings.translation.*, bookDetails.translation.*)

src/__tests__/
├── services/
│   ├── TranslationService.test.ts            # já existe — estender pra provider+cache
│   ├── TranslationProviderRegistry.test.ts   # NOVO
│   ├── DeepLService.test.ts                  # NOVO
│   ├── OpenAiTranslationService.test.ts      # NOVO
│   └── GoogleTranslateService.test.ts        # NOVO
├── screens/
│   ├── SettingsTranslationScreen.test.tsx    # NOVO
│   ├── BookDetailsScreen.test.tsx             # já existe — estender
│   └── ReaderScreen.test.tsx                  # já existe — estender (handleTranslate)
└── db/translations.test.ts (se existir — confirmar padrão de teste do cache)
```

**Structure Decision**: projeto único (sem separação backend/frontend —
já é a estrutura de todo o repositório). Segue exatamente a árvore real
encontrada na exploração; nenhum diretório novo além dos arquivos
individuais listados (nem `src/services/translation/`, nem qualquer outra
pasta nova — `src/services/` já é plano hoje, um arquivo por serviço).

## Complexity Tracking

> Vazio — nenhuma violação de constitution identificada.

## Estratégia de Testes

Prioridade: unitário (serviços de provedor + registry + hash de cache) →
integração (fluxo completo `handleTranslate` → provider → fallback, mock
de `fetch`) → manual/E2E (browser real, `quickstart.md`) — build limpo
como último gate antes de reportar qualquer fase como concluída.

Comandos-base (reais deste repositório):

```powershell
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npm test
npx vitest run <caminho-do-arquivo>   # durante o desenvolvimento de cada fase
npm run build
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Foundational (Fase 2) | Concluída — tipos, `TranslationProviderRegistry.ts` (vazio de premium, só `mymemory`), `TranslationService.translate()` já com a árvore de decisão completa do FR-007, cache isolado por provider (FR-010), tela `SettingsTranslationScreen`/rota/entrada no menu, seletor + banner de fallback em `BookDetailsScreen`, `handleTranslate` com `AbortController` em `ReaderScreen`. Nenhum provider premium real ainda (DeepL é a US1). |
| Regressão | Nenhuma — `ReaderScreen.test.tsx`/`BookDetailsScreen.test.tsx` (93 testes) verdes após ajuste de 3 assertions que só precisavam do novo 4º argumento de `translate()`. |
| User Story 1 — DeepL (Fase 3) | Concluída — `DeepLService.ts` completo (validação, tradução, host free/pro), registrado no registry, seletor/banner funcionando em `BookDetailsScreen`, `ReaderScreen` usa o provider certo e cancela a chamada anterior. Suite completa + lint + tsc + build limpos. Não testado contra a API real ainda (ver Cuidados para Retomada — chave em `.env` sem prefixo `VITE_`). |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Google Basic v2 autentica via query param `?key=...`, não header — risco de a chave aparecer em log de URL. | Alto se não verificado; nulo se confirmado coberto. | Verificado em `research.md` R4: `DiagnosticsLogger.sanitizeUrl` já redige qualquer valor de query param genericamente. Task de auditoria (SC-004) confirma com teste, sem exigir mudança em `DiagnosticsLogger.ts`. |
| R-002 | OpenAI/Google não distinguem "quota excedida" de "billing necessário" por HTTP status como a DeepL (456) faz. | Baixo — FR-007 trata as 2 categorias de forma idêntica (sem retry, cai pro MyMemory). | Aceito como limitação documentada em `research.md` R2; classificação usa `error.code` da OpenAI quando disponível (`insufficient_quota`), senão cai em `quota_exceeded` por padrão nos 2 provedores. |
| R-003 | Cache de tradução (`src/db/translations.ts`) hoje não isola por provider — bug de correção descoberto durante o `sdd-specify` (não estava no pedido original). | Médio — sem isso, trocar de provider por livro pode devolver tradução em cache do provider errado. | Resolvido por design: `TranslationService.hashText` passa a foldar o provider no input do hash (`data-model.md`) — sem precisar de índice novo no Dexie. |
| R-004 | OpenAI Structured Outputs (`strict: true`) pode, raramente, devolver algo fora do schema esperado (falha de parse). | Baixo. | Tratado como categoria `invalid` (erro de requisição/bug interno) — FR-007 diz explicitamente que essa categoria não cai pro MyMemory automaticamente, evita mascarar. |
| R-006 | **CRÍTICO — descoberto testando US1 no browser real**: a DeepL bloqueia chamadas diretas do browser via CORS por design (`Access-Control-Allow-Origin` ausente de propósito, documentado em developers.deepl.com/docs/best-practices/cors-requests — evita expor a chave em código client-side). Confirmado também pra OpenAI (mesma ausência de header CORS). Google Cloud Translation v2 **não** tem esse bloqueio (funciona direto do browser). Isso invalida a "Abordagem 1" (BYOK direto do app) da decision.md pra 2 dos 3 provedores. | Alto se não resolvido — US2 (OpenAI) repetiria o mesmo problema. | **Resolvido** — usuário escolheu restringir DeepL/OpenAI ao Android via `CapacitorHttp` nativo (bypassa CORS só no app empacotado; Web fica só com Google+MyMemory pra esses 2). Implementado: `capacitor.config.ts` (`CapacitorHttp: { enabled: true }`), `TranslationProviderDefinition.requiresNativePlatform` + `isTranslationProviderPlatformRestricted()` em `TranslationProviderRegistry.ts`, UI (`SettingsTranslationScreen`/`BookDetailsScreen`) mostra "disponível só no Android" em vez de tentar e falhar. Mesmo padrão deve ser aplicado à definição do OpenAI quando a US2 for criada (`requiresNativePlatform: true`). **Confirmado no device real**: "Testar chave" da DeepL funcionou via CapacitorHttp (bypass de CORS efetivo). |
| R-007 | **Bug real encontrado testando tradução no device** (não CORS — chave e rede já funcionando): DeepL rejeitava toda tradução com `code: "invalid"`. Logcat mostrou `source_lang: "ES-419"` — a DeepL só aceita código BASE no idioma de origem (rejeita qualquer variante regional), diferente do destino (onde "PT-BR" é aceito). `bookLanguage` vem direto do EPUB sem filtro, podendo ter qualquer variante regional. | Alto se não corrigido — quebra tradução pra qualquer livro cujo idioma declarado tenha variante regional (comum em espanhol: es-419, es-ES). | **Resolvido**: `DeepLService.toDeepLSourceLangCode` usa `getBaseLanguage()` (`utils/language.ts`) antes de maiusculizar; idioma de destino mantido como estava (conjunto fechado de 7, só pt-BR tem região e DeepL aceita). Reconfirmado no device: tradução funcionando. Atenção pra Google (US3): pode ter a mesma restrição de código base no source_lang — verificar antes de implementar. |
| R-008 | **Pedido de produto após ver funcionar no device**: usuário quer indicador de qual provedor traduziu, citando paridade com o indicador de engine de TTS — reverte parte do FR-008 (`spec.md` atualizado, sessão 2026-09-11). | Baixo — mudança de contrato aditiva (`translate()` retorna objeto em vez de string), não regressiva. | **Resolvido**: selo discreto "via {provedor}" no painel de tradução (só quando ≠ MyMemory), decisão do usuário entre 3 opções (selo no painel / ícone no chrome / os dois). `TranslationResult` (agora com `provider`) é o retorno de `translate()`; propagado até `EpubViewer.injectTranslation`. Mesmo padrão condicional já usado no indicador de TTS (`ttsEngine !== 'native'`). |
| R-005 | "Idioma não suportado" (FR-007, deveria cair pro MyMemory sem retry) e "requisição inválida/bug interno" (FR-007, não deveria cair automaticamente) chegam ambos como HTTP 400 genérico em DeepL/Google, sem sinal confiável pra distinguir sem parsear a mensagem de erro (frágil, evitado por "explícito antes de mágico"). Descoberto implementando T007. | Baixo — os 7 idiomas hoje expostos na UI do app são praticamente universais nos 3 provedores; a chance real de um 400 ser por idioma é pequena. | Decisão tomada durante T007: todo HTTP 400 é tratado como `invalid` (propaga erro, sem fallback). Se "idioma não suportado" ocorrer na prática, o usuário verá um erro em vez de fallback silencioso — aceito como limitação conhecida, não resolvido por parsing de mensagem. |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-11 | Foundational | Infra completa (tipos, registry, `translate()` com árvore FR-007, cache FR-010, telas shell, seletor+banner em BookDetailsScreen, AbortController em ReaderScreen). Suite completa (`npm test`) 100% verde após 2 rodadas de ajuste mecânico (3 assertions de `ReaderScreen.test.tsx` pro novo argumento de `translate()`; 3 assertions de `db/settings.test.ts` pros 3 campos novos de `AppSettings`) — nenhuma regressão de comportamento, só testes que hardcodavam o shape antigo. `tsc`, lint e `npm run build` limpos. | Nenhum provider premium real ainda — US1 (DeepL) é o próximo passo. |
| 2026-09-11 | US1 (DeepL) | `DeepLService.ts` completo; registrado no registry (T023 virou no-op — UI já é genérica); 4 arquivos de teste novos/estendidos (`DeepLService`, `SettingsTranslationScreen`, `BookDetailsScreen`, `ReaderScreen`, `TranslationProviderRegistry`). Suite completa + lint + tsc + build limpos. | Chave real do usuário em `.env` como `DEEPL_API_KEY` (sem prefixo `VITE_`) não é exposta ao client pelo Vite — sem teste manual contra a API real ainda. |
| 2026-09-11 | US1 (DeepL) — pós-teste em device real | R-006 confirmado e resolvido (CapacitorHttp bypassa CORS, "Testar chave" funcionando). R-007: bug real de `source_lang` regional (`ES-419`) corrigido com `getBaseLanguage()`; tradução confirmada funcionando no device. R-008: pedido de produto (selo "via {provedor}") implementado — `translate()` agora retorna `TranslationResult` em vez de `string`, propagado até o painel de tradução no iframe. Suite completa + lint + tsc + build limpos após cada uma das 3 rodadas. APK reinstalado no device 3 vezes (CORS fix, idioma fix, selo). | Nenhuma — US1 validada ponta a ponta no device real (chave, CORS, tradução, selo). |

**PRÓXIMO**: Fase 4 — User Story 2 (OpenAI). Ao criar a definição do OpenAI
no registry, lembrar de `requiresNativePlatform: true` (mesmo motivo do
DeepL, R-006) e checar se o idioma de origem precisa do mesmo tratamento de
`getBaseLanguage()` (R-007) — depende do que a Responses API exige.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/services/DeepLService.ts` (validação + tradução + `getBaseLanguage()` no source_lang)
- `src/services/TranslationProviderRegistry.ts` (deepl registrado, `requiresNativePlatform`)
- `src/services/TranslationService.ts` (árvore de decisão FR-007, retorna `TranslationResult`)
- `src/types/translation.ts` (`TranslationResult.provider`)
- `src/components/reader/EpubViewer.tsx` (`injectTranslation` com selo `.nr-tr-provider`)
- `capacitor.config.ts` (`CapacitorHttp: { enabled: true }`)
- `src/screens/SettingsTranslationScreen.tsx` (aviso "Android apenas")
- `src/screens/BookDetailsScreen.tsx` (seletor + banners de fallback/plataforma)
- `src/screens/ReaderScreen.tsx` (`handleTranslate` + AbortController + provider no selo)

## Cuidados para Retomada

- **Nunca** interpolar `apiKey`/a chave crua em mensagens de erro
  customizadas (`new Error(...)`) fora de headers/query params reais —
  o regex genérico de `DiagnosticsLogger.sanitizeString` só protege o
  padrão `key=valor`/`Bearer <token>`, não uma chave solta em texto livre
  (research.md R4).
- **Nunca** implementar fallback automático pra "o próximo provedor
  premium" — só existe 1 fallback automático válido nesta feature: pro
  MyMemory (Decisões Invariantes acima).
- Ao adicionar os 3 novos campos de `AppSettings`, seguir exatamente o
  padrão de merge de `normalizeUserSettings` (`src/types/settings.ts`) —
  já usado pros 3 campos de chave de TTS.
- Se em algum momento parecer necessário adicionar um índice novo em
  `bookSettings`/`translations`/`settings` (não deveria — ver
  `data-model.md`), isso exigiria uma nova `version()` em
  `src/db/database.ts` (schema é append-only, constitution).
