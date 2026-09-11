# Assessment Explora: TTS Traduzido

- **Slug**: tts-traduzido
- **Criado**: 2026-09-10
- **Origem**: ideia do backlog (`.planning/backlog.md`, seção "Ideias Futuras")

## Ideia Bruta

"Feature: TTS Traduzido: Funcionalidade nova em que o usuário pede para ler
um livro por exemplo em inglês, e o TTS lê em português. Na teoria seria o
envio do texto em inglês → serviço de tradução → TTS. O desafio é a
latência."

## Evidência a Favor

- Seria uma extensão de duas features já maduras e convergidas do NeoReader:
  TTS com audiobook contínuo em segundo plano (spec `001`, com múltiplos
  provedores premium e voz por idioma) e tradução inline (`TranslationService.ts`).
  As duas metades do pipeline já existem isoladamente.
- Os provedores de TTS premium já hoje selecionam voz por idioma
  (`SpeechifyService.listCompatibleVoices(language)`, `isLanguageCompatible`
  em `utils/language.ts`) — falar em português já é tecnicamente suportado
  pelos provedores atuais, não exigiria trocar de provedor TTS.
- Se o assessment paralelo de tradução multi-provedor BYOK
  (`sdd/assessments/traduo-multi-provedor-byok-deepl-openai-google/`)
  avançar, o `TranslationProvider` comum resultante poderia ser reaproveitado
  aqui como motor de tradução, reduzindo custo de construir do zero.
- ASSUMPTION: existe um público que quer "consumir" um livro estrangeiro sem
  esforço de idioma (ouvir em português um livro em inglês) — plausível como
  proposta de produto genérica ("Netflix for Books" também sugere consumo
  facilitado), mas não validado por nenhum usuário real do NeoReader.

## Evidência Contra

- O próprio autor da ideia já identificou o risco central no backlog:
  latência. Confirmado por leitura de código: a síntese TTS hoje é
  **sequencial e síncrona por chunk** — `useTTS.ts` chama
  `await synthesizePremiumTts(...)` diretamente nos dois pontos onde é usado,
  sem nenhum prefetch/look-ahead/buffer de "próximo chunk enquanto o atual
  toca" (busca por esses padrões em todo `src/` não encontrou nada). Inserir
  uma chamada de tradução por sentença antes da síntese empilharia **duas
  chamadas de rede sequenciais por chunk**, numa feature cujo valor central
  (audiobook contínuo em segundo plano, spec `001`, já convergida) é
  justamente não ter pausas perceptíveis.
- A tradução hoje é via MyMemory, API pública gratuita com limite de 500
  caracteres por chamada e sem SLA documentado — não projetada pra volume de
  chamadas contínuas (um audiobook inteiro, sentença por sentença, hora após
  hora). Risco real de rate-limit/degradação em uso prolongado.
- O chunking de TTS é por sentença (`splitParagraphIntoTtsChunks`, agrupando
  frases curtas). Traduzir frase isolada, sem o parágrafo ao redor como
  contexto, tende a produzir tradução pior — exatamente o problema de
  "tradução sem contexto" que motivou o assessment de tradução premium se
  agravaria aqui, não melhoraria.
- Escopo cruza 3 sistemas já complexos e maduros (registry de provedores TTS,
  playback contínuo em segundo plano já convergido, serviço de tradução) —
  risco real de regressão numa feature estável e testada (spec `001`) se a
  integração não for cuidadosa.
- Tensão de identidade de produto: CLAUDE.md descreve o NeoReader como focado
  em "facilitar o aprendizado de inglês". Ouvir a tradução em vez do texto
  original vai na direção oposta desse diferencial específico (evita o
  contato com o inglês, em vez de reforçá-lo) — não é necessariamente ruim
  pro produto como um todo, mas não reforça o pilar central declarado.
- Não há pedido de usuário real registrado além da própria linha de backlog
  — é uma ideia, não uma demanda validada externamente.

## Perguntas em Aberto

- Qual é o público-alvo real dessa feature: o mesmo público que já usa o app
  pra aprender inglês, ou um público diferente que só quer "ouvir" um livro
  estrangeiro sem aprender nada? Isso muda o valor e o fit estratégico da
  ideia.
- Existe apetite pra reformular a arquitetura de playback contínuo (buffer/
  prefetch de chunk) pra esconder a latência de tradução, mesmo sabendo que
  isso toca uma feature já convergida (spec `001`)? Ou a expectativa é uma
  versão simplificada aceitando pausas perceptíveis entre frases?
- Essa feature depende do assessment paralelo de tradução multi-provedor
  BYOK pra ter qualidade/volume aceitável, ou é aceitável avançar só com
  MyMemory, assumindo as limitações de tamanho de chamada e falta de SLA?
