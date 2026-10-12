# Bug Assessment: Paginação OPDS atrasada contamina outra pasta

- **Slug**: paginacao-opds-atrasada-contamina-outra-pasta
- **Criado**: 2026-10-12
- **Origem**: reports/code-review-2026-10-10.md, seção "R17" (reprodução em reports/code-review-2026-10-10/ui.probe.tsx)
- **Veredito**: valid
- **Severidade**: medium

## Report

R17 — P2 — `useOpdsCatalogBrowse.ts:165`: o efeito principal tem
cancelamento, mas `loadMore` não verifica geração, URL atual ou desmontagem
antes de anexar resultados e substituir `nextPageUrl`. Probe: carrega A,
inicia página 2, navega para B e resolve A depois → lista final mistura B/A e
`hasMore` reflete a paginação de A. Impacto: navegação rápida/rede lenta
mistura pastas e pode levar a download de item que não pertence à pasta
exibida. Busca e ordenação também precisam invalidar a paginação anterior.

## Symptom

Resposta atrasada de "carregar mais" da pasta/busca/ordem anterior é anexada
à lista da pasta atual e sobrescreve `nextPageUrl`. Esperado: resultado
obsoleto é descartado.

## Reproduction

1. Render do hook com a pasta A (página com `nextPageUrl`).
2. `loadMore()` com a promise pendente.
3. `navigateTo(B)`; B carrega.
4. Resolver a página 2 de A → `entries = ['B', 'A-old']`, `hasMore = true` (probe R17).

## Suspected Code Paths

- `src/hooks/useOpdsCatalogBrowse.ts:163-174` — `loadMore` aplica `setEntries`/`setNextPageUrl`/`setLoadingMore` sem checar se o contexto (pasta, busca, ordem) ainda é o mesmo.
- `src/hooks/useOpdsCatalogBrowse.ts:76-124` — efeito principal não reseta `loadingMore`/`nextPageUrl` ao iniciar uma consulta nova; um `loadingMore=true` preso de A bloqueia `loadMore` em B até A responder.

## Root Cause Hypothesis

Confiança: high. Falta um token de geração compartilhado entre o efeito de
consulta e `loadMore`; o `cancelled` do efeito é local e não alcança o
`loadMore`.

## Proposed Remediation

**Preferida**: `queryGenerationRef` (useRef numérico). Incrementa ao iniciar
cada consulta (`runFetch`) e no cleanup do efeito (troca de pasta, busca,
ordem, catálogo e desmontagem). `runFetch` também reseta `nextPageUrl` e
`loadingMore`. `loadMore` captura a geração antes do fetch e ignora sucesso,
erro e o reset de `loadingMore` se ela mudou.

**Alternativas**:
- AbortController no fetch: `OpdsCatalogService.fetchPage` não aceita signal; exigiria mexer no serviço (fora de escopo). A geração já impede a contaminação.

**Files likely to change**:
- `src/hooks/useOpdsCatalogBrowse.ts`

**Tests to add or update**:
- `src/__tests__/hooks/useOpdsCatalogBrowse.test.ts`: página atrasada de A após navegar para B é ignorada (entries e hasMore de B); idem após mudar a ordenação; `loadMore` liberado em B mesmo com A pendente.

## Risks & Considerations

- Request de A continua em voo (sem abort) — só custo de rede, sem efeito em estado.
- Resetar `nextPageUrl` no início da consulta esconde "carregar mais" durante o loading — coerente, a lista também será substituída.

## Open Questions

- Nenhuma.
