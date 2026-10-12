# Bug Fix: Paginação OPDS atrasada contamina outra pasta

- **Slug**: paginacao-opds-atrasada-contamina-outra-pasta
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmação — execução autorizada pelo usuário)

- `queryGenerationRef` no hook, incrementado em `runFetch` e nos cleanups do efeito (troca de pasta/busca/ordem/catálogo e desmontagem).
- `runFetch` reseta `nextPageUrl` e `loadingMore` da consulta anterior.
- `loadMore` captura a geração e descarta sucesso e erro obsoletos (sem tocar `loadingMore`).
- Sem AbortController (o serviço não aceita signal; fora de escopo).
- Testes: navegação com página atrasada; troca de ordem com erro atrasado.

## Summary

`loadMore` só aplica o resultado se a consulta que o originou ainda for a
atual; uma consulta nova zera a paginação anterior e libera o "carregar mais".

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/hooks/useOpdsCatalogBrowse.ts` | modified | `queryGenerationRef`; reset de `nextPageUrl`/`loadingMore` em `runFetch`; checagem de geração em `loadMore` (`.then` e `.catch`) |

## Tests Added or Updated

- `src/__tests__/hooks/useOpdsCatalogBrowse.test.ts::descarta a página atrasada da pasta anterior ao navegar` — entries/nextPageUrl de B intactos; `loadingMore` liberado em B.
- `src/__tests__/hooks/useOpdsCatalogBrowse.test.ts::descarta a página atrasada (inclusive erro) depois de trocar a ordenação` — erro antigo não derruba o `loadingMore` da página 2 da ordem nova.

## Local Verification

- `npx vitest run src/__tests__/hooks/useOpdsCatalogBrowse.test.ts` → 11/11 passam; com o hook do HEAD (cópia temporária via `git show`, restaurada em seguida) os 2 testes novos falham — travam o bug.
- Probe `ui.probe.tsx -t R17` (afirma o defeito) agora falha: `expected ['B'] to deeply equal ['B','A-old']` = bug não reproduz.
- `src/__tests__/screens/OpdsCatalogBrowseScreen.test.tsx` → 10/10.
- `npx tsc -p tsconfig.app.json --noEmit` e `npx eslint` nos 2 arquivos → limpos.

## Deviations from Assessment

Nenhuma.

## Follow-ups

- Opcional: aceitar `AbortSignal` em `OpdsCatalogService.fetchPage` para cancelar a request obsoleta de verdade (hoje só o resultado é descartado).
- `loadMore` chama `fetchPage(catalog, nextPageUrl)` sem `sortOrder` (comportamento anterior, não alterado; o servidor costuma embutir a ordem no link `next`).
