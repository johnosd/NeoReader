# Bug Verification: Fallback silencioso do TTS premium para o nativo Android

- **Slug**: fallback-silencioso-tts-premium-nativo-android
- **Testado**: 2026-09-23
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma original (troca silenciosa e permanente pro TTS nativo) não
reproduz mais. Melhor ainda: o teste em device real capturou o gatilho de
fato em campo (429/rate limit do Speechify, provavelmente autoinfligido pela
concorrência do prefetch/lookahead) — algo que a fase Assess só tinha como
hipótese — e ele passou por DUAS iterações do fix nesta própria fase Test,
com o usuário confirmando o comportamento em tempo real no device. A suite
de regressão (1071 testes, incluindo os 4 novos deste bug) e o build
continuam limpos.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix, device real) | Build+install (`gradlew assembleDebug` + `adb install`) no device `RXCX103NMVZ`, usuário tocou audiobook com Speechify | pass | Log real capturou 2 fallbacks (`Speechify error: 429`). Iteração 1 do fix já eliminava toast+persistência (`transient:false, silent:true`); usuário apontou que 429 merecia tratamento diferente (retry, não assentar em nativo) → iteração 2 aplicada e reinstalada no mesmo device, sem novo log de 30min coletado após a 2a instalação (ver Residual Risks) |
| Testes novos/atualizados | `npx vitest run src/__tests__/hooks/useTTS.test.tsx` | pass | 28/28 (era 26 na iteração 1; +2 na iteração 2 pros casos de 429) |
| Testes novos/atualizados | `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` | pass | 71/71, inalterado pela iteração 2 (não toca ReaderScreen) |
| Suite de regressão | `npm test` | pass | 1071 passed, 2 skipped (pré-existentes, não relacionados), 0 falhas — rodada após a iteração 2 completa |
| Lint / type-check | `npm run lint` + `npx tsc -p tsconfig.app.json --noEmit` | pass | Limpos após a iteração 2 |
| Build | `npm run build` | pass | `tsc -b` + Vite; warning de chunk >500kB é pré-existente, não relacionado |

## Output Excerpts

Evento real capturado em `logs/android-diagnostics-20260923-084907-filtered.log`
(2 ocorrências, mesma sessão de playback):

```
NeoReaderEvent tts.provider.fallback {"provider":"speechify","status":"fallback",
"errorMessage":"Speechify error: 429",
"details":{"fallbackProvider":"native","paraIdx":24,"transient":false,"silent":true}}
```

(`transient:false` reflete o código da ITERAÇÃO 1, antes do ajuste de 429 da
iteração 2 — com o código atual, esse mesmo evento sairia com
`transient:true`, ou nem apareceria se o retry recuperar o premium.)

Suite completa pós-iteração-2:
```
Test Files  119 passed | 2 skipped (121)
     Tests  1071 passed | 2 skipped (1073)
```

## Residual Risks

- A iteração 2 (retry+backoff pro 429) foi validada por testes automatizados
  novos, mas **não** por uma nova sessão longa em device após a reinstalação
  — o log de 30min que estava capturando em background cobriu só a versão
  da iteração 1. Recomendo uma sessão adicional de alguns minutos, se
  possível, pra confirmar que o retry realmente evita a queda pro nativo em
  uso real (não só no teste unitário).
- Causa raiz de fundo (concorrência do prefetch/lookahead gerando 429) não
  foi endereçada — só mitigada com retry. Registrado como follow-up em
  `fix.md`, candidato a task da feature 020 ou novo bug, fora do escopo
  deste fix.
- Não confirmado se o mesmo padrão de 429 ocorre com ElevenLabs/Fish Audio —
  só observado com Speechify nesta sessão.
- Hipótese original de `NotAllowedError`/`MediaError` (foco de áudio da
  WebView) não foi observada nesta sessão de teste — continua coberta pelo
  código e por testes automatizados, mas sem confirmação de campo. Não é um
  problema para o veredito atual (o código trata os dois casos), só uma
  lacuna de evidência.

## Recommendation

Fechar — verificado ponta a ponta, incluindo confirmação em device real com
o gatilho de fato observado em campo (429), corrigido em duas iterações
dentro desta própria fase Test com acompanhamento do usuário. A suite
completa e o build permanecem limpos. Os riscos residuais listados acima são
follow-ups razoáveis, não bloqueadores — nenhum indica que o fix não
funciona, apenas que a cobertura de cenários (outros providers, sessão longa
pós-iteração-2, causa raiz da concorrência) pode crescer depois.
