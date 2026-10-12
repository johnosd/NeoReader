# Bug Verification: Android mantém wake lock da CPU durante pausa do TTS

- **Slug**: android-mantem-wake-lock-cpu-durante
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

O código Java compila e o lock passou a seguir o estado play/pause por inspeção, mas a reprodução
original (`dumpsys power` no aparelho) **não foi executada** — não há device nesta sessão. Por isso
`partial`, não `verified`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `adb shell dumpsys power` com TTS tocando/pausado/retomado/parado | not-run | sem device conectado nesta sessão |
| Compilação Java | `android\gradlew.bat -p android :app:compileDebugJavaWithJavac --offline` | pass | BUILD SUCCESSFUL |
| Contrato JS do serviço | `npx vitest run src/__tests__/services/TtsPlaybackSessionService.test.ts` | pass | 8/8 (JS não mudou neste bug) |
| Testes automatizados do Service | — | not-run | não existem testes unitários/instrumentados para `TtsPlaybackService` |
| Build web / suite completa / lint global | `npm run build`, `npm test`, `npm run lint` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |

## Output Excerpts

```
> Task :app:compileDebugJavaWithJavac
BUILD SUCCESSFUL
Tests  8 passed (8)
```

## Residual Risks

- Retomada pela tela de bloqueio/fone com tela apagada depende da janela de graça de 10 s em `onPlay`; não validada em device.
- Áudio premium com tela apagada após retomar depende do `updatePlaybackState('playing')` do JS readquirir o lock.

## Recommendation

Segurar até QA em device: tocar/pausar/retomar/parar conferindo `dumpsys power | findstr NeoReader:TtsPlayback`, incluindo retomar pelo fone com a tela apagada.
