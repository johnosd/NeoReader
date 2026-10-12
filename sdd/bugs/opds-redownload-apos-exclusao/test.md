# Bug Verification: Re-download OPDS falha após excluir o livro

- **Slug**: opds-redownload-apos-exclusao
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

A reprodução original (probe R06 com Dexie real + fake-indexeddb) não
reproduz mais: o re-download depois da exclusão grava o vínculo sem
`ConstraintError`. Testes unitários, type-check e lint dos arquivos tocados
passam. Resultado `partial` só porque build e suite completa não foram
rodados aqui (outros agentes editam o mesmo working tree) e não houve teste em
device.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts reports/code-review-2026-10-10/data.probe.ts -t R06` | pass | o probe afirma o defeito; agora falha com "promise resolved undefined instead of rejecting" = bug não reproduz |
| Testes novos/atualizados | `npx vitest run src/__tests__/db/books.deleteBook.test.ts src/__tests__/db/opdsDownloadedEntries.test.ts src/__tests__/services/opds/ src/__tests__/hooks/useOpdsCatalogBrowse.test.ts src/__tests__/hooks/useOpdsCatalogs.test.ts` | pass | 10 arquivos, 87 testes |
| Suite de regressão | `npm test` / `npm run build` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |
| Lint / type-check | `npx eslint <6 arquivos alterados>` / `npx tsc -p tsconfig.app.json --noEmit` | pass | sem erros/avisos |
| Device (excluir + baixar de novo, reiniciar app) | manual | not-run | sem execução em Android nesta sessão |

## Output Excerpts

```
Test Files  10 passed (10)
     Tests  87 passed (87)
AssertionError: promise resolved "undefined" instead of rejecting   (probe R06)
```

## Residual Risks

- Fluxo de UI ponta a ponta (estado do item no catálogo após excluir) só coberto por teste unitário do coordenador.

## Recommendation

Segurar até o orquestrador rodar `npm run build` e a suite completa; se
passarem, fechar. Validação em device é desejável, não bloqueante.
