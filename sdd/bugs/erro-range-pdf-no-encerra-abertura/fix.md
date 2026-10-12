# Bug Fix: Erro de Range em PDF não encerra abertura

- **Slug**: erro-range-pdf-no-encerra-abertura
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada pelo usuário sem pausa)

- `createPdfBook(file, { signal? })` guarda a loading task do pdf.js.
- Falha de Range (HTTP ou `Blob.slice`) rejeita uma promessa `openingFailed`; documento, 1ª página, metadados e sumário correm contra ela.
- Abort do `signal` também rejeita `openingFailed` (AbortError).
- Em falha/abort durante a abertura: aborta Range pendentes e chama `loadingTask.destroy()`.
- Após a abertura, falha de Range continua só com `console.warn` e abort do signal não derruba a sessão.
- Hook passa um `AbortController` por efeito e aborta no cleanup.

## Summary

A abertura de PDF agora termina em tempo finito quando uma leitura de faixa falha ou quando o usuário sai do leitor: `createPdfBook` rejeita e destrói a loading task (transporte + worker), em vez de esperar para sempre por bytes que não chegam.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/services/pdf/PdfBookFactory.ts` | modified | `CreatePdfBookOptions { signal }`, `openingFailed` + `untilFailure` (race), `loadingTask` guardada, `abandonOpening()` em falha; listener de abort removido ao concluir |
| `src/services/pdf/pdfjs.ts` | modified | Tipo de `getDocument` expõe `destroy()` da loading task |
| `src/hooks/usePdfReaderSession.ts` | modified | `AbortController` por efeito; `signal` passado a `createPdfBook`; `abort()` no cleanup |
| `src/__tests__/services/pdf/PdfBookFactory.range.test.ts` | modified | 6 testes novos (describe "abertura com falha de Range / abort") |
| `src/__tests__/hooks/usePdfReaderSession.test.tsx` | modified | 1 teste novo; 2 `toHaveBeenCalledWith` ajustados para o novo 2º argumento |

## Tests Added or Updated

- `PdfBookFactory.range.test.ts::erro no 1º Range (documento ainda não aberto) rejeita a abertura e destrói a loading task`
- `::erro de Range depois do documento abrir (1ª página) também rejeita e destrói`
- `::erro em slice() de Blob durante a abertura rejeita`
- `::abort do signal durante a abertura rejeita, cancela os Range pendentes e destrói a loading task`
- `::signal já abortado não chega a abrir o documento`
- `::depois de aberto, erro de Range ou abort não derruba a sessão (só book.destroy libera)` — preserva o comportamento pós-abertura.
- `usePdfReaderSession.test.tsx::sair durante a abertura aborta o signal passado a createPdfBook e não vira status error`

## Local Verification

- `npx vitest run src/__tests__/services/pdf src/__tests__/hooks/usePdfReaderSession.test.tsx src/__tests__/services/bookInfo/PdfBookInfoProvider.test.ts` → 11 arquivos, 106 testes passando.
- `npx vitest run` em `pdfPageMapping`, `PdfPageViewer.contract`, `PdfTextModeViewer`, `BookDetailsScreen`, `ReaderScreen` → 5 arquivos, 247 testes passando.
- `npx tsc -p tsconfig.app.json --noEmit` → sem erros.
- `npx eslint` nos 5 arquivos alterados → sem erros.
- `npm run test:debug-epubs` → 71/71 (EPUB sem regressão — regra da feature 022).

## Deviations from Assessment

- Nenhuma de escopo. Detalhe: o `catch` pós-abertura passou de `pdf.destroy()` para `loadingTask.destroy()` (no pdf.js 4.7 `PDFDocumentProxy.destroy()` delega para a loading task — mesmo efeito, e cobre também o caso de o documento não ter aberto).

## Follow-ups

- Prazo (timeout) de abertura — não implementado.
- Falha de Range depois da abertura (render de página posterior) continua só com `console.warn`; o render daquela página pode esperar indefinidamente.
- Validação em device com arquivo local sumindo durante a abertura.
