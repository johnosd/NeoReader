# Bug Verification: Vocabulário remoto apagado ao entrar em outro dispositivo

- **Slug**: vocabulario-remoto-apagado-ao-entrar-outro
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A reprodução automatizada original (probe R01 do code review) foi reexecutada
contra o código corrigido e o sintoma não reproduz mais: o remoto não termina
vazio e `getJson` é chamado antes do publish. Os testes novos e os testes
vizinhos do vocabulário passam; type-check e lint limpos. Build e suite completa
ficaram para o orquestrador (ver tabela). `verified` aqui significa: checagens
críticas focadas executadas e passando — não houve validação em device.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts reports/code-review-2026-10-10/data.probe.ts -t "R01"` | pass (bug não reproduz) | O probe **afirma o comportamento bugado**; agora ele falha em `expect(remote).toMatchObject({ items: [] })` porque o remoto mantém o item. Antes da 2ª iteração do Fix, falhava só no `getJson` e o remoto ainda ficava vazio — achado registrado em fix.md |
| Prova de regressão dos testes novos | Novos testes rodados contra `HEAD:src/services/VocabularyDriveSyncService.ts` (feito na fase Fix) | pass | 5/7 falham no código antigo; os 2 restantes cobrem comportamento já correto |
| Testes novos/atualizados | `npx vitest run src/__tests__/services/VocabularyDriveSyncService.test.ts` | pass | 8/8 |
| Regressão focada | `npx vitest run src/__tests__/db/vocabulary.test.ts src/__tests__/screens/SettingsSyncScreen.test.tsx src/__tests__/App.test.tsx` (junto com o acima) | pass | 4 arquivos, 37 testes |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | exit 0; esse tsconfig exclui `src/__tests__` (o arquivo de teste é checado só pelo transform do Vitest) |
| Lint | `npx eslint` nos 3 arquivos alterados | pass | exit 0 |
| Build | `npm run build` | pass | Rodado pelo orquestrador em 2026-10-12 com R01+R03+R09+R07 juntos: lint ok; 152 arquivos e 1.582 testes passaram (2 ignorados); build ok |
| Suite completa | `npm test` | pass | Rodado pelo orquestrador em 2026-10-12 com R01+R03+R09+R07 juntos: lint ok; 152 arquivos e 1.582 testes passaram (2 ignorados); build ok |
| Device real | reinstalar com usuário Pro + logcat | not-run | fora do escopo desta sessão |

## Output Excerpts

```
× ... R01: an empty local vocabulary overwrites an existing remote vocabulary without reading it
AssertionError: expected { schemaVersion: 1, …(2) } to match object { items: [] }

Test Files  4 passed (4)
     Tests  37 passed (37)
TSC_EXIT=0
ESLINT_EXIT=0
```

## Residual Risks

- Exclusão feita em outro dispositivo ressuscita se este device ainda tiver o item (sem tombstones remotos). Não é perda de dados.
- Corrida read→write entre dois devices publicando simultaneamente pode perder a adição de um deles (sem escrita condicional/ETag).
- Itens restaurados ficam com `bookId: 0`.
- Baseline em localStorage: se apagada, o próximo sync pode ressuscitar exclusões locais (lado seguro).
- Build/suite completa e device não verificados nesta fase.

## Recommendation

Fechar o achado de perda de dados após o orquestrador confirmar `npm run build`
e `npm test` verdes. Tombstones + escrita condicional ficam como follow-up
(feature própria, pois mudam o formato remoto e o client do Drive).
