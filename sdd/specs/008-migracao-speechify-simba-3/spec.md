# Feature Specification: Migração Speechify simba-english/simba-multilingual → simba-3.2/simba-3.0

**Slug**: `008-migracao-speechify-simba-3`

**Created**: 2026-09-03

**Status**: Em Execução

**Input**: Handoff do assessment `sdd/assessments/migrar-speechify-simba-englishsimba-multilingual-simba-32sim/decision.md` (veredito `go`). A Speechify está retirando os modelos TTS `simba-english`/`simba-multilingual` — não selecionáveis a partir da versão de API `2026-09-21` (`400 model_retired`), desligados incondicionalmente em `2026-11-21`. `src/services/SpeechifyService.ts` hardcoda esses dois nomes em `pickSpeechifyModel` e não fixa `Speechify-Version`, então o projeto fica exposto já em `2026-09-21` (~18 dias a partir da criação desta spec).

## Escopo

### Incluído

- Trocar os modelos enviados em toda chamada de síntese Speechify (`POST
  https://api.speechify.ai/v1/audio/speech`) de `simba-english`/
  `simba-multilingual` para `simba-3.2`/`simba-3.0`.
- Decidir entre `simba-3.2` e `simba-3.0` por síntese com base no que a voz
  selecionada realmente suporta (campo `models[].name` já retornado por
  `GET /v1/voices`), não apenas pelo idioma do livro.
- Fallback automático para `simba-3.0` quando a voz de inglês não suportar
  `simba-3.2`, sem exigir ação do usuário.
- Cobertura de testes automatizados para os três caminhos de decisão de
  modelo (inglês com voz suportada, inglês sem suporte → fallback,
  não-inglês).
- Validação manual contra a API viva da Speechify (key local disponível em
  `.env`) antes de considerar a feature concluída.

### Fora de Escopo

- Trocar o provider de TTS padrão ou remover o Speechify como opção — ele
  continua ao lado de native, ElevenLabs e Fish Audio.
- Implementar pin do header `Speechify-Version` como rede de segurança —
  avaliado no assessment e descartado como solução (só adiaria o problema
  até 2026-11-21, não resolve).
- Qualquer mudança nos outros providers de TTS (native, ElevenLabs, Fish
  Audio) — não são afetados por esta depreciação.
- Ampliar cobertura de idiomas além do que `simba-3.0`/`simba-3.2` já
  suportam hoje (ex: melhorar suporte a japonês) — fora do problema
  original, tratado como comportamento inalterado (ver Edge Cases).
- Retry automático em caso de rejeição da API mesmo após a checagem local de
  suporte da voz (ex: cache desatualizado) — a checagem determinística via
  `models[].name` é o único mecanismo previsto nesta feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Narração Speechify continua funcionando após o desligamento (Priority: P1)

Como usuário com uma API key da Speechify configurada, quero continuar
ouvindo a narração dos meus livros sem interrupção depois que a Speechify
desligar os modelos antigos, para não perder a experiência de leitura com
voz que já uso hoje.

**Why this priority**: sem isso, a narração Speechify quebra em produção
para todo usuário configurado a partir de 2026-09-21 — é uma regressão, não
uma melhoria opcional.

**Independent Test**: com uma key Speechify válida configurada, abrir um
livro em inglês e em outro idioma coberto (ex: pt-BR), iniciar a narração em
cada um, e confirmar que o áudio é sintetizado sem erro `model_retired`.

**Acceptance Scenarios**:

1. **Given** usuário com Speechify configurado e livro em inglês, **When**
   inicia a narração, **Then** o áudio é sintetizado com sucesso usando
   `simba-3.2` (quando a voz suportar) ou `simba-3.0` (fallback), sem erro
   visível ao usuário.
2. **Given** usuário com Speechify configurado e livro em um idioma coberto
   por `simba-3.0` (pt-BR, es, fr, de, it), **When** inicia a narração,
   **Then** o áudio é sintetizado com sucesso usando `simba-3.0`.

---

### User Story 2 - Fallback automático quando a voz de inglês não suporta simba-3.2 (Priority: P2)

Como usuário que já tem uma voz de inglês salva/preferida que não está no
conjunto curado do `simba-3.2`, quero que a narração continue funcionando
automaticamente com outro modelo, para não precisar agir manualmente nem ter
a experiência quebrada por causa de uma escolha de modelo que não controlo.

**Why this priority**: é o caso que justifica o split por voz em vez de um
`simba-3.0` cego para tudo — sem o fallback, parte dos usuários de inglês
ficaria bloqueada mesmo com a migração feita.

**Independent Test**: com uma voz de inglês que não suporta `simba-3.2`
(confirmado via `models[].name` na resposta de `/v1/voices` para aquela
voz), iniciar a narração e confirmar que o sistema usa `simba-3.0`
automaticamente e a síntese é bem-sucedida.

**Acceptance Scenarios**:

1. **Given** voz de inglês selecionada não suporta `simba-3.2`, **When**
   inicia a narração, **Then** o sistema usa `simba-3.0` automaticamente e a
   síntese retorna áudio válido, sem erro exposto ao usuário.
2. **Given** voz de inglês selecionada suporta `simba-3.2`, **When** inicia
   a narração, **Then** o sistema usa `simba-3.2`.

---

### Edge Cases

- Voz sem informação de `models[].name` na resposta de `/v1/voices` (campo
  ausente/formato inesperado) → tratar como não suportando `simba-3.2` e
  cair para `simba-3.0` (fail-safe, nunca travar por falta de dado).
- Idioma sem nenhuma voz Speechify compatível hoje (ex: japonês, se
  `simba-3.0` não cobrir) → comportamento inalterado em relação ao atual:
  lista de vozes compatíveis vazia, sem crash (`useBookDetailsTtsVoices` já
  trata isso hoje). Esta feature não introduz nem resolve esse caso.
- API rejeita o modelo mesmo após a checagem local (ex: cache de vozes
  desatualizado) → segue o tratamento de erro de síntese já existente hoje
  (mensagem de erro genérica), sem necessidade de retry automático nesta
  feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema NÃO DEVE enviar `simba-english` ou `simba-multilingual`
  em nenhuma chamada de síntese Speechify.
- **FR-002**: Para livros em inglês, sistema DEVE usar `simba-3.2` quando a
  voz selecionada declarar suporte a esse modelo (via `models[].name` da
  resposta de `GET /v1/voices` para aquela voz).
- **FR-003**: Para livros em inglês, quando a voz selecionada não declarar
  suporte a `simba-3.2` (ou a informação não estiver disponível), sistema
  DEVE usar `simba-3.0` automaticamente, sem exigir ação do usuário nem
  expor erro.
- **FR-004**: Para idiomas não-inglês, sistema DEVE usar `simba-3.0`.
- **FR-005**: Sistema DEVE continuar enviando `language` explicitamente em
  toda chamada de síntese Speechify (comportamento já existente — não pode
  regredir).
- **FR-006**: Sistema DEVE manter o comportamento atual de lista vazia (sem
  crash) para idiomas sem nenhuma voz Speechify compatível.
- **FR-007**: Suite de testes automatizados DEVE cobrir os três caminhos de
  decisão de modelo: inglês com voz suportada por `simba-3.2`, inglês com
  voz não suportada (fallback), e idioma não-inglês.
- **FR-008**: Antes de considerar a feature concluída, DEVE ser feita uma
  validação manual contra a API viva da Speechify (key local em `.env`),
  sintetizando com a voz padrão (`carly`) e confirmando áudio válido sem
  erro `model_retired`.

### Key Entities

- **Voz Speechify** (`SpeechifyVoice`, já existente): cada voz expõe uma
  lista de modelos suportados (`models[].name`). Esta feature passa a usar
  esse dado para decidir o modelo de síntese por voz, além do uso atual
  (idioma/preview de áudio).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhuma síntese Speechify em produção retorna erro `model_retired`
  a partir da implementação (incluindo depois de 2026-09-21).
- **SC-002**: Toda voz hoje selecionável pelos usuários (padrão `carly` +
  vozes salvas) continua sintetizando com sucesso após a mudança — validado
  manualmente antes do deploy (FR-008).
- **SC-003**: Sínteses em inglês usam o modelo de menor latência
  (`simba-3.2`) sempre que a voz selecionada suportar — sem fallback
  desnecessário nos casos em que a voz é compatível.

## Assumptions

- A resposta de `GET /v1/voices` da Speechify continua incluindo
  `models[].name` por voz (já é o formato observado hoje no parsing
  existente). Se esse campo deixar de existir, a checagem de suporte a
  `simba-3.2` perde sua fonte de dado e precisaria de outro critério — fora
  do escopo desta spec.
- O conjunto de idiomas cobertos por `simba-3.0` (inglês, alemão, espanhol,
  francês, italiano, português) é suficiente para a maioria dos usuários do
  NeoReader hoje; japonês pode ficar sem cobertura, com o mesmo
  comportamento de fallback vazio que já existe.
- Existe uma key de Speechify válida disponível localmente (`.env`) para
  realizar a validação manual exigida em FR-008.

## Clarifications

### Sessão 2026-09-03

- Q: Critério de "pronto" — validar contra a API viva da Speechify (key
  local em `.env`) ou basta build + testes automatizados? → A: Exigir
  validação com API viva, sintetizando de fato com a voz padrão antes de
  considerar concluído (virou FR-008/SC-002).
- Q: Abordagem de modelo — `simba-3.0` para tudo (Abordagem 2 recomendada no
  assessment) ou reabrir o split `simba-3.2` (inglês) / `simba-3.0` (resto)?
  → A: Reabrir o split — `simba-3.2` para inglês quando a voz suportar,
  `simba-3.0` para o resto (mudou a abordagem recomendada no assessment).
- Q: Quando a voz de inglês selecionada não suportar `simba-3.2`, o que deve
  acontecer? → A: Cair automaticamente para `simba-3.0`, determinado via
  `models[].name` da própria API, sem exigir ação do usuário nem expor erro
  (virou FR-002/FR-003/User Story 2).
