---
description: "Tasks: Reorganizar Aba Configurações do Livro em Categorias Navegáveis"
---

# Tasks: Reorganizar Aba Configurações do Livro em Categorias Navegáveis

**Input**: Documentos de design de `sdd/specs/011-book-details-settings-categorias/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories), quickstart.md

**Organization**: US1 ("menu de 4 categorias"), US2 ("entrar numa categoria,
ajustar, voltar") e US3 ("Detalhes migrado como categoria") são tratadas
numa única fase (Fase 3) porque são mecanicamente inseparáveis nesta
feature — a própria spec já define o Acceptance Scenario de US1 esperando
exatamente 4 categorias incluindo "Detalhes" (não dá pra entregar um menu de
3 categorias e chamar de US1 completa; e US3 não tem sentido sem o menu de
US1 já existir). Cada task carrega sua tag de story (`[US1]`/`[US2]`/`[US3]`)
pra rastreabilidade, mesmo com a implementação unificada.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Tela alvo: `src/screens/BookDetailsScreen.tsx` (único arquivo de produção
  modificado)
- Layout compartilhado de Settings (reaproveitado, sem mudança):
  `src/components/settings/SettingsLayout.tsx`
- UI compartilhada (reaproveitada, sem mudança): `src/components/ui/`
- Hook de back button (reaproveitado, sem mudança):
  `src/hooks/useCapacitorAppListener.ts`
- Textos: `src/i18n/messages.ts` (3 blocos: pt-BR, en, es)
- Testes: `src/__tests__/screens/BookDetailsScreen.test.tsx` (único arquivo
  de teste afetado)

---

## Phase 1: Setup

**Purpose**: Confirmar baseline limpo antes de qualquer mudança.

- [X] T001 Rodar `npm run lint && npm test && npx tsc --noEmit && npm run build` no estado atual (antes de qualquer mudança desta feature) — isola qualquer regressão futura como introduzida por esta feature, não preexistente. Nota: o working tree já tem um fix de bug não relacionado em andamento (`git diff src/screens/BookDetailsScreen.tsx`, ver `plan.md` → Cuidados para Retomada) — a baseline inclui esse diff, não é regressão desta feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura de teste e i18n que a Fase 3 vai usar.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

- [X] T002 [P] Em `src/__tests__/screens/BookDetailsScreen.test.tsx`: ampliar o mock de `@capacitor/app` pra capturar o handler do `backButton` registrado (mesmo padrão de `src/__tests__/screens/ReaderScreen.test.tsx`: um objeto `mocks.capacitorListeners.backButton` atualizado dentro de `addListener`), preservando `remove: vi.fn()` no retorno pros testes existentes; resetar `mocks.capacitorListeners.backButton = null` no `beforeEach`.
- [X] T003 [P] Em `src/i18n/messages.ts`: adicionar as 8 chaves novas nos 3 blocos de locale (pt-BR, en, es) — `bookDetails.settingsCategory.appearance.title`/`.description`, `.language.title`/`.description`, `.narration.title`/`.description`, `.details.title`/`.description`.
- [~] T004 Em `src/i18n/messages.ts`: remover a chave órfã `bookDetails.tab.details` dos 3 blocos de locale. **Reagrupada pra dentro da T014** (Fase 3) — tentei rodar isolada aqui na Fase 2 e quebrou `npx tsc --noEmit`, porque `BookDetailsScreen.tsx` ainda referencia essa chave no array `TABS` até a T014 remover `'details'` de lá; remover a chave antes do uso sumir inverte a ordem seguro. Chave i18n e uso removidos juntos, atomicamente, na T014.

**Checkpoint**: Mock de back-button pronto pra testar navegação; 8 textos novos de categoria disponíveis nos 3 locales; `npx tsc --noEmit` ainda limpo. T004 (remover a chave órfã `bookDetails.tab.details`) foi reagrupada pra dentro da T014, ver nota na task.

---

## Phase 3: User Story 1 + User Story 2 + User Story 3 - Menu de categorias com Detalhes migrado (Priority: P1) 🎯 MVP

**Objetivo**: A aba Configurações vira um menu de 4 categorias (Aparência do
Leitor, Idioma, Narração, Detalhes); cada categoria abre uma subvisão com
paridade total de comportamento; voltar de dentro de uma categoria retorna
ao menu (não sai da tela de detalhes do livro); a aba "Detalhes" antiga
desaparece da lista de abas, com seu conteúdo migrado 1:1 pra dentro do
menu.

**Independent Test**: Abrir a tela de detalhes de um livro, tocar em
"Configurações", ver o menu de 4 categorias (não a lista longa antiga nem a
aba "Detalhes" separada), entrar em cada uma das 4, ajustar/conferir o
conteúdo, voltar ao menu a cada vez (UI e botão físico do Android) sem sair
da tela de detalhes do livro.

### Testes da Fase

- [X] T005 [P] [US1] Em `BookDetailsScreen.test.tsx`: novo teste "aba Configuracoes mostra o menu de 4 categorias, nao os controles direto" — clica em "Configuracoes", confirma que os 4 rótulos de categoria (Aparência do Leitor/Idioma/Narração/Detalhes) aparecem, e que `screen.queryByText('Tema do leitor')` é `null` antes de clicar em qualquer categoria. Reforçado com o achado A-001 do Analyze (`sdd-plan`): assert do nome acessível exato (`title` + `description` concatenados) de cada uma das 4 linhas do menu, provando que nenhum badge/estado dinâmico foi anexado (FR-009) — a tentativa inicial de checar `queryByRole('searchbox')`/texto "speechify" ausentes no documento inteiro deu falso positivo (o bottom sheet de busca de voz já fica sempre montado no DOM, fechado só visualmente), então essa abordagem foi trocada pela asserção de nome acessível exato, mais precisa.
- [X] T006 [P] [US1] Em `BookDetailsScreen.test.tsx`: atualizar o teste "renderiza as abas na ordem definida para detalhes do livro" — `expectedTabs` perde `'Detalhes'`, fica com 6 itens (`['Capitulo', 'Marcacoes', 'Destaques', 'Reviews', 'Autor', 'Configuracoes']`).
- [X] T007 [US2] Em `BookDetailsScreen.test.tsx`: ajustar (sem remover asserções) os testes "salva a fonte original do livro sem forcar override de fonte", "mostra diagnostico de estilo e aplica modo confortavel" e "aguarda salvar o tema do livro antes de abrir a leitura" — cada um ganha `fireEvent.click(await screen.findByText('Aparencia do Leitor'))` logo após clicar "Configuracoes" e antes de procurar o texto do controle (ex: "Fonte do livro", "Tema do leitor").
- [X] T008 [US2] Em `BookDetailsScreen.test.tsx`: ajustar os 2 testes de banner de TTS ("mostra banner quando provider premium selecionado nao tem key", "nao mostra banner quando provider premium selecionado tem key") e a função helper `openVoiceSheet()` — cada um ganha `fireEvent.click(await screen.findByText('Narracao'))` logo após clicar "Configuracoes" e antes de procurar "Ativo"/"Voz premium aguardando API key"/o botão "Voz".
- [X] T009 [US3] Em `BookDetailsScreen.test.tsx`: ajustar os testes que hoje clicam na aba "Detalhes" direto (`fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }))`) — trocar pra `fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' }))` seguido de `fireEvent.click(await screen.findByText('Detalhes'))` (a linha de categoria dentro do menu). Nota: eram 6 ocorrências no arquivo, não 5 como a estimativa original desta task previa — todas ajustadas via `replace_all` (texto idêntico nas 6).
- [X] T010 [P] [US2] Em `BookDetailsScreen.test.tsx`: novo teste "dentro de uma categoria, tocar em voltar (UI) retorna ao menu sem chamar onBack" — entra em qualquer categoria (ex: Narração), clica no botão de voltar da subvisão, confirma que os 4 rótulos de categoria reaparecem e que o mock `onBack` não foi chamado.
- [X] T011 [P] [US2] Em `BookDetailsScreen.test.tsx`: novo teste "botao fisico de voltar do Android, dentro de uma categoria, volta ao menu sem chamar onBack" — usa `mocks.capacitorListeners.backButton` (T002) pra disparar o evento estando dentro de uma categoria; confirma que o menu reaparece e `onBack` não foi chamado.
- [X] T012 [P] [US2] Em `BookDetailsScreen.test.tsx`: novo teste "botao fisico de voltar do Android, no menu de categorias (sem subcategoria aberta), chama onBack" — mesmo mecanismo do T011, mas sem entrar em categoria antes; confirma que `onBack` foi chamado 1 vez.
- [X] T013 [P] [US2] Em `BookDetailsScreen.test.tsx`: novo teste "trocar de aba estando dentro de uma categoria e voltar pra Configuracoes mostra o menu de novo" (FR-007) — entra em "Narração", clica na aba "Capitulo", clica de volta em "Configuracoes", confirma que os 4 rótulos de categoria aparecem (não os controles de Narração direto).

### Implementation

- [X] T014 [US1][US3] Em `src/screens/BookDetailsScreen.tsx`: remover `'details'` do `type Tab` e do array `TABS`; adicionar `type BookSettingsCategory = 'appearance' | 'language' | 'narration' | 'details'`, `const SETTINGS_CATEGORY_TITLE_KEY: Record<BookSettingsCategory, MessageKey>` (mapa explícito título-por-categoria, evita cast `as MessageKey` numa chave i18n construída dinamicamente — Constitution III) e `const [settingsCategory, setSettingsCategory] = useState<BookSettingsCategory | null>(null)` junto aos demais `useState` do componente. Junto (T004 reagrupada aqui): remover a chave órfã `bookDetails.tab.details` de `src/i18n/messages.ts` nos 3 locales, no mesmo passo — uso e chave desaparecem atomicamente.
- [X] T015 [US2] Em `BookDetailsScreen.tsx`: adicionar `useEffect(() => { setSettingsCategory(null) }, [activeTab])` (reset incondicional a cada troca de aba, com comentário curto explicando por quê — FR-007) e trocar a chamada `useCapacitorBackButton(onBack)` por uma que primeiro checa `activeTab === 'settings' && settingsCategory !== null` (fecha a categoria com `setSettingsCategory(null)`) antes de cair em `onBack()` — comentário curto explicando a interceptação (FR-005/FR-006).
- [X] T016 [US1] Em `BookDetailsScreen.tsx`: importados `SettingsGroup` de `../components/settings/SettingsLayout` e os ícones `Palette`, `Info` de `lucide-react`; dentro do bloco `activeTab === 'settings'`, quando `settingsCategory === null`, renderiza `SettingsGroup` com 4 `ListItem` (ícone `Palette`/`Globe`/`Volume2`/`Info` + `t('bookDetails.settingsCategory.<categoria>.title')` como `title` + `t('...description')` como `meta` + `<ChevronRight size={18} />` como `trailing`), cada `onClick` chamando `setSettingsCategory('<categoria>')`.
- [X] T017 [US2] Em `BookDetailsScreen.tsx`: quando `settingsCategory !== null`, renderiza um cabeçalho compacto acima do conteúdo da categoria (botão com `<ArrowLeft size={16} />` + `t(SETTINGS_CATEGORY_TITLE_KEY[settingsCategory])`) cujo `onClick` chama `setSettingsCategory(null)`.
- [X] T018 [US2] Em `BookDetailsScreen.tsx`: bloco de preview + diagnóstico de estilo + tema + fonte + tamanho de fonte + altura de linha + modo de leitura envolvido em `settingsCategory === 'appearance' && (...)`, com wrapper `rounded-md p-4 bg-bg-surface border border-border flex flex-col gap-4` próprio — JSX interno de cada controle inalterado.
- [X] T019 [US2] Em `BookDetailsScreen.tsx`: bloco de idioma do livro + tradução envolvido em `settingsCategory === 'language' && (...)`, com wrapper próprio — JSX interno inalterado.
- [X] T020 [US2] Em `BookDetailsScreen.tsx`: bloco de TTS (banner de chave ausente + provedor + voz + velocidade) envolvido em `settingsCategory === 'narration' && (...)`, com wrapper próprio — JSX interno inalterado.
- [X] T021 [US3] Em `BookDetailsScreen.tsx`: conteúdo que vivia sob `activeTab === 'details'` (`BookInfoDetails`, `BookInfoDiagnosticsSection`, lista de idioma/data de adição/último acesso/tamanho do arquivo) movido pra dentro de `settingsCategory === 'details' && (...)` no bloco `activeTab === 'settings'`; bloco `activeTab === 'details'` original removido.

**Critério de Conclusão**: Aba Configurações abre no menu de 4 categorias; cada categoria mostra só seu próprio conteúdo com paridade total de comportamento (mesmas asserções de antes da feature, agora atrás de 1 clique a mais); voltar (botão da UI e botão físico do Android) de dentro de uma categoria retorna ao menu sem sair da tela de detalhes do livro; voltar no menu preserva o comportamento já existente (chama `onBack`); trocar de aba e voltar pra Configurações reseta pro menu; a aba "Detalhes" não existe mais na lista de abas, e seu conteúdo aparece 1:1 dentro da categoria "Detalhes". `npm run lint && npm test && npx tsc --noEmit && npm run build` passam sem erro. **Atingido.**

**Checkpoint**: Navegação ponta a ponta completa e funcional — MVP da feature entregue.

**Registro da Fase**:

- Status: Concluída
- Feito: `BookDetailsScreen.tsx` reescrito — aba Configurações agora abre num menu de 4 categorias (`SettingsGroup`+`ListItem`, mesmo padrão visual da feature 004) e cada categoria (Aparência do Leitor, Idioma, Narração, Detalhes) vive num bloco condicional `settingsCategory === '<categoria>'` dentro de um único `<div className="flex flex-col gap-4">`, com cabeçalho de volta próprio. `Tab`/`TABS` perderam `'details'`. Back button físico (`useCapacitorBackButton`) ganhou o branch categoria→menu; `useEffect([activeTab])` reseta a categoria ao trocar de aba. A aba "Detalhes" antiga foi removida por inteiro, conteúdo 1:1 dentro da nova categoria "Detalhes". 8 chaves i18n novas + remoção da chave órfã `bookDetails.tab.details`, nos 3 locales.
- Testes executados: `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx` (34 passed — 29 existentes ajustados + 5 novos), `npm test` completo (868 passed, 2 skipped pré-existentes), `npm run lint` (limpo), `npx tsc --noEmit` (limpo), `npm run build` (limpo, mesmo warning pré-existente de chunk size).
- Pendências: nenhuma.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Fechamento da feature — validação manual, i18n, limpeza final.

- [X] T022 Rodar o cenário ponta a ponta de `sdd/specs/011-book-details-settings-categorias/quickstart.md` (browser via `npm run dev`; botão físico de voltar validado no device Android via `npm run android:run`). Buildado, sincronizado (`npx cap sync android`) e instalado no device real RXCX103NMVZ (`BUILD SUCCESSFUL`, app lançado via `adb`). Usuário validou manualmente todos os passos do roteiro (menu de 4 categorias, entrar/ajustar/voltar em categoria, botão físico do Android fechando categoria sem sair da tela, categoria "Detalhes" com o conteúdo migrado) e confirmou: "testei, funcionou tudo certo".
- [X] T023 Revisão de i18n: as 8 chaves novas existem nos 3 locales e `bookDetails.tab.details` foi removida de todos — garantido mecanicamente por `MessageKey = keyof typeof ptBRMessages` + `satisfies Record<MessageKey, string>` em `src/i18n/messages.ts`; `npx tsc --noEmit` limpo confirma paridade nos 3 locales (verificado T014/Fase 3 e novamente na checagem final desta fase).
- [X] T024 Limpeza final: nenhum import/ícone/estado sem uso restante em `BookDetailsScreen.tsx` — confirmado por `noUnusedLocals`/`noUnusedParameters` (`tsconfig.app.json`), que fariam `tsc` falhar; passou limpo.
- [X] T025 Checagem final: `npm run lint && npm test && npx tsc --noEmit && npm run build` — todos limpos (868 passed, 2 skipped pré-existentes).

### Checklist de Release

- [X] Fase 3 (US1+US2+US3) concluída — menu + 4 categorias + navegação completa
- [X] `quickstart.md` executado com sucesso (browser + device Android) — validado pelo usuário no device real (T022)
- [X] i18n completo nos 3 locales (pt-BR, en, es), sem chave órfã
- [X] `npm run lint && npm test && npx tsc --noEmit && npm run build` limpos
- [X] Nenhuma dependência nova adicionada a `package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA a Fase 3
- **Fase 3 (US1+US2+US3)**: depende do Foundational — é o MVP e entrega a feature inteira (as 3 stories são mecanicamente inseparáveis aqui)
- **Polish (Fase 4)**: depende da Fase 3 completa

### Parallel Opportunities

- T002, T003, T004 (Fase 2) podem rodar em paralelo — arquivos/seções diferentes.
- T005, T006 (testes de menu) podem rodar em paralelo com T010-T013 (testes de navegação) — todos no mesmo arquivo mas blocos de teste independentes; T007, T008, T009 são ajustes pontuais em testes já existentes, também independentes entre si.
- T014-T021 (implementação) são majoritariamente sequenciais — todas editam a mesma região de `BookDetailsScreen.tsx` (T014 antes de T015 antes de T016-T021, já que dependem do estado/tipo criado antes).

---

## Parallel Example: Fase 2 (Foundational)

```bash
Task: "T002 [P] Ampliar mock de @capacitor/app em BookDetailsScreen.test.tsx"
Task: "T003 [P] Adicionar 8 chaves i18n novas em messages.ts"
Task: "T004 [P] Remover chave orfa bookDetails.tab.details em messages.ts"
```

---

## Implementation Strategy

### MVP First (Fase 3 apenas)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (bloqueia a Fase 3)
3. Completar Fase 3: US1+US2+US3 — menu + 4 categorias + navegação completa + Detalhes migrado
4. **PARAR E VALIDAR**: rodar `quickstart.md` manualmente, confirmar navegação ponta a ponta (browser + device Android)

### Incremental Delivery

1. Setup + Foundational → infraestrutura de teste/i18n pronta
2. Fase 3 → feature inteira funcional e navegável → considerar entrega
3. Fase 4 → validação manual final + release

## Notes

- `[P]` = arquivos diferentes (ou blocos independentes do mesmo arquivo de teste), sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar no checkpoint da Fase 3 pra validar a feature isoladamente antes do Polish
- R-001/R-002 (`plan.md`): nunca apagar um teste existente sem o equivalente ajustado passando no lugar — a ordem das tasks acima (T005-T013 antes/junto da implementação T014-T021) já reflete isso.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
