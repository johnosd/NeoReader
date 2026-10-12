- **Slug**: links-externos-opds-recebem-credencial-catlogo
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A autenticação OPDS agora é enviada somente quando a origem efetiva do destino coincide com a origem do catálogo. Isso evita expor credenciais em links externos de feed, busca, capa e aquisição, preservando o acesso autenticado ao mesmo origin.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/services/opds/OpdsCatalogService.ts` | modified | Adiciona comparação de origem após normalização HTTPS para feed, OpenSearch e capas. |
| `src/services/opds/OpdsDownloadService.ts` | modified | `authHeaders` recebe a URL de aquisição e omite credencial em origem externa. |
| `src/__tests__/services/opds/OpdsCatalogService.test.ts` | modified | Regressões para página e capa externas sem Authorization. |
| `src/__tests__/services/opds/OpdsDownloadService.test.ts` | modified | Regressão para aquisição externa sem Authorization. |

## Tests Added or Updated

- `OpdsCatalogService.test.ts::não envia Authorization para página de outra origem` — trava paginação externa sem credencial.
- `OpdsCatalogService.test.ts::não envia Authorization para capa de outra origem` — trava capa externa sem credencial.
- `OpdsDownloadService.test.ts::não manda Authorization ao plugin para aquisição em outra origem` — trava download externo sem credencial.

## Local Verification

- Comandos rodados: `npx.cmd vitest run src/__tests__/services/opds/OpdsCatalogService.test.ts src/__tests__/services/opds/OpdsDownloadService.test.ts` → 2 arquivos, 35 testes passaram.
- Comandos rodados: `npm.cmd run lint` → passou.
- Comandos rodados: `npx.cmd tsc --noEmit` → passou.
- Comandos rodados: `npm.cmd run build` → passou; permaneceu apenas o aviso existente de chunk grande.
- Checagens manuais: revisão do diff confirmou que `testConnection` continua usando a credencial explícita para o próprio `baseUrl`.

## Deviations from Assessment

Nenhum.

## Follow-ups

- Validar redirects no plugin Android em QA nativo; a regra JS protege a URL solicitada, mas não controla o destino final de um redirect HTTP.
- Considerar no futuro uma lista explícita de origens autorizadas se catálogos legítimos exigirem múltiplos hosts.
