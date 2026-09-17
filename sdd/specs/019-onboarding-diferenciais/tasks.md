---
description: "Tasks: Onboarding com Diferenciais"
---

# Tasks: Onboarding com Diferenciais (TTS Traduzido, Vozes e Tradução Premium, OPDS, Sync)

**Input**: Documentos de design de `sdd/specs/019-onboarding-diferenciais/`

**Prerequisites**: plan.md, spec.md, quickstart.md

**Organization**: Tasks agrupadas por user story (P1 → P2 → P3), cada uma
independentemente testável depois do Setup.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence

## Path Conventions

Projeto único (SPA React, sem separação backend/frontend) — caminhos reais:
- Tela do onboarding: `src/screens/WelcomeScreen.tsx`
- Mensagens/i18n: `src/i18n/messages.ts` (3 blocos: `ptBRMessages`, `enMessages`, `esMessages`)
- Teste: `src/__tests__/screens/WelcomeScreen.test.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ícones novos disponíveis antes de qualquer slide usá-los.

- [X] T001 Em `src/screens/WelcomeScreen.tsx`, estender o import de
  `lucide-react` (linha 2) pra incluir `Languages`, `Globe` e `Rss` além dos
  ícones já importados (`BarChart3, BookOpen, Bookmark, ChevronRight,
  Volume2`).

**Checkpoint**: Ícones prontos — nenhum slide novo ainda.

---

## Phase 2: User Story 1 - TTS Traduzido como diferencial de destaque (Priority: P1) 🎯 MVP

**Objetivo**: Slide novo, posicionado logo após o slide de abertura
("Catálogo"), explicando que o app narra um livro em outro idioma na língua
nativa do usuário.

**Independent Test**: Abrir o onboarding do zero e confirmar que o 2º slide
(logo após "50.000 livros") é o de TTS Traduzido, com heading e descrição
visíveis.

### Implementation

- [X] T002 [US1] Em `src/screens/WelcomeScreen.tsx`, inserir uma nova entrada
  no array `slides` na posição 2 (entre `store` e `reading`):
  `{ icon: Languages, titleKey: 'welcome.slide.translatedTts.title',
  descriptionKey: 'welcome.slide.translatedTts.description', glow:
  'rgba(99,102,241,0.28)' }`.
- [X] T003 [P] [US1] Em `src/i18n/messages.ts`, adicionar em `ptBRMessages`
  (ordem alfabética dentro do grupo `welcome.slide.*`, antes de
  `welcome.slide.progress.*`):
  `'welcome.slide.translatedTts.description': 'Escolha um livro em outro
  idioma e ouca a narracao traduzida em tempo real, na sua lingua.'` e
  `'welcome.slide.translatedTts.title': 'Ouca em qualquer idioma'`
  (posição alfabética real: depois de `welcome.slide.store.title`, antes de
  `welcome.slide.voice.description` — ver ordem completa no arquivo).
- [X] T004 [P] [US1] Repetir T003 em `enMessages`:
  `'welcome.slide.translatedTts.description': 'Pick a book in another
  language and hear the narration translated in real time, in your own
  language.'` e `'welcome.slide.translatedTts.title': 'Listen in any
  language'`.
- [X] T005 [P] [US1] Repetir T003 em `esMessages`:
  `'welcome.slide.translatedTts.description': 'Elige un libro en otro idioma
  y escucha la narracion traducida en tiempo real, en tu idioma.'` e
  `'welcome.slide.translatedTts.title': 'Escucha en cualquier idioma'`.

### Testes da Fase

- [X] T006 [US1] Em `src/__tests__/screens/WelcomeScreen.test.tsx`, no teste
  "avanca pelo carousel e conclui no ultimo slide", inserir a asserção do
  heading `'Ouca em qualquer idioma'` logo após `'50.000 livros'` e antes de
  `'Leia sem limites'` (ajustar a contagem de cliques em "Proximo"
  subsequente — ver Phase 7 pra reconciliar a sequência completa depois que
  todos os slides novos existirem).

**Critério de Conclusão**: O onboarding tem um slide dedicado ao TTS
Traduzido na 2ª posição, com texto correto nos 3 locales (`npx tsc -p
tsconfig.app.json --noEmit` passa, confirmando que `enMessages`/`esMessages`
não ficaram com chave faltando).

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Implementação concluída; teste da fase (T006) adiado
- Feito: Slide de TTS Traduzido inserido na 2ª posição do array `slides`; chaves `welcome.slide.translatedTts.title`/`.description` adicionadas nos 3 locales
- Testes executados: `npx vitest run src/__tests__/screens/WelcomeScreen.test.tsx` (2 passed), incorporado na reescrita consolidada de T025 (Fase 7)
- Pendências: nenhuma

---

## Phase 3: User Story 2 - Vozes premium de TTS com aviso de chave própria (Priority: P2)

**Objetivo**: Ajustar a descrição do slide "Vozes" (já existente) pra deixar
explícito que ElevenLabs/Speechify/Fish Audio exigem conectar a própria
chave de API.

**Independent Test**: Abrir o onboarding, chegar no slide "Leia com vozes" e
confirmar que a descrição cita as 3 marcas e a frase "conecte sua chave".

### Implementation

- [X] T007 [US2] Em `src/i18n/messages.ts` → `ptBRMessages`, substituir
  `'welcome.slide.voice.description'` por: `'Use as vozes do dispositivo sem
  configurar nada, ou conecte sua chave da Speechify, ElevenLabs ou Fish
  Audio para vozes premium.'`
- [X] T008 [P] [US2] Repetir em `enMessages`: `'Use device voices without
  configuring anything, or connect your own Speechify, ElevenLabs, or Fish
  Audio key for premium voices.'`
- [X] T009 [P] [US2] Repetir em `esMessages`: `'Usa las voces del dispositivo
  sin configurar nada o conecta tu propia clave de Speechify, ElevenLabs o
  Fish Audio para voces premium.'`

### Testes da Fase

- [X] T010 [US2] Em `WelcomeScreen.test.tsx`, adicionar uma asserção (pode
  ser um novo `it` pequeno, ou parte do teste existente) que renderiza
  `WelcomeScreen`, navega até o slide "Leia com vozes" e confirma via
  `screen.getByText(/conecte sua chave/i)` (ou seletor equivalente) que o
  aviso de chave própria está presente.

**Critério de Conclusão**: Nenhum texto do slide de vozes sugere
gratuidade/zero-config para as vozes premium; as 3 marcas continuam
nominalmente citadas.

**Checkpoint**: User Story 2 funcional e testável isoladamente (não depende
da US1 nem é quebrada por ela).

**Registro da Fase**:

- Status: Implementação concluída; teste da fase (T010) adiado
- Feito: Descrição do slide "Vozes" atualizada nos 3 locales com aviso explícito de chave própria (BYOK)
- Testes executados: `npx vitest run src/__tests__/screens/WelcomeScreen.test.tsx` (2 passed), incorporado na reescrita consolidada de T025 (Fase 7)
- Pendências: nenhuma

---

## Phase 4: User Story 3 - Tradução premium por provedor com aviso de chave própria (Priority: P2)

**Objetivo**: Slide novo citando OpenAI, Google e DeepL, com o mesmo aviso
de chave própria do slide de vozes.

**Independent Test**: Abrir o onboarding e confirmar que existe um slide
citando os 3 provedores com o aviso de chave própria.

### Implementation

- [X] T011 [US3] Em `src/screens/WelcomeScreen.tsx`, inserir uma nova entrada
  no array `slides` entre `voice` e `progress`:
  `{ icon: Globe, titleKey: 'welcome.slide.translationProviders.title',
  descriptionKey: 'welcome.slide.translationProviders.description', glow:
  'rgba(157,78,221,0.26)' }`.
- [X] T012 [P] [US3] Em `ptBRMessages`, adicionar (ordem alfabética, logo
  antes de `welcome.slide.voice.description`):
  `'welcome.slide.translationProviders.description': 'Conecte sua chave da
  OpenAI, Google ou DeepL e traduza capitulos com mais qualidade e
  contexto.'` e `'welcome.slide.translationProviders.title': 'Traducao
  premium'`.
- [X] T013 [P] [US3] Repetir em `enMessages`: `'Connect your OpenAI, Google,
  or DeepL key and translate chapters with more quality and context.'` /
  `'Premium translation'`.
- [X] T014 [P] [US3] Repetir em `esMessages`: `'Conecta tu clave de OpenAI,
  Google o DeepL y traduce capitulos con mas calidad y contexto.'` /
  `'Traduccion premium'`.

### Testes da Fase

- [X] T015 [US3] Em `WelcomeScreen.test.tsx`, adicionar asserção do heading
  `'Traducao premium'` na posição correta da sequência (ver Phase 7 pra
  reconciliar a ordem final) **e** confirmar, igual ao T010, que a descrição
  desse slide contém o aviso de chave própria (`screen.getByText(/conecte
  sua chave/i)` ou equivalente) — FR-009 exige o aviso nos dois slides
  (vozes e tradução), não só num deles.

**Critério de Conclusão**: Slide de tradução premium existe, cita os 3
provedores e o aviso de chave própria, com texto nos 3 locales.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Implementação concluída; teste da fase (T015) adiado
- Feito: Slide "Traducao premium" inserido entre "Vozes" e "Bibliotecas OPDS"; chaves adicionadas nos 3 locales
- Testes executados: `npx vitest run src/__tests__/screens/WelcomeScreen.test.tsx` (2 passed), incorporado na reescrita consolidada de T025 (Fase 7)
- Pendências: nenhuma

---

## Phase 5: User Story 4 - Biblioteca via catálogos OPDS (Priority: P2)

**Objetivo**: Slide novo sobre bibliotecas/catálogos externos (OPDS), sem
exigir chave de API, com linguagem simples no título.

**Independent Test**: Abrir o onboarding e confirmar que existe um slide
sobre bibliotecas externas citando Project Gutenberg, sem menção a chave de
API.

### Implementation

- [X] T016 [US4] Em `src/screens/WelcomeScreen.tsx`, inserir uma nova entrada
  no array `slides` entre `translationProviders` (T011) e `progress`:
  `{ icon: Rss, titleKey: 'welcome.slide.opds.title', descriptionKey:
  'welcome.slide.opds.description', glow: 'rgba(236,72,153,0.22)' }`.
- [X] T017 [P] [US4] Em `ptBRMessages`, adicionar (ordem alfabética, antes de
  `welcome.slide.progress.description` — `opds` vem antes de `progress`):
  `'welcome.slide.opds.description': 'Adicione catalogos como o Project
  Gutenberg ou sua propria biblioteca OPDS e baixe livros direto no app.'` e
  `'welcome.slide.opds.title': 'Conecte outras bibliotecas'`.
- [X] T018 [P] [US4] Repetir em `enMessages`: `'Add catalogs like Project
  Gutenberg or your own OPDS library and download books straight into the
  app.'` / `'Connect other libraries'`.
- [X] T019 [P] [US4] Repetir em `esMessages`: `'Agrega catalogos como Project
  Gutenberg o tu propia biblioteca OPDS y descarga libros directo en la
  app.'` / `'Conecta otras bibliotecas'`.

### Testes da Fase

- [X] T020 [US4] Em `WelcomeScreen.test.tsx`, adicionar asserção do heading
  `'Conecte outras bibliotecas'` na posição correta da sequência, e confirmar
  (via `screen.queryByText` negativo ou leitura do texto) que a descrição não
  menciona "chave"/"API key".

**Critério de Conclusão**: Slide de OPDS existe, cita Project Gutenberg,
não menciona chave de API, com texto nos 3 locales.

**Checkpoint**: User Story 4 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Implementação concluída; teste da fase (T020) adiado
- Feito: Slide "Conecte outras bibliotecas" (OPDS) inserido entre "Traducao premium" e "Progresso"; chaves adicionadas nos 3 locales, sem menção a chave de API
- Testes executados: `npx vitest run src/__tests__/screens/WelcomeScreen.test.tsx` (2 passed), incorporado na reescrita consolidada de T025 (Fase 7)
- Pendências: nenhuma

---

## Phase 6: User Story 5 - Sincronização de bookmarks e progresso na nuvem (Priority: P3)

**Objetivo**: Ajustar a descrição do slide "Leitura sem limites" (já
existente) pra citar explicitamente o Google Drive como mecanismo de sync.

**Independent Test**: Abrir o onboarding, chegar no slide "Leia sem limites"
e confirmar que a descrição cita "Google Drive".

### Implementation

- [X] T021 [US5] Em `ptBRMessages`, substituir
  `'welcome.slide.reading.description'` por: `'Faca marcacoes, anote trechos
  favoritos e retome de onde parou em qualquer dispositivo, com sync via
  Google Drive.'`
- [X] T022 [P] [US5] Repetir em `enMessages`: `'Create bookmarks, note
  favorite passages, and resume where you stopped on any device, synced via
  Google Drive.'`
- [X] T023 [P] [US5] Repetir em `esMessages`: `'Crea marcadores, anota
  fragmentos favoritos y retoma donde quedaste en cualquier dispositivo,
  sincronizado con Google Drive.'`

### Testes da Fase

- [X] T024 [US5] Em `WelcomeScreen.test.tsx`, adicionar asserção
  (`screen.getByText(/Google Drive/i)`) no slide "Leia sem limites".

**Critério de Conclusão**: Descrição do slide de leitura cita Google Drive
explicitamente, nos 3 locales, sem perder a menção original a marcações/
retomar leitura.

**Checkpoint**: User Story 5 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Implementação concluída; teste da fase (T024) adiado
- Feito: Descrição do slide "Leitura sem limites" atualizada nos 3 locales citando explicitamente o Google Drive
- Testes executados: `npx vitest run src/__tests__/screens/WelcomeScreen.test.tsx` (2 passed), incorporado na reescrita consolidada de T025 (Fase 7)
- Pendências: nenhuma

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Consolidar a sequência final de 7 slides no teste (as fases
2-6 adicionaram asserções incrementais que podem ter ficado com contagem de
cliques em "Proximo" desalinhada) e validar a feature como um todo.

- [X] T025 Reescrever o teste "avanca pelo carousel e conclui no ultimo
  slide" em `WelcomeScreen.test.tsx` do zero, verificando a sequência
  completa e final dos 7 headings na ordem: `'50.000 livros'` → `'Ouca em
  qualquer idioma'` → `'Leia sem limites'` → `'Leia com vozes'` →
  `'Traducao premium'` → `'Conecte outras bibliotecas'` → `'Acompanhe seu
  progresso'`, com "Proximo" entre cada um e "Comecar agora" concluindo no
  7º. Manter o teste "permite pular direto para o login" como está (não
  depende da quantidade de slides).
- [X] T026 Rodar `npx tsc -p tsconfig.app.json --noEmit` e confirmar zero
  erros (rede de segurança do `satisfies Record<MessageKey, string>` para as
  6 chaves novas × 3 locales).
- [X] T027 Rodar o cenário manual completo de `quickstart.md` (7 slides,
  troca de idioma pt-BR/en/es, largura de tela estreita) num browser real
  (`npm run dev`), conforme a regra de ouro do `CLAUDE.md` de testar UI antes
  de reportar concluído. Executado em 2026-09-17 no Chromium via Playwright a
  390x844: os 7 slides na ordem da spec nos 3 locales, zero chave crua
  renderizada, 0px de overflow horizontal, CTA sempre dentro da viewport,
  "Comecar agora"/"Start now"/"Comenzar ahora" concluindo e "Pular" no slide 3
  concluindo direto. Zero erro de console.
- [X] T028 Rodar `npm run lint && npm test && npm run build` (gate de PR da
  constitution) e confirmar que passam sem erros.

### Checklist de Release

- [X] Fase 2 (User Story 1 - TTS Traduzido) concluída
- [X] Fase 3 (User Story 2 - Vozes premium) concluída
- [X] Fase 4 (User Story 3 - Tradução premium) concluída
- [X] Fase 5 (User Story 4 - OPDS) concluída
- [X] Fase 6 (User Story 5 - Sync) concluída
- [X] Teste de `WelcomeScreen` reescrito e passando (T025)
- [X] `npx tsc -p tsconfig.app.json --noEmit` limpo (T026)
- [X] `quickstart.md` executado manualmente com sucesso (T027) — Chromium real via Playwright, 3 locales, 2026-09-17
- [X] `npm run lint && npm test && npm run build` passam (T028)

---

## Phase 8: Ajuste pós-feedback — logos reais dos providers

**Purpose**: Usuário revisou o resultado da Fase 2-7 e apontou 2 problemas:
(1) os slides de Vozes/Tradução premium usavam ícones genéricos do
lucide-react em vez dos logos reais das marcas citadas; (2) pediu visual
"melhor", seguindo o design system do app (não as artes promocionais em
`docs/wellcome-page/`, que são só referência de mensagem). Resolvido nesta
fase, sem tocar em FR/SC da spec (continuam citando as marcas + aviso BYOK —
mudou só a apresentação visual).

- [X] T029 Localizar assets de logo já existentes no projeto
  (`src/assets/tts-providers/{elevenlabs,speechify,fishaudio,native-tts}.svg`,
  usados hoje em `TtsMiniPlayer.tsx`) e confirmar que não existe nenhum asset
  de logo para OpenAI/Google/DeepL em lugar nenhum do app.
- [X] T030 Baixar os 3 logos de tradução faltantes dos links oficiais listados
  em `docs/wellcome-page/logos_providers.html` (Wikimedia Commons, Simple
  Icons) para `src/assets/translation-providers/{openai,google,deepl}.svg`.
  `openai.svg` e `deepl.svg` não tinham `fill` explícito (default preto,
  invisível num pill escuro) — adicionado `fill="#f8fafc"` (mesmo valor do
  token `--color-text-primary`) no `<path>` de cada um. `google.svg` (G colorido
  com gradiente) mantido sem alteração.
- [X] T031 Em `WelcomeScreen.tsx`: type dos slides ganha campo opcional
  `providers?: ProviderBadge[]` (além de `icon?` virar opcional); os slides
  de Vozes e Tradução premium trocam o `icon` lucide por `providers` (3
  marcas cada); a seção central do slide renderiza uma fileira de pills
  (`rounded-pill bg-white/[0.06] border border-white/[0.12]`, mesmo padrão
  visual do box de ícone único) com `<img>` do logo real + nome da marca,
  com `flex-wrap` pra não estourar em telas estreitas (~390px, validado via
  Playwright).
- [X] T032 Revalidar `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`,
  `npx vitest run src/__tests__/screens/WelcomeScreen.test.tsx`, `npm run
  build` — todos limpos. Validação visual real via Playwright em
  `localhost:5175` (viewport 390×844): pills de Vozes e Tradução premium
  renderizam os 6 logos corretamente, incluindo o G colorido do Google
  (pequeno mas nítido de perto).

**Critério de Conclusão**: Os 2 slides que citam 3 marcas mostram o logo real
de cada uma (não ícone genérico), a apresentação segue os tokens/padrões
visuais já existentes no app (pill escuro, mesma borda/sombra do box de
ícone), e nenhum gate (`tsc`/lint/test/build) quebrou.

**Registro da Fase**:

- Status: Concluída
- Feito: T029-T032
- Testes executados: `npx tsc --noEmit` (limpo), `npm run lint` (limpo),
  `npx vitest run WelcomeScreen.test.tsx` (2 passed), `npm run build` (ok),
  validação visual via Playwright (2 screenshots revisados)
- Pendências: nenhuma — T027 (cenário manual completo do usuário) continua
  pendente, agora já contra o visual atualizado

---

## Phase 9: Ajuste pós-feedback #2 — cards com legenda em vez de pills

**Purpose**: Usuário apontou `docs/wellcome-page/providers_traducao.png` como
referência de estilo (3 cards grandes, cada um com o logo em destaque + uma
frase curta descrevendo o diferencial daquele provider). A imagem em si não
dava pra usar direto (texto em português desenhado nos pixels, impossível de
traduzir; paleta azul fora do tema do app). Solução: reproduzir o ESTILO
(card grande, logo + nome + legenda) com texto real localizável e nas cores
do app.

- [X] T033 Adicionar 6 chaves novas `welcome.provider.<slug>.caption` (deepl,
  elevenlabs, fishaudio, google, openai, speechify) nos 3 locales de
  `messages.ts`, com uma legenda curta por provider (ex.: "Ampla cobertura de
  idiomas" pro Google, "Vozes hiper-realistas" pra ElevenLabs) — mesmo
  conceito das legendas da imagem de referência, texto original.
- [X] T034 Em `WelcomeScreen.tsx`: `ProviderBadge` ganha `captionKey:
  MessageKey`; as pills viram cards maiores (`w-[134px]`, `rounded-[20px]`,
  logo `h-9`, nome + legenda abaixo) dentro de um row horizontal scrollável
  (`overflow-x-auto` com scrollbar oculta) — mesmo idioma visual das rows de
  livros do resto do app ("Netflix for Books"), em vez de tentar espremer 3
  cards grandes numa tela de ~390px.
- [X] T035 Corrigido um bug de centralização descoberto durante a
  implementação: a 1ª tentativa usava `justify-center` + `w-max mx-auto` no
  container do scroll, o que quebra em flexbox quando o conteúdo é mais largo
  que a viewport (parte do conteúdo fica inacessível à esquerda, scrollLeft
  inicial não mostra o 1º card). Trocado por row simples alinhado à esquerda
  (mesmo padrão das rows horizontais já existentes no app), sem `justify-*`.
- [X] T036 Revalidar `tsc`/lint/test/build (todos limpos) + validação visual
  via Playwright em `localhost:5175` (390×844): cards renderizam logo+nome+
  legenda corretamente nos 2 slides, e o scroll horizontal revela o 3º card
  (DeepL/Fish Audio) sem cortar nem travar.

**Critério de Conclusão**: Os 2 slides multi-provider mostram cards no
estilo da referência do usuário (logo grande + nome + legenda), com texto
100% localizável nos 3 idiomas, nas cores/tokens do app, sem regressão nos
gates automatizados.

**Registro da Fase**:

- Status: Concluída
- Feito: T033-T036
- Testes executados: `npx tsc --noEmit` (limpo), `npm run lint` (limpo, rodou
  em background por passar de 60s), `npx vitest run WelcomeScreen.test.tsx`
  (2 passed), `npm run build` (ok), validação visual via Playwright (3
  screenshots revisados, incluindo scroll até o 3º card)
- Pendências: nenhuma — T027 (cenário manual do usuário) segue pendente,
  agora contra este visual final

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — bloqueia todas as user stories (ícones precisam existir antes de qualquer slide novo importá-los)
- **User Stories (Phase 2-6)**: dependem só do Setup. São todas edições no mesmo array `slides` e no mesmo objeto de mensagens, então rodar os 5 grupos de tasks **em sequência** (não em paralelo entre si) evita conflito de merge no mesmo arquivo — mas cada story continua conceitualmente independente (nenhuma depende do conteúdo de outra pra fazer sentido)
- **Polish (Phase 7)**: depende de todas as 5 user stories completas (precisa da ordem final dos 7 slides pra reescrever o teste consolidado)

### Parallel Opportunities

- Dentro de cada user story, as 3 tasks de locale (pt-BR/en/es) marcadas `[P]` podem ser feitas em paralelo entre si (mesma seção do arquivo, mas blocos de objeto distintos e sem dependência de conteúdo entre locales)
- As user stories em si (Phase 2-6) tocam os mesmos 2 arquivos (`WelcomeScreen.tsx`, `messages.ts`) — na prática, rodar em sequência evita conflitos, mesmo sendo independentes em conceito

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup (ícones)
2. Completar Fase 2: User Story 1 (TTS Traduzido)
3. **PARAR E VALIDAR**: abrir o onboarding e confirmar o slide de TTS Traduzido na 2ª posição — já é o diferencial mais forte sozinho

### Incremental Delivery

1. Setup → ícones prontos
2. US1 (TTS Traduzido) → validar isoladamente → já entrega o diferencial mais exclusivo
3. US2 (Vozes + BYOK) → US3 (Tradução premium) → US4 (OPDS) → US5 (Sync) → cada uma validável isoladamente, sem quebrar as anteriores
4. Polish → consolida o teste final e roda os gates de build/lint

## Notes

- `[P]` = arquivos diferentes ou blocos de objeto independentes, sem dependência de conteúdo
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada fase (ou grupo lógico coerente dentro dela)
- Parar em qualquer checkpoint pra validar a story isoladamente
- Todas as strings novas seguem a convenção ASCII sem acento já usada em
  `messages.ts` (Decisão Invariante do `plan.md`) — não "corrigir" isso pra
  português acentuado.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
