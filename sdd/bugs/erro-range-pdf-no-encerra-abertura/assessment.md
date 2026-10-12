# Bug Assessment: Erro de Range em PDF não encerra abertura

- **Slug**: erro-range-pdf-no-encerra-abertura
- **Criado**: 2026-10-12
- **Origem**: `reports/code-review-2026-10-10.md` → R14 (P2, achado estático)
- **Veredito**: valid
- **Severidade**: medium

## Report

Em `createPdfBook`, a falha de leitura em `requestDataRange` cai só em `console.warn`; o transporte do PDF.js não recebe dados nem erro. A factory espera `getDocument().promise` sem guardar a loading task. O cleanup de `usePdfReaderSession` só destrói sessão já aberta. Impacto: Range rejeitado durante a abertura pode deixar o PDF.js esperando bytes que nunca chegam → spinner permanente; sair do leitor marca `cancelled` mas não interrompe a abertura pendente nem libera worker/requests. Não reproduzido em celular (conclusão estática).

## Symptom

Se uma leitura de faixa (HTTP Range do arquivo local ou `Blob.slice`) falha durante a abertura, `createPdfBook` nunca resolve nem rejeita; o leitor fica em "carregando" e o worker/requests ficam vivos mesmo depois de sair. Esperado: abertura rejeita em tempo finito e tudo é liberado em falha ou ao sair.

## Reproduction

1. Mockar `getDocument` para devolver uma loading task cuja `promise` só resolve quando chegam bytes via `transport.onDataRange`.
2. Chamar `createPdfBook(source)` e, durante a abertura, disparar `transport.requestDataRange(...)` com `fetch`/`Blob.slice` rejeitando.
3. Observar: a promessa de `createPdfBook` fica pendente para sempre; só há `console.warn`.

## Suspected Code Paths

- `src/services/pdf/PdfBookFactory.ts:129-138` — `requestDataRange` engole o erro com `console.warn`.
- `src/services/pdf/PdfBookFactory.ts:140-148` — `getDocument(...).promise` sem guardar a loading task; nada a destruir se a abertura não terminar.
- `src/services/pdf/PdfBookFactory.ts:150-170` — `getPage(1)`/`getMetadata`/`getOutline` também dependem de faixas e podem esperar para sempre.
- `src/hooks/usePdfReaderSession.ts:51-82` — cleanup só libera `opened`; não aborta abertura pendente.
- `src/services/pdf/pdfjs.ts:72` — tipo de `getDocument` não expõe `destroy()` da loading task.

## Root Cause Hypothesis

`PDFDataRangeTransport` do pdf.js 4.7 não tem canal de erro (só `onDataRange`/progress); o código não compensa isso fora do pdf.js, e a loading task não é guardada para ser destruída. `PDFDocumentLoadingTask.destroy()` (pdf.mjs:11328) não rejeita necessariamente `promise` depois que o worker está pronto, então é preciso uma corrida explícita com a falha. Confiança: high quanto ao código; o travamento real no device não foi observado.

## Proposed Remediation

**Preferida**:
- `createPdfBook(file, options?: { signal?: AbortSignal })`; guarda a `loadingTask`.
- Falha de Range (fora de abort) rejeita uma promessa de "falha de transporte"; a abertura (documento + 1ª página + metadados + sumário) corre contra ela e contra o `signal`.
- Em qualquer falha/abort durante a abertura: aborta os Range pendentes e destrói a loading task (o que também destrói o documento, se já tiver sido carregado).
- `usePdfReaderSession` cria um `AbortController` por efeito, passa o `signal` e aborta no cleanup; um abort não vira status `error`.
- Tipo `getDocument` em `pdfjs.ts` passa a expor `destroy()`.

**Alternativas**:
- Timeout fixo de abertura — o relatório sugere; deixado como follow-up (precisa definir valor e UX; mais risco de falso positivo em PDF grande no celular).
- Após a abertura, Range falho em páginas posteriores continua só com `console.warn` (o render da página pode esperar) — follow-up, porque tratar exigiria mexer no viewer/renderer.

**Files likely to change**:
- `src/services/pdf/PdfBookFactory.ts`
- `src/services/pdf/pdfjs.ts`
- `src/hooks/usePdfReaderSession.ts`
- `src/__tests__/services/pdf/PdfBookFactory.range.test.ts`
- `src/__tests__/hooks/usePdfReaderSession.test.tsx`

**Tests to add or update**:
- Range falho antes do documento abrir → `createPdfBook` rejeita e a loading task é destruída.
- Range falho depois do documento abrir, durante 1ª página/metadados → rejeita e destrói.
- `signal` abortado durante a abertura → rejeita, aborta os fetches e destrói a loading task.
- Hook: cleanup aborta o `signal` passado a `createPdfBook`; abort não vira `error`.
- Ajustar `toHaveBeenCalledWith(pdfBlob)` dos testes do hook para o novo 2º argumento.

## Risks & Considerations

- Regra da feature 022: só código de PDF muda; EPUB não usa `createPdfBook` (`PdfService`, `PdfBookInfoProvider` e `BookDetailsScreen` usam sem `signal` — parâmetro opcional, comportamento igual salvo a rejeição em erro de Range).
- Depois da abertura, uma falha de Range não deve derrubar a sessão (comportamento atual preservado).

## Open Questions

- Prazo de abertura (timeout) — fora do escopo mínimo.
