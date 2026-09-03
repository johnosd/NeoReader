---
description: "Tasks: Migração Speechify simba-english/simba-multilingual → simba-3.2/simba-3.0"
---

# Tasks: Migração Speechify simba-english/simba-multilingual → simba-3.2/simba-3.0

**Input**: Documentos de design de `sdd/specs/008-migracao-speechify-simba-3/`

**Prerequisites**: `plan.md`, `spec.md`, `quickstart.md`

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- Projeto único (React 19 + TS + Vite + Capacitor), sem separação backend/frontend — `src/` na raiz.
- Serviço tocado: `src/services/SpeechifyService.ts` e `src/services/TtsProviderRegistry.ts`.
- Helper novo: `src/utils/ttsVoiceSelection.ts`.
- Hook tocado: `src/hooks/useTTS.ts`.
- Testes em `src/__tests__/services/providerValidation.test.ts`, convenção existente (imports explícitos de `'vitest'`).

---

## Phase 1: Setup

Nenhuma task de setup necessária nesta feature — sem dependências novas, sem estrutura de pastas nova, sem tipos novos (reaproveita `modelId` já existente em `TtsVoiceOption`/`TtsVoiceSelection`, `src/types/tts.ts`).

---

## Phase 2: Foundational (Blocking Prerequisites)

Nenhuma fase Foundational necessária — User Story 1 é autocontida (só altera `pickSpeechifyModel`). A infraestrutura de `modelId` (options/registry/hook) fica dentro da própria fase da User Story 2, já que só ela depende disso.

---

## Phase 3: User Story 1 - Narração Speechify continua funcionando após o desligamento (Priority: P1) 🎯 MVP

**Objetivo**: Nenhuma síntese Speechify envia mais `simba-english`/`simba-multilingual` — todo idioma passa a usar `simba-3.0`, sem quebra.

**Independent Test**: Com key Speechify válida, iniciar narração em um livro em inglês e em outro em pt-BR; confirmar áudio sintetizado sem erro `model_retired` em ambos.

### Testes da Fase

- [X] T001 [P] [US1] Editar `src/__tests__/services/providerValidation.test.ts` — novo teste: `SpeechifyService.synthesize` com `language: 'en-US'` envia `model: 'simba-3.0'` no corpo da requisição (não mais `simba-english`).
- [X] T002 [P] [US1] Editar `src/__tests__/services/providerValidation.test.ts` — novo teste: `SpeechifyService.synthesize` com `language: 'pt-BR'` envia `model: 'simba-3.0'` no corpo da requisição (não mais `simba-multilingual`).

### Implementation

- [X] T003 [US1] Editar `src/services/SpeechifyService.ts` — `pickSpeechifyModel` ganha a assinatura final `(language: string, modelId?: string | null)` desde já: retorna `'simba-3.2'` só quando o idioma-base for `en` E `modelId === 'simba-3.2'`, senão `'simba-3.0'` (FR-001/FR-002/FR-003/FR-004). Nesta fase nenhum call site ainda passa `modelId` (isso é a Fase 4), então na prática todo idioma usa `'simba-3.0'` — mas a assinatura já nasce completa pra evitar reescrever a função de novo na Fase 4 e manter `getBaseLanguage` em uso contínuo (sem import temporariamente órfão entre fases, que quebraria `npm run lint` no checkpoint da US1).

**Critério de Conclusão**: nenhuma chamada de síntese Speechify envia `simba-english`/`simba-multilingual`; inglês e demais idiomas sintetizam via `simba-3.0`; T001/T002 passam; `npm run build` limpo.

**Checkpoint**: User Story 1 funcional e testável isoladamente — narração Speechify não quebra em nenhum idioma (ainda sem o ganho de latência do `simba-3.2` pra inglês, que entra na US2).

**Registro da Fase**:

- Status: Concluída
- Feito: `pickSpeechifyModel` em `src/services/SpeechifyService.ts` ganhou a assinatura final `(language, modelId?)`, retornando `simba-3.0` sempre que `modelId` não for `'simba-3.2'` — nenhum call site passa `modelId` ainda, então hoje todo idioma usa `simba-3.0`. Também aproveitado pra fechar o achado A-001 do Analyze (`sdd-plan`): os dois testes novos já conferem `body.language` junto de `body.model`.
- Testes executados: `npx vitest run src/__tests__/services/providerValidation.test.ts` — 26/26 passando. `npm run lint` limpo. `npm run build` (`tsc -b` + Vite) limpo.
- Pendências: nenhuma para esta fase.

---

## Phase 4: User Story 2 - Fallback automático quando a voz de inglês não suporta simba-3.2 (Priority: P2)

**Objetivo**: Inglês usa `simba-3.2` quando a voz selecionada declarar suporte (via `models[].name` de `GET /v1/voices`); cai automaticamente pra `simba-3.0` em qualquer outro caso, sem erro exposto ao usuário.

**Independent Test**: Com uma voz de inglês que suporta `simba-3.2` (confirmada via resposta de `/v1/voices`), iniciar narração e confirmar `model: 'simba-3.2'` no corpo; com uma voz que não suporta (ou nenhuma voz selecionada, caso padrão `carly`), confirmar `model: 'simba-3.0'` — em ambos os casos, síntese bem-sucedida.

### Testes da Fase

- [X] T004 [P] [US2] Editar `src/__tests__/services/providerValidation.test.ts` — novo teste: voz cuja resposta de `/v1/voices` inclui `models: [{ name: 'simba-3.2', ... }]` resulta em `TtsVoiceOption.modelId === 'simba-3.2'` após `SpeechifyService.listCompatibleVoices`.
- [X] T005 [P] [US2] Editar `src/__tests__/services/providerValidation.test.ts` — novo teste: voz cuja resposta de `/v1/voices` NÃO inclui `simba-3.2` em `models[]` resulta em `TtsVoiceOption.modelId === undefined`.
- [X] T006 [P] [US2] Editar `src/__tests__/services/providerValidation.test.ts` — novo teste: `SpeechifyService.synthesize` com `language: 'en-US'` e `modelId: 'simba-3.2'` nas options envia `model: 'simba-3.2'` no corpo.
- [X] T007 [P] [US2] ~~Editar providerValidation.test.ts~~ — já coberto pelo teste da T001 (Fase 3: `language: 'en-US'` sem `modelId` → `model: 'simba-3.0'`), que continua passando sem alteração após o plumbing da US2. Sem duplicar teste idêntico.
- [X] T008 [P] [US2] Editar `src/__tests__/services/providerValidation.test.ts` — novo teste: `SpeechifyService.synthesize` com `language: 'pt-BR'` e `modelId: 'simba-3.2'` (mesmo se presente) ainda envia `model: 'simba-3.0'` — `simba-3.2` é exclusivo de inglês.

### Implementation

- [X] T009 [US2] Editar `src/services/TtsProviderRegistry.ts` — `PremiumTtsSynthesisOptions` ganha `modelId?: string | null`.
- [X] T010 [US2] Editar `src/services/SpeechifyService.ts` — `SpeechifySpeechOptions` ganha `modelId?: string | null`, repassado pra `pickSpeechifyModel` dentro de `synthesize` (a função em si já tem a assinatura certa desde T003, não muda de novo aqui); mapeamento voz→`TtsVoiceOption` dentro de `listCompatibleVoices` passa a setar `modelId: 'simba-3.2'` quando `models[].name` da voz (já parseado por `normalizeSpeechifyVoice`, checado pela nova `voiceSupportsSimba32`) incluir `'simba-3.2'`, senão deixa `undefined`. Comentário curto no ponto onde `modelId` é lido/repassado, explicando por que ausência de suporte declarado sempre cai pro modelo seguro (Constitution II, Decisões Invariantes de `plan.md`).
- [X] T011 [P] [US2] Criar `getPlaybackTtsVoiceModelId(config: TtsPlaybackConfig, provider: TtsProvider)` em `src/utils/ttsVoiceSelection.ts`, espelhando `getPlaybackTtsVoiceId` — lê de `config.voiceSelections?.[provider]?.modelId`.
- [X] T012 [US2] Editar `src/hooks/useTTS.ts` — em `speakWithPremium` (~linha 489-554) e `prefetchPremiumChunk` (~linha 758-775), obter `modelId` via `getPlaybackTtsVoiceModelId(config, provider)` e repassar em `synthesizePremiumTts(provider, text, { ..., modelId })`.

**Critério de Conclusão**: vozes que declaram suporte a `simba-3.2` (via API, nunca inferido) são usadas em inglês; qualquer voz sem esse suporte — incluindo a padrão `carly` sem seleção explícita — cai automaticamente pra `simba-3.0`, sem erro exposto ao usuário; idiomas não-inglês permanecem em `simba-3.0` independente do `modelId`; T004-T008 passam; `npm run build` limpo.

**Checkpoint**: User Story 2 funcional — narração em inglês usa o modelo de menor latência quando a voz suporta, com fallback automático e transparente quando não suporta.

**Registro da Fase**:

- Status: Concluída
- Feito: `modelId` agora flui ponta a ponta — `SpeechifyService.listCompatibleVoices` marca `modelId: 'simba-3.2'` na `TtsVoiceOption` quando a voz declara suporte (`voiceSupportsSimba32`, checagem exata em `models[].name`); `PremiumTtsSynthesisOptions`/`SpeechifySpeechOptions` ganharam o campo; novo helper `getPlaybackTtsVoiceModelId` em `ttsVoiceSelection.ts`; `useTTS.ts` repassa o `modelId` da voz selecionada nos 2 pontos de síntese premium (`speakWithPremium`, `prefetchPremiumChunk`). `pickSpeechifyModel` (já com a assinatura certa desde a Fase 3) agora recebe `modelId` de verdade.
- Testes executados: `npx vitest run src/__tests__/services/providerValidation.test.ts` — 30/30 passando (4 novos: T004, T005, T006, T008; T007 reaproveitou o teste da T001). `npx vitest run src/__tests__/hooks/useTTS.test.tsx` — 23/23 passando (threading do `modelId` não quebrou nenhum teste existente). `npm run lint` limpo. `npm run build` (`tsc -b` + Vite) limpo.
- Pendências: nenhuma para esta fase. Fixtures de teste com `'simba-multilingual'` como nome de modelo de exemplo (linhas ~544/~583, hoje não afetadas pois `toEqual` ignora `modelId: undefined`) ficam pra limpeza na T013 (Polish).

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Limpeza, gate final de qualidade e validação manual obrigatória contra a API viva.

- [X] T013 [P] Editar `src/__tests__/services/providerValidation.test.ts` — atualizar os 2 fixtures antigos que ainda citam `'simba-multilingual'` como exemplo de `models[].name` (linhas ~544 e ~583 no momento desta spec) para nomes atuais (`'simba-3.0'`/`'simba-3.2'`), evitando sugerir nomenclatura retirada. Não bloqueante — só clareza.
- [X] T014 Rodar a validação manual completa de `quickstart.md` (Cenários A, B e C) contra a API viva da Speechify (key local em `.env`) — obrigatória por FR-008/SC-002. **Concluída por completo**: `GET /v1/voices` confirmou `simba-3.2`/vozes/`carly` reais (R-001); depois o usuário instalou no device real (`npm run android:run`) e testou de verdade — narração em inglês usou `simba-3.2`, em português usou `simba-3.0`, exatamente como projetado (R-003 resolvido).
- [X] T015 Rodar `npm run lint && npm test && npx tsc --noEmit && npm run build` como gate final (Constitution IV).

### Checklist de Release

- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Testes automatizados cobrindo os 3 caminhos de decisão de modelo (FR-007: inglês com voz suportada, inglês sem suporte, não-inglês) passando
- [X] Validação manual contra API viva da Speechify concluída (FR-008 / `quickstart.md`) — confirmada por completo: teste real no device (inglês → `simba-3.2`, português → `simba-3.0`)
- [X] `npm run lint && npm test && npx tsc --noEmit && npm run build` limpos

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup / Foundational**: N/A — ver notas acima.
- **User Story 1 (Fase 3)**: sem dependências, pode começar imediatamente.
- **User Story 2 (Fase 4)**: depende da Fase 3 estar concluída (parte da mesma função `pickSpeechifyModel` tocada em T003 é estendida em T010) — não roda em paralelo com a Fase 3.
- **Polish (Fase 5)**: depende das Fases 3 e 4 concluídas.

### Parallel Opportunities

- T001/T002 (Fase 3) podem rodar em paralelo entre si.
- T004-T008 (Fase 4) podem rodar em paralelo entre si (mesmo arquivo de teste, mas blocos `it(...)` independentes).
- T011 (Fase 4) pode rodar em paralelo com T009/T010 (arquivos diferentes).

---

## Parallel Example: User Story 2

```bash
# T004-T008 podem ser escritos juntos antes de T009-T012 (TDD)
Task: "T004 [P] [US2] ..."
Task: "T005 [P] [US2] ..."
Task: "T006 [P] [US2] ..."
Task: "T007 [P] [US2] ..."
Task: "T008 [P] [US2] ..."
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 3: User Story 1 — elimina o risco de `model_retired`, sem otimização de latência ainda.
2. **PARAR E VALIDAR**: rodar T001/T002 + `npm run build`; opcionalmente já rodar o Cenário C de `quickstart.md` (não-inglês) pra confirmar na prática.

### Incremental Delivery

1. User Story 1 → risco de produção eliminado (deploy possível mesmo sozinha, antes de 2026-09-21).
2. User Story 2 → otimização de latência em inglês com fallback seguro, sem quebrar o que a US1 já entregou.
3. Polish → validação manual obrigatória (FR-008) + gate de qualidade antes de reportar concluído.

## Notes

- `[P]` = arquivos diferentes ou blocos de teste independentes, sem dependência real.
- `[Story]` mapeia a task pra uma user story específica.
- Commitar após cada task ou grupo lógico coerente.
- Parar no checkpoint da Fase 3 pra validar a User Story 1 isoladamente, se o prazo (2026-09-21) exigir entregar o mínimo primeiro.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
