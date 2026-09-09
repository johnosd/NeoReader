# Bug Fix: Clique no parágrafo não abre o menu contextual perto do início/fim do capítulo

- **Slug**: clique-no-paragrafo-nao-abre-menu
- **Corrigido**: 2026-09-09
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`isVisibleChromeTapZone` comparava `ev.clientY` (posição do clique relativa
ao documento INTEIRO da seção — em `flow=scrolled` cada seção é um iframe do
tamanho do próprio conteúdo, não de uma tela) contra uma "altura de tela"
derivada de `doc.defaultView.innerHeight`, que nesse modo é a altura total da
seção (podendo ter milhares de px), não a altura física visível. Isso fazia
qualquer parágrafo perto do topo/fundo do HTML da seção (inevitável nos
primeiros/últimos parágrafos de um capítulo) ser classificado como "toque na
margem do chrome" e nunca abrir a tradução. A correção converte a posição do
clique pra coordenada absoluta da viewport física (via a posição atual do
próprio `<iframe>` na página + o container real do renderer) antes de decidir
se caiu mesmo na margem de 140/156px.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/components/reader/EpubViewer.tsx` | modified | `isVisibleChromeTapZone` passou a aceitar uma posição física opcional (`PhysicalTapPosition`); nova função `getPhysicalTapPosition` (perto de `getRendererScrollContainer`) calcula essa posição via `doc.defaultView.frameElement` + o container real do renderer; ponto de chamada no handler de `click` passa a fornecer essa posição. Sem posição física disponível (ex.: modo paginado, ou fallback de teste), o cálculo antigo é preservado 1:1. `isRightChromeTapZone`/largura não foram alterados — confirmado que a largura do iframe acompanha a física mesmo em `scrolled` (só a altura cresce pra caber o conteúdo). |
| `src/__tests__/components/EpubViewer.test.tsx` | modified | Novo teste que simula uma seção 6000px de altura (bem mais alta que a tela) com o container real do renderer marcando 720px de altura física — clique perto do fim do documento (fora do rect exato do parágrafo, replicando a margem real onde o bug ocorre) precisa abrir a tradução em vez de cair na "zona de chrome". |

## Tests Added or Updated

- `src/__tests__/components/EpubViewer.test.tsx::tap perto do fim de uma seção bem mais alta que a tela abre a tradução, não trava na zona de chrome` — trava a regressão: verificado manualmente que esse teste FALHA (chama `onCenterTap` em vez de `onTranslate`) se a posição física for forçada a `null` (comportamento antigo), e PASSA com o fix.

## Local Verification

- `npx tsc --noEmit` → sem erros.
- `npx vitest run src/__tests__/components/EpubViewer.test.tsx` → 102/102 passaram (101 preexistentes + 1 novo).
- `npm test` (suite completa) → 873 passaram, 2 skipped (preexistentes, não relacionados).
- `npm run lint` → sem erros.
- `npm run build` → build de produção concluído sem erros.
- Checagem manual: reverti temporariamente o fix (forçando `physicalTapPosition = null`) e confirmei que o teste novo falha exatamente como o bug real (toque some, chrome alterna em vez de abrir tradução); restaurei o fix e confirmei que os 102 testes voltam a passar.

## Deviations from Assessment

A remediação aplicada não é literalmente a descrita no assessment (que
sugeria só trocar a fonte de "altura de tela" por
`getRendererScrollContainer()?.clientHeight`, comparando direto contra
`ev.clientY`). Ao implementar, descobri que isso teria um problema de escala:
`ev.clientY` é relativo ao documento INTEIRO da seção (pode valer milhares de
px), enquanto `getRendererScrollContainer()?.clientHeight` é a altura física
pequena (ex.: 720px) — comparar os dois diretamente faria a zona de "fundo da
tela" cobrir quase toda a seção a partir de uma certa profundidade, um bug
novo e pior que o original. A correção real também converte a posição do
clique pra coordenada absoluta da viewport (via a posição do próprio
`<iframe>` na página, obtida por `doc.defaultView.frameElement`), não só
troca a altura de referência. Escopo e arquivo afetado continuam os mesmos
previstos no assessment (`EpubViewer.tsx` + testes) — só o mecanismo exato da
correção ficou mais completo do que a proposta original antecipava.

## Follow-ups

- Nenhum bloqueante. Fica como nota: `tapHitsReadableText` aparece redigido
  nos logs de diagnóstico (`DiagnosticsLogger.ts`, `CONTENT_KEYS` casando por
  substring "text" no nome do campo) — mencionado no assessment como achado
  secundário, não corrigido aqui (fora do escopo deste bug).
