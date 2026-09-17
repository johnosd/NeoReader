# Feature Specification: Onboarding com Diferenciais (TTS Traduzido, Vozes e Tradução Premium, OPDS, Sync)

**Slug**: `019-onboarding-diferenciais`

**Created**: 2026-09-16

**Status**: Em Execucao

**Input**: Atualizar a welcome page (onboarding in-app, `src/screens/WelcomeScreen.tsx`) pra mostrar mais benefícios e diferenciais do app: TTS com vozes de última geração (ElevenLabs, Speechify, Fish Audio), tradução com providers (OpenAI, Google, DeepL), TTS Traduzido (lê um livro em inglês na língua nativa do usuário) e biblioteca via OPDS. Exemplos de mensagem/conteúdo fornecidos em `docs/wellcome-page/` (artes promocionais).

## Escopo

### Incluído

- Atualizar o onboarding in-app (carrossel de boas-vindas exibido antes do login/cadastro, hoje implementado em `WelcomeScreen.tsx`) pra comunicar 5 diferenciais do NeoReader frente a outros leitores de EPUB:
  1. **TTS Traduzido** — ouvir um livro em outro idioma narrado no idioma nativo do usuário. Diferencial de maior destaque (aparece antes dos demais diferenciais novos), por ser o mais exclusivo do mercado e funcionar mesmo sem nenhuma chave própria configurada (motor gratuito da feature 018).
  2. **Vozes premium de TTS** — citando nominalmente ElevenLabs, Speechify e Fish Audio, deixando claro que dependem do usuário conectar a própria chave de API (BYOK).
  3. **Tradução premium por provedor** — citando nominalmente OpenAI, Google e DeepL, com o mesmo aviso de BYOK.
  4. **Biblioteca via catálogos OPDS** — acesso a catálogos públicos (ex.: Project Gutenberg) e self-hosted que o usuário cadastrar, sem exigir nenhuma chave.
  5. **Sincronização na nuvem** — bookmarks e progresso de leitura sincronizados entre dispositivos via Google Drive.
- Todo texto novo localizado nos 3 idiomas já suportados (pt-BR, en, es), pelo mesmo mecanismo de `src/i18n/messages.ts` usado pelos slides atuais.
- Preservação do comportamento de navegação já existente: "Pular" conclui o fluxo a qualquer momento; o último passo troca "Próximo" por "Começar agora".
- A composição final (quantos slides existem, se os 3 destaques atuais — Catálogo/50 mil livros, Leitura sem limites, Progresso — são mantidos como estão, fundidos ou reorganizados, e a ordem exata dos 5 diferenciais novos além do TTS Traduzido vir primeiro) é uma decisão de UX resolvida no `sdd-plan`, não travada aqui.

### Fora de Escopo

- Redesenho visual do onboarding num estilo diferente do design system atual (dark mode, tokens de `src/index.css`). As imagens em `docs/wellcome-page/` são inspiração de **mensagem/conteúdo**, não direção visual — são artes promocionais em tom azul, fora da identidade "Netflix for Books" do app.
- Criação de uma página de marketing/landing web separada (site, App Store/Play Store listing) — o escopo é só o onboarding in-app já existente.
- Mudanças na lógica de paywall/Pro, no gating de features, ou no fluxo de configuração de chaves BYOK em si (telas de Configurações > Narração/Tradução).
- Novos provedores de TTS/tradução além dos já existentes e citados acima.
- Estender o ícone tocável de sincronização de bookmarks (feature 005) — o onboarding só menciona a sincronização como benefício, sem mudar esse fluxo.
- Mudar quando o onboarding aparece (ex.: só na primeira instalação vs. reexibição) — fora de escopo, mantém o comportamento atual.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - TTS Traduzido como diferencial de destaque (Priority: P1)

Uma pessoa que nunca usou o NeoReader abre o app pela primeira vez e passa pelo onboarding. Antes de qualquer outro diferencial novo, ela vê um destaque explicando que pode ouvir um livro em outro idioma (ex.: inglês) narrado na sua própria língua — algo que os leitores de EPUB concorrentes não oferecem.

**Why this priority**: É o diferencial mais exclusivo do app e funciona mesmo sem nenhuma configuração de chave própria (motor gratuito da feature 018), então vende bem sem exigir explicação técnica de BYOK. Sozinho já comunica o principal motivo pra continuar explorando o app.

**Independent Test**: Abrir o onboarding do zero e confirmar que existe um destaque (heading + descrição) sobre TTS Traduzido, posicionado antes dos destaques de vozes premium, tradução premium, OPDS e sync.

**Acceptance Scenarios**:

1. **Given** o usuário abre o app pela primeira vez, **When** o onboarding é exibido, **Then** existe um destaque dedicado ao TTS Traduzido com título e descrição que deixam claro o benefício ("ouça um livro em outro idioma narrado no seu idioma").
2. **Given** o usuário está nesse destaque, **When** ele avança pelo onboarding, **Then** o destaque de TTS Traduzido aparece antes de qualquer um dos outros 4 diferenciais novos (vozes premium, tradução premium, OPDS, sync).

---

### User Story 2 - Vozes premium de TTS com aviso de chave própria (Priority: P2)

Durante o onboarding, o usuário vê um destaque citando ElevenLabs, Speechify e Fish Audio como vozes de última geração disponíveis no app, com uma indicação clara de que usá-las exige conectar a própria chave de API — sem dar a impressão de que já vêm prontas/gratuitas.

**Why this priority**: Complementa o diferencial de voz que já existe hoje (slide "Leia com vozes"), tornando-o mais forte e citando as marcas nominalmente — mas é testável e entregável de forma independente do TTS Traduzido.

**Independent Test**: Abrir o onboarding e confirmar que existe um destaque citando as 3 marcas (ElevenLabs, Speechify, Fish Audio) e um texto indicando a necessidade de conectar chave própria.

**Acceptance Scenarios**:

1. **Given** o usuário chega no destaque de vozes premium, **When** ele lê o conteúdo, **Then** as 3 marcas (ElevenLabs, Speechify, Fish Audio) aparecem nominalmente no texto.
2. **Given** o mesmo destaque, **When** o usuário lê a descrição, **Then** fica explícito que usar essas vozes exige conectar a própria chave de API (BYOK) — nenhum texto sugere que sejam gratuitas ou automáticas.

---

### User Story 3 - Tradução premium por provedor com aviso de chave própria (Priority: P2)

Durante o onboarding, o usuário vê um destaque citando OpenAI, Google e DeepL como provedores de tradução disponíveis, com o mesmo aviso de chave própria (BYOK) usado no destaque de vozes.

**Why this priority**: Mesmo racional da User Story 2 — diferencial real (feature 017 já implementada), mas não tão exclusivo quanto o TTS Traduzido, e testável isoladamente.

**Independent Test**: Abrir o onboarding e confirmar que existe um destaque citando os 3 provedores (OpenAI, Google, DeepL) com o aviso de chave própria.

**Acceptance Scenarios**:

1. **Given** o usuário chega no destaque de tradução premium, **When** ele lê o conteúdo, **Then** os 3 provedores (OpenAI, Google, DeepL) aparecem nominalmente no texto.
2. **Given** o mesmo destaque, **When** o usuário lê a descrição, **Then** fica explícito que usar esses provedores exige conectar a própria chave de API (BYOK).

---

### User Story 4 - Biblioteca via catálogos OPDS (Priority: P2)

Durante o onboarding, o usuário vê um destaque explicando que pode conectar bibliotecas/catálogos externos (ex.: Project Gutenberg, ou qualquer catálogo público/self-hosted que ele cadastrar) pra ter acesso a mais livros, sem precisar de nenhuma chave.

**Why this priority**: Diferencial real (feature 003 já implementada) e testável isoladamente, mas de apelo mais restrito (usuário avançado) que o TTS Traduzido.

**Independent Test**: Abrir o onboarding e confirmar que existe um destaque sobre bibliotecas/catálogos externos, sem menção a chave própria (não se aplica a essa feature).

**Acceptance Scenarios**:

1. **Given** o usuário chega no destaque de bibliotecas externas, **When** ele lê o conteúdo, **Then** fica claro que dá pra conectar catálogos públicos (com pelo menos um exemplo nomeado, ex.: Project Gutenberg) e self-hosted.
2. **Given** o mesmo destaque, **When** o usuário lê a descrição, **Then** nenhum texto menciona necessidade de chave de API pra essa funcionalidade.

---

### User Story 5 - Sincronização de bookmarks e progresso na nuvem (Priority: P3)

Durante o onboarding, o usuário vê um destaque explicando que bookmarks e progresso de leitura sincronizam entre dispositivos via Google Drive.

**Why this priority**: É conveniência (continuidade entre dispositivos), não um diferencial único de mercado como os demais — prioridade mais baixa, mas ainda testável e entregável isoladamente.

**Independent Test**: Abrir o onboarding e confirmar que existe um destaque sobre sincronização de bookmarks/progresso via Google Drive entre dispositivos.

**Acceptance Scenarios**:

1. **Given** o usuário chega no destaque de sincronização, **When** ele lê o conteúdo, **Then** fica claro que bookmarks e progresso sincronizam entre dispositivos via Google Drive.

---

### Edge Cases

- Texto novo sem tradução em algum dos 3 idiomas suportados (pt-BR/en/es) não deve quebrar o onboarding nem cair em chave crua — deve seguir o mesmo comportamento de fallback do sistema de i18n já existente.
- Nomes de marca (ElevenLabs, Speechify, Fish Audio, OpenAI, Google, DeepL) são strings estáticas, como hoje — não há tratamento dinâmico caso um provedor mude de nome/identidade visual.
- Textos mais longos (ex.: citar 3 marcas numa frase) não devem estourar o layout mobile-first em telas pequenas (~360-400px de largura) nem exigir scroll dentro do slide.
- O termo técnico "OPDS" não é familiar pro usuário final leigo — o destaque correspondente deve priorizar linguagem simples ("bibliotecas/catálogos externos") e pode citar "OPDS" só como detalhe secundário, não como o termo principal do título (ver Assumptions).
- Usuário que já passou pelo onboarding antes da atualização (app já instalado) — fora de escopo mudar a lógica de quando o onboarding reaparece; se ele não reaparece hoje pra quem já completou, essa spec não muda isso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O onboarding DEVE apresentar um destaque dedicado ao TTS Traduzido, descrevendo que o app narra um livro em outro idioma na língua nativa do usuário.
- **FR-002**: O destaque de TTS Traduzido DEVE aparecer antes de qualquer um dos outros 4 diferenciais novos (vozes premium, tradução premium, OPDS, sync) na sequência do onboarding.
- **FR-003**: O onboarding DEVE apresentar um destaque descrevendo vozes premium de TTS, citando nominalmente ElevenLabs, Speechify e Fish Audio, e informando que exigem conectar a própria chave de API do usuário (BYOK).
- **FR-004**: O onboarding DEVE apresentar um destaque descrevendo tradução premium por provedor, citando nominalmente OpenAI, Google e DeepL, e informando que exigem conectar a própria chave de API do usuário (BYOK).
- **FR-005**: O onboarding DEVE apresentar um destaque descrevendo suporte a bibliotecas via catálogos OPDS (com pelo menos um exemplo nomeado, ex.: Project Gutenberg), sem sugerir necessidade de chave de API.
- **FR-006**: O onboarding DEVE apresentar um destaque descrevendo a sincronização de bookmarks e progresso de leitura entre dispositivos via Google Drive.
- **FR-007**: Todo texto novo introduzido nesta feature DEVE estar disponível nos 3 idiomas já suportados pelo app (pt-BR, en, es), usando o mesmo mecanismo de `src/i18n/messages.ts` dos destaques existentes.
- **FR-008**: O onboarding DEVE preservar o comportamento de navegação existente — "Pular" conclui o fluxo a qualquer momento (chamando `onComplete`), e o último passo troca "Próximo" por "Começar agora".
- **FR-009**: Nenhum texto dos destaques de vozes premium ou tradução premium DEVE sugerir que essas funcionalidades são gratuitas ou funcionam sem configuração — o aviso de chave própria (BYOK) deve estar presente em ambos.

### Key Entities

N/A — feature de conteúdo/copy sobre uma tela já existente; não introduz nem altera entidades de dados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Os 5 diferenciais (TTS Traduzido, vozes premium, tradução premium, OPDS, sync) têm conteúdo dedicado no onboarding, com texto completo nos 3 idiomas suportados (sem chave de tradução ausente).
- **SC-002**: O destaque de TTS Traduzido é o primeiro entre os 5 diferenciais novos em qualquer ordem de navegação do onboarding.
- **SC-003**: Os destaques de vozes premium e tradução premium citam as 6 marcas/provedores nominalmente (ElevenLabs, Speechify, Fish Audio, OpenAI, Google, DeepL) e incluem o aviso de chave própria — verificável por leitura direta do texto localizado.
- **SC-004**: A suíte de testes de `WelcomeScreen` (adaptada nesta feature) continua cobrindo o fluxo de "Pular" e "Começar agora" sem regressão, e passa em `npm test`.

## Assumptions

- O onboarding referido é a tela in-app `src/screens/WelcomeScreen.tsx` (carrossel exibido antes do login/cadastro) — não uma página de marketing web, que não existe hoje neste repositório.
- As imagens em `docs/wellcome-page/` (incluindo `api_key_elevanlabs.png`, que é um tutorial de configuração, não conteúdo de onboarding) servem só como referência de tom/mensagem — o guia passo a passo de conectar a ElevenLabs fica fora de escopo desta feature (pertence a ajuda/configurações, não ao onboarding de boas-vindas).
- O destaque de OPDS usa linguagem amigável ("bibliotecas/catálogos externos") como termo principal, evitando expor a sigla técnica "OPDS" como headline — decisão de copy de baixo risco, revisável no `sdd-plan`/`sdd-execute` sem impacto na spec.
- A decisão de estrutura final do onboarding (quantos slides, se os 3 destaques atuais são mantidos como estão, fundidos ou reorganizados) fica pro `sdd-plan`, guiada pela prioridade P1 do TTS Traduzido e pelas prioridades P2/P3 dos demais.
- Os textos dos slides atuais não citados nesta spec (Catálogo/50 mil livros, Leitura sem limites, Progresso) podem ser reaproveitados, ajustados ou reorganizados no `sdd-plan`, desde que a informação que já comunicam hoje não desapareça sem um substituto equivalente.

## Clarifications

### Sessão 2026-09-16

- Q: Como encaixar os 4+1 diferenciais nos 4 slides atuais do onboarding (manter e adicionar, consolidar, ou decidir depois)? → A: Decidir a estrutura final no `sdd-plan`, sem travar aqui o número/agrupamento de slides.
- Q: Vozes e tradução premium exigem BYOK — o onboarding deve deixar isso explícito? → A: Sim, deve ficar explícito (FR-003, FR-004, FR-009).
- Q: Incluir sincronização de bookmarks/progresso (Google Drive) como diferencial, já que apareceu numa das imagens de referência junto do OPDS? → A: Sim, incluir como 5º diferencial (User Story 5, FR-006).
- Q: Existe prioridade de destaque entre os diferenciais (ex.: TTS Traduzido primeiro)? → A: Sim, TTS Traduzido em destaque/primeiro (P1); os demais em ordem livre (P2/P3).
