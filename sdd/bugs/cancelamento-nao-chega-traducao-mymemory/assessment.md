# Bug Assessment: Cancelamento não chega à tradução MyMemory

- **Slug**: cancelamento-nao-chega-traducao-mymemory
- **Criado**: 2026-10-12
- **Origem**: texto colado — `reports/code-review-2026-10-10.md`, seção "R10 — P2 — Cancelamento não chega à tradução MyMemory"; reprodução em `reports/code-review-2026-10-10/translation.probe.ts` (teste R10)
- **Veredito**: valid
- **Severidade**: medium (P2 no relatório)

## Report

`TranslateOptions` expõe `signal`, mas os caminhos MyMemory não o encaminham.
A função interna chama `fetchWithTimeout(url)` sem cancelamento. O helper HTTP
também substitui `init.signal` pelo controlador de timeout sem compor sinais.
Evidência: sinal já abortado ainda despacha a requisição e retorna sucesso.
Aceitação: sinal já abortado não despacha; abort interrompe request; não há
retry/fallback nem próximas partes depois de cancelar.

## Symptom

`translate(..., { provider: 'mymemory', signal })` com `signal` já abortado
(ou abortado durante a requisição) despacha/continua o HTTP do MyMemory e
resolve com sucesso. Esperado: rejeitar com AbortError sem despachar, e
interromper a requisição em andamento.

## Reproduction

1. `fetch` simulado retornando sucesso MyMemory.
2. `const c = new AbortController(); c.abort()`.
3. `await translate('Synthetic', 'en', 'pt-BR', { provider: 'mymemory', signal: c.signal })` → resolve `'Sintético'` e `fetch` é chamado 1x sem `init` (probe R10).

## Suspected Code Paths

- `src/services/TranslationService.ts:93` — `translateViaMyMemory(...)` chamado sem signal (caminho mymemory e fallback sem chave, linha ~99).
- `src/services/TranslationService.ts:174/180` — fallback pós-premium e retorno inalcançável, também sem signal.
- `src/services/TranslationService.ts:207` (`translateViaMyMemory`) — `fetchWithTimeout(url)` sem `init.signal`.
- `src/services/http.ts:45` — `{ ...options.init, signal: controller.signal }` sobrescreve qualquer `init.signal` do chamador.
- `src/services/TranslatedAudiobookService.ts:62` — loop de pedaços de parágrafos longos; depende de `translate()` rejeitar quando abortado para não despachar as partes restantes.

## Root Cause Hypothesis

Confiança: high. O `signal` só foi ligado ao caminho premium; `translateViaMyMemory`
não recebe parâmetro de cancelamento e `fetchWithTimeout` nunca suportou um
sinal externo (todos os chamadores atuais só usam timeout, por isso ninguém
notou o overwrite).

## Proposed Remediation

**Preferida**:
- `translate()`: checar `signal.aborted` antes de qualquer trabalho (cache/dispatch) e lançar AbortError; repassar `signal` para todas as chamadas de `translateViaMyMemory`.
- `translateViaMyMemory`: aceitar `signal`, passar via `init.signal`; não logar `translation.failure` quando o motivo for cancelamento.
- `fetchWithTimeout`: compor timeout + `init.signal` externo num único controller interno (listener `abort` no sinal externo, abort imediato se já abortado), remover o listener no `finally`; distinguir cancelamento de timeout no diagnóstico.
- Abort não dispara fallback/retry (o caminho premium já checa `signal.aborted` no catch; o fallback para MyMemory agora recebe o mesmo sinal e rejeita de imediato).
- Textos divididos: como `translate()` passa a rejeitar com sinal abortado antes de despachar, o loop de `translateParagraphForAudiobook` para no próximo pedaço sem mudança nesse arquivo.

**Alternativas**:
- `AbortSignal.any([timeout, external])` — mais curto, mas suporte em WebView Android antigo/jsdom é incerto; preferido o listener manual.

**Files likely to change**:
- `src/services/TranslationService.ts`
- `src/services/http.ts`
- `src/__tests__/services/TranslationService.test.ts`
- `src/__tests__/services/http.test.ts`

**Tests to add or update**:
- MyMemory com sinal já abortado não chama `fetch` e rejeita.
- Abort durante a requisição MyMemory rejeita (fetch recebe sinal que aborta).
- Premium + abort não cai para MyMemory (já existe) e sinal pré-abortado não chama o premium.
- Parágrafo longo dividido: abort durante o 1º pedaço não despacha os restantes.
- `fetchWithTimeout`: sinal externo aborta o fetch; sinal pré-abortado rejeita; listener removido no fim; timeout continua funcionando com sinal externo presente.

## Risks & Considerations

- Outros chamadores de `fetchWithTimeout` (AuthorService, GoogleBooks, OpenLibrary, NYT, YouTube, GoogleDriveAppData) não passam `init.signal` hoje — composição é retrocompatível.
- `ReaderScreen` já ignora rejeição por abort (a UI descarta); mudar de "resolve" para "rejeita com AbortError" só elimina trabalho descartado.
- Cache hit com sinal abortado passa a rejeitar — aceitável (o chamador já cancelou).

## Open Questions

- Nenhuma.
