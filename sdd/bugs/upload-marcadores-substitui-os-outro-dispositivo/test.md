# Bug Verification: Upload de marcadores substitui os de outro dispositivo

- **Slug**: `upload-marcadores-substitui-os-outro-dispositivo`
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma não reproduz mais na reprodução automatizada (dois aparelhos simulados com fake-indexeddb + Drive em memória): o remoto termina com os marcadores de A e B, tombstones se mantêm e falha de leitura não sobrescreve. Resultado `partial` só porque `npm run build` e a suite completa não foram rodados nesta fase (coordenação com outros agentes) e não houve validação em device real com duas contas/aparelhos.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run src/__tests__/services/BookmarkDriveSyncIntegration.test.ts` (cenário A cria X, B cria Y) | pass | Remoto e local de B com X e Y; retry não duplica |
| Probe original R03 | `npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts reports/code-review-2026-10-10/data.probe.ts -t R03` | pass (probe falha, como esperado) | A probe afirma o bug; agora o sync aborta sem escrever (client da probe não tem `getJson`) e `remote-only` permanece |
| Testes novos falham sem o fix | `BookmarkDriveSyncService.ts` revertido temporariamente para `HEAD` (fase Fix) | pass | 5 de 6 testes novos falharam no código antigo |
| Testes novos/atualizados + regressão de bookmarks | `npx vitest run` nos 13 arquivos de `src/__tests__` que citam `BookmarkDrive*`/`restoreBookBookmarksFromDrive`/`syncBookBookmarks` | pass | 12 arquivos passaram, 1 pulado; 311 testes passaram, 1 pulado |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | exit 0 |
| Lint | `npx eslint` nos 5 arquivos alterados | pass | exit 0 |
| Build | `npm run build` | pass | Rodado pelo orquestrador em 2026-10-12 com R01+R03+R09+R07 juntos: lint ok; 152 arquivos e 1.582 testes passaram (2 ignorados); build ok |
| Suite completa | `npm test` | pass | Rodado pelo orquestrador em 2026-10-12 com R01+R03+R09+R07 juntos: lint ok; 152 arquivos e 1.582 testes passaram (2 ignorados); build ok |
| Device real (2 aparelhos) | manual | not-run | Sem dois aparelhos/sessão Drive nesta execução |

## Output Excerpts

```
 Test Files  12 passed | 1 skipped (13)
      Tests  311 passed | 1 skipped (312)
```

```
× R03: uploading bookmarks replaces remote-only bookmarks with the local snapshot
  → expected { Object (bookmarks) } to match object { bookmarks: [ { label: 'local' } ] }
  (sync.failure: "driveClient.getJson is not a function" → nenhuma escrita)
```

## Residual Risks

- Corrida entre `getJson` e `updateJson` com dois aparelhos publicando quase juntos ainda pode perder a alteração de um deles (sem ETag/`If-Match`).
- Sem pull automático: B só recebe X quando sincroniza algo dele ou reimporta.
- 1 GET a mais por sync de livro com arquivo remoto.

## Recommendation

Fechar com ressalva após o orquestrador rodar `npm run build` e `npm test` sem erros. A perda determinística do R03 está corrigida e travada por testes; a concorrência de escrita fica como follow-up junto com o R01 (mesmo `GoogleDriveAppDataService`).
