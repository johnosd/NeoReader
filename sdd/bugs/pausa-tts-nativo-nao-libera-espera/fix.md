# Bug Fix: Pausa do TTS nativo não libera espera de interrupção

- **Slug**: pausa-tts-nativo-nao-libera-espera
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada pelo usuário via orquestrador)

- `pause()` nativo captura o ack da fala em curso antes de `await TextToSpeech.stop()` e o dispara após a confirmação do plugin.
- Cleanup de unmount dispara o ack após o stop do plugin (loop não fica órfão).
- `speakWithNative` não chama `speak()` se pause/stop aconteceu durante `resolveVoiceIndex`.
- `speakWithNative` só limpa `nativeSpeakStopAckRef` se o ref ainda for o seu (retomada não perde o ack novo).
- Testes de regressão em `useTTS.test.tsx`; preservar `waitForMoreChunks`/`wakeChunkWaitRef` (R09).

## Summary

`pause()` (provider nativo) agora libera o `Promise.race` de `speakWithNative` do mesmo jeito que
`stop()`, então a pausa conclui mesmo com `speak()` do plugin nunca resolvendo. Ack é por fala
(capturado antes do await e limpo só pelo dono), para que pause→resume rápido não libere nem apague
o ack da sessão retomada.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/hooks/useTTS.ts` | modified | `pause()` dispara ack capturado; unmount dispara ack após stop; `speakWithNative` checa stop após `resolveVoiceIndex` e usa `clearOwnStopAck()` |
| `src/__tests__/hooks/useTTS.test.tsx` | modified | 2 testes R08 |

## Tests Added or Updated

- `useTTS.test.tsx::pause() nativo conclui mesmo quando speak() nunca resolve apos o stop (R08)` — pausa e loop de play() concluem com `speak()` pendurado.
- `useTTS.test.tsx::ack da pausa nao libera a fala de uma retomada feita antes do stop confirmar (R08)` — confirmação tardia do stop da pausa não termina a sessão retomada, e `stop()` posterior ainda consegue liberá-la.

## Local Verification

- `npx vitest run src/__tests__/hooks/useTTS.test.tsx src/__tests__/hooks/useTtsSleepTimer.test.ts` → 39 passed.
- `npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts reports/code-review-2026-10-10/tts.probe.tsx` → probe R08 agora FALHA em `expect(pauseSettled).toBe(false)` (a pausa conclui = sintoma não reproduz). O probe afirma o comportamento defeituoso, então falhar é o esperado.
- `npx tsc -p tsconfig.app.json --noEmit` → limpo. `npx eslint src/hooks/useTTS.ts src/__tests__/hooks/useTTS.test.tsx` → limpo.

## Deviations from Assessment

- Dois ajustes extras em `speakWithNative` (mesmo arquivo previsto), descobertos ao escrever o teste de pause→resume:
  1. A linha `nativeSpeakStopAckRef.current = () => {}` após o race apagava o ack da sessão retomada (então o `stop()` seguinte travava). Agora só limpa se o ref ainda é o da própria fala.
  2. Checagem `shouldStopRef`/sessão após `resolveVoiceIndex`: sem ela, uma pausa durante a resolução da voz deixaria `speak()` ser chamado após o stop do plugin, sem ack possível.
- Não centralizei stop/pause/teardown num helper único (sugestão do relatório) — mudança mínima; `stop()` ficou intocado.

## Follow-ups

- Validar em device (pausa/retomada rápida no Android) — não executado.
