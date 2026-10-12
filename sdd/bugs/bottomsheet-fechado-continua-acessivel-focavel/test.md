# Bug Verification: BottomSheet fechado continua acessível e focável

- **Slug**: bottomsheet-fechado-continua-acessivel-focavel
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

Em jsdom, o sintoma não reproduz mais: com `open={false}` o diálogo e seus botões não aparecem por papel e o contêiner tem `inert` + `aria-hidden`. Suítes dos chamadores passam. Resultado `partial` porque build/suite completa e TalkBack real não foram rodados.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | Equivalente automatizado: 1º teste de `BottomSheet.test.tsx` (mesmo cenário do probe R16, asserções invertidas) | pass | O probe original em `reports/` não é coletado pelo `include` do Vitest (`*.probe.tsx`); não foi executado diretamente |
| Testes novos | `npx vitest run src/__tests__/components/ui/BottomSheet.test.tsx` | pass | 4/4 |
| Regressão (chamadores) | `npx vitest run` em HighlightComposerSheet, QuickBookActionsSheet, TocDrawer, BookDetailsScreen, LibraryScreen, ReaderScreen, SettingsLanguageScreen | pass | 7 arquivos, 220/220 |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | |
| Lint | `npx eslint` nos 2 arquivos alterados | pass | |
| Build + suite completa | `npm run build` / `npm test` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |
| TalkBack / teclado em device | manual | not-run | Sem device nesta sessão |

## Output Excerpts

```
Test Files  1 passed (1)   Tests  4 passed (4)
Test Files  7 passed (7)   Tests  220 passed (220)
TSC EXIT 0 / ESLINT EXIT 0
```

## Residual Risks

- jsdom não implementa a semântica de `inert` (não bloqueia `focus()`); o teste verifica o atributo e a exclusão por `aria-hidden`. O bloqueio real de foco depende do WebView (Chromium ≥ 102 suporta `inert`).
- Sem contenção de foco (Tab cíclico) com o sheet aberto.
- Foco programático no diálogo ao abrir: comportamento visual no Android (anel de foco/teclado) não verificado em device.

## Recommendation

Segurar até o orquestrador rodar build + suite completa e, idealmente, um teste rápido com TalkBack; sem regressões nas suítes afetadas, pode fechar depois disso.
