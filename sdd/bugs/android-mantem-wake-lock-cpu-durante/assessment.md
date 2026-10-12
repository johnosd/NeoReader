# Bug Assessment: Android mantém wake lock da CPU durante pausa do TTS

- **Slug**: android-mantem-wake-lock-cpu-durante
- **Criado**: 2026-10-12
- **Origem**: texto colado — R15 de `reports/code-review-2026-10-10.md`
- **Veredito**: valid
- **Severidade**: medium

## Report

R15 — P2 — "O serviço adquire `PARTIAL_WAKE_LOCK` sem timeout. Atualizar estado para pausado muda
notificação/MediaSession, mas não libera o lock. O hook preserva deliberadamente o serviço na pausa."
Aceitação: no aparelho, `dumpsys power` mostra liberação na pausa, aquisição na retomada e ausência
após stop/erro; áudio com tela apagada permanece correto. Evidência atual estática.

## Symptom

Com o audiobook pausado (notificação ainda ativa), o `TtsPlaybackService` mantém um
`PARTIAL_WAKE_LOCK` indefinido, impedindo a CPU de dormir até o serviço ser parado.
Esperado: lock só enquanto há reprodução.

## Reproduction

1. Tocar TTS no Android, pausar pela UI/notificação, apagar a tela.
2. `adb shell dumpsys power | findstr NeoReader:TtsPlayback` → lock continua listado.
   (Não executado: análise estática; QA em device fora desta sessão.)

## Suspected Code Paths

- `android/.../TtsPlaybackService.java:124` — `acquireWakeLock()` em `ACTION_START`, sem timeout.
- `android/.../TtsPlaybackService.java:215-219` — `updatePlaybackState(boolean)` só muda `isPlaying`/notificação.
- `src/hooks/useTTS.ts` `pause()`/`resume()` — chamam `updatePlaybackState('paused'|'playing')`; resume nativo chama `play()` → `ACTION_START` (readquire); resume premium só chama `updatePlaybackState('playing')`.
- `MediaSessionCompat.Callback.onPlay` (`TtsPlaybackService.java:~309`) — play pela tela de bloqueio/fone só notifica o JS.

## Root Cause Hypothesis

Confiança: high. O ciclo de vida do lock está amarrado ao ciclo do Service (start/destroy), não ao
estado de reprodução; a pausa mantém o Service vivo de propósito, então o lock fica junto.

## Proposed Remediation

**Preferida**: em `updatePlaybackState(playing)`, chamar `acquireWakeLock()` quando `playing` e
`releaseWakeLock()` quando pausado. Para não perder a retomada pela tela de bloqueio/fone com a tela
apagada (o JS só roda depois que o evento atravessa o bridge), `onPlay` da MediaSession adquire um
lock curto com timeout (janela de graça) antes de notificar o JS; o `acquireWakeLock()` sem timeout
feito pela retomada efetiva cancela o timeout (lock não-contado: `acquire()` remove o releaser
pendente). Stop/erro já liberam: `onDestroy()` e o caminho de `startForeground` negado chamam
`releaseWakeLock()`.

**Alternativas**:
- Lock com timeout fixo sempre — exigiria renovar periodicamente durante a reprodução; rejeitado.
- Liberar no JS (`WakeLockService`) — é FLAG_KEEP_SCREEN_ON, outro mecanismo; não resolve.

**Files likely to change**:
- `android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java`

**Tests to add or update**:
- Não há testes unitários Java para o Service (sem `android/app/src/test` para ele); verificação = compilação + QA em device (`dumpsys power`).

## Risks & Considerations

- Retomada com tela apagada via botão de mídia: coberta pela janela de graça em `onPlay`; validar no device.
- `ACTION_START` continua adquirindo o lock (retomada nativa passa por lá).
- Não mexer em `android/build.gradle`/`android/app/build.gradle` (mudanças do usuário).

## Open Questions

- Nenhuma.
