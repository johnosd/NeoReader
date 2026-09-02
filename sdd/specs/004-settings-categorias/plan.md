# Implementation Plan: Reorganizar Tela de Settings em Categorias Navegáveis

**Slug**: `004-settings-categorias` | **Date**: 2026-09-02 | **Spec**: `sdd/specs/004-settings-categorias/spec.md`

## Summary

Hoje `src/screens/SettingsScreen.tsx` é um único arquivo de ~1170 linhas que
renderiza 11 seções completas (com todos os controles expostos) numa lista
vertical só. A feature decompõe isso num menu curto de categorias (mesmo
padrão visual que "Catálogos OPDS" já usa hoje) mais 6 subtelas novas — cada
uma reaproveitando 1:1 a lógica/UI que já existe, só movida de arquivo. 3
itens sem nada pra configurar (Plano Pro, Cotas de Uso, Build/Sobre) ficam
como linha direta no próprio menu, sem subtela. Nenhuma dependência nova,
nenhuma mudança de schema, nenhuma mudança de comportamento de configuração
individual — é reorganização de navegação/agrupamento.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 via Vite 8 — sem mudança.

**Primary Dependencies**: Nenhuma nova. Reaproveita `lucide-react` (ícones já
importados em `SettingsScreen.tsx`), `@capacitor/app` (`useCapacitorBackButton`,
já usado por `OpdsCatalogSettingsScreen.tsx`), Dexie via `src/db/settings.ts`.

**Storage**: Dexie/IndexedDB via `getSettings`/`updateAppSettings`/
`updateReaderDefaults` (`src/db/settings.ts`) — sem alteração de schema, sem
nova `version()` (nenhuma entidade nova, ver spec `## Key Entities`).

**Testing**: Vitest + Testing Library, mesmo padrão de
`src/__tests__/screens/OpdsCatalogSettingsScreen.test.tsx` e do
`SettingsScreen.test.tsx` atual (15 testes hoje, cobrindo várias seções
misturadas — serão decompostos por subtela).

**Target Platform**: Android (Capacitor) + Web, mesma superfície de código —
sem divergência de comportamento entre as duas (FR-012).

**Performance Goals**: N/A — reorganização de navegação/UI, sem novo
processamento pesado.

**Constraints**: Reaproveitar exatamente o padrão de pilha de rotas já usado
em `App.tsx` (`useState<Route[]>`, push/pop) e o padrão estrutural de
`OpdsCatalogSettingsScreen.tsx` (header com `ArrowLeft` + título/subtítulo,
`useCapacitorBackButton(onBack)`) — sem introduzir router externo nem estado
de navegação paralelo.

**Scale/Scope**: 1 tela monolítica → 1 menu (`SettingsScreen.tsx` reescrito)
+ 6 subtelas novas (Idioma, Aparência do Leitor, Word Lens, Narração,
Integrações/Chaves de API, Sincronização na Nuvem) + Catálogos OPDS (já
existe, sem mudança) + 3 itens diretos no menu (Plano Pro, Cotas de Uso,
Build/Sobre).

## Decisões Invariantes

- Reaproveitar o padrão de pilha de rotas já existente (`App.tsx`,
  `useState<Route[]>` push/pop) pras novas subtelas — sem router externo, sem
  estado de navegação paralelo. `useCapacitorBackButton(onBack)` em cada
  subtela já resolve FR-006/FR-007 de graça, porque `onBack` é sempre `pop()`
  do mesmo stack (mesmo mecanismo que já faz "Catálogos OPDS" voltar pro menu
  em vez de fechar o Settings).
- Cada subtela de categoria é um arquivo próprio em `src/screens/`, seguindo
  exatamente o padrão estrutural de `OpdsCatalogSettingsScreen.tsx` (header
  com `ArrowLeft` + título/subtítulo vindo de `sectionLabel`/
  `sectionDescription`, `useCapacitorBackButton`).
- Extrair pra um módulo compartilhado (`src/components/settings/SettingsLayout.tsx`)
  só o que é genuinamente usado por múltiplas subtelas: `SettingsSection`,
  `SettingsGroup`, `SettingBlock`, `InfoRow`. Helpers de uso único (ex:
  `ApiKeyField`, `ValidationBadge`, `IntegrationStatus`, `getDataSyncMeta`)
  migram inteiros pro arquivo da subtela que os usa — sem criar camada extra
  pra algo com um único consumidor (Constitution III).
- Criar `src/hooks/useUserSettings.ts` encapsulando o trio
  `getSettings`/`updateAppSettings`/`updateReaderDefaults` + estado de
  loading — evita duplicar essa mesma dança de `useState`/`useEffect`/spinner
  em 6+ arquivos novos. É extração por duplicação real observada, não
  abstração especulativa.
- Nenhuma configuração individual muda de comportamento, texto (exceto as
  novas labels/descrições de categoria) ou lógica de persistência/validação —
  é reorganização de navegação, não reescrita de feature (FR-008 da spec).
- Categoria "Idioma" reaproveita a label já existente
  `settings.appLanguage.sectionLabel` ("Idioma"/"Language"/"Idioma") como
  título da categoria consolidada — sem criar uma chave nova só pro label.
  Adiciona exatamente 1 chave nova por idioma
  (`settings.language.sectionDescription`) pra descrever os dois controles
  juntos (idioma do app + idioma padrão de tradução). Os controles internos
  (`settings.appLanguage.title`, `settings.translation.defaultLanguage`, os
  dois bottom sheets) continuam exatamente como estão.
- Rotas novas em `App.tsx` (`settings-language`, `settings-appearance`,
  `settings-word-lens`, `settings-narration`, `settings-integrations`,
  `settings-sync`) e seu `case` correspondente no switch de renderização são
  adicionados na MESMA task que cria a subtela correspondente — nunca com o
  tipo declarado e o case ausente (evita rota "morta" caindo no `default`
  silenciosamente).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | OK | OK | Este plano é a proposta de arquivos afetados; segue pro `sdd-execute` só depois de revisado. |
| II. Comentários só onde o "porquê" não é óbvio | OK | OK | Nenhum comentário novo previsto além de decisões não óbvias (ex: por que o back-button funciona sem lógica extra — já documentado acima). |
| III. Explícito antes de mágico | Risco avaliado | OK | Único ponto de atenção: `useUserSettings` poderia virar abstração especulativa. Justificado — resolve duplicação real observada em 6+ arquivos novos, fica fino (só wrap de loading+save, sem generalização extra). Ver Complexity Tracking. |
| IV. Build limpo é a definição de "pronto" | OK | OK | `npm run build` ao final de cada fase, como sempre. |
| V. Dependências novas exigem justificativa | OK | OK | Nenhuma dependência nova nesta feature. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/004-settings-categorias/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── quickstart.md          # Fase 1 — passos de verificação manual
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

(Sem `research.md` — nenhuma incerteza técnica genuína, o padrão a seguir já
existe no repositório. Sem `data-model.md`/`contracts/` — nenhuma entidade ou
superfície de API nova.)

### Source Code (repository root)

```text
src/
├── App.tsx                              # MODIFICADO: novos Route + push handlers + cases do switch
├── components/
│   ├── ui/                              # Reaproveitado sem mudança (ListItem, Badge, BottomSheet, Switch, Input, Spinner)
│   └── settings/                        # NOVO
│       ├── SettingsLayout.tsx           # SettingsSection, SettingsGroup, SettingBlock, InfoRow (extraídos)
│       ├── ApiKeyField.tsx              # NOVO (pós-MVP) — componentes de campo de chave, compartilhados por Narração e Integrações
│       └── apiKeyValidation.ts          # NOVO (pós-MVP) — tipos/funções puras de validação (sem componente, por causa do Fast Refresh)
├── hooks/
│   └── useUserSettings.ts               # NOVO — getSettings/updateAppSettings/updateReaderDefaults + loading
├── screens/
│   ├── SettingsScreen.tsx               # REESCRITO — menu de 8 categorias uniformes (Plano incluído), nenhum item direto/expandido
│   ├── SettingsPlanScreen.tsx           # NOVO (pós-MVP) — NeoReader Pro + as 2 cotas de uso mensal
│   ├── SettingsLanguageScreen.tsx       # NOVO — Idioma do app + Idioma padrão de tradução
│   ├── SettingsAppearanceScreen.tsx     # NOVO — tema/fonte/tamanho/espaçamento/modo do leitor
│   ├── SettingsWordLensScreen.tsx       # NOVO — enabled/level/legenda/fontes do Word Lens
│   ├── SettingsNarrationScreen.tsx      # NOVO — TTS nativo (info) + keep awake
│   ├── SettingsIntegrationsScreen.tsx   # NOVO — chaves Speechify/ElevenLabs/FishAudio/YouTube
│   ├── SettingsSyncScreen.tsx           # NOVO — status bookmark/progress/vocabulary sync + reconectar
│   └── OpdsCatalogSettingsScreen.tsx    # SEM MUDANÇA (já é o padrão sendo replicado)
├── i18n/
│   └── messages.ts                      # MODIFICADO — +1 chave nova × 3 locales (settings.language.sectionDescription)
└── __tests__/
    ├── App.test.tsx                     # MODIFICADO — cobertura de navegação pras novas rotas
    ├── hooks/
    │   └── useUserSettings.test.tsx     # NOVO
    └── screens/
        ├── SettingsScreen.test.tsx      # REESCRITO — só o menu (contagem de itens, callbacks)
        ├── SettingsLanguageScreen.test.tsx     # NOVO
        ├── SettingsAppearanceScreen.test.tsx   # NOVO
        ├── SettingsWordLensScreen.test.tsx     # NOVO
        ├── SettingsNarrationScreen.test.tsx    # NOVO
        ├── SettingsIntegrationsScreen.test.tsx # NOVO
        └── SettingsSyncScreen.test.tsx         # NOVO
```

**Structure Decision**: Projeto único (React + Capacitor), sem separação
backend/frontend. Segue a convenção já estabelecida em `src/` (componentes
PascalCase, hooks com prefixo `use`, testes espelhando a árvore de `src/` em
`src/__tests__/`). A única pasta nova é `src/components/settings/`, seguindo
o mesmo padrão já usado por `src/components/reader/` (componentes
específicos de uma área da UI, não genéricos o bastante pra `components/ui/`).

## Complexity Tracking

> Nenhuma violação não justificada do Constitution Check. O único ponto
> avaliado (`useUserSettings`) está documentado na tabela acima como
> justificado, não como violação — tabela abaixo fica vazia.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário (Vitest + Testing Library, por tela) → integração de
navegação (`App.test.tsx`, pilha de rotas) → manual no browser/device
(`quickstart.md`).

Cada subtela nova herda os testes relevantes que hoje vivem misturados em
`SettingsScreen.test.tsx` (ex: os testes de Word Lens migram pra
`SettingsWordLensScreen.test.tsx`, mantendo as mesmas asserções de
comportamento) — nunca deletar um teste antes de portar o equivalente pro
novo arquivo, pra não perder cobertura durante a migração.

Comandos-base:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

Arquivo único: `npx vitest run src/__tests__/screens/SettingsAppearanceScreen.test.tsx`
(ou o arquivo relevante da fase em andamento).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluído — baseline confirmado (lint/test/tsc/build limpos antes da feature). |
| Foundational (Fase 2) | Concluído — primitivos de layout, hook `useUserSettings`, tipos de rota e chave i18n prontos. |
| Fase 3 (US1+US2) | Concluído — menu de categorias + 6 subtelas + routing completo. MVP entregue. |
| Fase 4 (US3) | Concluído — 3 testes dedicados (Plano Pro, Cotas de Uso, Build/Sobre). |
| Fase 5 (US4) | Concluído — teste de consolidação de Idioma. |
| Fase 6 (Polish) | Concluída — T029 validado manualmente pelo usuário no device (RXCX103NMVZ), depois de 2 rodadas de ajustes ad-hoc: (R-005) TTS→Narração, Cotas+Plano juntos, Build removido; (R-006) "Plano" virou a 8ª categoria clicável. Menu principal 100% uniforme (8 categorias, nenhum item direto/expandido). 765 testes passando, lint/tsc/build limpos. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Duplicar a dança de `getSettings()`/loading/spinner em 6+ telas novas sem nenhuma abstração geraria repetição real e risco de inconsistência (ex: um spinner esquecido). | Médio — manutenção mais cara, risco de bug de UI (flash de tela vazia). | Resolvido: hook `useUserSettings` compartilhado (ver Decisões Invariantes), usado pelas 4 subtelas que precisam de settings (Language, Appearance, WordLens, Integrations). |
| R-002 | `SettingsScreen.test.tsx` atual tem 15 testes cobrindo várias seções misturadas; ao decompor em 6+ arquivos, risco de perder cobertura no meio da migração se um teste for removido antes do equivalente existir no novo arquivo. | Alto — regressão silenciosa não pega pelo CI. | Resolvido: todos os 15 testes originais portados 1:1 pros 6 arquivos novos na Fase 3, mais 5 testes novos (useUserSettings, Narração, navegação profunda) — 759 passando no total (era 752 antes da feature). |
| R-003 | Adicionar o tipo de rota nova em `App.tsx` sem o `case` correspondente faz a navegação cair silenciosamente no `default` (Home) em vez de dar erro de compilação. | Médio — bug de navegação só percebido em teste manual, não em build. | Resolvido: `case` do switch adicionado na mesma task (T024) que criou as 6 subtelas (T016-T021), nunca ficou dessincronizado. |
| R-004 | Ao portar a inicialização de `ttsKeyInputs`/`youtubeKeyInput` (originalmente dentro de uma Promise `.then()`) pro hook compartilhado `useUserSettings`, um `useEffect` ingênuo com `setState` síncrono no corpo violou a regra de lint `react-hooks/set-state-in-effect` (cascading renders) — descoberto durante a T018. | Baixo (bloqueava só a própria task, corrigido inline) — mas é um padrão que outras telas alimentadas por dados assíncronos no projeto podem repetir. | Resolvido: `SettingsIntegrationsScreen` virou 2 componentes — um gate que só renderiza depois de `settings` carregado, e um form interno que usa lazy initializers de `useState` (`useState(() => settings.appSettings.x)`) em vez de `setState` dentro de efeito. Padrão a reaproveitar em telas futuras que consomem `useUserSettings` (ou hooks assíncronos similares) pra seedar estado local. |
| R-005 | Durante o teste manual no device (T029), o usuário pediu 3 ajustes de conteúdo do menu depois do MVP pronto: mover as 3 chaves de voz (Speechify/ElevenLabs/FishAudio) de Integrações pra Narração, juntar "Cotas de Uso" dentro do bloco "Plano", e remover "Build/Sobre" do menu (informação irrelevante pro usuário final). | Baixo/Médio — mudança de conteúdo pós-MVP, tocou `SettingsScreen.tsx`, `SettingsNarrationScreen.tsx`, `SettingsIntegrationsScreen.tsx` e ~10 testes. | Resolvido: implementado como tasks ad-hoc (ver tasks.md Fase 6). `ApiKeyField`/`ValidationBadge`/`IntegrationStatus`/`KeyVisibilityButton` viraram compartilhados entre Narração e Integrações (extraídos porque agora 2 telas os usam de verdade); `getApiKeyValidationMessage`/`getEducationStatus`/`IDLE_KEY_STATE`/tipos ficaram num arquivo `.ts` puro separado do `.tsx` de componentes, por causa da regra de lint `react-refresh/only-export-components` (um arquivo não pode misturar export de componente com export de função/constante, ou quebra o Fast Refresh do Vite). `spec.md` atualizado (Escopo, US3, FR-004/FR-005, Clarifications) pra refletir a decisão. |
| R-006 | Logo depois de R-005, o usuário testou o bloco "Plano" expandido direto no menu principal e pediu mais um ajuste: virar categoria clicável igual às outras 7 (menu principal 100% uniforme). | Baixo — mudança de conteúdo pós-MVP, mesma extensão de R-005. | Resolvido: `SettingsPlanScreen.tsx` criado (NeoReader Pro + as 2 cotas, mesmo padrão de header/back button das outras subtelas); `SettingsScreen.tsx` (menu) reduzido a uma linha "Plano" com badge PRO/Free + chevron, sem `FeatureQuotaService`/lógica de cota (movida pra tela nova); nova rota `settings-plan` em `App.tsx`; `spec.md` atualizado (Escopo, US3, FR-002/FR-004/FR-005, edge cases, SC-001, Clarifications). |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-02 | Setup + Foundational | Baseline confirmado (752 testes, tsc/lint/build limpos). Criados `src/components/settings/SettingsLayout.tsx` (SettingsSection/SettingsGroup/SettingBlock/InfoRow extraídos), `src/hooks/useUserSettings.ts` + teste, 6 membros novos no `type Route` de `App.tsx` (só tipo, sem case ainda), chave `settings.language.sectionDescription` nos 3 locales. `SettingsScreen.tsx` ainda intacto (nada removido dele ainda). | Nenhuma — fundação pronta pra Fase 3. |
| 2026-09-02 | Fase 3 (US1+US2) | `SettingsScreen.tsx` reescrito como menu (7 categorias clicáveis + Plano Pro/Cotas de Uso/Build-Sobre diretos, sem `useUserSettings` — não precisa mais de settings carregado pra renderizar). Criadas as 6 subtelas novas em `src/screens/` (Language, Appearance, WordLens, Narration, Integrations, Sync), cada uma com header próprio + `useCapacitorBackButton(onBack)`. `App.tsx` com os 6 `case` novos + 6 push handlers passados ao `SettingsScreen`. Testes: 7 arquivos novos/reescritos em `src/__tests__/screens/` + 2 cenários de navegação profunda em `App.test.tsx`. 759 testes passando (era 752), lint/tsc/build limpos. | Nenhuma — MVP completo. |
| 2026-09-02 | Fase 4 (US3) + Fase 5 (US4) | 3 testes dedicados adicionados a `SettingsScreen.test.tsx` (quotas, badge Ativo do Plano Pro, Build/Sobre) e 1 teste de consolidação em `SettingsLanguageScreen.test.tsx`. Nenhuma implementação nova — ambas as stories já vinham prontas da Fase 3. | Nenhuma. |
| 2026-09-02 | Fase 6 (Polish) | T030 (i18n) e T031 (limpeza) confirmados mecanicamente via `tsc --noEmit` limpo (`satisfies Record<MessageKey, string>` garante paridade de chaves nos 3 locales; `noUnusedLocals`/`noUnusedParameters` garante zero código morto). T032: `lint && test && tsc && build` limpos, 762 testes passando. T029 (validação manual ponta a ponta) tentei rodar sozinho — dev server sobe limpo em `localhost:5173`, mas travei na tela de login do Firebase (sem credencial real) e não há `chromium-cli`/Playwright configurado neste ambiente; usuário optou por validar manualmente no próprio device/browser. | T029 — aguardando validação manual do usuário antes de fechar a feature como Implementada. |
| 2026-09-02 | Fase 6 (Polish) — ad-hoc (R-005) | App instalado no device (`npm run android:run`) pro usuário validar T029. Durante o teste, usuário pediu 3 ajustes: (1) mover chaves de voz Speechify/ElevenLabs/FishAudio de Integrações pra Narração; (2) juntar "Cotas de Uso" dentro do bloco "Plano"; (3) remover "Build/Sobre" do menu. Implementado: `ApiKeyField.tsx` (componentes) + `apiKeyValidation.ts` (tipos/funções puras, separados por causa do lint `react-refresh/only-export-components`) extraídos como compartilhados entre Narração e Integrações; `SettingsNarrationScreen.tsx` ganhou o form de TTS (mesmo padrão gate+form da T018); `SettingsIntegrationsScreen.tsx` reduzido a só YouTube; `SettingsScreen.tsx` com Plano+quotas num bloco só, sem mais seção Build. i18n: chaves órfãs removidas (`settings.build.*`, `settings.quota.sectionLabel/sectionDescription`), `settings.plan.sectionDescription` reescrita nos 3 locales. `spec.md` atualizado (Escopo, US3, FR-004/FR-005, edge cases, Clarifications). Testes atualizados/movidos entre os 3 arquivos afetados. | Nenhuma — 764 testes passando, lint/tsc/build limpos. T029 continua pendente (agora sobre esta versão atualizada). |
| 2026-09-02 | Fase 6 (Polish) — ad-hoc (R-006) | Usuário reinstalou/testou o bloco Plano expandido e pediu mais um ajuste: virar categoria clicável igual às outras. Criado `SettingsPlanScreen.tsx` (NeoReader Pro + 2 cotas, `getPlanMeta`/`getQuotaMeta`/`getQuotaBadge`/`getQuotaTone` movidos pra lá). `SettingsScreen.tsx` reduzido a 1 linha "Plano" com badge PRO/Free. Nova rota `settings-plan` + case + push handler em `App.tsx`. 2 chaves i18n novas (`settings.plan.tierPro`/`tierFree`, 3 locales). Testes: `SettingsScreen.test.tsx` reescrito (8 categorias uniformes, badge PRO/Free), `SettingsPlanScreen.test.tsx` novo (quotas + badge Ativo + abre Paywall). `spec.md` atualizado de novo (Escopo, US3, FR-002/004/005, edge cases, SC-001, Clarifications). | Nenhuma — 765 testes passando, lint/tsc/build limpos. |
| 2026-09-02 | Fase 6 (Polish) — fechamento | Versão final (com R-005 e R-006) reinstalada no device; usuário validou manualmente T029 e confirmou "feito, teste concluído". Todas as 50 tasks de `tasks.md` marcadas, Checklist de Release completo. Feature pronta pra fechar como Implementada. | Nenhuma. |

**PRÓXIMO**: Rodar `sdd-converge` quando o usuário quiser auditar a implementação final contra spec/plan/tasks e sincronizar a documentação (README etc., se aplicável).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/screens/SettingsScreen.tsx` — menu de 8 categorias uniformes (Plano incluído), nenhum item direto/expandido
- `src/screens/SettingsPlanScreen.tsx` — NOVO — NeoReader Pro + as 2 cotas de uso mensal, mesmo padrão das outras subtelas
- `src/screens/SettingsNarrationScreen.tsx` — TTS nativo + keep awake + as 3 chaves de voz (Speechify/ElevenLabs/FishAudio), padrão gate+form
- `src/screens/SettingsIntegrationsScreen.tsx` — só YouTube Data API, padrão gate+form
- `src/screens/SettingsLanguageScreen.tsx` / `SettingsAppearanceScreen.tsx` / `SettingsWordLensScreen.tsx` / `SettingsSyncScreen.tsx` — sem mudança desde a Fase 3
- `src/components/settings/ApiKeyField.tsx` — componentes de campo de chave, compartilhados por Narração e Integrações
- `src/components/settings/apiKeyValidation.ts` — tipos/funções puras de validação (arquivo `.ts` separado por causa do lint `react-refresh/only-export-components`)
- `src/App.tsx` — 7 `case` + push handlers do menu (rota `settings-plan` nova nesta rodada)
- `src/i18n/messages.ts` — chaves `settings.build.*` e `settings.quota.sectionLabel/sectionDescription` removidas (órfãs); `settings.plan.sectionDescription` reescrita; `settings.plan.tierPro`/`tierFree` novas
- `src/__tests__/screens/SettingsScreen.test.tsx` / `SettingsPlanScreen.test.tsx` (novo) / `SettingsNarrationScreen.test.tsx` / `SettingsIntegrationsScreen.test.tsx` — atualizados pro novo conteúdo

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Testar no device via `npm run android:run` exige o adb conectado no exato momento da instalação (não só do build) — o app builda/sincroniza normal mesmo com o device desconectado, mas a instalação falha silenciosamente no final ("Nenhum dispositivo Android conectado pelo adb"). Sempre confirmar `adb devices` logo antes de rodar, não só no início da sessão.
- `SettingsSyncScreen.tsx` (categoria Sincronização) só mostra o botão de reconectar quando o status é exatamente `permission-error` — usuário sem conexão prévia ou noutro status não vê nenhuma ação de login/conectar, só o badge. Confirmado com o usuário (2026-09-02) que é a mesma limitação já registrada no spec (Fora de Escopo) e não algo quebrado por esta feature — logado em `.planning/backlog.md` → Ideias Futuras, não corrigido aqui.

## Resultado Final

<!-- Anexado pelo sdd-converge ao fechar a feature sem achados. -->

Convergência rodada em 2026-09-02, sem achados (nenhuma lacuna `missing`/
`partial`/`contradicts`/`unrequested`). Verificação final: `npm run lint`,
`npx tsc --noEmit`, `npm test` (765 passed, 2 skipped pré-existentes) e
`npm run build` — todos limpos. `git status` confirma que nenhum commit foi
feito durante a execução (todas as mudanças ainda em working tree, aguardando
o usuário decidir quando commitar) e que nenhuma dependência nova entrou em
`package.json`.

**O que foi de fato construído**: a tela única de Settings (~1170 linhas)
virou um menu de **8 categorias uniformes** — Plano, Idioma, Aparência do
Leitor, Word Lens, Narração, Integrações/Chaves de API, Catálogos OPDS,
Sincronização na Nuvem — cada uma abrindo sua própria subtela, todas
seguindo o mesmo padrão de header/back button (`useCapacitorBackButton` +
pop do stack de rotas de `App.tsx`). Nenhum item "direto"/expandido restou
no menu principal — isso é mais uniforme do que o plano original previa
(3 itens diretos: Plano Pro, Cotas de Uso, Build/Sobre).

**Desvios acumulados em relação ao plano original** (todos por pedido do
usuário durante o teste manual no device, documentados em R-005/R-006 e nas
2 sessões extras de Clarifications do `spec.md`):

1. As 3 chaves de provedor TTS (Speechify, ElevenLabs, Fish Audio) migraram
   de "Integrações" pra "Narração"; "Integrações" ficou só com o YouTube
   Data API. O plano original previa as 4 chaves juntas em "Integrações".
2. "Cotas de Uso" e "Build/Sobre" — que o plano original tratava como 2 dos
   3 itens diretos do menu — passaram por 2 rodadas: primeiro "Cotas de
   Uso" foi absorvida pelo bloco "Plano" (ainda expandido no menu), depois
   esse bloco inteiro virou a 8ª categoria clicável (`SettingsPlanScreen.tsx`,
   novo arquivo não previsto no plano original). "Build/Sobre" foi removido
   do produto inteiramente (não só reorganizado) — decisão de escopo do
   usuário, já refletida no `spec.md`.
3. `src/components/settings/ApiKeyField.tsx` — que a Decisão Invariante
   original previa como "helper de uso único, migra pro arquivo da subtela
   que usa" — acabou virando genuinamente compartilhado entre Narração e
   Integrações (ambas usam campos de chave expansíveis), e foi desmembrado
   num arquivo `.tsx` (só componentes) + `src/components/settings/apiKeyValidation.ts`
   (só tipos/funções puras), por causa da regra de lint
   `react-refresh/only-export-components`. A Decisão Invariante nesta
   página ficou com o texto original (não reescrita, por restrição do
   `sdd-execute`/`sdd-converge`) — este parágrafo é a correção viva.
4. A árvore de `## Project Structure` (Source Code) acima também ficou
   parcialmente desatualizada pelos mesmos motivos (comentários por arquivo
   descrevendo o conteúdo pré-R-005/R-006) — não foi reescrita por restrição
   deste skill; o estado real de cada arquivo está descrito no changelog de
   `## Riscos e Decisões` (R-005, R-006) e em `## Arquivos Principais`
   (já atualizado pelo `sdd-execute` na última passada).

**Achado registrado fora desta feature**: `SettingsSyncScreen.tsx` só
oferece reconectar quando o status é `permission-error` — sem ação alguma
pra quem nunca conectou o Drive. Já era uma limitação preexistente da tela
única, ficou só mais visível com a subtela dedicada. Confirmado com o
usuário que é o mesmo problema já previsto como fora de escopo no `spec.md`
— logado em `.planning/backlog.md` → Ideias Futuras, não é uma pendência
desta feature.

**Documentação**: `README.md` → seção "Configuracoes" estava desatualizada
(descrevia a lista plana antiga) — atualizada cirurgicamente pra refletir o
menu de categorias e os desvios acima (TTS em Narração, YouTube em
Integrações, Plano com badge PRO/Free). Nenhuma outra seção do README
precisou de mudança.
