# Assessment Problem: Suporte a catálogos OPDS (públicos e self-hosted)

- **Slug**: suporte-catlogos-opds-pblicos-self-hosted
- **Criado**: 2026-08-31
- **Explora**: não rodada — o pedido do usuário já chegou com 10 decisões técnicas concretas (formato, transporte, storage de credencial, filtro de conteúdo, catálogo padrão, telas), suficiente pra pular direto pro estágio mínimo viável.

## Problem Statement

O NeoReader só sabe importar EPUB local (arquivo trazido pelo usuário) ou baixar de um catálogo fixo e curado manualmente (Standard Ebooks, feature `002-biblioteca-dominio-publico`). Não existe suporte ao protocolo OPDS — então usuários que rodam biblioteca própria (Calibre-Web, Kavita) não têm como conectar essa fonte ao app, e usuários sem biblioteca própria ficam limitados ao único catálogo pré-configurado hoje.

## Usuários / Partes Afetadas

- **Usuários com servidor self-hosted** (Calibre-Web, Kavita) — hoje só conseguem ler esses livros no NeoReader copiando o arquivo manualmente pro dispositivo; sem nenhuma forma de "conectar" a biblioteca própria.
- **Usuários sem acervo próprio** — dependem inteiramente do catálogo estático de Standard Ebooks (feature 002); não têm acesso a catálogos maiores como Project Gutenberg dentro do app.
- **Time do produto** — hoje mantém à mão uma lista curada estática (ver `PublicDomainCatalogService`) em vez de um mecanismo genérico que fala com qualquer fonte compatível com o padrão do setor.

## Goals

- Permitir que o usuário adicione, edite e remova catálogos OPDS (nome, URL base, auth opcional).
- Suportar OPDS 1.x (Atom/XML) e OPDS 2.0 (JSON) desde o v1, com detecção de formato por `Content-Type`/content negotiation.
- Navegar a hierarquia de um catálogo (pastas/entries de navegação) e listar só entries com link de aquisição EPUB.
- Baixar um EPUB de qualquer catálogo configurado reaproveitando o pipeline de import já existente (`BookImportService`), sem storage/schema paralelo pro livro em si.
- Suportar Basic Auth para catálogos self-hosted, sem guardar a senha em texto puro no Dexie.
- Vir com Project Gutenberg pré-configurado por padrão (único catalogado hoje como 100% aberto e DRM-free).
- Unificar a tela Descubra num único mecanismo por catálogo: uma row de amostra (poucos títulos) por catálogo configurado, com "ver mais" levando pra navegação completa daquele servidor. A seção "Clássicos em Inglês" (feature 002) migra desse mecanismo — deixa de ser lista estática mantida à mão e passa a ser alimentada por um feed OPDS do Standard Ebooks, seguindo o mesmo padrão aplicado a Project Gutenberg e a qualquer catálogo self-hosted.

## Non-Goals

- Suporte Web/browser completo para catálogos sem CORS liberado — mesma restrição já assumida na feature 002 (`CapacitorHttp` contorna CORS só no Android nativo; na Web, um catálogo self-hosted sem header de CORS continua bloqueado).
- OAuth ou qualquer esquema de auth além de Basic Auth.
- Download/sincronização de catálogo inteiro em segundo plano.
- Suporte a formatos além de EPUB (PDF, MOBI, CBZ, audiobooks OPDS etc.) — filtro mantém só `application/epub+zip`.
- Motor de validação jurídica por título/catálogo — ao contrário da feature 002 (curadoria vetada manualmente), aqui o usuário pode adicionar qualquer catálogo por conta própria; a responsabilidade de conteúdo de catálogos de terceiros adicionados pelo usuário é dele, não do app.

## Success Metrics

- % de usuários que adicionam pelo menos 1 catálogo próprio (self-hosted) além do padrão (Gutenberg).
- Downloads via catálogo OPDS por usuário ativo/mês, comparado à baseline já existente da seção Standard Ebooks (002).
- Taxa de erro ao adicionar catálogo (parse/format detection falhando) e ao navegar/baixar.
- Zero relatos de credencial de auth vazada ou exposta em texto puro.

## Cost of Inaction

O app continua funcionando normalmente sem isso — não é bloqueante, já existe workaround (import manual de arquivo, ou o catálogo fixo da feature 002). O custo real é de oportunidade: NeoReader fica de fora do ecossistema padrão que outros leitores (KOReader, Moon+ Reader, etc.) já cobrem via OPDS, o que é especialmente relevante pro segmento de usuário técnico que já roda Calibre-Web/Kavita — hoje esse usuário não tem motivo pra preferir o NeoReader sobre um leitor com OPDS nativo pra essa parte do fluxo. Também mantém o time preso a manutenção manual de lista curada em vez de um mecanismo genérico e reutilizável.
