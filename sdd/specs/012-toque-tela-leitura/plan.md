# Implementation Plan: Controle de toque na tela de leitura

**Slug**: `012-toque-tela-leitura` | **Date**: 2026-09-10 | **Spec**: `sdd/specs/012-toque-tela-leitura/spec.md`

## Summary

Adicionar uma nova zona de toque na borda esquerda da área de leitura
(`EpubViewer.tsx`), limitada à faixa central entre as zonas de chrome de
topo/rodapé já existentes, que abre o índice (TOC) do livro — e expor,
em Settings > Aparência, um diagrama estático read-only documentando
todas as zonas de toque ativas hoje.

**Pivotado durante o `sdd-execute` (T001)**: o spike original propunha
navegar pra seção/capítulo anterior (reaproveitando `prevToEnd()`/
`goToAdjacentSection`). Foi implementado, testado no device real, 102
testes verdes — mas o usuário não viu valor na ação em si ("funcionou
mas não gostei, não vi valor em voltar para início do capítulo") e
esclareceu que o objetivo da feature é mapear zonas de toque pra ações
úteis, não necessariamente navegação. A ação foi trocada pra "abrir o
índice", reaproveitando o handler de TOC já existente no chrome — ver
R-001 (resolvido) e `spec.md` → Clarifications, sessão de continuação.

## Technical Context

**Language/Version**: TypeScript 5.x / React 19 (stack já travada pela constitution).

**Primary Dependencies**: `foliate-js` (via `view.renderer.goTo`, já usado por `goToAdjacentSection`/`prevToEnd`), `useI18n` (provider local de i18n, sem lib externa). Nenhuma dependência nova.

**Storage**: N/A — nenhuma entidade nova, nenhuma preferência persistida (Dexie não é tocado nesta feature).

**Testing**: Vitest + Testing Library, seguindo os padrões já existentes em `src/__tests__/components/EpubViewer.test.tsx` (harness com `FoliateViewMock`, `clickAt`, `setViewportWidth/Height`, `expectTapIgnored`) e `src/__tests__/screens/SettingsAppearanceScreen.test.tsx`.

**Target Platform**: Android (Capacitor) + Web — mesmos alvos do projeto.

**Performance Goals**: N/A — feature é detecção de zona de toque (síncrona, custo desprezível) e um diagrama estático; sem trabalho sensível a performance.

**Constraints**:
- Geometria de tap zone em `flow=scrolled` já se provou frágil (fix mais recente na branch, `d8c25f2`, sobre altura errada do iframe da seção) — reaproveitar helpers geométricos já testados (`getVisibleChromeTapZoneSize`, padrão de `getPhysicalTapPosition`) em vez de recalcular do zero.
- Zero regressão nas zonas de toque já existentes (chrome topo/rodapé/direita, tradução inline/Word Lens, highlight, bookmark, navegação por TTS) — cobertura de teste existente é a rede de segurança (SC-002).
- O estado do painel de índice (TOC) vive em `ReaderScreen.tsx` (`tocOpen`/`setTocOpen`), não em `EpubViewer.tsx` — diferente da ideia original de navegação (que podia ficar 100% interna ao `EpubViewer`), abrir o índice exige uma nova prop de callback (`onOpenToc`) subindo do `EpubViewer` pro `ReaderScreen`, reaproveitando o mesmo handler já usado pelo botão de TOC do chrome.

**Scale/Scope**: App local-first, single-user por dispositivo — sem preocupação de escala.

## Decisões Invariantes

- A ação da zona esquerda é abrir o índice (TOC), chamando o mesmo
  handler já usado pelo botão de TOC do chrome (`handleOpenToc` em
  `ReaderScreen.tsx`, reaproveitado via nova prop `onOpenToc` em
  `EpubViewer.tsx`) — nunca um handler duplicado.
- A detecção da nova zona vive inteiramente dentro do tap handler já
  existente de `EpubViewer.tsx`, no mesmo padrão de
  `isVisibleChromeTapZone`/`isRightChromeTapZone`. A única prop nova
  necessária é `onOpenToc` (callback simples) — não uma estrutura de
  mapeamento zona→ação (decidido explicitamente contra isso em
  2026-09-10, ver `spec.md` → Clarifications: manter simples, sem
  abstração prematura, customização real fica pra v2).
- A zona esquerda é verticalmente limitada à faixa entre as zonas de
  chrome de topo e rodapé (nunca sobrepõe os cantos superior/inferior-
  esquerdos) — geometria reaproveita as mesmas constantes/helpers já
  usados pelas zonas de chrome como referência de limite.
- Toques sobre texto legível (parágrafo) sempre têm prioridade sobre a
  nova zona, reaproveitando a mesma checagem `tapHitsReadableText` já
  usada pelas zonas de chrome — sem heurística nova.
- Nenhuma preferência desta feature é persistida no Dexie — nem a
  existência da zona, nem a ação que ela dispara. Tudo fixo em código
  nesta rodada (customização fica pra v2, fora de escopo).
- O diagrama de Settings > Aparência é somente leitura — nenhum elemento
  dele dispara ação, navegação ou gravação de preferência.
- Nenhuma dependência nova é adicionada ao projeto.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | Compatível | Compatível | Escopo veio de `sdd-assess` (go) + `sdd-specify` (entrevista completa); a única ambiguidade real (FR-002) é marcada `NEEDS CLARIFICATION` de propósito e resolvida por checkpoint explícito no início da execução — não por suposição. |
| II. Comentários só onde o "porquê" não é óbvio | Compatível | Compatível | A extração de `prevToEnd()` pra função compartilhada e a geometria de zona (por que a faixa esquerda não cobre os cantos) são os únicos pontos não óbvios — ambos vão levar comentário curto na implementação. |
| III. Explícito antes de mágico | Compatível | Compatível | Reaproveita primitivas já existentes (`goToAdjacentSection`, `getVisibleChromeTapZoneSize`) em vez de criar uma camada nova de "sistema de zonas configurável" — isso é deliberadamente adiado pra v2 (fora de escopo). |
| IV. Build limpo é a definição de "pronto" | Compatível | Compatível | `npm run build` faz parte do Checklist de Release em tasks.md; nenhuma mudança é reportada concluída sem isso passar. |
| V. Dependências novas exigem justificativa | Compatível | Compatível | Nenhuma dependência nova — toda a feature usa infraestrutura já presente (foliate-js, i18n provider local). |

Nenhuma violação — Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/012-toque-tela-leitura/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── quickstart.md          # Fase 1, passos de verificação manual
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

Sem `research.md` (a única incerteza técnica genuína — semântica do
gesto — não é resolvível por pesquisa de desk, é uma comparação
experiencial no device real; virou a primeira task de execução em vez
de um documento de pesquisa). Sem `data-model.md`/`contracts/` (nenhuma
entidade ou superfície de API nova).

### Source Code (repository root)

```text
src/
├── components/
│   ├── reader/
│   │   └── EpubViewer.tsx              # MODIFICADO: nova zona esquerda no tap handler (isLeftTocTapZone) + prop onOpenToc
│   └── settings/
│       ├── SettingsLayout.tsx           # existente, reaproveitado (SettingsGroup/SettingBlock)
│       └── TouchZonesDiagram.tsx        # NOVO: diagrama read-only do mapa de zonas
├── screens/
│   ├── ReaderScreen.tsx                # MODIFICADO: handleOpenToc compartilhado entre onTocOpen (chrome) e onOpenToc (EpubViewer)
│   └── SettingsAppearanceScreen.tsx    # MODIFICADO: nova seção com o diagrama
└── i18n/
    └── messages.ts                      # MODIFICADO: novas chaves settings.appearance.touchZones.* (pt-BR, en, es)

src/__tests__/
├── components/
│   └── EpubViewer.test.tsx             # MODIFICADO: testes da nova zona
└── screens/
    └── SettingsAppearanceScreen.test.tsx # MODIFICADO: testes do diagrama
```

**Structure Decision**: Projeto único (React + TypeScript + Vite), sem
separação backend/frontend — segue a estrutura já existente do
repositório. A detecção de zona fica dentro de `EpubViewer.tsx` (mesmo
componente que já possui as zonas de chrome); abrir o índice sobe pro
`ReaderScreen.tsx` via a nova prop `onOpenToc`, reaproveitando o mesmo
handler do botão de TOC do chrome. O diagrama vira um componente novo e
pequeno em `src/components/settings/` (mesma pasta de outros componentes
de Settings), seguindo a convenção "um arquivo = uma responsabilidade".

## Complexity Tracking

*(vazio — nenhuma violação do Constitution Check a justificar)*

## Estratégia de Testes

Prioridade: unitário (Vitest + Testing Library) → não há camada de
contrato/integração de API aplicável (app local-first sem backend
próprio de dados de leitura) → manual em device Android real como
validação final (mandatado pela constitution pra mudanças de UI/leitor).

Comandos-base:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
npx vitest run src/__tests__/components/EpubViewer.test.tsx
npx vitest run src/__tests__/screens/SettingsAppearanceScreen.test.tsx
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| User Story 1 (zona esquerda → abrir índice) | Concluída e validada no device real |
| User Story 2 (diagrama do mapa de zonas) | Concluída, validada no device real e via Playwright |
| Polish (lint/test/build completos, README) | Concluída — feature implementada por completo |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Semântica exata do gesto da zona esquerda — ainda não decidida no planejamento, `spec.md` deixou `[NEEDS CLARIFICATION]` de propósito. | Bloqueava a task de implementação principal da User Story 1. | **Resolvido (2026-09-10, T001)**: spike comparativo rodado no device real — versão A (navegar pra seção/capítulo anterior, via `prevToEnd`/`goToAdjacentSection`) foi implementada e testada (102 testes verdes), mas o usuário achou sem valor ("não vi valor em voltar para início do capítulo"; objetivo real é mapear zonas pra ações úteis, não navegação). Ação trocada pra **abrir o índice (TOC)**, reaproveitando o handler já existente do botão de TOC do chrome. Confirmado funcionando no device após a troca. Código da navegação revertido; `spec.md` atualizada (FR-002 e Acceptance Scenarios reescritos, marcador `[NEEDS CLARIFICATION]` removido). |
| R-002 | Zona esquerda pode colidir com texto legível perto da borda em livros com margem pequena/fonte grande. | Ação acidental (abrir índice) em vez de abrir tradução — quebraria a feature central de Word Lens. | Reaproveitar a mesma checagem `tapHitsReadableText` já usada pelas zonas de chrome (FR-004) — texto sempre prioritário, sem heurística nova a validar. Coberto por teste automatizado (`EpubViewer.test.tsx`). |
| R-003 | Geometria de tap zone em `flow=scrolled` já se provou frágil (fix mais recente da branch, `d8c25f2`, sobre altura errada do iframe da seção). | Risco de reintroduzir um bug de coordenada semelhante ao já corrigido. | Reaproveitar helpers geométricos já existentes e testados (`getVisibleChromeTapZoneSize`, mesmo padrão de `getPhysicalTapPosition`) em vez de recalcular do zero; coberto por teste de regressão equivalente ao que já existe pras outras zonas. |
| R-004 | Abrir o índice exige que `EpubViewer.tsx` chame de volta pro `ReaderScreen.tsx` (estado do painel de TOC vive lá), diferente da ideia original de navegação que podia ficar 100% interna ao `EpubViewer`. | Nova prop de callback (`onOpenToc`) — pequeno acoplamento novo entre os dois componentes. | Resolvido: reaproveita o mesmo handler (`handleOpenToc`) já usado pelo botão de TOC do chrome, passado como prop pros dois lugares — sem duplicar lógica de abrir o painel. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-10 | Fase 3 / User Story 1 | T001 (spike) rodado no device real com a ação original (navegar seção); usuário rejeitou, pivotou pra "abrir índice" (R-001). Código do spike revertido, reimplementado com `onOpenToc`. T002-T005 concluídas, 142 testes passando, build limpo, validado no device real pelo usuário. | Nenhuma para US1 — falta rodar `npm run lint` completo (fica no Polish). |
| 2026-09-10 | Fase 4 / User Story 2 | `TouchZonesDiagram.tsx` criado (diagrama CSS, sem SVG/lib nova), chaves i18n nos 3 locales, integrado em `SettingsAppearanceScreen.tsx`. 2 testes automatizados + verificação visual via Playwright (desktop e 390px) confirmando layout responsivo e tokens de cor corretos. Suite completa (881 testes), lint e build limpos. | Nenhuma — falta só a Fase Polish. |
| 2026-09-10 | Fase 5 / Polish | `npm run lint && npm test && npx tsc --noEmit && npm run build` limpos (T010). Build final instalada e validada no device real (SM-S911B): zona esquerda ("funcionou bem, gostei") e diagrama ("Diagrama ficou bom, pode fechar") confirmados pelo usuário (T011). `README.md` atualizado com a nova zona e a correção do auto-hide (T012). Checklist de Release 100% marcado. | Nenhuma — feature concluída. |

**PRÓXIMO**: Feature implementada por completo. Sugerido rodar `sdd-converge` numa sessão futura pra auditar a implementação final contra spec/plan/tasks antes de considerar 100% arquivada.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/components/reader/EpubViewer.tsx` — zona `isLeftTocTapZone` + prop `onOpenToc`
- `src/screens/ReaderScreen.tsx` — `handleOpenToc` compartilhado
- `src/components/settings/TouchZonesDiagram.tsx` — diagrama read-only do mapa de zonas
- `src/screens/SettingsAppearanceScreen.tsx` — seção com o diagrama
- `src/i18n/messages.ts` — chaves `settings.appearance.touchZones.*`
- `README.md` — seção de features do leitor atualizada

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `prevToEnd()` (`EpubViewer.tsx`) foi cogitada e chegou a ser usada num spike descartado (R-001) — **não é mais parte desta feature**. Continua existindo, testada, sem chamador em produção, exatamente como estava antes desta feature começar; não reintroduza essa dependência sem motivo novo.
- As zonas de chrome de topo/rodapé cobrem a LARGURA INTEIRA da tela, não só a direita — a nova zona esquerda precisa ficar limitada à faixa vertical central pra não colidir nos cantos (ver Decisões Invariantes).
- O estado do painel de índice (`tocOpen`) vive em `ReaderScreen.tsx`, não em `EpubViewer.tsx` — por isso essa feature precisou de uma prop nova (`onOpenToc`), diferente do padrão "tudo interno ao EpubViewer" que as zonas de chrome usam.
