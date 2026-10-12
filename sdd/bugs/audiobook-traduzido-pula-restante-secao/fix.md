# Bug Fix: Audiobook traduzido pula o restante da seção

- **Slug**: audiobook-traduzido-pula-restante-secao
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada sem pausas pelo usuário)

- `useTTS` ganha opção opcional `waitForMoreChunks` e espera por ela no fim momentâneo do array.
- A espera é interrompível por `stop()`/`pause()` via `wakeChunkWaitRef` (sem tocar no `Promise.race`/`nativeSpeakStopAckRef`).
- `'interrupted'` (cancelamento/erro do produtor) encerra sem `onFinished`; `'end'` mantém o fim natural.
- `useTranslatedAudiobook` guarda a promessa do prefetch em voo e expõe `waitForMoreChunks()`.
- `ReaderScreen` liga a opção só quando a sessão traduzida está ativa; teste de regressão com os hooks reais.

## Summary

O loop de `useTTS.play()` passou a perguntar ao produtor de chunks se há mais
texto a caminho antes de declarar o fim da seção. Na leitura traduzida, ele
espera o prefetch do próximo parágrafo e retoma a fala quando os chunks chegam;
stop/pause/cancelamento/erro durante a espera encerram sem avançar de seção.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/hooks/useTTS.ts` | modified | Tipo `TtsChunkWaitResult`; opção `waitForMoreChunks`; helper `waitForMoreChunks(chunks, index, session)`; loop `for` sem condição de saída fixa (espera ao chegar no fim); `wakeChunkWaitRef` disparado em `stop()`/`pause()`; `onFinished` não dispara quando a fonte foi interrompida; pausa durante a espera grava `lastChunkIdx` = próximo chunk. |
| `src/hooks/useTranslatedAudiobook.ts` | modified | Tipo `TranslatedChunkWaitResult`; `pendingAdvanceRef` com a promessa do prefetch (`'more'`/`'end'`/`'interrupted'`); `waitForMoreChunks()` exposto; ref limpa em `startSession`/`cancel`. |
| `src/screens/ReaderScreen.tsx` | modified | Passa `waitForMoreChunks` ao `useTTS`: delega ao audiobook traduzido quando ativo, senão `'end'` imediato. |
| `src/__tests__/hooks/useTranslatedAudiobookPlayback.test.tsx` | added | Regressão adaptada do probe R09 (expectativa invertida) + cancelamento/erro. |

## Tests Added or Updated

- `useTranslatedAudiobookPlayback.test.tsx::não encerra a seção enquanto a tradução está pendente e retoma quando ela chega` — o cenário R09: fala 'Segundo.' depois que a tradução resolve; `onFinished` só no fim real.
- `::stop() durante a espera encerra a sessão sem onFinished e ignora a tradução tardia`
- `::pause() durante a espera resolve sem travar e deixa o próximo chunk como posição de retomada`
- `::erro do produtor durante a espera chama onFatalFailure e não avança de seção`
- `::cancel() da sessão traduzida durante a espera não é tratado como fim natural`
- `::fim real da seção (sem mais parágrafos) ainda chama onFinished`

## Local Verification

- `npx vitest run src/__tests__/hooks/useTranslatedAudiobookPlayback.test.tsx` → 6/6 pass.
- Mesmo arquivo com a linha `waitForMoreChunks: translated.waitForMoreChunks` removida (cópia temporária, já apagada) → 5 de 6 falham (só "fim real" passa) — o teste de fato pega o bug.
- `npx vitest run src/__tests__/hooks/useTTS.test.tsx src/__tests__/hooks/useTranslatedAudiobookPlayback.test.tsx src/__tests__/screens/ReaderScreen.test.tsx src/__tests__/hooks/useTtsSleepTimer.test.ts` → 4 arquivos, 163 testes pass.
- `npx vitest run src/__tests__/services/TranslatedAudiobookService.test.ts` → 8/8 pass.
- `npx tsc -p tsconfig.app.json --noEmit` → exit 0.
- `npx eslint` nos 4 arquivos alterados → exit 0.
- Probe original (`reports/code-review-2026-10-10/tts.probe.tsx -t R09`) continua "passando" porque o harness dele não liga a opção nova (replica a fiação antiga do ReaderScreen) — não é evidência de bug remanescente.
- `npm run build` / `npm test` completos: não rodados (restrição de coordenação com outros agentes no mesmo working tree).

## Deviations from Assessment

Nenhuma. Arquivos alterados = os listados no assessment + o teste novo previsto.

## Follow-ups

- QA em device: leitura traduzida com rede lenta (ou throttling) em capítulo de diálogos curtos; conferir também pausa/stop durante a espera e o provider premium.
- Retomada após pausa na espera: se a tradução ainda não chegou, `resume()` nativo devolve `false` e o `ReaderScreen` recomeça em `min(lastChunkIdx, len-1)`, repetindo a última frase falada antes de voltar a esperar. Menor; não tratado para manter a mudança mínima.
- Se o prefetch não estiver em voo ao chegar no fim (ex.: guarda de `inFlightParagraph` pulou o disparo), `waitForMoreChunks` devolve `'end'` como antes — não dispara tradução nova.
- O probe R09 em `reports/` pode ser atualizado para passar `waitForMoreChunks` se quiserem reusá-lo.
