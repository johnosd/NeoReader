# Bug Fix: Cache de EPUB mantém pacotes descompactados sem limite

- **Slug**: cache-epub-mantm-pacotes-descompactados-sem
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada pelo usuário sem pausa)

- Manter `packageCache` como `Map`, usando a ordem de inserção como LRU (hit = delete+set).
- Novo `packageCacheBytes` com o tamanho descompactado de cada entrada resolvida.
- Limites: `PACKAGE_CACHE_MAX_ENTRIES = 3` e `PACKAGE_CACHE_MAX_BYTES = 48 MiB`.
- Despejo só de entradas resolvidas (promessa em andamento continua compartilhada).
- Pacote que sozinho excede o orçamento não fica retido; invalidação durante o unzip não deixa contabilidade órfã.
- Testes novos em `EpubService.test.ts`; nada fora de `EpubService.ts`.

## Summary

`EpubService.packageCache` virou um LRU limitado por entradas (3) e por bytes descompactados (48 MiB). Antes cada livro aberto na tela de detalhes deixava o EPUB inteiro descompactado preso até o processo morrer.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/services/EpubService.ts` | modified | LRU em `getEpubPackage`, `packageCacheBytes`, `packageByteSize`, `enforcePackageCacheLimits`; `invalidateExtrasCache` também limpa os bytes |
| `src/__tests__/services/EpubService.test.ts` | modified | Novo `describe` "getEpubPackage - limite do cache (LRU)" com 5 testes |

## Tests Added or Updated

- `EpubService.test.ts::mantem no maximo PACKAGE_CACHE_MAX_ENTRIES e descarta o mais antigo` — limite de entradas e re-unzip do despejado.
- `::um hit reposiciona a entrada como mais recente` — ordem LRU.
- `::respeita o orcamento de bytes e nao retem pacote maior que o orcamento` — orçamento em bytes.
- `::compartilha o unzip em andamento mesmo com o cache cheio` — 1 unzip para chamadas concorrentes.
- `::invalidar durante o unzip nao deixa contabilidade orfa` — corrida invalidação × resolução.

## Local Verification

- `npx vitest run src/__tests__/services/EpubService.test.ts src/__tests__/services/bookInfo` → 7 arquivos, 78 testes passando (inclui os testes antigos de compartilhamento do unzip).
- Probe do relatório (`npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts reports/code-review-2026-10-10/data.probe.ts -t R11`) → a asserção que documentava o bug (`cache.size === 8`) agora falha com `expected 3 to be 8`, ou seja, o cache fica no limite.
- `npx tsc -p tsconfig.app.json --noEmit` → sem erros.
- `npx eslint src/services/EpubService.ts src/__tests__/services/EpubService.test.ts` → sem erros.
- `npm run test:debug-epubs` → 2 arquivos, 71 testes passando.

## Deviations from Assessment

Nenhuma.

## Follow-ups

- Medir em device com corpus real (aceitação do relatório) — não feito aqui.
- Avaliar extração seletiva (OPF/nav/capa) em vez de descompactar todas as imagens para reduzir o pico, não só a retenção.
