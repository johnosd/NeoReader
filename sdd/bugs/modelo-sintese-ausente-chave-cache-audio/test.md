# Bug Verification: Modelo de síntese ausente da chave do cache de áudio TTS

- **Slug**: modelo-sintese-ausente-chave-cache-audio
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A colisão de chave entre modelos não reproduz mais (probe R13 agora falha, como esperado após o fix);
testes novos e relacionados passam. `partial` só porque build/suite completa ficaram para o orquestrador.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts reports/code-review-2026-10-10/translation.probe.ts -t R13` | pass | Probe afirma a colisão (`toBe`) e agora falha: chaves diferentes |
| Testes novos/atualizados | `npx vitest run src/__tests__/services/TtsAudioCache.test.ts src/__tests__/hooks/useTTS.test.tsx` | pass | incluídos na execução abaixo |
| Regressão relacionada | `npx vitest run ...TtsAudioCache.test.ts ...useTTS.test.tsx ...useTranslatedAudiobookPlayback.test.tsx ...SettingsNarrationScreen.test.tsx` | pass | 46/46 |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | rodado na fase Fix, sem erros |
| Lint (arquivos alterados) | `npx eslint` nos 4 arquivos | pass | rodado na fase Fix |
| Build / suite completa / lint global | `npm run build`, `npm test`, `npm run lint` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |

## Output Excerpts

```
× R13: two synthesis models have the same audio cache key
  → expected 'v2::elevenlabs::same-voice::eleven_mu…' to be 'v2::elevenlabs::same-voice::eleven_v3…'
Tests  46 passed (46)
```

## Residual Risks

- Chave usa o modelo pedido, não o efetivo (possível miss extra, nunca áudio errado).

## Recommendation

Fechar após o orquestrador confirmar build/suite completa.
