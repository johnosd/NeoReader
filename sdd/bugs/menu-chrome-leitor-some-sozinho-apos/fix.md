# Bug Fix: Menu de chrome do leitor some sozinho após ~2.5s

- **Slug**: menu-chrome-leitor-some-sozinho-apos
- **Corrigido**: 2026-09-10
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`useChromeAutoHide` deixou de reagendar um `setTimeout` toda vez que o
chrome é reaberto por toque ou por fechar um sheet (Aparência,
Marcadores, TOC, Vocabulário, TTS, preview de imagem). O auto-hide passou
a acontecer só uma vez, no mount do leitor, com delay maior (10s em vez
de 2.5s); reaberturas manuais depois disso ficam abertas até o usuário
fechar explicitamente (toque de novo ou botão de dispensar).

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/hooks/useChromeAutoHide.ts` | modified | `resetAutoHide` renomeado pra `scheduleInitialAutoHide` (só chamado 1x, no mount); `handleCenterTap` virou toggle puro, sem agendar hide; `setChromeVisible` exposto agora é um wrapper que cancela qualquer timer pendente ao ser chamado diretamente (evita sumiço de surpresa se o usuário fechar/reabrir manualmente antes do hide inicial disparar). |
| `src/screens/ReaderScreen.tsx` | modified | Renomeada a desestruturação (`resetAutoHide` → `scheduleInitialAutoHide`), usada só no `useEffect` de mount. Removidas as chamadas de reset em `handleOpenImage` e nos handlers `onAppearanceOpen`/`onBookmarkList`/`onTocOpen`/`onOpenVocabulary`/`onTtsToggle` do `ReaderChrome` — não fazem mais sentido sem o timer recorrente. |
| `src/__tests__/hooks/useChromeAutoHide.test.ts` | modified | Testes de timer recorrente removidos/reescritos pro novo contrato: chrome não some sozinho depois de reaberto manualmente, e o hide inicial pendente é cancelado por qualquer interação explícita. |

## Tests Added or Updated

- `src/__tests__/hooks/useChromeAutoHide.test.ts::scheduleInitialAutoHide esconde o chrome após o delay configurado` — cobre o hide único no mount (renomeado do antigo teste de `resetAutoHide`).
- `src/__tests__/hooks/useChromeAutoHide.test.ts::handleCenterTap ao reabrir o chrome NÃO agenda auto-hide (regressão: chrome não deve sumir sozinho)` — trava exatamente o sintoma relatado: reabrir por toque e esperar bem mais que o delay não esconde mais.
- `src/__tests__/hooks/useChromeAutoHide.test.ts::handleCenterTap cancela um auto-hide inicial ainda pendente` — cobre o caso extra descoberto na análise de risco (fechar/reabrir manualmente antes do hide inicial disparar não deixa um timer fantasma vivo).
- `src/__tests__/hooks/useChromeAutoHide.test.ts::setChromeVisible força visibilidade diretamente e cancela auto-hide pendente` — cobre o `setChromeVisible` exposto (usado por `onDismiss` do `ReaderChrome`).

## Local Verification

- `npx vitest run src/__tests__/hooks/useChromeAutoHide.test.ts` → 7/7 passando.
- `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` → 34/34 passando.
- `npx tsc --noEmit` → sem erros.
- `npm test` (suite completa) → 873 passando, 2 skipped (pré-existentes), sem regressão.
- `npm run lint` → limpo.
- `npm run build` → build de produção completo sem erros.
- Checagem manual em device real: **não realizada nesta rodada** — recomendado antes de fechar de vez (ver Follow-ups).

## Deviations from Assessment

O `assessment.md` deixava a decisão entre "Preferida" (remover o
auto-hide por completo, inclusive no mount) e "Alternativa" (manter só o
piscar inicial do mount, remover do resto) como pergunta aberta pro
usuário. Resolvida em conversa antes de editar código:
- Escolhida a **Alternativa** (não a "Preferida" do assessment).
- Delay do hide inicial aumentado pra **10s** (o assessment tinha citado
  2500ms/o valor atual como referência, sem propor um novo número — 10s
  foi pedido explicitamente pelo usuário).
- Adicionado o cancelamento de timer pendente em `setChromeVisible`/
  `handleCenterTap`, que não estava detalhado como parte da remediação
  proposta, mas resolve diretamente o risco já sinalizado em
  "Risks & Considerations" do assessment (timer fantasma sobrevivendo a
  um fechar/reabrir manual).

## Follow-ups

- ~~Validar em device real (RXCX103NMVZ)~~ — feito: usuário confirmou
  "testado com sucesso" em 2026-09-10 (ver `test.md`).
- Este fix é independente da feature de navegação por zona de borda
  esquerda (assessment `controle-customizavel-toque-na-tela-leitura`,
  veredito go) — não há sobreposição de código, mas vale reler as duas
  juntas ao especificar aquela feature, já que ambas mexem na camada de
  toque do leitor.
