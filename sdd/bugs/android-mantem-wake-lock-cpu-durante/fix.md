# Bug Fix: Android mantém wake lock da CPU durante pausa do TTS

- **Slug**: android-mantem-wake-lock-cpu-durante
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada pelo usuário via orquestrador)

- `updatePlaybackState(false)` libera o `PARTIAL_WAKE_LOCK`; `updatePlaybackState(true)` readquire.
- `acquireWakeLock(long timeoutMs)`: variante temporária; a versão sem timeout continua usada por `ACTION_START`.
- `MediaSession.onPlay` com reprodução pausada adquire lock de 10 s (janela de graça) antes de notificar o JS.
- Stop/erro: mantidos `releaseWakeLock()` em `onDestroy()` e no `startForeground` negado.
- Verificação: compilar com Gradle offline; QA em device fica `not-run`.

## Summary

O wake lock parcial agora acompanha o estado de reprodução, não só o ciclo de vida do Service:
é liberado quando o JS informa pausa e readquirido ao retomar (pelo `updatePlaybackState('playing')`
do premium ou pelo `ACTION_START` do resume nativo).

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java` | modified | release/acquire em `updatePlaybackState`; `acquireWakeLock(long)`; janela de graça em `onPlay`; constante `RESUME_GRACE_WAKE_LOCK_MS` |

## Tests Added or Updated

- Nenhum teste automatizado: o projeto não tem testes unitários/instrumentados para o Service (só os `Example*Test` do template), e o comportamento depende do `PowerManager` real. Verificação prevista: `dumpsys power` no device.

## Local Verification

- `android\gradlew.bat -p android :app:compileDebugJavaWithJavac --offline` → BUILD SUCCESSFUL (nota "uses or overrides a deprecated API" no arquivo — vem de APIs já usadas antes, ex. `android.support.v4.media`; o código novo usa só `WakeLock.acquire()/acquire(long)`).
- QA em device (`adb shell dumpsys power`) → not-run (sem device nesta sessão).

## Deviations from Assessment

- Nenhuma.

## Follow-ups

- QA no device: tocar → `dumpsys power` lista `NeoReader:TtsPlayback`; pausar → some; retomar (UI, notificação e fone com tela apagada) → volta; parar → some.
- Se o JS não retomar após `onPlay` (nada a retomar), o lock de graça expira sozinho em 10 s.
