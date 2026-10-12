# Bug Fix: Cancelamento não chega à tradução MyMemory

- **Slug**: cancelamento-nao-chega-traducao-mymemory
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano confirmado

Execução autorizada pelo usuário via orquestrador, sem pausa para confirmação. Plano registrado aqui:

- `fetchWithTimeout`: rejeitar sem despachar se `init.signal` já estiver abortado; compor sinal externo + timeout num controller interno; remover o listener no `finally`; não logar cancelamento do chamador como timeout ou falha de rede.
- `translate()`: checar abort antes de qualquer trabalho; repassar `signal` para todas as chamadas de `translateViaMyMemory` (mymemory direto, premium sem chave, fallback pós-premium, retorno inalcançável).
- `translateViaMyMemory`: aceitar `signal`, enviá-lo via `init.signal`; não logar `translation.failure` quando o motivo é cancelamento.
- Retry do premium: rechecar abort depois do backoff para não gastar a 2ª tentativa.
- Textos divididos: nenhuma mudança em `TranslatedAudiobookService` — o loop para porque `translate()` rejeita no pedaço em andamento e rejeitaria antes de despachar o próximo.

## Summary

O sinal de cancelamento agora chega a todos os caminhos MyMemory, e `fetchWithTimeout` compõe o sinal externo com o timeout em vez de sobrescrevê-lo. Um sinal abortado (antes ou durante a requisição) rejeita com AbortError, sem retry, sem fallback e sem despachar as partes restantes.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/services/http.ts` | modified | Checagem antes de despachar, composição via listener (sem `AbortSignal.any`), remoção do listener no `finally`, cancelamento sem log de timeout/falha; novo helper exportado `toAbortError` |
| `src/services/TranslationService.ts` | modified | Abort checado na entrada, `signal` repassado nos 4 caminhos MyMemory, recheck após o backoff do retry, sem `translation.failure` em cancelamento |
| `src/__tests__/services/http.test.ts` | modified | 4 testes novos (`fetchWithTimeout — signal externo`) |
| `src/__tests__/services/TranslationService.test.ts` | modified | 5 testes novos (`translate — cancelamento (R10)`) |

## Tests Added or Updated

- `http.test.ts::signal já abortado rejeita sem chamar o fetch` — garante que nada é despachado.
- `http.test.ts::abort externo interrompe o fetch em andamento e não loga como timeout` — garante a composição e o diagnóstico correto.
- `http.test.ts::timeout continua valendo com signal externo presente` — garante que não houve regressão no timeout.
- `http.test.ts::remove o listener do signal externo ao terminar` — garante que nenhum listener vaza.
- `TranslationService.test.ts::MyMemory com signal já abortado não despacha a requisição` — cenário da probe R10.
- `TranslationService.test.ts::abort durante a requisição MyMemory interrompe o fetch`
- `TranslationService.test.ts::provider premium com signal já abortado não chama o premium nem o MyMemory`
- `TranslationService.test.ts::abort durante o backoff do premium não gasta o retry nem cai pro MyMemory`
- `TranslationService.test.ts::parágrafo longo dividido: abort no 1º pedaço não despacha os restantes` — usa o `translateParagraphForAudiobook` real.

## Local Verification

- `npx vitest run src/__tests__/services/http.test.ts src/__tests__/services/TranslationService.test.ts` → 33/33 pass.
- Mesmo comando com `http.ts` e `TranslationService.ts` temporariamente revertidos para HEAD → os 8 testes de cancelamento falham e os 25 antigos passam (os testes travam o bug). Arquivos restaurados em seguida.
- Testes dos chamadores de `fetchWithTimeout`/`translate` (AuthorService, NytBooks, GoogleDriveAppData, bookInfo/* (GoogleBooks, OpenLibrary, YouTube…), DeepL, GoogleTranslate, OpenAi, TranslatedAudiobook, TranslationProviderRegistry) junto com os acima → 17 arquivos, 302 testes pass.
- `npx tsc -p tsconfig.app.json --noEmit` → sem erros.
- `npx eslint` nos 4 arquivos alterados → sem erros.

## Deviations from Assessment

- Também foi adicionado um recheck de abort depois do backoff de retry do premium. O assessment cobria "abort não dispara retry" só de forma implícita. É a mesma regra aplicada ao mesmo arquivo, sem escopo novo.
- `toAbortError` foi exportado de `http.ts` para que `translate()` reuse o mesmo formato de erro.

## Follow-ups

- Nenhum chamador atual além da tradução passa `init.signal` para `fetchWithTimeout`. Os serviços de metadados (OpenLibrary/GoogleBooks) agora podem aceitar cancelamento se isso for útil.
- Rodar build e suite completa após todos os bugs P2 (orquestrador).
