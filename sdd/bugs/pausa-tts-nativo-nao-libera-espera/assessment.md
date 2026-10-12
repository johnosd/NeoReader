# Bug Assessment: Pausa do TTS nativo não libera espera de interrupção

- **Slug**: pausa-tts-nativo-nao-libera-espera
- **Criado**: 2026-10-12
- **Origem**: texto colado — R08 de `reports/code-review-2026-10-10.md` (reprodução em `reports/code-review-2026-10-10/tts.probe.tsx`)
- **Veredito**: valid
- **Severidade**: medium

## Report

R08 — P2 — "O código prevê `speak()` nativo pendente após interrupção: usa `Promise.race`
com confirmação local de stop. `stop()` aciona essa confirmação após o plugin responder.
`pause()` chama o plugin e espera `playbackDone`, mas não aciona a confirmação."
Aceitação: pausa conclui mesmo que `speak()` não resolva sozinho; não sobra listener/loop;
repetir pause/stop/resume não provoca callback tardio.

## Symptom

No provider nativo (Android), `pause()` chama `TextToSpeech.stop()` e fica esperando
`playbackDone`, mas como o plugin não resolve `speak()` após `stop()`, a promise de `pause()`
nunca conclui e o loop de play fica órfão. Esperado: pausa conclui assim que o plugin confirma o stop.

## Reproduction

1. Mock de `TextToSpeech.speak` que nunca resolve (comportamento real do plugin Android após stop).
2. `play([chunk])` com provider `native`; depois `pause()`.
3. `TextToSpeech.stop` é chamado, mas a promise de `pause()` não resolve; só um `stop()` posterior libera.
   (Probe R08 em `tts.probe.tsx` confirma.)

## Suspected Code Paths

- `src/hooks/useTTS.ts:692-708` — `speakWithNative` faz `Promise.race([speak, stopAckPromise])`, liberada por `nativeSpeakStopAckRef`.
- `src/hooks/useTTS.ts:1050-1075` (`pause`) — chama `TextToSpeech.stop()` + `await playbackDone` sem acionar `nativeSpeakStopAckRef`.
- `src/hooks/useTTS.ts:1131-1141` (`stop`) — único caminho que aciona o ack.
- `src/hooks/useTTS.ts:365-390` (cleanup de unmount) — chama `TextToSpeech.stop()` sem ack (loop fica órfão após desmontar).

## Root Cause Hypothesis

Confiança: high. O mecanismo de ack foi adicionado apenas no `stop()`; `pause()` (e o teardown
de unmount) reutilizam `TextToSpeech.stop()` mas não sinalizam o ack, então o `Promise.race`
em `speakWithNative` nunca vence e `playbackDone` não resolve.

## Proposed Remediation

**Preferida**: em `pause()` (provider nativo), capturar o ack corrente **antes** de
`await TextToSpeech.stop()` (proteção por sessão: se o usuário retomar enquanto o stop está
pendente, um `play()` novo registra outro ack que não deve ser disparado) e chamá-lo após o
plugin confirmar. Fazer o mesmo no cleanup de unmount (`.then(ack)`), para não deixar o loop órfão.
O ack é idempotente (resolver uma promise já resolvida é no-op).

**Alternativas**:
- Extrair helper `stopNativeAndAck()` usado por stop/pause/teardown — mais "centralizado" como sugere o relatório, mas muda `stop()` também (fora do mínimo). Rejeitado por escopo.
- Timeout na espera de `playbackDone` — mascara o problema; rejeitado.

**Files likely to change**:
- `src/hooks/useTTS.ts`
- `src/__tests__/hooks/useTTS.test.tsx`

**Tests to add or update**:
- `pause()` nativo resolve com `speak()` que nunca resolve; `play()` também resolve (loop não fica órfão).
- `pause()` → `resume()` → a pausa antiga não libera o `speak` da sessão nova.

## Risks & Considerations

- Preservar `waitForMoreChunks`/`wakeChunkWaitRef` (R09, commit 5e9e594) — `pause()` já chama `wakeChunkWaitRef.current()`; não mexer.
- Após ack, `speakWithNative` retorna e o loop checa `shouldStopRef` (já true na pausa) → sai sem avançar o chunk; `lastChunkIdxRef` continua no chunk interrompido (retomada recomeça nele).

## Open Questions

- Nenhuma.
