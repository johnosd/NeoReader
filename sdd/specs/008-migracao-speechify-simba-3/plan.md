# Implementation Plan: Migração Speechify simba-english/simba-multilingual → simba-3.2/simba-3.0

**Slug**: `008-migracao-speechify-simba-3` | **Date**: 2026-09-03 | **Spec**: `sdd/specs/008-migracao-speechify-simba-3/spec.md`

## Summary

`SpeechifyService.pickSpeechifyModel` hoje decide o modelo TTS só pelo idioma
(`en` → `simba-english`, resto → `simba-multilingual`), ambos retirados pela
Speechify a partir de 2026-09-21. A troca decide o modelo por **voz**, não só
por idioma: `simba-3.2` para inglês quando a voz declarar suporte (via
`models[].name`, campo que `GET /v1/voices` já retorna e que o código hoje
descarta ao montar `TtsVoiceOption`), com fallback automático e silencioso
para `simba-3.0` em qualquer outro caso (voz sem suporte conhecido, idioma
não-inglês, ou nenhuma voz selecionada — ex: padrão `carly`). O campo
`modelId` já existe em `TtsVoiceOption`/`TtsVoiceSelection` (não usado hoje
pela Speechify) e a plumbing de `voiceSelections` já passa por
`TtsPlaybackConfig` até os dois pontos de síntese em `useTTS.ts` — a feature
aproveita esse caminho existente em vez de criar um novo.

## Technical Context

**Language/Version**: TypeScript (strict) + React 19, Vite 8 — stack já
travada pela constitution.

**Primary Dependencies**: nenhuma nova. Reutiliza `fetch` nativo já usado por
`SpeechifyService.ts` contra `https://api.speechify.ai`.

**Storage**: N/A — não toca `src/db/database.ts`. Cache de áudio premium
(`TtsAudioCache.ts`) é in-memory e já chaveia por `voiceId` (que já implica o
modelo, indiretamente); cache de vozes (`ttsVoiceCaches.ts`) guarda
`TtsVoiceOption[]`, cujo shape (incluindo `modelId`) não muda.

**Testing**: Vitest + Testing Library, convenção `src/__tests__/` espelhando
`src/`, imports explícitos de `'vitest'`.

**Target Platform**: Android (Capacitor) + Web — mudança é só na camada de
serviço/hook, sem código nativo envolvido.

**Performance Goals**: preservar (idealmente melhorar) a latência de síntese
em inglês — `simba-3.2` tem menor time-to-first-byte que o modelo retirado,
quando a voz suportar.

**Constraints**: prazo externo rígido — `simba-english`/`simba-multilingual`
param de ser selecionáveis em `2026-09-21`; nenhuma voz/idioma hoje
funcional pode passar a falhar por causa desta mudança; sem alteração de
schema Dexie.

**Scale/Scope**: single-user local, feature pequena e cirúrgica — toca 1
service, 1 registry, 1 util e 1 hook já existentes; nenhuma tela nova.

## Decisões Invariantes

- O modelo é decidido por síntese individual (idioma + voz selecionada),
  nunca fixado por sessão ou config global.
- Ausência de informação de suporte a `simba-3.2` — voz sem seleção
  explícita (ex: padrão `carly`), voz cujo `models[]` não lista o modelo, ou
  dado ausente/malformado na resposta da API — SEMPRE resolve para
  `simba-3.0`. Fail-safe nunca assume suporte que não foi declarado pela
  própria API.
- `modelId` em `TtsVoiceOption`/`TtsVoiceSelection` (campo já existente no
  domínio, hoje não populado pela Speechify) passa a carregar `'simba-3.2'`
  quando a voz declarar esse suporte via `models[].name` de `GET
  /v1/voices`; em qualquer outro caso fica `undefined` — nunca um valor
  inferido ou hardcoded por voz específica.
- Pin do header `Speechify-Version` fica fora de escopo (Non-Goal já
  registrado em `spec.md`) — não vira task nem decisão técnica desta
  feature.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | ✅ Compatível | ✅ Compatível | Feature pequena/cirúrgica, mas o plano de arquivos abaixo cumpre o espírito do princípio antes de tocar código. |
| II. Comentários só onde o "porquê" não é óbvio | ✅ Compatível | ✅ Compatível | `pickSpeechifyModel` ganha regra não óbvia (por que só `simba-3.2` com suporte declarado, fallback fail-safe) — exige comentário curto na implementação. |
| III. Explícito antes de mágico | ✅ Compatível | ✅ Compatível | Decisão de modelo é função pura com regras explícitas; reaproveita campo/plumbing já existente (`modelId`) em vez de criar abstração nova. |
| IV. Build limpo é a definição de "pronto" | ✅ Compatível | ✅ Compatível | `npm run build` incluído na Estratégia de Testes e no Checklist de Release. |
| V. Dependências novas exigem justificativa | ✅ Compatível | ✅ Compatível | Nenhuma dependência nova. |

Nenhuma violação identificada — `Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/008-migracao-speechify-simba-3/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── quickstart.md          # Fase 1 — verificação manual (inclui validação da FR-008)
├── tasks.md               # Saída do sdd-plan (fase de tasks)
└── history.md              # Condicional, criado pelo sdd-execute quando arquiva
```

Sem `research.md` (nenhuma incerteza técnica bloqueante — a única incerteza
real, o formato exato de `models[].name` na API viva, já é coberta pela
validação manual da FR-008/quickstart, não por pesquisa prévia) nem
`data-model.md`/`contracts/` (nenhuma entidade nova, nenhuma superfície de
API própria alterada — só o valor enviado a uma API externa já integrada).

### Source Code (repository root)

```text
src/
├── services/
│   ├── SpeechifyService.ts          # pickSpeechifyModel + normalizeSpeechifyVoice (alterado)
│   └── TtsProviderRegistry.ts        # PremiumTtsSynthesisOptions (alterado)
├── utils/
│   └── ttsVoiceSelection.ts          # novo helper getPlaybackTtsVoiceModelId
├── hooks/
│   └── useTTS.ts                     # thread do modelId nos 2 pontos de síntese premium
└── __tests__/
    └── services/
        └── providerValidation.test.ts # novos casos de teste Speechify
```

**Structure Decision**: projeto único (React 19 + TS + Vite), sem separação
backend/frontend. A feature toca só a camada de serviços/hooks de TTS já
existente (`src/services/`, `src/utils/`, `src/hooks/`), sem nova tela, sem
nova pasta.

## Complexity Tracking

*Vazio — nenhuma violação da constitution a justificar.*

## Estratégia de Testes

Prioridade: unitário (Vitest, mockando `fetch`) → nenhuma camada de
contrato/integração própria aplicável (API externa) → manual contra a API
viva como último passo obrigatório (FR-008), não como substituto dos
automatizados.

Comandos-base:

```powershell
npx vitest run src/__tests__/services/providerValidation.test.ts
npm run lint
npm test
npx tsc --noEmit
npm run build
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| US1 — modelo seguro (`simba-3.0` sempre) | Concluída. |
| US2 — `simba-3.2` por voz + fallback | Concluída. `modelId` flui de `listCompatibleVoices` até `synthesize` via `TtsPlaybackConfig`/`useTTS.ts`. |
| Validação manual (FR-008/quickstart.md) | **Concluída de verdade** — testada no device real (2026-09-03): inglês sintetizou com `simba-3.2`, português com `simba-3.0`. R-001 e R-003 resolvidos. |
| Feature | **Implementada** — todas as 19 tasks concluídas, gate final limpo. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Não confirmado se `GET /v1/voices` retorna literalmente `"simba-3.2"` em `models[].name` na API viva (só inferido por analogia ao padrão atual, onde o nome já bate com o valor de `model` da síntese). | Se o nome real for diferente, nenhuma voz seria detectada como suportando `simba-3.2` e tudo cairia pra `simba-3.0` — sem quebra, só sem o ganho de latência. | **Resolvido**: confirmado contra a API viva em 2026-09-03 (script único, fora do repo) — `GET /v1/voices` retorna 992 vozes, 8 delas com `simba-3.2` literal em `models[].name` (`beatrice_32`, `dominic_32`, `edmund_32`, `geffen_32`, `harper_32`, `hugh_32`, `imogen_32`, `wyatt_32` — todas `en-US`/`en-GB`). A voz padrão `carly` NÃO suporta `simba-3.2` (só `simba-3.0`/`simba-english`/`simba-multilingual`) — confirma que o fallback da Decisão Invariante é o caminho real pra maioria dos usuários hoje, não só um caso teórico. |
| R-002 | Não há telemetria de quais vozes/idiomas usuários reais têm salvos hoje em produção. | Não dá pra testar contra a distribuição real de vozes salvas. | **Resolvido**: mitigação confirmada pela auditoria de convergência — o teste no device real usou justamente `carly` (a voz padrão, sem suporte a `simba-3.2`) e o fallback funcionou exatamente como projetado, sem depender de conhecer a distribuição real de vozes salvas. |
| R-003 | A conta associada à key local de `.env` está sem créditos (`402 payment_required` em toda chamada `POST /v1/audio/speech`, inclusive com o modelo antigo `simba-english` — não é um erro `model_retired`, é billing). Não foi possível confirmar ponta a ponta que a síntese retorna áudio válido com `simba-3.0`/`simba-3.2`. | FR-008/SC-002 ("confirmar áudio válido") não pode ser fechado 100% sem créditos na conta — só a parte de metadados de voz (`GET /v1/voices`) foi confirmada ao vivo. | **Resolvido**: usuário testou no device real (2026-09-03) — narração em inglês usou `simba-3.2` e em português usou `simba-3.0`, exatamente como projetado. Síntese de áudio confirmada ponta a ponta na prática (o 402 do script isolado não refletia o app real — key/conta usada pelo app tinha crédito). FR-008/SC-001/SC-002/SC-003 fechados por completo. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-03 | Fase 3 (US1) | `pickSpeechifyModel` reescrito com assinatura final `(language, modelId?)`; sem `modelId` disponível ainda, tudo sintetiza via `simba-3.0` — risco de `model_retired` já eliminado. 2 testes novos (en/pt-BR) cobrindo `model` e `language` enviados. `npx vitest run providerValidation.test.ts` 26/26, `npm run lint` e `npm run build` limpos. | Fase 4 (US2) ainda não iniciada — `simba-3.2` ainda não é usado em nenhum caso. |
| 2026-09-03 | Fase 4 (US2) | `modelId` plugado ponta a ponta: `SpeechifyService` marca `modelId: 'simba-3.2'` na voz quando `models[].name` declara suporte (`voiceSupportsSimba32`); `PremiumTtsSynthesisOptions`/`SpeechifySpeechOptions` ganharam o campo; `getPlaybackTtsVoiceModelId` novo em `ttsVoiceSelection.ts`; `useTTS.ts` repassa nos 2 pontos de síntese premium. `providerValidation.test.ts` 30/30, `useTTS.test.tsx` 23/23, `npm run lint` e `npm run build` limpos. | Validação manual contra API viva (FR-008) ainda não feita — R-001 (`models[].name` real bater com `'simba-3.2'`) segue em aberto até essa validação. |
| 2026-09-03 | Fase 5 (Polish, parcial) | T013 feito (fixtures antigas atualizadas, 30/30 continua passando). T014: rodei `GET /v1/voices`/`POST /v1/audio/speech` reais contra a API da Speechify com a key de `.env` — `GET /v1/voices` confirmou `simba-3.2` real em 8 vozes (`carly` não é uma delas), resolvendo R-001. `POST /v1/audio/speech` retornou `402 payment_required` em toda tentativa (inclusive com o modelo antigo `simba-english` — é billing, não `model_retired`) — não deu pra confirmar áudio válido ponta a ponta. Pausei aqui (R-003) em vez de decidir sozinho se isso fecha FR-008. | R-003 (créditos) bloqueia fechar FR-008/SC-002 100% — decisão do usuário. |
| 2026-09-03 | Fase 5 (Polish, fechamento) | Usuário decidiu aceitar a confirmação parcial de FR-008 (R-003 fica registrado, não bloqueia mais). T015 (gate final) rodado: `npm run lint` limpo, `npx tsc --noEmit` limpo, `npm test` (suite inteira) 804/806 passando (2 skipped pré-existentes, não relacionados), `npm run build` limpo. Todas as 19 tasks de `tasks.md` marcadas, Checklist de Release completo. Feature implementada. | Nenhuma pra fechar a implementação. R-003 segue como nota pra quando houver créditos na conta (não bloqueia mais o backlog). |

| 2026-09-03 | Fase 5 (validação real no device) | Usuário instalou (`npm run android:run`, device `RXCX103NMVZ`) e testou no app de verdade — narração em inglês usou `simba-3.2`, narração em português usou `simba-3.0`. Confirma FR-008/SC-001/SC-002/SC-003 ponta a ponta; resolve R-003 (o `402` do script isolado era da key/conta usada só naquele teste, não do app). | Nenhuma — feature validada por completo, código + comportamento real. |

**PRÓXIMO**: Nenhum — feature implementada e validada no device real. `sdd-converge` pode rodar quando o usuário quiser conferir a implementação contra spec/plan/tasks/constitution.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/services/SpeechifyService.ts` — `pickSpeechifyModel`, `voiceSupportsSimba32`, `modelId` em `SpeechifySpeechOptions`/`listCompatibleVoices`
- `src/services/TtsProviderRegistry.ts` — `PremiumTtsSynthesisOptions.modelId`
- `src/utils/ttsVoiceSelection.ts` — `getPlaybackTtsVoiceModelId` (novo)
- `src/hooks/useTTS.ts` — thread do `modelId` em `speakWithPremium`/`prefetchPremiumChunk`
- `src/__tests__/services/providerValidation.test.ts` — 6 testes novos (US1 + US2)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Prazo externo: `simba-english`/`simba-multilingual` param de ser
  selecionáveis em **2026-09-21** — não é um prazo flexível de projeto.
- A key da Speechify pra validação manual (FR-008) já existe localmente em
  `.env` (`VITE_SPEECHIFY_API_KEY`) — não pedir uma nova ao usuário.
- A conta dessa key está **sem créditos** (`402 payment_required` em toda
  `POST /v1/audio/speech`, confirmado 2026-09-03) — qualquer validação
  futura de síntese de áudio ao vivo (não só metadados de `/v1/voices`) exige
  créditos antes. Não confundir esse 402 com um erro de código.

## Resultado Final

<!-- Anexado pelo sdd-converge — convergência limpa, sem achados. -->

Auditoria de convergência (2026-09-03) confirmou fidelidade total entre
`spec.md`/`plan.md` e o código real — nenhum achado de lacuna, contradição
ou scope creep. Verificado diretamente no código (não só reafirmado dos
Registros de Fase):

- `pickSpeechifyModel` (`SpeechifyService.ts:156-158`) nunca envia
  `simba-english`/`simba-multilingual` — só `simba-3.2` (inglês, voz com
  suporte declarado) ou `simba-3.0` (todo o resto, fail-safe). Confirmado
  que nenhum arquivo de `src/` referencia os modelos retirados como valor
  funcional (só um comentário explicando o porquê).
- `modelId` flui ponta a ponta exatamente como desenhado:
  `SpeechifyService.listCompatibleVoices` (`voiceSupportsSimba32`) →
  `TtsVoiceOption`/`TtsVoiceSelection` → `TtsPlaybackConfig` →
  `getPlaybackTtsVoiceModelId` (`ttsVoiceSelection.ts`) →
  `speakWithPremium`/`prefetchPremiumChunk` (`useTTS.ts`) →
  `SpeechifyService.synthesize`.
- As 5 Decisões Invariantes seguem intactas: decisão por síntese individual
  (não por sessão), fail-safe nunca assume suporte não declarado, `modelId`
  só vem da própria API (nunca inferido/hardcoded), sem pin de
  `Speechify-Version`, sem mudança de schema Dexie.
- Os 5 princípios da constitution seguem compatíveis — confirmado contra o
  código, não só reafirmado do Constitution Check original (comentários nos
  pontos não óbvios, nenhuma abstração nova além do necessário, build/lint
  limpos, nenhuma dependência nova).
- Único desvio real do plano original: a abordagem mudou de "simba-3.0 pra
  tudo" (recomendação do assessment) pro split `simba-3.2`/`simba-3.0` por
  voz, decidido na entrevista do `sdd-specify` — já registrado em
  `## Clarifications` de `spec.md`, não é uma divergência silenciosa.
- Validação end-to-end aconteceu em duas camadas: contra a API viva
  diretamente (`GET /v1/voices`, resolveu R-001) e no device Android real
  (resolveu R-003) — narração em inglês usou `simba-3.2`, em português usou
  `simba-3.0`, confirmando SC-001/SC-002/SC-003 na prática, não só em teste
  automatizado.
- `README.md` do projeto não precisou de nenhuma edição — referências a
  "Speechify" ali são genéricas (nome do provider, env var), sem menção a
  nomes de modelo especificos.
