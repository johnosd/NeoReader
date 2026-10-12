# Bug Assessment: Cache de EPUB mantém pacotes descompactados sem limite

- **Slug**: cache-epub-mantm-pacotes-descompactados-sem
- **Criado**: 2026-10-12
- **Origem**: `reports/code-review-2026-10-10.md` → R11 (P2); reprodução em `reports/code-review-2026-10-10/data.probe.ts` (teste "R11")
- **Veredito**: valid
- **Severidade**: medium

## Report

`EpubService.packageCache` é um `Map` estático (`Map<bookId, Promise<EpubZipPackage>>`) com todos os arquivos do EPUB descompactados. Não há orçamento de bytes, LRU ou descarte quando o consumidor termina; só há invalidação explícita (`invalidateExtrasCache`, chamada ao reextrair capa e em `BookDetailsScreen`) e remoção em caso de erro. A probe abre 8 ZIPs sintéticos de 1 MiB (9.352 bytes comprimidos) e o cache fica com 8 entradas e 8.388.608 bytes descompactados referenciados.

## Symptom

Cada livro cuja tela de detalhes é aberta deixa o EPUB inteiro descompactado (incluindo imagens) preso na memória até o processo morrer. Esperado: retenção limitada e previsível, sem perder o compartilhamento do unzip entre `parseExtras` e `EpubBookInfoProvider` na mesma abertura.

## Reproduction

1. Rodar a probe `R11` de `reports/code-review-2026-10-10/data.probe.ts`: 8 chamadas `EpubService.getEpubPackage(blob, id)` com ids distintos.
2. Observar `packageCache.size === 8` e 8 MiB retidos após a última leitura.

## Suspected Code Paths

- `src/services/EpubService.ts:97` — declaração do `packageCache` sem limite.
- `src/services/EpubService.ts:108-120` — `getEpubPackage` insere e nunca remove (exceto em erro).
- `src/services/EpubService.ts:99-103` — `invalidateExtrasCache` é o único descarte normal.
- Consumidores: `src/services/EpubService.ts:211` (`_parseExtrasInternal`) e `src/services/bookInfo/EpubBookInfoProvider.ts:90`.

## Root Cause Hypothesis

O cache foi criado para deduplicar o unzip entre dois efeitos React concorrentes da tela de detalhes (comentário na linha 93-96), mas não ganhou política de descarte. Como é estático, cresce com cada livro visitado. Confiança: high (lido no código e medido na probe).

## Proposed Remediation

**Preferida**: transformar `packageCache` num LRU limitado dentro do próprio `EpubService`:
- Limite de entradas (pequeno, ex. 3 — o uso real é "tela de detalhes aberta agora") e orçamento de bytes descompactados (ex. 48 MiB).
- Promessas em andamento continuam compartilhadas e nunca são despejadas (não se sabe o tamanho ainda); o tamanho é contabilizado quando a promessa resolve.
- Hit reposiciona a entrada como mais recente (ordem de inserção do `Map`).
- Ao resolver, despeja as entradas resolvidas menos recentes até caber; um pacote que sozinho excede o orçamento não fica retido (quem já tinha a promessa recebe normalmente).
- Invalidação/erro durante o unzip não registra o tamanho de uma promessa que já saiu do cache.

**Alternativas**:
- Extração seletiva (só OPF/nav/capa) em vez de descompactar tudo — reduz o pico, mas muda o parser e o `EpubBookInfoProvider`; fora do escopo de mudança mínima.
- Liberar o cache quando a tela de detalhes desmonta — exige mexer em `BookDetailsScreen`/hooks (fora do escopo de arquivos deste agente) e não cobre outros consumidores.

**Files likely to change**:
- `src/services/EpubService.ts`
- `src/__tests__/services/EpubService.test.ts`

**Tests to add or update**:
- Abrir mais livros que o limite de entradas → cache fica no limite e o mais antigo é descartado (reabrir o antigo descompacta de novo; o recente não).
- Orçamento de bytes: pacotes grandes despejam os mais antigos; pacote maior que o orçamento não fica retido.
- Hit LRU: acessar um livro antigo o mantém ao despejar.
- Concorrência preservada: os testes existentes de "compartilha o unzip" continuam passando.

## Risks & Considerations

- Não conflita com as mitigações de `sdd/bugs/alerta-play-console-uso-memoria-acima/` (WebView `clearCache`, partições do Word Lens, bitmap do TTS) — aquelas não tocam o `EpubService`.
- O leitor (`EpubViewer`/foliate) não usa `packageCache`; só a tela de detalhes e o import (que passa `bookId` indefinido e não usa cache). Risco de afetar a leitura de EPUB é baixo.
- Limite baixo demais pode causar re-unzip ao alternar entre livros na tela de detalhes — custo de CPU aceitável em troca de memória; `extrasCache`/IndexedDB já evitam a maior parte do reparse.

## Open Questions

- Medição em corpus real/celular (aceitação do relatório) não é feita aqui — exige device.
