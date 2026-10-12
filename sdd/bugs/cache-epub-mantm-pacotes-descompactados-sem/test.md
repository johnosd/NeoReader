# Bug Verification: Cache de EPUB mantém pacotes descompactados sem limite

- **Slug**: cache-epub-mantm-pacotes-descompactados-sem
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A reprodução automatizada (probe R11) não reproduz mais: depois de 8 livros o cache fica com 3 entradas. Testes novos e antigos passam, type-check/lint dos arquivos alterados e corpus de EPUB passam. Resultado `partial` porque build e suíte completa não foram rodados nesta fase (serão rodados pelo orquestrador) e não houve medição em device.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts reports/code-review-2026-10-10/data.probe.ts -t R11` | pass | A probe afirma o bug (`size === 8`); agora falha com `expected 3 to be 8` — o sintoma sumiu |
| Testes novos/atualizados | `npx vitest run src/__tests__/services/EpubService.test.ts` | pass | 32/32 (5 novos de LRU) |
| Regressão relacionada | `npx vitest run src/__tests__/services/EpubService.test.ts src/__tests__/services/bookInfo` | pass | 78/78 em 7 arquivos |
| Corpus EPUB | `npm run test:debug-epubs` | pass | 71/71 em 2 arquivos |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | sem saída |
| Lint (arquivos alterados) | `npx eslint src/services/EpubService.ts src/__tests__/services/EpubService.test.ts` | pass | sem saída |
| Build | `npm run build` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |
| Suite completa | `npm test` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |

## Output Excerpts

```
× R11: decompressed packages remain retained for every visited book
  → expected 3 to be 8 // Object.is equality
Test Files  7 passed (7) / Tests  78 passed (78)
test:debug-epubs → Test Files 2 passed (2) / Tests 71 passed (71)
```

## Residual Risks

- Sem medição de heap/RSS em device com corpus real.
- Livros com pacote > 48 MiB não ficam em cache: `EpubBookInfoProvider` pode re-descompactar se chamar depois que `parseExtras` já resolveu (chamadas concorrentes continuam compartilhando).
- O pico de memória do unzip completo continua igual (só a retenção foi limitada).

## Recommendation

Segurar até o orquestrador rodar build + suíte completa; se passarem, fechar. Medição em device é desejável mas não bloqueante.
