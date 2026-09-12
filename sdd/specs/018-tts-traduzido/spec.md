# Feature Specification: TTS Traduzido (audiobook com tradução em lote por parágrafo)

**Slug**: `018-tts-traduzido`

**Created**: 2026-09-12

**Status**: Implementada

**Input**: Assessment `sdd/assessments/tts-traduzido/` (veredito: go, 2026-09-10).
Ideia original de backlog: permitir ouvir um livro em áudio (TTS) traduzido
para outro idioma que não o original — ex.: ler um livro em francês/japonês
via audiobook contínuo, mas ouvir em português — sem exigir que o usuário
acompanhe no idioma original. Feature complementar ao pilar de aprendizado de
inglês do produto (destinada a idiomas que o usuário **não** está estudando),
não concorrente com ele.

## Escopo

### Incluído

- Pipeline texto original → tradução em lote por parágrafo → síntese/playback
  TTS frase a frase, reaproveitando o audiobook contínuo em segundo plano já
  existente (feature `001`, convergida) sem alterar sua arquitetura de
  playback.
- Motor de tradução plugável: MyMemory (gratuito, padrão, sempre disponível)
  ou o provedor BYOK premium já configurado para aquele livro (feature `017`,
  convergida — DeepL/OpenAI/Google), quando disponível.
- Prefetch sequencial de 1 parágrafo à frente: traduz o próximo parágrafo
  enquanto o atual ainda está sendo falado frase a frase.
- Sticky fallback por sessão de leitura traduzida: se o motor de tradução
  falhar e cair para outro (ex.: BYOK → MyMemory, conforme as regras de
  fallback já definidas na feature `017`), o motor de fallback permanece fixo
  até o fim da sessão — não alterna de novo a cada parágrafo.
- Progresso de leitura salvo sempre pela posição original do EPUB
  (parágrafo/CFI) — nunca por um offset do texto traduzido.
- Destaque visual da leitura degradado para frase/parágrafo original durante
  audiobook traduzido (sem alinhamento palavra-a-palavra bilíngue).
- Aviso de consumo (estimativa de caracteres a traduzir) na primeira vez que
  o usuário ativa a leitura traduzida em cada livro, com opção de não
  perguntar de novo para aquele livro.
- Cache de tradução com o provedor como parte da chave (texto + par de
  idiomas + provider), evitando cache hit cruzado entre motores diferentes.
- Cancelamento (`AbortSignal`) de qualquer tradução de parágrafo em andamento
  ao trocar de capítulo, livro, idioma-alvo ou provedor.
- Ativação/desativação por livro em `BookDetailsScreen`, ao lado das
  configurações já existentes de idioma de tradução e provedor.
- Reuso do idioma-alvo já configurado por livro para tradução inline
  (`bookSettingsRow.translationTargetLang`, com fallback pro idioma padrão do
  app) — não introduz um segundo seletor de idioma independente.
- Disponível para todos os usuários, sem exigência de assinatura Pro (mesmo
  padrão de não-gating já usado pelos provedores BYOK premium de TTS e
  tradução).
- Parada segura com erro visível quando a tradução falha por completo (sem
  fallback restante — ex.: rede totalmente indisponível), em vez de tocar
  áudio incorreto/vazio ou pular texto silenciosamente.

### Fora de Escopo

- Redesenho da arquitetura de prefetch/buffering de chunks de TTS da feature
  `001` — a abordagem de lote por parágrafo não precisa disso.
- Troca dos provedores de TTS existentes — os provedores premium atuais já
  suportam vozes em múltiplos idiomas.
- Fila de múltiplas traduções em paralelo com reordenação por
  `sequenceNumber` — não existe problema de ordem com prefetch sequencial de
  1 parágrafo.
- Buffer adaptativo de playback medido em segundos de áudio (regime de
  múltiplos chunks em fila) — arquitetura descartada em favor do lote por
  parágrafo.
- Ordem de fallback entre provedores de tradução configurável por "modo" de
  leitura — mantém a ordem fixa já definida na feature `017`.
- Streaming da Responses API da OpenAI (SSE) para reduzir latência inicial —
  otimização futura, não desta versão.
- Alinhamento bilíngue palavra-a-palavra no destaque de leitura.
- Um segundo seletor de idioma-alvo específico do audiobook, independente do
  já usado pela tradução inline por toque.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ouvir o audiobook traduzido usando o motor gratuito (Priority: P1)

Um usuário abre um livro em um idioma que não domina (ex.: francês), com o
idioma-alvo de tradução do livro já configurado (ex.: português). Ele ativa
"Ouvir traduzido" nas configurações do livro e inicia o audiobook contínuo:
cada parágrafo é traduzido em uma única chamada (MyMemory, motor padrão) e
reproduzido frase a frase no idioma-alvo, com o próximo parágrafo já sendo
traduzido em segundo plano enquanto o atual toca.

**Why this priority**: É o núcleo da feature — sem esse pipeline funcionando
de ponta a ponta com o motor sempre disponível (gratuito), nenhuma outra
camada (motor premium, aviso de consumo) tem o que aprimorar. Entrega o valor
completo da ideia original do backlog sozinho.

**Independent Test**: Ativar o toggle num livro em idioma estrangeiro com
tradução configurada, iniciar o audiobook e confirmar que o áudio ouvido está
no idioma-alvo, com pausa perceptível apenas na transição entre parágrafos
(nunca entre frases do mesmo parágrafo).

**Acceptance Scenarios**:

1. **Given** um livro em idioma X aberto com `translationTargetLang` = Y
   (efetivo, por livro ou padrão do app), **When** o usuário ativa "ouvir
   traduzido" e inicia o audiobook, **Then** cada parágrafo é traduzido em
   lote (1 chamada de tradução) antes de qualquer frase dele ser sintetizada
   em Y.
2. **Given** o audiobook traduzido tocando o parágrafo N, **When** a última
   frase do parágrafo N começa a ser sintetizada/tocada, **Then** o
   parágrafo N+1 já foi enviado para tradução em segundo plano, sem pausa
   perceptível na transição para N+1.
3. **Given** uma sessão de leitura traduzida ativa, **When** o usuário troca
   de capítulo, fecha o livro ou desativa a tradução, **Then** qualquer
   tradução de parágrafo em voo é cancelada e nenhum áudio dessa tradução
   cancelada é reproduzido.
4. **Given** o usuário fecha o app no meio de uma sessão de audiobook
   traduzido e reabre depois, **When** o livro é reaberto, **Then** o
   progresso retomado corresponde à posição original do EPUB (parágrafo/CFI),
   não a um offset calculado sobre o texto traduzido.
5. **Given** destaque de leitura ativo durante o audiobook traduzido,
   **When** uma frase é falada, **Then** o destaque visual aparece na
   frase/parágrafo original correspondente (não em nível de palavra).
6. **Given** a tradução de um parágrafo falha e não há mais fallback
   disponível (ex.: sem conexão), **When** isso acontece, **Then** o
   audiobook pausa e exibe um erro visível ao usuário, em vez de tocar áudio
   incorreto ou pular o parágrafo silenciosamente.

---

### User Story 2 - Usar o provedor de tradução premium já configurado como motor (Priority: P2)

Um usuário que já configurou um provedor BYOK premium de tradução para aquele
livro (feature `017`) ativa "ouvir traduzido": em vez de MyMemory, o
audiobook usa o provedor premium configurado como motor de tradução por
parágrafo, com a mesma regra de fallback (sticky) já definida na feature
`017` caso ele falhe.

**Why this priority**: Incremento de qualidade sobre o P1 (tradução mais
fiel ao tom/estilo do livro), mas não é o caminho crítico — a feature já
entrega valor completo com MyMemory isoladamente. Só faz sentido depois do
pipeline básico (P1) estar sólido.

**Independent Test**: Configurar um provedor BYOK premium válido para um
livro (feature `017`), ativar "ouvir traduzido" nesse livro e confirmar, via
log de diagnóstico, que as chamadas de tradução por parágrafo vão para o
provedor premium configurado, não para MyMemory. Em outro livro sem provedor
BYOK configurado, confirmar que o motor usado continua sendo MyMemory.

**Acceptance Scenarios**:

1. **Given** um livro com provedor de tradução premium configurado e
   validado (feature `017`), **When** o usuário ativa "ouvir traduzido",
   **Then** a tradução de cada parágrafo usa esse provedor como motor
   primário.
2. **Given** o motor premium falha durante a sessão de leitura traduzida
   (ex.: quota excedida), **When** o fallback é aplicado conforme as regras
   da feature `017`, **Then** o motor de fallback (MyMemory ou outro,
   conforme a cadeia definida) permanece fixo (sticky) pelo resto da sessão —
   não volta a tentar o motor premium a cada novo parágrafo.
3. **Given** um livro sem nenhum provedor BYOK configurado, **When** o
   usuário ativa "ouvir traduzido", **Then** o motor usado é MyMemory sem
   nenhuma configuração adicional exigida.

---

### User Story 3 - Aviso de consumo antes de iniciar a leitura traduzida (Priority: P3)

Na primeira vez que o usuário ativa "ouvir traduzido" em um livro específico,
o sistema mostra uma estimativa de volume de caracteres que serão traduzidos
(proporcional ao tamanho do livro) antes de permitir que o audiobook comece,
com uma opção de não mostrar esse aviso de novo para aquele livro.

**Why this priority**: Camada de proteção/transparência sobre um pipeline já
funcional (P1/P2) — relevante especialmente quando o motor é BYOK pago (P2),
mas não bloqueia o valor central da feature.

**Independent Test**: Ativar "ouvir traduzido" pela primeira vez num livro e
confirmar que aparece o aviso com a estimativa antes do áudio começar;
confirmar o aviso e reativar a mesma opção depois (mesmo livro) e verificar
que o aviso não aparece novamente.

**Acceptance Scenarios**:

1. **Given** um livro em que "ouvir traduzido" nunca foi ativado antes,
   **When** o usuário ativa a opção pela primeira vez, **Then** o sistema
   mostra uma estimativa de caracteres a traduzir (baseada no tamanho do
   livro) antes de iniciar o audiobook.
2. **Given** o aviso de consumo já foi confirmado uma vez para um livro,
   **When** o usuário desativa e reativa "ouvir traduzido" nesse mesmo livro
   depois, **Then** o aviso não é mostrado novamente.
3. **Given** o mesmo usuário em um livro **diferente** onde nunca ativou a
   opção, **When** ativa "ouvir traduzido" pela primeira vez nesse livro,
   **Then** o aviso aparece de novo (a confirmação é por livro, não global).

### Edge Cases

- O idioma-alvo efetivo de tradução (do livro ou padrão do app) é igual ao
  idioma original do livro: não há o que traduzir. O toggle "ouvir traduzido"
  deve ficar desabilitado (ou oculto) nesse caso, com uma indicação do
  motivo, em vez de rodar uma tradução identidade sem sentido.
- Livro com idioma original não detectado/desconhecido: sem uma origem clara
  para a tradução, "ouvir traduzido" deve ficar indisponível até o usuário
  definir manualmente o idioma do livro (mesma tela já usada para isso em
  `BookDetailsScreen`).
- Parágrafo maior que o limite de caracteres por chamada de um motor (ex.:
  MyMemory, 500 caracteres) — precisa de uma estratégia de divisão que ainda
  preserve contexto suficiente por chamada; detalhe técnico de implementação
  fica para o `sdd-plan`, mas o comportamento observável (o áudio final ainda
  cobre o parágrafo inteiro, sem trecho perdido) é requisito desta spec.
- Usuário troca o idioma-alvo de tradução do livro enquanto uma sessão de
  audiobook traduzido está tocando: a sessão atual deve ser encerrada
  (cancelamento) e uma nova sessão, se reiniciada, usa o novo idioma —
  nenhum áudio no idioma antigo continua tocando depois da troca.
- Usuário desativa "ouvir traduzido" no meio da leitura: o audiobook
  continua tocando a partir da mesma posição, mas agora no idioma original,
  sem precisar reiniciar o capítulo.
- Livro muito curto (poucos parágrafos) ou parágrafo vazio/só espaço em
  branco: não deve gerar chamada de tradução para conteúdo vazio nem travar
  o prefetch do próximo parágrafo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir ativar/desativar "ouvir traduzido" por
  livro, em `BookDetailsScreen`, junto às configurações já existentes de
  idioma de tradução e provedor.
- **FR-002**: Quando "ouvir traduzido" está ativo, o sistema DEVE traduzir
  cada parágrafo em uma única chamada ao motor de tradução configurado,
  antes de sintetizar/tocar qualquer frase desse parágrafo.
- **FR-003**: O sistema DEVE reproduzir o áudio traduzido frase a frase,
  usando o mesmo mecanismo de síntese/chunking de TTS já existente (feature
  `001`), sem alterar sua arquitetura de playback contínuo em segundo plano.
- **FR-004**: O sistema DEVE traduzir o próximo parágrafo em segundo plano
  (prefetch sequencial de 1 parágrafo) enquanto o parágrafo atual ainda está
  sendo falado, de forma que a pausa perceptível de tradução ocorra no
  máximo uma vez por parágrafo, nunca por frase.
- **FR-005**: O sistema DEVE reaproveitar `translationTargetLang` já
  configurado por livro (com fallback para o idioma padrão do app) como
  idioma-alvo do audiobook traduzido — não DEVE introduzir um segundo
  seletor de idioma independente para essa finalidade.
- **FR-006**: O motor de tradução usado pelo audiobook DEVE ser MyMemory por
  padrão, e DEVE usar o provedor BYOK premium já configurado e validado para
  aquele livro (feature `017`), quando disponível, sem exigir configuração
  adicional além da já feita para tradução inline.
- **FR-007**: Quando o motor de tradução falhar durante uma sessão de leitura
  traduzida e um fallback for aplicado (regras já definidas na feature
  `017`), o sistema DEVE manter esse motor de fallback fixo (sticky) pelo
  restante da sessão, sem tentar voltar ao motor original a cada novo
  parágrafo.
- **FR-008**: Quando a tradução de um parágrafo falhar sem nenhum fallback
  restante, o sistema DEVE pausar o audiobook e exibir um erro visível ao
  usuário, em vez de reproduzir áudio incorreto/vazio ou pular o parágrafo
  silenciosamente.
- **FR-009**: O sistema DEVE salvar e retomar o progresso de leitura sempre
  pela posição original do EPUB (parágrafo/CFI), independentemente de a
  leitura traduzida estar ativa.
- **FR-010**: Durante o audiobook traduzido, o destaque visual de leitura
  DEVE degradar para o nível de frase/parágrafo original — não DEVE tentar
  alinhamento palavra-a-palavra entre original e tradução.
- **FR-011**: O sistema DEVE cancelar (via `AbortSignal`) qualquer tradução
  de parágrafo em andamento ao trocar de capítulo, livro, idioma-alvo ou
  provedor, e DEVE garantir que nenhum áudio resultante de uma tradução
  cancelada seja reproduzido.
- **FR-012**: A chave de cache de tradução usada pelo audiobook DEVE incluir
  o provedor de tradução (além de texto e par de idiomas), para que uma
  troca de motor nunca resulte em cache hit com a tradução de outro motor.
- **FR-013**: Na primeira ativação de "ouvir traduzido" em cada livro, o
  sistema DEVE mostrar uma estimativa de volume de caracteres a traduzir
  (proporcional ao tamanho do livro) antes de iniciar o audiobook, com opção
  de não mostrar esse aviso novamente para aquele livro.
- **FR-014**: "Ouvir traduzido" DEVE estar disponível para todos os
  usuários, sem exigir assinatura Pro.
- **FR-015**: O sistema DEVE desabilitar (ou ocultar, com indicação do
  motivo) o toggle "ouvir traduzido" quando o idioma-alvo efetivo de
  tradução for igual ao idioma original do livro, ou quando o idioma
  original do livro não estiver definido.

### Key Entities

- **Sessão de leitura traduzida**: estado efêmero (não persistido além da
  sessão) que amarra livro + capítulo atual + idioma-alvo + motor de
  tradução ativo (incluindo qual motor de fallback ficou sticky, se algum
  foi acionado) enquanto o audiobook traduzido está tocando. Encerra e é
  descartada ao trocar capítulo/livro/idioma/provedor ou ao desativar a
  opção.
- **Preferência de audiobook traduzido por livro**: extensão da configuração
  já existente por livro (mesma linha de `bookSettingsRow` usada por idioma
  de tradução e provedor) — guarda se "ouvir traduzido" está ativo para
  aquele livro e se o aviso de consumo já foi confirmado e não deve
  reaparecer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A pausa perceptível de tradução ocorre no máximo 1 vez por
  parágrafo — nunca entre frases do mesmo parágrafo — medido comparando o
  audiobook com e sem "ouvir traduzido" ativado.
- **SC-002**: Nenhuma regressão nos testes e no fluxo de audiobook em
  segundo plano da feature `001` (já convergida) após esta feature ser
  implementada.
- **SC-003**: Zero cache hit cruzado entre motores de tradução diferentes
  para o mesmo par texto+idiomas.
- **SC-004**: 100% das trocas de capítulo/livro/idioma-alvo/provedor durante
  uma sessão de leitura traduzida cancelam corretamente a tradução em voo —
  nenhum áudio de tradução obsoleta é reproduzido em teste manual dirigido a
  esse cenário.
- **SC-005**: A qualidade percebida da tradução usada no audiobook (com
  contexto de parágrafo inteiro) é validada manualmente como igual ou melhor
  que a tradução por frase isolada do fluxo de tap-to-translate existente.
- **SC-006**: O aviso de consumo aparece exatamente uma vez por livro (até
  ser confirmado) em teste manual dirigido, nunca a cada sessão de audiobook
  no mesmo livro.

## Assumptions

- O público-alvo é o mesmo usuário que já usa o NeoReader para aprender
  inglês, mas para livros em **outros** idiomas que ele não domina — a
  feature não compete com o pilar de aprendizado de inglês do produto.
  Esclarecido pelo dono do produto durante o assessment (2026-09-10).
- A feature `017` (tradução premium BYOK) já está convergida e em produção
  no momento desta spec (2026-09-12) — diferente do assessment original
  (2026-09-10), que a tratava como dependência incerta/futura. Por isso, o
  suporte a motor BYOK premium (User Story 2) entra no escopo desta feature
  desde já, em vez de ficar condicionado a um assessment paralelo ainda em
  aberto.
- `getSentenceChunks()` (`EpubViewer.tsx`) já extrai o capítulo/seção inteiro
  de uma vez (não só o texto visível em tela), então o prefetch de 1
  parágrafo à frente não exige um iterador novo baseado no spine do EPUB —
  confirmado por leitura de código durante o assessment.
- `TranslationService.ts` e a síntese de TTS já operam sobre string pura,
  sem acoplamento a DOM/UI — a integração entre os dois pipelines não exige
  reescrever nenhum dos dois do zero.
- Nem os provedores de TTS premium BYOK (`SettingsNarrationScreen`) nem os
  provedores de tradução premium BYOK (`SettingsTranslationScreen`) são
  Pro-gated hoje no código — o precedente de produto é que o custo desses
  provedores já é do próprio usuário (chave dele) ou do MyMemory gratuito,
  então esta feature segue o mesmo padrão (FR-014).
- Detalhes técnicos específicos de provider citados numa proposta de
  arquitetura externa avaliada durante o assessment (parâmetro `context` e
  modelo `latency_optimized` do DeepL, limite de ~5.000 caracteres do
  Google, eventos SSE da Responses API da OpenAI) **não** foram aceitos como
  fato nesta spec — precisam ser confirmados contra documentação oficial na
  fase de pesquisa do `sdd-plan`, se relevantes à abordagem escolhida.

## Clarifications

### Sessão 2026-09-12

- Q: Idioma-alvo da tradução do audiobook: de onde ele vem? → A: Reusa
  `translationTargetLang` já configurado por livro (mesmo campo usado pela
  tradução inline por toque), com fallback pro idioma padrão do app — sem
  seletor novo dedicado ao audiobook. (Refletido em FR-005 e Fora de
  Escopo.)
- Q: A feature deve ser Pro-gated ou disponível para todos? → A: Disponível
  para todos, sem exigência de assinatura Pro — mesmo padrão já usado pelos
  provedores BYOK premium de TTS e tradução, que também não são Pro-gated
  hoje. (Refletido em FR-014.)
- Q: Onde o usuário ativa/desativa a leitura traduzida do audiobook? → A: Em
  `BookDetailsScreen`, ao lado das configurações já existentes de idioma de
  tradução e provedor por livro — não no mini player do leitor. (Refletido
  em FR-001.)
- Q: Se a tradução de um parágrafo falhar de vez durante o audiobook (sem
  fallback restante), o que a leitura traduzida deve fazer? → A: Pausar o
  audiobook e mostrar um erro visível, em vez de pular o parágrafo e tocar
  no idioma original ou arriscar áudio incorreto/vazio. Consistente com o
  comportamento já validado na feature `017` para o mesmo cenário de falha
  total. (Refletido em FR-008 e Acceptance Scenario 6 da User Story 1.)
- Q: Com que frequência mostrar o aviso de consumo (caracteres a traduzir)
  antes de iniciar a leitura traduzida? → A: Uma vez por livro, com opção de
  não perguntar de novo — não a cada sessão de audiobook. (Refletido em
  FR-013 e na User Story 3.)
