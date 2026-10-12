# Bug Verification: Backup de API keys atravessa contas

- **Slug**: backup-api-keys-atravessa-contas
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

Com contas distintas simuladas (nome do banco Dexie + Preferences em memória),
a conta nova não recebe mais a key de outra conta nem a legada; o dono do banco
legado migra a key antiga e apagar a key não a ressuscita. Build e suite completa
não foram rodados nesta fase (coordenação com outros agentes), e não houve
validação em device — por isso `partial`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run src/__tests__/db/settings.apiKeyBackup.test.ts` (teste "conta nova não herda...") | pass | Equivalente automatizado do R12 com dono distinto; o probe do relatório não serve (usa o banco legado e um mock `endsWith` que casa com a chave nova) |
| Testes novos/atualizados | `npx vitest run src/__tests__/db/settings.apiKeyBackup.test.ts src/__tests__/db/settings.test.ts` | pass | 13/13, rodado 8 vezes seguidas; 1 execução anterior teve 5 falhas não reproduzíveis, coincidente com edições paralelas de outros agentes no working tree |
| Regressão próxima | `npx vitest run src/__tests__/hooks/useUserSettings.test.tsx src/__tests__/screens/SettingsIntegrationsScreen.test.tsx` | pass | 6/6 |
| Lint | `npx eslint src/db/settings.ts src/__tests__/db/settings.apiKeyBackup.test.ts` | pass | |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | |
| Build / suite completa | `npm run build` / `npm test` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |
| Device (login A → key → login B) | manual | not-run | Sem device nesta sessão |

## Output Excerpts

```
Test Files  2 passed (2)
     Tests  13 passed (13)
```

## Residual Risks

- Uma key gravada por outra conta na chave legada antes desta correção ainda pode ser herdada pelo dono do `NeoReaderDB`, se o IndexedDB dele estiver vazio (ver assessment).
- Comportamento real do `Preferences.remove` no Android não exercitado.

## Recommendation

Segurar até o orquestrador rodar build + suite completa; depois, fechar. Validação em device é desejável, mas não bloqueante.
