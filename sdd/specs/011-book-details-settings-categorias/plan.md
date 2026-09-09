# Implementation Plan: Reorganizar Aba Configurações do Livro em Categorias Navegáveis

**Slug**: `011-book-details-settings-categorias` | **Date**: 2026-09-09 | **Spec**: `sdd/specs/011-book-details-settings-categorias/spec.md`

## Summary

Hoje `src/screens/BookDetailsScreen.tsx` (~2000 linhas) renderiza, na aba
"Configurações", um bloco único e rolável com preview, diagnóstico de
estilos, tema, fonte, tamanho, altura de linha, modo de leitura, idioma do
livro, tradução e toda a seção de TTS — e mantém "Detalhes" (sinopse,
diagnósticos de metadados, idioma detectado, datas, tamanho do arquivo) como
uma aba própria e separada. A feature decompõe a aba Configurações num menu
curto de 4 categorias (mesmo padrão visual do menu global de Settings da
feature `004-settings-categorias`: `ListItem` com ícone + nome + descrição
dentro de `SettingsGroup`), cada categoria reaproveitando 1:1 o JSX/lógica já
existente — só reagrupado — e absorve o conteúdo da antiga aba "Detalhes"
como a 4ª categoria. Diferente da 004, aqui a navegação por categoria é
inteiramente **local** ao componente (não usa a pilha de rotas de
`App.tsx`), porque a aba Configurações já vive dentro de `BookDetailsScreen`
como estado React (`activeTab`), não como uma rota própria. Nenhuma
dependência nova, nenhuma mudança de schema, nenhuma mudança de comportamento
de configuração individual.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 via Vite 8 — sem mudança.

**Primary Dependencies**: Nenhuma nova. Reaproveita `lucide-react` (2 ícones
adicionais — `Palette`, `Info` — já parte do pacote instalado, mesmo usado
para os demais ícones do arquivo), `@capacitor/app` via
`useCapacitorBackButton` (já usado no componente, `src/hooks/useCapacitorAppListener.ts`),
Dexie via `getBookSettings`/`updateBookSettings` (`src/db/bookSettings.ts`) e
`getStoredBookInfo`/`patchBookInfo` (`src/db/bookInfo.ts`).

**Storage**: Sem alteração de schema — `BookSettings`, `AppSettings` e
`StoredBookInfo` continuam com o mesmo formato (ver spec `## Key Entities`).

**Testing**: Vitest + Testing Library. `src/__tests__/screens/BookDetailsScreen.test.tsx`
já existe (44 testes) e mocka `@capacitor/app` de forma simplificada
(`addListener: vi.fn(async () => ({ remove: vi.fn() }))`, sem capturar o
handler) — precisa ser ampliado pro padrão já usado em
`src/__tests__/screens/ReaderScreen.test.tsx` (captura o handler registrado
em `mocks.capacitorListeners.backButton` pra poder disparar
`await act(async () => { mocks.capacitorListeners.backButton?.() })` nos
testes novos de botão físico).

**Target Platform**: Android (Capacitor) + Web, mesma superfície de código —
sem divergência de comportamento entre as duas (FR-012).

**Performance Goals**: N/A — reorganização de navegação/UI dentro de uma
aba já montada, sem novo processamento pesado nem novo fetch.

**Constraints**: Reaproveitar exatamente os primitivos já existentes de
`src/components/settings/SettingsLayout.tsx` (`SettingsGroup`) e
`src/components/ui` (`ListItem`) pro menu de categorias — sem introduzir
router externo nem uma segunda pilha de navegação paralela ao `activeTab`
que já existe.

**Scale/Scope**: 1 aba com conteúdo único → 1 menu de 4 categorias + 4
subvisões, todas dentro do mesmo arquivo/componente (`BookDetailsScreen.tsx`).
A aba "Detalhes" desaparece da lista de abas (`TABS`: 7 → 6 itens).

## Decisões Invariantes

- **Navegação 100% local, sem nova rota em `App.tsx`**: a categoria
  selecionada dentro da aba Configurações é só mais um `useState` local de
  `BookDetailsScreen` (`settingsCategory: BookSettingsCategory | null`) —
  nunca um novo membro do `type Route`/`switch (current.name)` de `App.tsx`.
  A aba Configurações já é 100% local ao componente hoje (`activeTab`), e
  a categoria é só um nível a mais dentro dela. Isso difere
  deliberadamente do padrão da feature 004 (lá cada categoria é uma tela
  cheia empilhada em `App.tsx`), porque lá o "Settings" raiz já era uma
  rota própria — aqui não é.
- **Conteúdo de cada categoria fica inline em `BookDetailsScreen.tsx`, sem
  novos arquivos**: os 4 blocos (Aparência, Idioma, Narração, Detalhes)
  continuam declarados dentro do JSX do componente principal (só
  reagrupados sob `settingsCategory === '<categoria>' && (...)`), em vez de
  extraídos para componentes/arquivos novos. Motivo: cada bloco depende de
  ~10-15 pedaços de estado/handlers já locais ao componente (`bookSettingsRow`,
  `applyBookSettingsPatch`, os 5 setters de bottom sheet, a lógica de preview
  de voz, `bookInfo`/`bookInfoDiagnostics`) — extrair viraria prop-drilling
  puro sem ganho de reuso (nenhum desses blocos é usado em outro lugar),
  violando Constitution III (explícito antes de mágico, sem abstração sem
  necessidade real). Consistente com os helpers privados que já vivem neste
  mesmo arquivo hoje (`Section`, `TtsControlRow`, `BookInfoDiagnosticsSection`,
  `BookReviewsTab`).
- **Menu de categorias reaproveita `SettingsGroup` (de
  `src/components/settings/SettingsLayout.tsx`) + `ListItem` (de
  `src/components/ui`)** — nenhum componente visual novo. `ChevronRight`,
  `Globe`, `Volume2` já estão importados no arquivo; só `Palette` e `Info`
  entram como imports novos de `lucide-react`.
- **Um único `useCapacitorBackButton`, já existente, ganha um branch
  condicional** — em vez de registrar um segundo listener. A checagem
  `activeTab === 'settings' && settingsCategory !== null` decide entre
  `setSettingsCategory(null)` (fecha a categoria, fica na aba Configurações)
  e `onBack()` (comportamento inalterado em qualquer outro estado —
  implementa FR-005/FR-006 sem tocar no significado de "voltar" fora da
  aba Configurações).
- **Reset de `settingsCategory` via `useEffect([activeTab])`, incondicional**:
  toda troca de aba (não só saindo de "settings") chama
  `setSettingsCategory(null)`. Mais simples que checar direção da troca, e
  idempotente quando já é `null` (React não re-renderiza por
  `Object.is` igual) — implementa FR-007.
- **Bottom sheets (idioma do livro, tradução, provedor TTS, voz, velocidade)
  continuam declarados fora do bloco condicional de categoria, no final do
  componente, exatamente como hoje** — eles não precisam saber em qual
  categoria o usuário está; abrir um bottom sheet a partir de dentro de
  "Narração", por exemplo, não muda `settingsCategory`. Nenhuma mudança
  nesses blocos além de mover o botão/`ListItem` que os abre pra dentro do
  novo agrupamento visual da categoria correspondente.
- **Chaves i18n novas usam o namespace `bookDetails.settingsCategory.<categoria>.title`/`.description`**
  (não reaproveitam `settings.appearance.sectionLabel` etc. do Settings
  global) — as descrições ali falam de "padrão do app quando abre um livro
  novo", aqui é sobre este livro específico; textos diferentes merecem
  chaves diferentes. A chave `bookDetails.tab.details` (label da aba antiga)
  fica órfã e é removida dos 3 locales.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | OK | OK | Spec (`sdd-specify`, com 5 rodadas de clarificação) + este plano são a proposta revisável antes de qualquer código. |
| II. Comentários só onde o "porquê" não é óbvio | OK | OK | Comentários previstos só nos 2 pontos não óbvios: o branch do back-button (por que intercepta antes de chamar `onBack`) e o reset incondicional de `settingsCategory` no `useEffect` (por que roda em toda troca de aba, não só saindo de Configurações). |
| III. Explícito antes de mágico | Risco avaliado | OK | Ver Decisão Invariante 2 (inline em vez de extrair arquivos) — decisão explícita contra prop-drilling especulativo. Nenhuma abstração nova introduzida. |
| IV. Build limpo é a definição de "pronto" | OK | OK | `npm run build` ao final de cada fase, como sempre. |
| V. Dependências novas exigem justificativa | OK | OK | Nenhuma dependência nova; só 2 ícones adicionais de um pacote já instalado. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/011-book-details-settings-categorias/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── quickstart.md          # Fase 1 — passos de verificação manual
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

(Sem `research.md` — nenhuma incerteza técnica genuína, o padrão a seguir já
existe no repositório, tanto na feature 004 quanto no próprio arquivo. Sem
`data-model.md`/`contracts/` — nenhuma entidade ou superfície de API nova.)

### Source Code (repository root)

```text
src/
├── screens/
│   └── BookDetailsScreen.tsx            # MODIFICADO — menu de categorias + 4 subvisões locais + Tab sem 'details'
├── components/
│   ├── settings/
│   │   └── SettingsLayout.tsx           # Reaproveitado sem mudança (SettingsGroup)
│   └── ui/                              # Reaproveitado sem mudança (ListItem, BottomSheet, Badge, Button, EmptyState, Spinner)
├── hooks/
│   └── useCapacitorAppListener.ts       # Reaproveitado sem mudança (useCapacitorBackButton)
├── i18n/
│   └── messages.ts                      # MODIFICADO — +8 chaves novas (4 categorias × title/description) × 3 locales; remove bookDetails.tab.details órfã
└── __tests__/
    └── screens/
        └── BookDetailsScreen.test.tsx   # MODIFICADO — mock de @capacitor/app captura o handler; testes existentes ganham 1 clique de categoria a mais; testes novos de menu/navegação/back button
```

**Structure Decision**: Projeto único (React + Capacitor), sem separação
backend/frontend — segue a convenção já estabelecida em `src/`. Nenhuma
pasta nova. Toda a mudança de código de produção fica contida em 2 arquivos
já existentes (`BookDetailsScreen.tsx`, `messages.ts`); o único arquivo de
teste afetado é o já existente de `BookDetailsScreen`.

## Complexity Tracking

> Nenhuma violação não justificada do Constitution Check — tabela vazia.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário/componente (Vitest + Testing Library, mesmo arquivo já
existente) → manual no browser/device (`quickstart.md`). Sem testes E2E
neste projeto (não há Playwright/Cypress configurado) e sem superfície de
API nova (sem teste de contrato).

Todos os testes hoje existentes que dependem de clicar "Configuracoes" e
achar texto direto (ex: `fireEvent.click(screen.getByRole('button', { name: 'Configuracoes' })); await screen.findByText('Fonte do livro')`)
precisam de 1 clique de categoria a mais no meio (ex: clicar em "Aparência
do Leitor" antes de procurar "Fonte do livro"). Os testes que hoje clicam na
aba "Detalhes" direto (`getByRole('button', { name: 'Detalhes' })`) trocam
para: clicar "Configuracoes", depois clicar na categoria "Detalhes". Nenhum
teste deve ser removido sem o equivalente atualizado passando — só ajustado
no lugar (não há migração pra arquivo novo aqui, diferente da 004).

Comandos-base:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

Arquivo único: `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx`

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluído — baseline confirmado (863 testes, tsc/lint/build limpos). |
| Foundational (Fase 2) | Concluído — mock de `@capacitor/app` em `BookDetailsScreen.test.tsx` ampliado pra capturar o handler do `backButton`; 8 chaves i18n novas de categoria nos 3 locales. T004 (remover chave órfã `bookDetails.tab.details`) reagrupada pra dentro da T014 (Fase 3) — ver R-004. |
| Fase 3 (US1+US2+US3) | Concluído — menu de 4 categorias + navegação local (back-button + reset por troca de aba) + Detalhes migrado. MVP entregue. |
| Polish (Fase 4) | Concluído — validado manualmente no device real (RXCX103NMVZ) pelo usuário; checagem final (lint/test/tsc/build) limpa. Feature Implementada. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `src/__tests__/screens/BookDetailsScreen.test.tsx` tem 44 testes hoje; a maioria dos que tocam a aba Configurações/Detalhes vai quebrar assim que o clique direto em texto parar de funcionar (o texto passa a estar 1 nível mais fundo, atrás de uma categoria). Risco de regressão silenciosa de cobertura se algum teste for só apagado em vez de ajustado. | Alto — perda de cobertura não pega pelo CI se um teste for removido sem reposição. | Resolvido: confirmado pela auditoria do `sdd-converge` — nenhum teste foi apagado, todos os afetados (T007/T008/T009) ganharam exatamente 1 `fireEvent.click` de categoria a mais no lugar; suíte final com 868 passed (era 863 antes da feature, +5 testes novos). |
| R-002 | O mock de `@capacitor/app` em `BookDetailsScreen.test.tsx` hoje descarta o handler do `backButton` (`addListener: vi.fn(async () => ({ remove: vi.fn() }))`), então não existe forma de testar FR-005/FR-006/edge case do botão físico sem alterar o mock. | Médio — sem isso, o comportamento central de navegação da feature (voltar da categoria pro menu) fica sem cobertura automatizada, só validação manual. | Resolvido (Fase 2/T002): mock ampliado pro mesmo padrão já usado em `src/__tests__/screens/ReaderScreen.test.tsx` (`mocks.capacitorListeners.backButton`), 29 testes existentes continuam passando sem alteração de comportamento. |
| R-003 | Pré-existente, não introduzido por esta feature: `BottomSheet` (`src/components/ui`) não intercepta o botão físico de voltar do Android — hoje, se um bottom sheet está aberto (ex: seletor de voz) e o usuário aperta voltar, o único `useCapacitorBackButton` do componente dispara `onBack()` e sai da tela de detalhes do livro inteira, sem fechar o sheet primeiro. | Baixo pra esta feature — comportamento inalterado, só documentado. | Fora de escopo: nenhuma mudança nesta feature toca esse comportamento (o branch novo só decide entre `setSettingsCategory(null)` e `onBack()`, nunca fecha sheets). Se quiser corrigir, é feature própria — não misturar aqui. |
| R-004 | Durante a Fase 2 (T004), remover a chave i18n órfã `bookDetails.tab.details` isoladamente quebrou `npx tsc --noEmit`, porque `BookDetailsScreen.tsx` ainda referencia essa chave no array `TABS` até `'details'` ser removido de lá (T014, Fase 3) — descoberto rodando a checagem de tipos logo após a T004. | Baixo — bloqueava só a própria task, sem efeito em produção (nada foi commitado quebrado). | Resolvido: chave i18n revertida na Fase 2; T004 reagrupada pra dentro da T014 (Fase 3), onde uso e chave desaparecem no mesmo passo. `tasks.md` atualizado com a nota. |
| R-005 | O teste novo de menu (T005) tentou provar FR-009/FR-010 (sem badge dinâmico, sem busca) checando `queryByRole('searchbox')`/texto "speechify" ausentes no `document` inteiro — deu falso positivo porque o input de busca de voz (bottom sheet de seleção de voz TTS) já fica sempre montado no DOM, só oculto visualmente quando fechado (não é código novo desta feature, comportamento pré-existente do `BottomSheet`). | Baixo — só afetava a confiabilidade do teste novo, não o comportamento real do app. | Resolvido: assert trocado para o nome acessível exato (`title` + `description` concatenados) de cada uma das 4 linhas do menu — prova que nada extra (badge, texto de estado) foi anexado a elas especificamente, sem depender de nenhum elemento fora do menu. |
| R-006 | `BookDetailsScreen.test.tsx` tinha 6 ocorrências do clique direto na aba "Detalhes" (`getByRole('button', { name: 'Detalhes' })`), não 5 como a T009 original estimava. | Nenhum — só a contagem da task estava desatualizada. | Resolvido: as 6 ocorrências ajustadas via um único `replace_all` (texto idêntico nas 6). `tasks.md` (T009) atualizado com a contagem real. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-09 | Setup | Baseline confirmado: `npm run lint` limpo, `npm test` (863 passed, 2 skipped pré-existentes), `npx tsc --noEmit` limpo, `npm run build` limpo (mesmo warning pré-existente de chunk size). | Nenhuma. |
| 2026-09-09 | Foundational | Mock de `@capacitor/app` em `BookDetailsScreen.test.tsx` ampliado (`mocks.capacitorListeners.backButton` captura o handler registrado), reset em ambos os `beforeEach`. 8 chaves i18n novas (`bookDetails.settingsCategory.*`) adicionadas nos 3 locales. T004 (remover chave órfã `bookDetails.tab.details`) tentada isolada, quebrou `tsc` (R-004), revertida e reagrupada pra dentro da T014. `npx tsc --noEmit` limpo; `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx` — 29 passed, sem regressão do mock ampliado. | Nenhuma — pronto pra Fase 3. |
| 2026-09-09 | Fase 3 (US1+US2+US3) | `BookDetailsScreen.tsx`: `Tab`/`TABS` sem `'details'`; `BookSettingsCategory` + `SETTINGS_CATEGORY_TITLE_KEY` + `settingsCategory` (state) novos; `useEffect([activeTab])` reseta a categoria; `useCapacitorBackButton` com o branch categoria→menu. Aba Configurações: menu (`SettingsGroup`+4 `ListItem`) quando `settingsCategory === null`, senão cabeçalho de volta + 1 dos 4 blocos de categoria (Aparência/Idioma/Narração/Detalhes, JSX interno preservado 1:1). Bloco `activeTab === 'details'` antigo removido, conteúdo movido pra categoria "Detalhes". Chave órfã `bookDetails.tab.details` removida dos 3 locales (T004+T014 juntas). Testes: 6 ajustes de testes existentes (T007/T008/T009) + 5 testes novos (T005, T010-T013) — 2 achados ad-hoc registrados (R-005: assert de badge/busca reformulado; R-006: T009 tinha 6 ocorrências, não 5). | Nenhuma — MVP completo. |
| 2026-09-09 | Fase 4 (Polish) | `npm run android:run` — build de produção + `cap sync android` + instalação no device real conectado (RXCX103NMVZ), `BUILD SUCCESSFUL`, app lançado via `adb`. Usuário validou manualmente o roteiro completo de `quickstart.md` (menu de 4 categorias, entrar/ajustar/voltar em cada uma, botão físico do Android fechando categoria sem sair da tela de detalhes do livro, categoria "Detalhes" com conteúdo migrado) e confirmou: "testei, funcionou tudo certo". T023/T024 (i18n/limpeza) confirmadas mecanicamente via `tsc --noEmit` limpo. Checagem final: `npm run lint` (limpo), `npx tsc --noEmit` (limpo), `npm run build` (limpo), `npm test` (868 passed, 2 skipped pré-existentes). | Nenhuma — feature completa. |

**PRÓXIMO**: Rodar `sdd-converge` quando o usuário quiser auditar a implementação final contra spec/plan/tasks e sincronizar a documentação (README etc., se aplicável).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/screens/BookDetailsScreen.tsx` — aba Configurações reescrita como menu de 4 categorias + navegação local (`settingsCategory`), back-button e reset por troca de aba
- `src/__tests__/screens/BookDetailsScreen.test.tsx` — mock de `@capacitor/app` ampliado + 6 testes ajustados + 5 testes novos de menu/navegação
- `src/i18n/messages.ts` — 8 chaves novas de `bookDetails.settingsCategory.*` nos 3 locales; `bookDetails.tab.details` removida (órfã)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Há uma mudança pré-existente e não relacionada já em andamento no working
  tree (`git diff src/screens/BookDetailsScreen.tsx` antes desta feature
  começar): um fix do bug `bookmark-nao-sincroniza-ao-clicar-no`
  (`sdd/bugs/bookmark-nao-sincroniza-ao-clicar-no/`) que adiciona
  `getCachedBookmarkDriveSyncStatus`/`refreshDriveToken` em
  `handleSyncBookmarksTap`. Já está no arquivo lido/explorado por este plano
  (faz parte da baseline) — não reverter nem duplicar; só continuar
  construindo em cima dela.

## Resultado Final

<!-- Anexado pelo sdd-converge ao fechar a feature sem achados. -->

Convergência rodada em 2026-09-09, sem achados (nenhuma lacuna
`missing`/`partial`/`contradicts`/`unrequested`). Todos os `FR-001` a
`FR-012` e `SC-001` a `SC-005` da spec, e as 6 Decisões Invariantes deste
plano, foram confirmados diretamente no código real:
`src/screens/BookDetailsScreen.tsx` (`Tab`/`TABS` sem `'details'` nas linhas
76-85; `BookSettingsCategory`/`SETTINGS_CATEGORY_TITLE_KEY`/`settingsCategory`
nas linhas 87-96 e 116; `useEffect([activeTab])` + branch do
`useCapacitorBackButton` nas linhas 278-294; menu de 4 categorias + os 4
blocos condicionais nas linhas 831-1160) e `src/i18n/messages.ts` (8 chaves
`bookDetails.settingsCategory.*` × 3 locales, chave órfã `bookDetails.tab.details`
ausente nos 3). Verificação final: `npm run lint`, `npx tsc --noEmit`,
`npm test` (868 passed, 2 skipped pré-existentes) e `npm run build` — todos
limpos. `git status` confirma que os únicos arquivos de produção/teste
tocados são exatamente os 3 previstos no plano (`BookDetailsScreen.tsx`,
`BookDetailsScreen.test.tsx`, `messages.ts`) e que nenhuma dependência nova
entrou em `package.json`. Validação manual ponta a ponta feita pelo usuário
no device real (RXCX103NMVZ) via `npm run android:run`, cobrindo o roteiro
completo de `quickstart.md` incluindo o botão físico de voltar do Android —
confirmado sem ressalvas ("testei, funcionou tudo certo").

**O que foi de fato construído**: a aba "Configurações" da tela de detalhes
do livro (`BookDetailsScreen.tsx`) virou um menu de **4 categorias**
(Aparência do Leitor, Idioma, Narração, Detalhes), cada uma abrindo uma
subvisão local (sem nova rota em `App.tsx` — diferente do padrão da feature
`004-settings-categorias`, aqui a navegação é só mais um nível de estado
React dentro do componente que já existia). A aba "Detalhes" antiga foi
removida por inteiro da lista de abas, seu conteúdo migrado 1:1 pra dentro da
nova categoria "Detalhes". O botão físico/gesto de voltar do Android fecha a
categoria (volta pro menu) em vez de sair da tela quando dentro de uma
categoria; trocar de aba sempre reseta a navegação interna pro menu.

**Nenhum desvio acumulado em relação ao plano original** — diferente da
feature 004 (que teve 2 rodadas de ajuste pós-MVP pedidas pelo usuário
durante o teste manual), aqui o roteiro de `quickstart.md` foi validado sem
pedido de mudança. Os 3 achados ad-hoc registrados durante a execução
(R-004, R-005, R-006) foram todos correções internas de sequenciamento/teste
descobertas pelo próprio assistente — não mudanças de escopo ou conteúdo
pedidas pelo usuário.

**Documentação**: `README.md` → seção "Detalhes do livro" estava
desatualizada (listava "Detalhes" como aba própria e as configurações do
livro como uma lista plana) — atualizada cirurgicamente: a linha de Tabs
perdeu "Detalhes", e o bloco de configurações por livro passou a refletir o
menu de 4 categorias (Aparência do Leitor, Idioma, Narração, Detalhes),
citando explicitamente que o conteúdo de Detalhes migrou pra dentro de
Configurações. Nenhuma outra seção do README precisou de mudança (as demais
menções a "Detalhes"/"Configurações" no arquivo se referem à tela de
detalhes do livro como um todo ou às configurações globais do app, não à
antiga aba — fora do escopo desta feature).
