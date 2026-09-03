# Research: Redimensionamento e recompressão de capas de EPUB

## Decisão 1: Técnica de redimensionamento — Canvas API nativa, sem dependência nova

**Decisão**: `createImageBitmap(blob)` (decodifica) + `<canvas>`/`drawImage`
(redimensiona) + `canvas.toBlob()` (reexporta como Blob). Nenhuma
dependência nova.

**Justificativa**: Todas essas são APIs Web padrão, amplamente suportadas
tanto na WebView Android (Chromium via Capacitor, Android 8+) quanto em
qualquer browser moderno usado no build Web — não precisam de polyfill nem
de pacote externo. Isso resolve de cara a pergunta "precisa de dependência
nova?" da spec (FR-007 original do backlog): **não precisa**. Constitution
Princípio V (dependências novas exigem justificativa) fica trivialmente
satisfeito — não há dependência pra justificar.

**Alternativas consideradas**:
- **Biblioteca de resize** (ex: `browser-image-compression`,
  `compressorjs`) — rejeitada: adicionaria uma dependência nova sem
  necessidade, já que a Canvas API nativa cobre o caso de uso completo
  (redimensionar + reexportar como Blob) sem nenhuma lacuna.
- **`OffscreenCanvas` num Web Worker** — mais "correto" arquiteturalmente
  (não bloqueia a main thread durante o redimensionamento), mas overhead de
  criar/gerenciar um Worker novo só pra isso é desproporcional: o
  redimensionamento de uma imagem por vez (um livro sendo importado) é
  rápido o bastante pra rodar inline sem travar a UI de forma perceptível —
  mesmo import de pasta processa um livro por vez, não em paralelo massivo.
  Rejeitada como não-necessária agora; pode virar otimização futura se
  perfilamento real mostrar necessidade.

## Decisão 2: Onde inserir o redimensionamento — antes de `saveBookCover()`, nunca dentro de uma transação Dexie

**Decisão**: Uma função utilitária nova, `resizeCoverBlob(blob, maxDimension): Promise<Blob>`
(`src/utils/imageResize.ts`), chamada explicitamente nos **3 call sites**
de `saveBookCover()` em `BookImportService.ts` — sempre **antes** de
chamar `saveBookCover()`, nunca dentro dela.

**Justificativa**: `saveBookCover()` (`src/db/bookCovers.ts`) é chamada de
dentro de uma transação Dexie (`db.transaction('rw', db.books,
db.bookCovers, async () => {...})`) no caminho principal de import
(`importSingleEpubRecord`, `BookImportService.ts` linha ~715). Dexie fecha
a transação automaticamente se uma promise não-Dexie for aguardada dentro
dela — `createImageBitmap`/`canvas.toBlob()` são exatamente esse tipo de
promise externa. Colocar o redimensionamento dentro de `saveBookCover()`
faria a transação do import principal falhar de forma intermitente
(`TransactionInactiveError`). A metadata (`metadata.coverBlob`) já está
totalmente resolvida **antes** da transação abrir (linha ~699, `await
this.parseMetadataWithDiagnostics(...)`), então redimensionar logo depois
disso e antes de `db.transaction(...)` abrir resolve o problema sem tocar
em `saveBookCover()`/no formato da transação.

Os 3 pontos de chamada, confirmados por leitura direta do código:
1. `importSingleEpubRecord` (linha ~739-748) — cobre tanto import web
   quanto nativo Android (`metadata.coverBlob` já vem resolvido de
   `EpubService.parseMetadata()` ou de `metadataFromPreparedNativeEpub()`
   antes de chegar aqui) — resizar logo após obter `metadata`, antes do
   `db.transaction(...)`.
2. `reextractCover` (linha ~628-638, ação "Recriar capa") — não está numa
   transação, mas segue o mesmo padrão por consistência.
3. `updateManualCover` (linha ~640-642, ação "Escolher imagem") — mesmo
   padrão.

**Alternativas consideradas**:
- Redimensionar dentro de `EpubService.extractCover()` — rejeitada:
  cobriria só o caminho de import **web**, não o caminho nativo Android
  (`metadataFromPreparedNativeEpub` usa `base64ToBlob` a partir da
  extração feita em Java por `NeoReaderLibraryPlugin.java`, sem passar por
  `EpubService.extractCover()`). Resizar depois que as duas fontes já
  convergem pra `metadata.coverBlob`/`coverBlob` (nos 3 call sites de
  `saveBookCover`) cobre as duas com uma única mudança.
- Redimensionar dentro de `saveBookCover()` — rejeitada pelo motivo do
  Dexie explicado acima.

## Decisão 3: Formato de saída — preservar o formato original, com fallback pra JPEG

**Decisão**: `canvas.toBlob(callback, mimeType, quality)` usa o
`mimeType` do blob original (`coverBlob.type`) quando for um dos formatos
que o Canvas sabe reexportar (`image/png`, `image/jpeg`, `image/webp`).
Pra qualquer outro tipo (`image/gif`, tipo vazio/desconhecido), usa
`image/jpeg` como fallback.

**Justificativa**: A spec deixou essa escolha pro plano. Preservar o
formato original é a opção de menor risco/surpresa — evita mudar
comportamento de transparência ou paleta de cores que o usuário não pediu,
e é reversível/consistente (a mesma capa PNG que entrou como PNG sai como
PNG, só menor). `image/gif` não é reencodável de forma significativa via
Canvas (perderia animação de qualquer jeito, se houver) — fallback pra
JPEG é aceitável já que é uma capa estática de livro, não um asset
decorativo animado.

**Alternativas consideradas**:
- Converter tudo pra JPEG — rejeitada como decisão padrão: perde
  transparência de PNGs (raro em capa de livro, mas sem necessidade de
  arriscar) sem ganho claro o bastante pra justificar mudar formato sem
  pedido explícito da spec.
- Converter tudo pra WebP — rejeitada por ora: melhor compressão que
  JPEG/PNG, mas motivo insuficiente pra forçar uma mudança de formato não
  pedida pela spec; pode ser revisitado como otimização futura.

## Decisão 4: Cálculo de redimensionamento — um único decode, sem upscale

**Decisão**: `createImageBitmap(blob)` uma vez só. Se
`Math.max(bitmap.width, bitmap.height) <= 2000`, retorna o blob original
sem nenhuma modificação (nem reencode). Caso contrário, calcula a escala
(`2000 / Math.max(width, height)`), desenha o bitmap redimensionado num
canvas do tamanho final (`ctx.drawImage(bitmap, 0, 0, newWidth,
newHeight)` — o próprio canvas faz o downscale ao desenhar um bitmap maior
num destino menor) e exporta via `canvas.toBlob()`.

**Justificativa**: Um único decode completo por capa, durante o import de
**um** livro por vez (mesmo import de pasta processa sequencialmente), é
um custo transitório aceitável — o problema original (motivador desta
spec) é sobre capas **armazenadas** e **decodificadas repetidamente depois**
(cada vez que a Biblioteca renderiza um card), não sobre o decode único e
pontual no momento do import. Decodificar duas vezes (uma pra medir, outra
já com `resizeWidth`/`resizeHeight` do próprio `createImageBitmap`) evitaria
uma fração do pico de memória durante o import, mas é complexidade extra
sem uma necessidade demonstrada — não adicionar essa otimização agora
(Princípio III da constitution: explícito antes de mágico, sem overengineer
por precaução).

**Alternativas consideradas**:
- `createImageBitmap(blob, { resizeWidth, resizeHeight, resizeQuality })`
  direto na primeira chamada — evitaria o decode "cheio" antes de saber se
  precisa redimensionar, mas exige saber as dimensões originais
  ANTES de decodificar (não dá, com APIs padrão) ou aceitar sempre
  redimensionar mesmo quando desnecessário (violaria FR-003, não-upscale,
  se aplicado sem checar o tamanho original antes). Rejeitada.

## Decisão 5: Testabilidade — Canvas não existe de verdade no jsdom

**Risco identificado**: jsdom (ambiente do Vitest) não implementa
renderização real de `<canvas>` (`getContext('2d')` retorna `null` por
padrão) nem define `createImageBitmap` globalmente. Nenhum polyfill de
canvas (ex: pacote `canvas`) está instalado no projeto.

**Decisão**: Os testes de `resizeCoverBlob()` mockam `createImageBitmap`,
`document.createElement('canvas')`/`HTMLCanvasElement.prototype.getContext`
e `HTMLCanvasElement.prototype.toBlob` via `vi.stubGlobal`/
`vi.spyOn`, testando a **lógica de decisão** (não faz nada se já está
dentro do teto; calcula a escala certa; cai pro blob original se
`createImageBitmap` rejeitar) — não o resultado pixel-a-pixel real do
redimensionamento, que não é verificável em jsdom. Correção visual real
fica pro `quickstart.md` (import de um EPUB com capa grande de verdade, no
browser/device, conferindo a capa renderizada e a dimensão salva).

**Justificativa**: Mesmo padrão já usado no projeto pra limitações de
jsdom (stub de `ResizeObserver`/medição de elemento na feature
006-virtualizacao-biblioteca) — testar a lógica que dá pra testar
deterministicamente, documentar explicitamente o que só é verificável
manualmente, nunca fingir cobertura que não existe.
