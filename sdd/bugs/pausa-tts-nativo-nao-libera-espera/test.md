# Bug Verification: Pausa do TTS nativo não libera espera de interrupção

- **Slug**: pausa-tts-nativo-nao-libera-espera
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

A reprodução automatizada (probe R08) não reproduz mais: a pausa nativa conclui com `speak()`
pendurado. Testes novos e suites TTS relevantes passam. Resultado `partial` porque build, suite
completa e QA em device não foram executados nesta fase.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts reports/code-review-2026-10-10/tts.probe.tsx` | pass | Probe R08 afirma o defeito (`pauseSettled === false`) e agora falha com `expected true to be false` = pausa conclui |
| Testes novos/atualizados | `npx vitest run src/__tests__/hooks/useTTS.test.tsx src/__tests__/hooks/useTtsSleepTimer.test.ts` | pass | 39/39, inclui os 2 testes R08 |
| Regressão relacionada | `npx vitest run src/__tests__/hooks/useTranslatedAudiobookPlayback.test.tsx src/__tests__/screens/ReaderScreen*.tsx` | pass | 126/126 (inclui o fluxo R09 de `waitForMoreChunks`) |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | sem erros |
| Lint (arquivos alterados) | `npx eslint src/hooks/useTTS.ts src/__tests__/hooks/useTTS.test.tsx` | pass | sem avisos |
| Build / suite completa / lint global | `npm run build`, `npm test`, `npm run lint` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |
| QA em device Android | pausa/retomada rápida com TTS nativo | not-run | sem device nesta sessão |

## Output Excerpts

```
× ... R08: native pause remains pending after stop acknowledges interruption
  → expected true to be false // Object.is equality
Tests  39 passed (39)
Tests  126 passed (126)
```

## Residual Risks

- O comportamento real do plugin Android (speak() nunca resolver após stop) é simulado por mock; não validado em device.
- `stop()` continua lendo o ack do ref após o await (comportamento anterior, inalterado).

## Recommendation

Segurar até o orquestrador rodar build/suite completa; depois disso, fechar. Idealmente validar
pausa/retomada no device.
