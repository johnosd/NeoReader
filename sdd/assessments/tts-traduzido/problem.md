# Assessment Problem: TTS Traduzido

- **Slug**: tts-traduzido
- **Criado**: 2026-09-10
- **Explora**: ./explora.md

## Problem Statement

Hoje o NeoReader só permite ouvir um livro no idioma original dele via TTS —
não existe caminho para "ler este livro em inglês, mas ouvir em português"
(ou o inverso), o que deixa de fora quem quer consumir um livro estrangeiro
sem o esforço de acompanhar no idioma original.

## Usuários / Partes Afetadas

- O mesmo público que já usa o NeoReader pra aprender inglês — a feature não
  compete com esse objetivo porque é pensada pra livros em **outras**
  línguas que o usuário não está estudando (ex.: um livro em francês ou
  japonês), dando liberdade de consumir esse conteúdo traduzido sem abrir
  mão do fluxo normal de leitura/estudo em inglês. Esclarecido pelo dono do
  produto em 2026-09-10.
- Usuários do audiobook contínuo em segundo plano (spec `001`, já
  convergida) — continuam sendo quem mais sentiria qualquer perda de
  fluidez, mas a abordagem escolhida (ver Goals) evita tocar na arquitetura
  dessa spec.

## Goals

- Permitir o pipeline texto original → tradução → TTS no idioma alvo, para
  livros em idiomas que o usuário não domina (fora do inglês, que continua
  sendo o foco de aprendizado do produto).
- Traduzir em lote por parágrafo (uma chamada de tradução a cada parágrafo,
  não a cada frase) e sintetizar/tocar frase por frase a partir do texto já
  traduzido — decisão de abordagem confirmada pelo dono do produto em
  2026-09-10, que resolve a latência sem reestruturar o loop de playback
  contínuo da spec `001` e melhora a qualidade da tradução (frase traduzida
  com o parágrafo inteiro como contexto, não isolada).
- Suportar tanto a tradução gratuita atual (MyMemory) quanto provedores BYOK
  premium como motor de tradução — a escolha de motor não é exclusiva; a
  feature deve funcionar com o que estiver disponível/configurado.
- Prefetch enxuto de 1 parágrafo: traduzir o próximo parágrafo enquanto o
  atual está sendo falado sentença por sentença — dá pausa quase zero sem
  precisar de fila/buffer multi-chunk. Confirmado viável: `getSentenceChunks()`
  (`EpubViewer.tsx:3491`) já extrai o capítulo/seção inteiro de uma vez, não
  só o texto visível — não é necessário criar um iterador novo baseado no
  spine do EPUB.
- Sticky fallback por sessão de leitura traduzida: ao trocar de provedor por
  erro, manter o provedor de fallback até o fim da sessão (não alternar por
  parágrafo), evitando inconsistência de tom/vocabulário no meio do livro.
- Progresso de leitura sempre pela posição original do EPUB (paraIdx/CFI),
  nunca por um offset do texto traduzido.
- Destaque visual degrada pra frase/parágrafo original (não palavra-por-
  palavra) durante leitura traduzida — alinhamento bilíngue palavra-a-palavra
  fica fora de escopo.
- Aviso de consumo antes de iniciar a leitura traduzida: um livro de ~100 mil
  palavras gera ~600 mil caracteres traduzidos — ordens de grandeza a mais
  que um tap-to-translate avulso. Usuário BYOK precisa ver isso antes de
  começar, não só no momento de um fallback.
- Cache de tradução passa a incluir o provider (e não só texto+par de
  idiomas) na chave, evitando cache hit cruzado entre motores diferentes.
- Cancelamento (`AbortSignal`) da tradução em andamento ao trocar de
  capítulo/livro/idioma/provedor — reaproveita o mesmo padrão já usado na
  síntese de TTS (`PremiumTtsSynthesisOptions.signal`).

## Non-Goals

- Redesenhar a arquitetura de prefetch/buffering de chunks do TTS (playback
  contínuo da spec `001`) — descartado pela abordagem de lote por parágrafo,
  que não precisa disso.
- Trocar provedores de TTS — os provedores premium atuais já suportam vozes
  em múltiplos idiomas.
- Depender obrigatoriamente da conclusão do assessment paralelo de tradução
  multi-provedor BYOK — a feature deve funcionar com MyMemory isoladamente
  hoje, e ganhar os provedores premium como opção adicional se/quando esse
  assessment avançar.
- Fila de múltiplas traduções em paralelo com `sequenceNumber` pra reordenar
  resultado fora de ordem — só existe problema de ordem com mais de uma
  tradução em voo ao mesmo tempo; com prefetch sequencial de 1 parágrafo,
  isso nunca acontece.
- Buffer adaptativo medido em segundos de áudio (regime de múltiplos chunks
  em fila, com estados de "pausar prefetch"/"priorizar tradução") — é a
  arquitetura certa pra um buffer sentence-level completo, que foi descartado
  no Decide em favor do lote por parágrafo.
- Ordem de fallback configurável por "modo" de leitura (fluido vs.
  literário) — mantém a ordem fixa DeepL → OpenAI → Google já definida no
  assessment de tradução multi-provedor BYOK.
- Streaming da Responses API da OpenAI (SSE) — otimização futura de latência
  inicial, não dependência da primeira versão.

## Success Metrics

- Pausa perceptível de tradução acontece no máximo 1x por parágrafo (não por
  frase) — medido comparando o playback com e sem tradução ativada.
- Nenhuma regressão no fluxo e nos testes da feature `001` (audiobook
  background playback), já convergida — a arquitetura de playback contínuo
  não é alterada por este escopo.
- Qualidade percebida da tradução (frase traduzida com contexto de
  parágrafo) validada manualmente contra a tradução por frase isolada do
  fluxo de tap-to-translate atual.
- Nenhum cache hit cruzado entre provedores de tradução diferentes (mesma
  chave de texto+idiomas, provider diferente = miss).
- Tradução em andamento é cancelada corretamente (sem áudio "fantasma") ao
  trocar de capítulo/livro/idioma/provedor durante a leitura traduzida.

## Cost of Inaction

Baixo no curto prazo — não há demanda externa validada, só a ideia do
backlog. Mas, com o público-alvo confirmado (aprendizes de inglês que também
querem liberdade de consumir livros em outras línguas), a ausência da
feature limita o alcance de idiomas do produto sem necessidade, já que a
abordagem escolhida tem risco técnico baixo.
