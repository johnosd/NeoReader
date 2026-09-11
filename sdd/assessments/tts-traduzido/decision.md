# Assessment Decision: TTS Traduzido

- **Slug**: tts-traduzido
- **Decidido**: 2026-09-10
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | adequate | Público-alvo esclarecido pelo dono do produto: é o mesmo público que aprende inglês, mas a feature cobre livros em **outras** línguas que ele não domina — complementar ao pilar de aprendizado, não conflitante. Ainda sem demanda externa validada, só intenção clara do dono do produto. |
| Força da evidência | adequate | O único "sinal" continua sendo a intenção do dono do produto, não um pedido de usuário externo — mas agora vem com racional articulado e consistente com a visão do produto (CLAUDE.md), não mais uma linha solta de backlog. |
| Valor vs. custo de inação | adequate | Valor complementar claro (expande alcance de idiomas sem abrir mão do pilar de inglês); custo de inação continua baixo no curto prazo, mas a abordagem escolhida tem risco/esforço baixo o suficiente pra justificar avançar. |
| Viabilidade / apetite | adequate | A abordagem escolhida (tradução em lote por parágrafo, síntese por frase) remove o risco arquitetural crítico identificado na Explora: não precisa mexer no loop de playback contínuo da spec `001` (já convergida), e o perfil de latência de síntese fica igual ao de hoje — só aparece 1 chamada de tradução extra por parágrafo, não por frase. Validação adicional em 2026-09-10 (revisão de uma proposta de arquitetura externa colada pelo usuário): `getSentenceChunks()` (`EpubViewer.tsx:3491`) já extrai o capítulo/seção inteiro de uma vez, não só o texto visível, e `TranslationService.ts`/síntese de TTS já trabalham com string pura, não acopladas a DOM/UI — dois riscos técnicos que a proposta externa listava como "maiores riscos" já não existem neste código. Risco residual normal de qualquer feature nova, não mais um risco estrutural. |
| Fit estratégico | strong | Reforça "incentivar a leitura" (consumir livros em qualquer idioma) preservando explicitamente o pilar "facilitar aprendizado de inglês" (a feature é para as línguas que o usuário NÃO está estudando). Os dois pilares do CLAUDE.md deixam de estar em tensão. |

Todos os critérios centrais atingiram `adequate` ou melhor — a barra de `go`
foi atingida sem inflar nenhuma nota. As duas mudanças que destravaram isso
em relação à rodada anterior: (1) público-alvo deixou de ser `unknown` e
virou complementar ao objetivo de aprendizado de inglês, não concorrente; (2) a
abordagem de tradução em lote por parágrafo elimina o risco arquitetural que
era a principal fraqueza (viabilidade) antes.

## Abordagens Candidatas

### 1. Tradução em lote por parágrafo + síntese por frase (recomendada)

- Traduz o parágrafo inteiro de uma vez (1 chamada de tradução por
  parágrafo), mantém o loop de síntese/playback por frase igual ao de hoje.
  Motor de tradução plugável: MyMemory (gratuito, disponível hoje) ou um
  provedor BYOK premium, se/quando o assessment paralelo de tradução
  multi-provedor avançar — não é dependência bloqueante.
- **Recomendada**: sim — decisão já confirmada pelo dono do produto em
  2026-09-10. Menor risco arquitetural (não toca a spec `001`), menor
  esforço, e melhora a qualidade de tradução como efeito colateral positivo
  (contexto de parágrafo em vez de frase isolada).
- Refinamentos incorporados em 2026-09-10 após revisão de uma proposta de
  arquitetura externa colada pelo usuário (avaliada criticamente, não aceita
  em bloco — ver `problem.md` para a lista completa de Goals/Non-Goals
  atualizados): prefetch enxuto de 1 parágrafo à frente (sequencial, sem
  fila/reordenação), sticky fallback por sessão de leitura (não alterna
  provider por parágrafo), progresso sempre pela posição original do EPUB
  (nunca por offset do texto traduzido), destaque degrada pra frase/parágrafo
  em vez de palavra-por-palavra, aviso de consumo antes de iniciar (um livro
  inteiro traduzido é ordens de grandeza mais caro que um tap-to-translate
  avulso), cache de tradução com provider na chave, e cancelamento por
  `AbortSignal` ao trocar capítulo/livro/idioma/provedor. Descartado da
  proposta externa por ser desenhado pra um regime de buffer multi-chunk que
  não se aplica ao lote por parágrafo: fila paralela com `sequenceNumber`,
  buffer adaptativo em segundos de áudio, ordem de fallback por "modo" de
  leitura, e streaming da Responses API da OpenAI (fica como otimização
  futura).

## Veredito

**go.** O bloqueio da rodada anterior era duplo: público-alvo `unknown` (a
feature podia estar competindo com o pilar de aprendizado de inglês do
produto) e viabilidade `weak` (risco arquitetural real de empilhar 2
chamadas de rede sequenciais por frase numa feature de playback contínuo
sem buffer). As duas respostas do dono do produto resolvem isso: o público é
complementar (línguas que o usuário não estuda), e a abordagem escolhida
(lote por parágrafo) evita o ponto arquitetural mais arriscado. Nenhum
critério central ficou `weak`/`unknown` nesta rodada.

### Se go — Handoff

- **Problema**: NeoReader só permite ouvir um livro no idioma original via
  TTS; usuários que aprendem inglês no app não têm liberdade de consumir
  livros em outras línguas que não dominam, traduzidos, no mesmo fluxo de
  audiobook contínuo.
- **Abordagem recomendada**: pipeline texto → tradução em lote por parágrafo
  → síntese/playback por frase (igual ao fluxo atual), sem alterar a
  arquitetura de playback contínuo da spec `001`. Motor de tradução plugável
  entre MyMemory (gratuito) e provedores BYOK premium (se o assessment
  paralelo avançar).
- **Escopo sugerido**:
  - Entra: tradução em lote por parágrafo antes da fila de chunks de TTS;
    prefetch sequencial de 1 parágrafo à frente (traduz o próximo enquanto o
    atual fala); reuso do serviço de tradução existente
    (`TranslationService.ts`) como motor padrão, com ponto de extensão pra
    plugar provedores BYOK depois; sticky fallback por sessão de leitura;
    progresso salvo pela posição original do EPUB; destaque visual degradado
    pra frase/parágrafo original; aviso de consumo antes de iniciar; cache de
    tradução com provider na chave; cancelamento por `AbortSignal` ao trocar
    capítulo/livro/idioma/provedor.
  - Fica de fora: redesenho do loop de playback contínuo/prefetch de chunk
    de TTS da spec `001`; troca de provedores de TTS; qualquer trabalho do
    assessment paralelo de tradução BYOK (é consumido como motor opcional,
    não implementado aqui); fila paralela de traduções com reordenação;
    buffer adaptativo em segundos de áudio; ordem de fallback configurável
    por "modo" de leitura; streaming da Responses API da OpenAI; alinhamento
    bilíngue palavra-a-palavra no destaque.
- **Métricas de sucesso**: pausa perceptível de tradução no máximo 1x por
  parágrafo (não por frase); zero regressão nos testes/fluxo da spec `001`;
  qualidade de tradução com contexto de parágrafo validada manualmente
  contra o fluxo de tap-to-translate por frase isolada; nenhum cache hit
  cruzado entre provedores diferentes; cancelamento correto (sem áudio
  "fantasma") ao trocar capítulo/livro/idioma/provedor durante a leitura.
- **Perguntas em aberto pro sdd-specify**: qual idioma-alvo da tradução do
  audiobook (o mesmo idioma de UI do app, ou selecionável por livro, como já
  acontece na tradução inline)? A feature é Pro-gated ou disponível pra
  todos? Onde ativar/desativar isso no fluxo de audiobook (mini player,
  configurações do livro)?
- **Nota pro `sdd-plan`**: detalhes técnicos específicos de provider citados
  numa proposta externa (parâmetro `context` e modelo `latency_optimized` do
  DeepL, limite de ~5.000 caracteres recomendado pelo Google, eventos SSE
  `response.output_text.delta` da Responses API da OpenAI) vieram sem fonte
  e precisam ser confirmados contra a documentação oficial de cada provider
  na fase de pesquisa — não foram aceitos como fato neste assessment.
