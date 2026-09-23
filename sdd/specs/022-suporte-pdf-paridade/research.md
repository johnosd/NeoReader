# Research: Suporte a PDF com paridade de recursos do EPUB

Incertezas técnicas genuínas que o plano não conseguiu fechar só lendo código.
Cada item tem uma **decisão provisória** (o que o execute assume) e um **spike**
que confirma ou derruba a decisão logo no início da fase indicada. Se o spike
derrubar a decisão, registrar em `plan.md` → Riscos e Decisões antes de seguir.

## 1. Acesso ao arquivo de PDFs grandes (R-004)

- **Decisão provisória**: o `PdfBookFactory` sempre recebe um `Blob`/`File` e usa
  `PDFDataRangeTransport` com `blob.slice()` (como o `foliate-js/pdf.js` já faz),
  lendo só as faixas necessárias. Para `storageMode: 'local'`, obter o Blob via
  `fetch(convertFileSrc(uri))` — no Chromium, Blobs grandes vindos de `fetch`
  ficam em disco, não no heap do JS.
- **Justificativa**: não depende de o servidor local do Capacitor responder
  `Range`; mesmo caminho para web (`embedded`) e Android (`local`).
- **Alternativas consideradas**: (a) `pdfjsLib.getDocument({ url, disableAutoFetch,
  disableStream })` com range HTTP no servidor local — menor pico de memória se o
  servidor do Capacitor suportar `Range` (não confirmado); (b) passar a URL ao
  `view.open()` — rejeitada: o `makeBook` do foliate faz `fetch` e cria o Blob
  inteiro sem controle nosso.
- **Spike (início da Fase 3)**: abrir o PDF de ~200 MB do corpus no device,
  medir memória do processo (`adb shell dumpsys meminfo com.johnny.neoreader`) e
  tempo até a primeira página com a decisão provisória. Se o pico passar de
  ~1,5× o tamanho do arquivo, testar a alternativa (a).

## 2. Pinça/zoom e pan no modo scroll do layout fixo (R-005)

- **Decisão provisória**: capturar `touchstart/touchmove/touchend` com dois dedos
  nos documentos das páginas (mesmo origin — o pai pode registrar listeners sem
  scripts no iframe, igual o `EpubViewer` faz) e aplicar o atributo
  `scale-factor` do `foliate-fxl` ao soltar (o pdf.js re-renderiza nítido via
  `onZoom`). Durante o gesto, `transform: scale()` visual no container para
  resposta imediata. Pan horizontal: estilo inline `overflow-x: auto` no
  elemento `foliate-fxl` (estilo inline vence a regra `:host([flow="scrolled"])
  { overflow-x: hidden }`).
- **Alternativas**: zoom nativo do WebView (`user-scalable`) — rejeitado: dá
  zoom na UI inteira, inclusive chrome, e não re-renderiza a página nítida.
- **Spike (início da Fase 3)**: no device, pinça de 100%→300%→100% numa página
  com texto pequeno: nitidez, pan horizontal, e seleção de texto ainda
  funcionando após zoom.

## 3. Heurísticas de reconstrução de parágrafos (R-003)

- **Decisão provisória**: pipeline puro sobre itens de `getTextContent()`
  (`str`, `transform` → x/y/altura de fonte, `width`, `hasEOL`, `fontName`):
  1. agrupar itens em linhas por baseline (tolerância proporcional à altura);
  2. detectar colunas por bordas-x recorrentes das linhas da página;
  3. ordem de leitura: coluna a coluna, de cima para baixo;
  4. quebra de parágrafo quando o gap vertical > razão × altura de linha
     mediana, recuo de primeira linha, linha anterior curta terminando em
     pontuação final, ou mudança de tamanho/fonte (vira heading se maior);
  5. remover cabeçalho/rodapé: linhas no topo/rodapé cujo texto (normalizado,
     com dígitos trocados por `#`) se repete em ≥ 3 páginas de uma janela;
  6. dehifenizar `pala-\nvra` quando os dois lados são letras;
  7. cada bloco carrega os intervalos de offset do texto bruto (DI-005).
  As constantes numéricas ficam nomeadas e comentadas, calibradas pelo corpus.
- **Justificativa**: é o conceito descrito no relatório do Readest (seção 4),
  reimplementado do zero, e estendido — lá a heurística só limpa o texto de uma
  seleção; aqui precisa produzir blocos para o documento inteiro.
- **Spike (Fase 2)**: rodar em 5 PDFs do corpus e medir SC-003 manualmente
  (amostra de 40 parágrafos por PDF) antes de construir o modo texto em cima.

## 4. Onde o pdf.js real roda nos testes (R-008)

- **Decisão provisória**: testes do Vitest nunca carregam o pdf.js real. Um
  script local (`scripts/extract-pdf-text-fixtures.mjs`, rodado no Chromium via
  Playwright MCP ou página de dev) extrai os itens de texto de PDFs do corpus
  para `src/__tests__/fixtures/pdf/*.json`; os testes unitários consomem esses
  JSON. Integração com pdf.js real é validada em Chromium/device.
- **Alternativa**: build legacy do pdf.js para Node — rejeitada: não está no
  pacote vendorizado (seria dependência nova, princípio V).

## 5. Capa no import nativo Android

- **Decisão provisória**: no caminho nativo (pasta/arquivo/"abrir com"), o
  plugin renderiza a página 1 com `android.graphics.pdf.PdfRenderer` (bitmap
  limitado a 2000 px no lado maior, mesmo teto de `MAX_COVER_DIMENSION_PX`) e
  devolve junto com a cópia local; título/autor/camada de texto são lidos no
  JS pelo `PdfService` (pdf.js lê só o cabeçalho/xref/Info por faixa). No
  caminho web, tudo no JS. Se o `PdfRenderer` falhar (PDF exótico), fallback
  para capa renderizada pelo pdf.js no JS.
- **Justificativa**: import de pasta com dezenas de PDFs não deve carregar o
  pdf.js e renderizar canvas grandes no WebView um atrás do outro (histórico
  de alerta de memória). É a mesma ideia de "fast path" nativo do relatório,
  implementada em Java.
- **Spike (Fase 3)**: importar pasta com 20 PDFs no device e comparar tempo e
  memória com/sem o `PdfRenderer`.
