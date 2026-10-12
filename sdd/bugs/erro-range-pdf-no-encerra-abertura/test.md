# Bug Verification: Erro de Range em PDF não encerra abertura

- **Slug**: erro-range-pdf-no-encerra-abertura
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

A reprodução automatizada (loading task do pdf.js mockada esperando bytes + Range falhando ou abort) agora termina com rejeição e `destroy()` da loading task; sair do leitor durante a abertura aborta o signal. Testes de PDF, leitor e corpus EPUB passam. `partial` porque o bug original foi achado estaticamente e não foi reproduzido com o pdf.js real nem em device, e build/suíte completa ficam para o orquestrador.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix, automatizada) | `npx vitest run src/__tests__/services/pdf/PdfBookFactory.range.test.ts src/__tests__/hooks/usePdfReaderSession.test.tsx` | pass | 19/19; cobre 1º Range, Range após abrir, `Blob.slice`, abort, signal pré-abortado, pós-abertura intacta |
| Regressão PDF | `npx vitest run src/__tests__/services/pdf src/__tests__/hooks/usePdfReaderSession.test.tsx src/__tests__/services/bookInfo/PdfBookInfoProvider.test.ts` | pass | 106/106 |
| Regressão leitor/telas | `npx vitest run` em pdfPageMapping, PdfPageViewer.contract, PdfTextModeViewer, BookDetailsScreen, ReaderScreen | pass | 247/247 |
| Corpus EPUB | `npm run test:debug-epubs` | pass | 71/71 |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | sem saída |
| Lint (arquivos alterados) | `npx eslint <5 arquivos>` | pass | sem saída |
| Reprodução com pdf.js real / device | — | not-run | exige device/arquivo local sumindo; não feito |
| Build | `npm run build` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |
| Suite completa | `npm test` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |

## Output Excerpts

```
PdfBookFactory.range.test.ts + usePdfReaderSession.test.tsx → Test Files 2 passed / Tests 19 passed
test:debug-epubs → Test Files 2 passed (2) / Tests 71 passed (71)
```

## Residual Risks

- Sem timeout de abertura: se o pdf.js travar por outro motivo (não Range), a abertura ainda pode esperar.
- Range falho em página posterior (depois de aberto) continua só com `console.warn`.
- Mock de `getDocument` não exercita o pdf.js real; o efeito de `loadingTask.destroy()` no worker foi confirmado só por leitura de `pdf.mjs` (linha ~11328).

## Recommendation

Segurar até o orquestrador rodar build + suíte completa; se passarem, fechar com a ressalva de validação em device.
