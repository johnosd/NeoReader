# Bug Verification: Paginação OPDS atrasada contamina outra pasta

- **Slug**: paginacao-opds-atrasada-contamina-outra-pasta
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

A reprodução original (probe R17) não reproduz mais: a página atrasada da
pasta A é descartada e a lista de B fica só com B. Testes novos/afetados,
type-check e lint passam. `partial` porque build e suite completa não foram
rodados aqui (working tree compartilhado com outros agentes) e não houve
teste manual em device/navegador.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts reports/code-review-2026-10-10/ui.probe.tsx -t R17` | pass | o probe afirma o defeito; agora falha com `expected ['B'] to deeply equal ['B','A-old']` = bug não reproduz |
| Testes novos/atualizados | `npx vitest run src/__tests__/hooks/useOpdsCatalogBrowse.test.ts src/__tests__/screens/OpdsCatalogBrowseScreen.test.tsx src/__tests__/hooks/useOpdsCatalogs.test.ts` | pass | 3 arquivos, 28 testes; os 2 testes novos falham contra o hook do HEAD (checado na fase Fix) |
| Suite de regressão | `npm test` / `npm run build` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |
| Lint / type-check | `npx eslint` (2 arquivos) / `npx tsc -p tsconfig.app.json --noEmit` | pass | limpos |
| Manual (navegação rápida em catálogo real) | device/navegador | not-run | sem sessão manual |

## Output Excerpts

```
Test Files  3 passed (3)
     Tests  28 passed (28)
AssertionError: expected [ 'B' ] to deeply equal [ 'B', 'A-old' ]   (probe R17)
```

## Residual Risks

- Request obsoleta continua em voo (sem abort) — só custo de rede.

## Recommendation

Segurar até o orquestrador rodar build e suite completa; se passarem, fechar.
