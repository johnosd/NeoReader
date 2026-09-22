# Implementation Plan: Buffer e Lookahead de TTS na língua nativa

**Slug**: `020-tts-buffer-lookahead` | **Date**: 2026-09-21 | **Spec**: `sdd/specs/020-tts-buffer-lookahead/spec.md`

## Summary

Expandir o lookahead do TTS para manter até 3 frases adiantadas em memória (atualmente só pré-sintetiza 1), gerenciando de forma assíncrona falhas (retries transparentes) e o descarte do buffer (abort) em casos de pulo de navegação (seek).

## Technical Context

**Language/Version**: TypeScript / React 19

**Primary Dependencies**: Capacitor 8 (Web/Android), foliate-js (parser EPUB)

**Storage**: Cache de áudios em memória (já via `TtsAudioCache`) e blob caching nativo.

**Testing**: Vitest (`npm test`)

**Target Platform**: Android nativo e Web (Capacitor)

**Performance Goals**: Latência menor que 50ms (imperceptível) na transição de frases por conta da pronta disponibilidade em memória.

**Constraints**: Sandbox do iframe `EpubViewer.tsx` (não relevante para lookahead porque ele é orquestrado no `useTTS.ts` fora do iframe).

**Scale/Scope**: Local-first; o impacto de memória para até 3 requisições é baixo.

## Decisões Invariantes

- A orquestração do prefetch ocorrerá em `useTTS.ts`, que já tem contexto total sobre os chunks sequenciais e a `playSession`.
- O buffer será dimensionado fixamente (ex. max 3 chunks à frente) sem lógicas preditivas complexas — apenas varrer `index + 1, index + 2, index + 3`.
- `AbortController` será injetado nos prefetches para permitir que `seek` cancele downloads imediatamente e poupe rede (atualmente prefetches não enviam `signal` para o `synthesizePremiumTts`).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | PASS | PASS | Este plano desenha a expansão de lookahead explícita. |
| II. Comentários só onde o "porquê" não é óbvio | PASS | PASS |  |
| III. Explícito antes de mágico | PASS | PASS | Abordagem usa iteração simples em array para prefetch, sem bibliotecas mágicas de task queue. |
| IV. Build limpo | PASS | PASS | Testes automatizados cobrirão as mudanças. |
| V. Dependências novas justificadas | PASS | PASS | Nenhuma biblioteca nova será introduzida. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/020-tts-buffer-lookahead/
├── spec.md              
├── plan.md               
├── tasks.md               
```

### Source Code (repository root)

```text
src/
├── hooks/
│   └── useTTS.ts                 # Orquestrador do player e loop de TTS
├── services/
│   ├── TtsAudioCache.ts          # Onde o áudio premium é salvo em blob
│   └── ElevenLabsService.ts / SpeechifyService.ts # Serviços de backend TTS (recebem AbortSignal)
├── __tests__/
│   └── hooks/
│       └── useTTS.test.tsx
```

**Structure Decision**: A implementação modifica majoritariamente o loop de play e os métodos de abort e prefetch no `useTTS.ts`. Adicionalmente, exigirá plugar o `AbortController` nas chamadas de `prefetchPremiumChunk`.

## Complexity Tracking

> **Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas**

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
npm test
npm run build
```

## Estado Atual

| Área | Estado |
| --- | --- |
| Cancelamento/Retry de Prefetch (Fase 1) | Pronto |
| Lookahead 3 chunks (Fase 2 / US1) | Pronto |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Condição de Corrida (Race condition) ao dar seek durante prefetch ativo | Pode tentar tocar o novo trecho enquanto os abortos das promises velhas causam side-effects. | Vincular prefetches diretamente ao `playSessionRef.current` da sessão; abortar os sinais no evento de stop/seek, garantindo que as chamadas não mudem o state de buffers da nova playSession. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-21 | Fase 1 (Foundational) | T001-T004 implementadas, com retry e cancelamento abortáveis via signal | Nenhuma |
| 2026-09-21 | Fase 2 (US1) | T005-T006 implementadas: lookahead expandido para 3 chunks concorrentes e coberto por teste | Nenhuma |

**PRÓXIMO**: Fase 3 (Polish & Cross-Cutting Concerns)

## Arquivos Principais

- `src/hooks/useTTS.ts`
- `src/__tests__/hooks/useTTS.test.tsx`

## Cuidados para Retomada

- (nenhum ainda)

