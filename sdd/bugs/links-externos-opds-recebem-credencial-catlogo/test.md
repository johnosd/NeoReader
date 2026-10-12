- **Slug**: links-externos-opds-recebem-credencial-catlogo
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A reprodução pós-fix foi executada pelos testes de regressão: same-origin continua autenticado e destinos externos em paginação, capa e aquisição ficam sem `Authorization`. Os gates de qualidade também passaram.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx.cmd vitest run src/__tests__/services/opds/OpdsCatalogService.test.ts src/__tests__/services/opds/OpdsDownloadService.test.ts` | pass | 2 arquivos, 35 testes; inclui os cenários externos do R07. |
| Testes novos/atualizados | Mesmo comando focado | pass | Página e capa externas não recebem header; aquisição externa não recebe header. |
| Suite de regressão | `npm.cmd test -- --run` | pass | 150 arquivos passaram, 2 ignorados; 1.562 testes passaram, 2 ignorados. |
| Lint / type-check | `npm.cmd run lint` e `npx.cmd tsc --noEmit` | pass | Sem erros. |
| Build | `npm.cmd run build` | pass | Build concluído; aviso existente de chunk grande. |

## Output Excerpts

- `Test Files 150 passed | 2 skipped (152)`
- `Tests 1562 passed | 2 skipped (1564)`
- Build Vite concluído com sucesso.

## Residual Risks

- Não houve QA Android do comportamento de redirects nativos; a checagem cobre a URL solicitada antes do plugin.
- Catálogos que legitimamente exigem credencial em múltiplas origens continuam sem suporte explícito a uma allowlist.

## Recommendation

Fechar o R07 como verificado no escopo JavaScript. Manter QA nativo de redirects como follow-up de segurança antes de ampliar uso de catálogos privados.
