# Research: TTS Traduzido

## R1 — Parágrafo maior que o limite de caracteres por chamada do motor de tradução

**Decisão**: Quando o parágrafo original exceder `MAX_CHARS` (500, o mesmo
limite já aplicado uniformemente a todos os provedores em
`TranslationService.ts`, herdado da feature `017`), uma nova função de
orquestração (`translateParagraphForAudiobook`, em
`src/services/TranslatedAudiobookService.ts`) divide o parágrafo em pedaços
≤500 caracteres respeitando fronteiras de frase — reusando
`splitParagraphIntoTtsChunks(text, minLen, locale, maxLen=480)` (a mesma
função pura já usada por `EpubViewer.tsx` para chunking de TTS, só chamada
com um `maxLen` menor) — traduz cada pedaço via `TranslationService.translate()`
(uma chamada por pedaço, cada uma com seu próprio cache hit/miss) e concatena
o texto traduzido de volta em ordem antes de re-chunkar para TTS.

**Justificativa**: `TranslationService.translate()` (feature `017`) já
trunca silenciosamente qualquer texto acima de 500 caracteres — inaceitável
aqui, já que perderia texto do livro. Dividir por frase (não por caractere
cru) preserva legibilidade de cada chamada. O caso comum (parágrafo curto,
maioria dos livros) continua sendo 1 única chamada — a divisão só ativa para
parágrafos genuinamente longos, mantendo FR-002 válido na prática típica
mesmo com a exceção documentada no Edge Case da spec.

**Alternativas consideradas**:
- Aumentar `MAX_CHARS` em `TranslationService.ts`: rejeitado — mudaria o
  contrato de uma feature já convergida (`017`) para todos os chamadores
  (tap-to-translate incluído), fora do escopo desta feature, e ainda
  esbarraria no limite real de 500 caracteres do MyMemory gratuito.
- Truncar o parágrafo silenciosamente: rejeitado — viola o requisito
  explícito do Edge Case (nenhum trecho perdido).
- Enviar o parágrafo inteiro sem dividir e deixar o provider rejeitar: alguns
  provedores premium aceitariam (DeepL/Google/OpenAI toleram mais que 500
  chars), mas o MyMemory gratuito (motor padrão, sempre disponível) não —
  quebraria o caso comum sem BYOK configurado.

## R2 — Alimentar `useTTS.play()` com chunks traduzidos sem alterar seu loop interno

**Decisão**: `useTTS.play(chunks: TtsChunk[], startIdx)` (`useTTS.ts:786`)
guarda a referência do array em `activeChunksRef.current` e itera com
`for (let index = startIdx; index < chunks.length; index += 1)`, relendo
`chunks.length` a cada volta. Isso permite que a camada de orquestração desta
feature construa o array de chunks traduzidos **progressivamente**: traduz e
chunka o parágrafo inicial de forma síncrona (bloqueante) antes da primeira
chamada a `tts.play()`, e continua `push`-ando chunks do próximo parágrafo
nesse MESMO array (por referência) assim que a tradução em segundo plano
terminar — disparada pelo callback `onParagraphChange(paraIdx)` já existente
(`ReaderScreen.tsx:491`), que passa a também acionar
`translateParagraphForAudiobook` do parágrafo seguinte quando a leitura
traduzida está ativa. Nenhuma linha de `useTTS.ts` precisa mudar.

**Justificativa**: Reaproveita 100% do mecanismo de playback contínuo, foco
de áudio, wake lock, fallback pra native TTS e notificação nativa já
convergidos na feature `001` — exatamente a restrição de Não-Objetivo da
spec ("não redesenhar a arquitetura de prefetch/buffering do TTS"). É a
opção mais "explícita antes de mágico" (Constitution III): a orquestração
de tradução vive inteiramente FORA de `useTTS.ts`, como uma função que
prepara dados antes de chamar uma API já existente.

**Alternativas consideradas**:
- Modificar `useTTS.play()` para aceitar um `AsyncIterable<TtsChunk>` ou
  callback "getNextChunk": mais "correto" em teoria, mas reabre o design de
  uma feature já convergida e testada em produção sem necessidade — rejeitado
  por Constitution III (evitar abstração não exigida pela tarefa atual) e
  pelo Non-Goal explícito da spec.
- Buffer/fila com `sequenceNumber` como a proposta externa revisada no
  assessment sugeria: já descartado no Decide do assessment (Non-Goal) —
  só faz sentido pra prefetch multi-chunk paralelo, que este design não tem
  (prefetch é sempre de exatamente 1 parágrafo à frente, sequencial).

## R3 — Estimativa de consumo (caracteres a traduzir) antes de iniciar

**Decisão**: A estimativa exibida no aviso de consumo (FR-013) é
explicitamente aproximada, derivada de `book.fileSize` (bytes do arquivo
EPUB, já existente em `types/book.ts`) com um fator fixo documentado no
código (ex.: `charEstimate ≈ fileSize * K`, `K` calibrado uma vez contra
alguns EPUBs de referência) — não uma contagem exata de caracteres do livro
inteiro.

**Justificativa**: Não existe hoje nenhum campo de contagem de
palavras/caracteres no schema (`types/book.ts`), e o parser (`foliate-js`)
carrega seções sob demanda — somar o texto de TODAS as seções do livro só
para mostrar um aviso exigiria carregar o EPUB inteiro na memória uma vez
(custo real, sem benefício proporcional ao propósito do aviso, que é dar
uma ordem de grandeza, não um número exato — a própria spec usa a palavra
"estimativa"). `fileSize` já está disponível sem custo adicional.

**Alternativas consideradas**:
- Somar o texto de todas as seções via `foliate-js` na hora de mostrar o
  aviso: mais preciso, mas custo de carregar o livro inteiro (potencialmente
  vários MB) só para um aviso informativo — desproporcional, revisitar só se
  o feedback de usuários real pedir mais precisão.
- Basear a estimativa apenas no capítulo atual: mais barato, mas subestima
  fortemente o volume total (o aviso existe justamente para alertar sobre o
  volume do LIVRO, não do capítulo) — rejeitado por não cumprir o propósito
  do FR-013.
