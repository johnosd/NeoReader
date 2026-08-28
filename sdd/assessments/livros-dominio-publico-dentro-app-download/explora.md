# Assessment Explora: Biblioteca de domínio público dentro do app

- **Slug**: livros-dominio-publico-dentro-app-download
- **Criado**: 2026-08-28
- **Origem**: texto colado (usuário trouxe 3 candidatas: Standard Ebooks, Gutendex, Open Library API)

## Ideia Bruta

Permitir que o usuário navegue e baixe EPUBs de domínio público diretamente
dentro do NeoReader, sem precisar trazer o próprio arquivo. O usuário
sugeriu 3 fontes candidatas:

1. **Standard Ebooks** — curadoria rigorosa, tipografia profissional, EPUBs
   com HTML limpíssimo, catálogo via OPDS. Acervo pequeno, só clássicos.
2. **Gutendex** — API REST/JSON open source sobre todo o catálogo do
   Project Gutenberg. Volume gigantesco, mas HTML interno dos EPUBs pode ser
   inconsistente.
3. **Open Library API** — braço do Internet Archive, forte em metadados,
   biografias e capas em alta resolução.

## Evidência a Favor

- **Import pipeline já aceita esse fluxo sem mudança estrutural**:
  `BookImportService.importEpub(file: File, ...)` ([BookImportService.ts:117](../../../src/services/BookImportService.ts#L117))
  recebe um `File` genérico — um EPUB baixado da rede e convertido em
  `File`/`Blob` entra pelo mesmo pipeline de hash/dedupe/metadados/capa que
  já existe hoje para import local. Não é preciso reconstruir
  dedupe/storage/schema.
- **Precedente direto para o problema de CORS já existe no repo**:
  `FishAudioService.ts` já resolve exatamente esse tipo de chamada a
  terceiro — usa `CapacitorHttp` (plugin nativo do Capacitor, sem CORS) em
  Android e `fetch` com proxy de dev do Vite na Web
  ([FishAudioService.ts:332](../../../src/services/FishAudioService.ts#L332),
  [vite.config.ts:63](../../../vite.config.ts#L63)). O padrão arquitetural
  para "falar com API de terceiro que não tem CORS liberado" já foi
  validado em produção (Android) pelo menos uma vez.
- **Gutendex confirmado funcional e sem custo/chave**: testado ao vivo
  (`GET https://gutendex.com/books/?languages=pt`) — retornou HTTP 200,
  `count: 648` livros em português, formatos incluindo
  `application/epub+zip`. API aberta (MIT), sem autenticação, sem rate
  limit publicado.
- **Fit forte com a missão do produto**: CLAUDE.md descreve o NeoReader
  como focado em "incentivar a leitura" e "facilitar o aprendizado de
  inglês" — uma biblioteca embutida de clássicos public domain (incluindo
  em inglês, via Standard Ebooks/Gutenberg) ataca as duas metas ao mesmo
  tempo: reduz fricção de "preciso trazer meu próprio EPUB" no primeiro uso
  e dá material de leitura em inglês pronto pro Word Lens/TTS.
- **Standard Ebooks: download individual é livre**, sem paywall — só o
  feed OPDS (para consumo automatizado/bulk) é restrito a
  supporters/patrons/sponsors. Um fluxo que baixa EPUBs individuais por URL
  direta (sem depender do feed OPDS) evita essa barreira. `ASSUMPTION`: a
  API/HTML de listagem de `standardebooks.org/ebooks` é estável o
  suficiente pra raspar/parsear sem quebrar com frequência — não
  confirmado, precisa validação técnica se essa fonte for adiante.

## Evidência Contra

- **Gutendex não expõe CORS** (confirmado: resposta HTTP não traz header
  `Access-Control-Allow-Origin`). No build **Web** (fora do Capacitor
  nativo), toda chamada de busca/download bateria em CORS — hoje o projeto
  só tem proxy de CORS em **modo dev** (Vite, só local), não existe proxy
  de produção. Ou seja: a feature funcionaria de primeira só no Android
  nativo; a versão Web (`npm run dev` / `dist/`) precisaria de um backend
  proxy novo (infra que não existe hoje) ou ficaria bloqueada.
- **Gutendex é serviço de terceiro não-oficial**, mantido por
  colaborador independente (`garethbjohnson/gutendex` no GitHub), sem SLA.
  Ponto único de falha: se `gutendex.com` cair ou for descontinuado, a
  fonte de maior volume do catálogo some sem aviso.
- **Risco jurídico de "domínio público" divergente entre EUA e Brasil**:
  Project Gutenberg (e por extensão Gutendex) classifica obras como
  domínio público pelas regras dos EUA (geralmente: publicadas antes de
  1929 entram em domínio público independente da data de morte do autor).
  No Brasil (Lei 9.610/1998), o critério é 70 anos contados de 1º de
  janeiro do ano seguinte à morte do autor — critério diferente, que pode
  classificar como "ainda protegida" uma obra que o Gutenberg já trata
  como livre. Como o NeoReader tem público majoritariamente brasileiro
  (locale pt-BR prioritário), oferecer "download de domínio público"
  dentro do app sem filtrar por essa diferença é um risco de compliance
  real, não hipotético.
- **Open Library API não é, na prática, uma fonte de EPUBs pra download**:
  a API é forte em metadados/capas/biografias, mas os links de
  texto-completo do Internet Archive majoritariamente exigem "empréstimo"
  (borrow) com DRM — não é um EPUB baixável livre na maioria dos casos.
  Ou seja, das 3 candidatas trazidas pelo usuário, só 2 (Standard Ebooks,
  Gutendex) são de fato fontes de arquivo; Open Library serve melhor como
  enriquecimento de metadados/capa sobre as outras duas do que como fonte
  própria.
- **Tensão com a arquitetura local-first do produto**: hoje o NeoReader
  não depende de rede pra nenhuma funcionalidade central (README:
  "aplicação é local-first"). Esta seria a primeira feature com uma tela
  que exige rede pra funcionar (buscar/navegar catálogo remoto) — não é
  incompatível (o livro baixado vira local depois), mas é a primeira vez
  que "estar offline" degrada uma tela inteira, e isso precisa virar
  Non-Goal/comportamento explícito (o que a tela mostra sem rede), não só
  ficar implícito.
- **Escopo não é trivial**: além do download em si, a feature pede UI de
  busca/navegação de catálogo remoto, paginação, cache de resultados,
  tratamento de falha de rede, e possivelmente normalização de qualidade
  variável de HTML (Gutendex avisa isso explicitamente). Não é um "botão a
  mais" — é uma tela nova com estado próprio.

## Perguntas em Aberto

- Filtrar o catálogo por "seguro no Brasil" (ex: só obras publicadas há
  mais de 70 anos E autor morto há mais de 70 anos) é viável de calcular a
  partir dos metadados que o Gutendex/Standard Ebooks expõem, ou exigiria
  checagem manual por título?
- A feature deveria ficar restrita a Android nativo no MVP (evitando o
  buraco de CORS na Web) ou vale investir num proxy de produção desde já?
- Vale considerar Standard Ebooks como fonte primária de um MVP menor e
  mais seguro (catálogo curado, risco jurídico menor por já ser
  "supported/vetted"), deixando Gutendex/volume pra uma fase 2?
