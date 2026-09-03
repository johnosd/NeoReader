# Feature Specification: Redimensionamento e recompressão de capas de EPUB no import

**Slug**: `007-redimensionamento-capas`

**Created**: 2026-09-03

**Status**: Convergida

**Input**: `[Perf]` Capas de EPUB nunca são redimensionadas/recomprimidas no import — nem `EpubService.extractCover()` (fluxo web) nem `NeoReaderLibraryPlugin.java` (nativo, que só limita a 10MB de bytes comprimidos, não dimensões). Capas de impressão em alta resolução viram dezenas de MB decodificados cada, um dos fatores por trás do alerta de memória do Play Console. Exige decisão de tamanho/formato alvo e migração das capas já salvas.

## Escopo

### Incluído

- Redimensionamento da imagem de capa em **todas** as vias que gravam uma capa: extração automática do EPUB no import, ação rápida "Recriar capa" e "Escolher imagem" (upload manual da galeria/arquivo) — as 3 passam por `saveBookCover()` (`src/db/bookCovers.ts`), chamado de 3 pontos em `BookImportService.ts`.
- Aplica-se só a capas gravadas a partir desta feature em diante (forward-only) — capas já salvas em bibliotecas existentes não são reprocessadas.
- Teto de dimensão pensado pra cobrir a maior exibição real de capa no app, incluindo contextos de viewport largos (tablet/desktop no build Web), já que `HeroBanner` (Home) e o grid da Biblioteca não têm largura máxima travada (`w-full`, sem `max-w-`).

### Fora de Escopo

- Migração/reprocessamento de capas já salvas em bibliotecas existentes — decisão explícita: fica pra uma ideia futura separada, se o alerta de memória persistir mesmo assim.
- Layout responsivo/`max-width` do app em telas largas (tablet/desktop) — característica pré-existente do app inteiro (nenhum breakpoint `sm:`/`md:`/`lg:` em lugar nenhum), não desta feature.
- Bitmap de capa do TTS nativo Android (`TtsPlaybackService.java`) — já tratado no bugfix do alerta de memória do Play Console (commit `06ddc5a`), pipeline e mecanismo diferentes (bitmap nativo, não Blob no Dexie).
- Capas remotas de catálogos OPDS/Domínio Público exibidas **antes** do import (thumbnails servidos pelo catálogo remoto, fora do nosso controle client-side). Uma vez importado, o EPUB baixado tem sua capa extraída e passa pelo mesmo pipeline desta feature normalmente — nenhuma integração especial necessária.
- Escolha exata de formato de saída (manter original / converter pra JPEG / WebP) e a técnica/API de redimensionamento (Canvas, biblioteca externa etc.) — decisão técnica, fica pro `sdd-plan` (inclui avaliar dependência nova, se necessário, com justificativa e aprovação explícita antes de instalar, conforme constitution).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importar um EPUB com capa em altíssima resolução (Priority: P1)

Um usuário importa um EPUB cuja capa é um scan de impressão em resolução muito acima do que qualquer tela do app consegue exibir. A capa salva localmente fica redimensionada a um teto razoável, sem perda de qualidade perceptível em nenhuma tela do app, e sem o peso de memória de um bitmap decodificado de dezenas de MB.

**Why this priority**: É o caminho mais comum (import automático de EPUB) e a origem direta do problema reportado no alerta de memória do Play Console.

**Independent Test**: Pode ser totalmente testado importando um EPUB com capa de resolução muito alta (ex: 4000×6000px) e confirmando que a capa salva no Dexie tem sua maior dimensão dentro do teto definido, exibindo normalmente em todas as telas que mostram capa (Home, Biblioteca lista/grid, Detalhes) — entrega valor mesmo que a US2 (recriar capa / escolher imagem) ainda não esteja implementada, já que import automático é o caminho mais comum de entrada de capas na biblioteca.

**Acceptance Scenarios**:

1. **Given** um EPUB com capa de resolução muito acima do teto definido, **When** o usuário importa esse EPUB, **Then** a capa salva localmente tem sua maior dimensão dentro do teto, preservando a proporção original da imagem.
2. **Given** uma capa cuja maior dimensão já está dentro do teto, **When** o usuário importa esse EPUB, **Then** a capa é salva sem upscale (sem aumentar a resolução original).

---

### User Story 2 - Recriar capa ou escolher imagem manualmente (Priority: P2)

Um usuário usa a ação rápida "Recriar capa" (reextrai do EPUB) ou "Escolher imagem" (galeria/arquivo do dispositivo) para um livro já na biblioteca. A imagem resultante passa pelo mesmo redimensionamento da importação inicial — incluindo fotos de celular, que podem ser tão grandes quanto (ou maiores que) um scan de capa.

**Why this priority**: Mesmo problema de fundo da User Story 1, mas em ações secundárias (o usuário precisa acioná-las manualmente), cobrindo uma fonte adicional de imagens grandes (fotos de celular via "Escolher imagem") que a US1 sozinha não alcança.

**Independent Test**: Pode ser totalmente testado usando "Escolher imagem" com uma foto de alta resolução da galeria e confirmando que a capa salva respeita o mesmo teto de dimensão da US1 — entrega valor incremental sobre a US1, reaproveitando a mesma lógica de redimensionamento.

**Acceptance Scenarios**:

1. **Given** um livro já na biblioteca, **When** o usuário usa "Recriar capa", **Then** a nova capa extraída do EPUB é redimensionada com o mesmo teto da User Story 1.
2. **Given** um livro já na biblioteca, **When** o usuário usa "Escolher imagem" e seleciona uma foto de alta resolução, **Then** a capa salva é redimensionada com o mesmo teto, independente de a fonte ser EPUB ou galeria.

---

### Edge Cases

- Capa gerada pelo fallback SVG (`EpubService.createFallbackCover`, quando o EPUB não tem nenhuma imagem de capa detectável): permanece como está, sem passar por redimensionamento/rasterização — já é pequena e vetorial.
- Imagem de capa corrompida ou que falha ao decodificar: o import não deve quebrar por causa disso — comportamento de fallback existente hoje (capa ausente) é preservado.
- Imagem cuja maior dimensão já é menor que o teto: não sofre upscale.
- Capa com proporção muito diferente de uma capa de livro comum (quadrada, paisagem): redimensiona preservando a proporção original da imagem (sem cortar/croppar o blob armazenado) — o corte visual pra caber no card (`object-cover`, já usado hoje em todos os componentes de capa) continua sendo feito em CSS, sem mudança.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE redimensionar a imagem de capa antes de armazená-la sempre que uma capa for salva via `saveBookCover()` — cobrindo import automático de EPUB, "Recriar capa" e "Escolher imagem".
- **FR-002**: O sistema DEVE limitar a maior dimensão (largura ou altura, o que for maior) da capa armazenada a um teto de 2000px, preservando a proporção original da imagem.
- **FR-003**: O sistema NÃO DEVE fazer upscale de capas cuja maior dimensão já esteja dentro do teto de 2000px.
- **FR-004**: O sistema DEVE continuar funcionando sem quebrar o import se a capa não puder ser decodificada/redimensionada, preservando o comportamento de fallback já existente hoje pra capas ausentes ou inválidas.
- **FR-005**: O sistema NÃO DEVE alterar capas já salvas em bibliotecas existentes — a mudança se aplica só a capas salvas a partir desta feature em diante.
- **FR-006**: O sistema DEVE excluir a capa de fallback gerada internamente (SVG) do redimensionamento.
- **FR-007**: O sistema DEVE manter a exibição visual das capas em todas as telas do app (Home, Biblioteca lista/grid, Detalhes) sem regressão perceptível de qualidade, incluindo as exibições em largura total (`HeroBanner`, grid da Biblioteca) em viewports largos.

### Key Entities

- **BookCover** (`src/types/book.ts`, tabela `bookCovers` no Dexie): entidade já existente, sem mudança de schema — só o conteúdo do `blob` armazenado passa a ser redimensionado antes de chegar em `saveBookCover()`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhuma capa salva a partir desta feature tem largura ou altura acima de 2000px.
- **SC-002**: Capas cuja imagem original já é menor que o teto não sofrem upscale (dimensão final = dimensão original).
- **SC-003**: Capas continuam sendo exibidas corretamente (sem erro, sem espaço em branco) em todas as telas que mostram capa, incluindo `HeroBanner` e o grid da Biblioteca em viewports largos.
- **SC-004**: Falha ao processar uma imagem de capa (corrompida, formato não suportado) não interrompe o import do livro.
- **SC-005**: `npm run build`, `npm run lint` e `npm test` passam sem regressão após a implementação.

## Assumptions

- Formato de saída (manter original vs. converter pra JPEG/WebP) e a técnica/API usada pro redimensionamento (Canvas, biblioteca externa etc.) ficam pro `sdd-plan` — incluindo avaliação de dependência nova, se necessário, com justificativa e aprovação explícita do usuário antes de instalar (constitution, Princípio V).
- O teto de 2000px foi calibrado pra cobrir a maior exibição real de capa no app hoje (`HeroBanner`, full-width) em viewports largos (tablet/desktop, já que "Web" é plataforma alvo), com margem de segurança — não é uma validação de que o app deveria ter layout otimizado pra telas largas, só um teto pragmático pro tamanho de imagem armazenada.
- Migração de capas já salvas fica fora de escopo por decisão explícita do usuário — pode virar uma feature/ideia futura separada se o alerta de memória do Play Console persistir mesmo depois desta mudança.
- O bitmap de capa do TTS nativo Android (`TtsPlaybackService.java`) já foi tratado num bugfix anterior (reciclagem de bitmap, commit `06ddc5a`) e não faz parte desta feature.

## Clarifications

### Sessão 2026-09-03

- Q: O redimensionamento deve valer só pra capas extraídas do EPUB, ou também pra "Escolher imagem" (upload manual)? → A: Todas as fontes — os 3 call sites de `saveBookCover()` (epub-extracted no import, recreate-cover, manual-upload) recebem o mesmo tratamento.
- Q: Capas já salvas em bibliotecas existentes devem ser migradas/reprocessadas? → A: Não — só daqui pra frente (forward-only). Sem migração em lote nem reprocessamento lazy.
- Q: O objetivo principal é limitar dimensão (bitmap decodificado) ou só tamanho de arquivo (compressão)? → A: Limitar dimensão — é o que resolve o problema de memória de bitmap decodificado, motivador original da spec.
- Q: Qual teto de dimensão? → A: 2000px no lado mais longo. Inicialmente cogitado 900-1200px (baseado só na tela de Detalhes, `w-40`/160px CSS), mas descoberto durante a entrevista que `HeroBanner` (Home) e o grid da Biblioteca não têm largura máxima travada (`w-full`, sem `max-w-`) — numa tela larga (tablet/desktop, já que Web é plataforma alvo) a capa pode ocupar 1000px+ de largura real. Decidido ser conservador: 2000px cobre esse cenário com folga.
