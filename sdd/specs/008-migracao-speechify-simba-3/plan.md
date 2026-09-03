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
| US1 — modelo seguro (`simba-3.0` sempre) | Concluída. `pickSpeechifyModel(language, modelId?)` já com a assinatura final; nenhum call site passa `modelId` ainda. |
| US2 — `simba-3.2` por voz + fallback | Pendente. |
| Validação manual (FR-008/quickstart.md) | Pendente. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Não confirmado se `GET /v1/voices` retorna literalmente `"simba-3.2"` em `models[].name` na API viva (só inferido por analogia ao padrão atual, onde o nome já bate com o valor de `model` da síntese). | Se o nome real for diferente, nenhuma voz seria detectada como suportando `simba-3.2` e tudo cairia pra `simba-3.0` — sem quebra, só sem o ganho de latência. | Confirmado na validação manual da FR-008/quickstart.md antes de fechar a feature; ajustar a string de comparação em `SpeechifyService.ts` se necessário. |
| R-002 | Não há telemetria de quais vozes/idiomas usuários reais têm salvos hoje em produção. | Não dá pra testar contra a distribuição real de vozes salvas. | O fallback fail-safe (Decisões Invariantes) garante que qualquer voz hoje funcional continua sintetizando, independente de qual seja — não depende de conhecer a distribuição real. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-03 | Fase 3 (US1) | `pickSpeechifyModel` reescrito com assinatura final `(language, modelId?)`; sem `modelId` disponível ainda, tudo sintetiza via `simba-3.0` — risco de `model_retired` já eliminado. 2 testes novos (en/pt-BR) cobrindo `model` e `language` enviados. `npx vitest run providerValidation.test.ts` 26/26, `npm run lint` e `npm run build` limpos. | Fase 4 (US2) ainda não iniciada — `simba-3.2` ainda não é usado em nenhum caso. |

**PRÓXIMO**: Fase 4 (User Story 2) — plumbing de `modelId` (`TtsProviderRegistry.ts`, `SpeechifyService.ts`, `ttsVoiceSelection.ts`, `useTTS.ts`) pra usar `simba-3.2` quando a voz suportar.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/services/SpeechifyService.ts` — `pickSpeechifyModel` (assinatura final, ainda sem `modelId` plugado)
- `src/__tests__/services/providerValidation.test.ts` — 2 testes novos (US1)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Prazo externo: `simba-english`/`simba-multilingual` param de ser
  selecionáveis em **2026-09-21** — não é um prazo flexível de projeto.
- A key da Speechify pra validação manual (FR-008) já existe localmente em
  `.env` (`VITE_SPEECHIFY_API_KEY`) — não pedir uma nova ao usuário.
