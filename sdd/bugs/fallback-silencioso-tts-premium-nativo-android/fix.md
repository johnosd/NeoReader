# Bug Fix: Fallback silencioso do TTS premium para o nativo Android

- **Slug**: fallback-silencioso-tts-premium-nativo-android
- **Corrigido**: 2026-09-23
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Separou a classificação de falha do TTS premium em dois eixos independentes:
(1) **retry na sessão** — falha de playback do `<audio>` (`NotAllowedError`,
`MediaError`) entra no mesmo grupo de `AbortError`/rede, ganha 1 retry no
chunk atual e não derruba a sessão pro nativo permanentemente; (2) **avisar +
persistir no livro** — passa a valer só pra falha acionável pelo usuário (key
inválida, voz ausente, request malformado). Falha de rede/servidor/limite/
créditos (402/429/5xx) cai pro nativo **nesta sessão**, sem toast e sem
gravar `ttsProvider: 'native'` no livro — decisão de produto confirmada com o
usuário durante esta fase (registrada em `assessment.md`), que muda a
remediação original prevista.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/hooks/useTTS.ts` | modified | `handleAudioError` normaliza `MediaError` numa mensagem reconhecível; `isTransientTtsFailure` ganha `NotAllowedError` + essa mensagem; nova `isUserActionableTtsFailure` (eixo 2); `speakChunk` ganha retry de 1 tentativa em falha transiente (2a tentativa é cache hit, sem nova requisição HTTP); `notifyProviderFallback` (em `play()` e `speakOne()`) passa `silent` no payload; `UseTTSOptions.onProviderFallback` ganha o campo `silent: boolean` |
| `src/screens/ReaderScreen.tsx` | modified | `onProviderFallback` pula toast + `switchToNativeTts()` quando `silent` (mas ainda atualiza `ttsProviderFallback` pro indicador do mini-player refletir a sessão atual) |
| `src/__tests__/hooks/useTTS.test.tsx` | modified | `FakeAudio` ganha `nextPlayErrorCount` (simula falha em N tentativas seguidas); teste antigo de `NotAllowedError` dividido em dois — retry recupera premium (falha só 1x) e fallback silencioso (falha nas 2 tentativas); teste de erro 500 ganha asserção de `silent: true` |
| `src/__tests__/screens/ReaderScreen.test.tsx` | modified | 3 chamadas existentes de `onProviderFallback` ganham `silent` explícito (network → `true`, key inválida → `false`); novo teste do caminho silencioso completo (sem toast, sem `updateBookSettings`) |

## Tests Added or Updated

- `src/__tests__/hooks/useTTS.test.tsx::retry recupera o premium quando audio.play falha só na primeira tentativa (NotAllowedError)` — trava que 1 falha de playback não derruba a sessão: retry usa cache (sem 2a requisição HTTP), premium volta a tocar, `onProviderFallback` nunca é chamado.
- `src/__tests__/hooks/useTTS.test.tsx::cai pro nativo silenciosamente (sem persistir) quando audio.play falha nas duas tentativas` — trava que, esgotado o retry, o chunk cai pro nativo com `transient: true, silent: true` no payload (2 falhas de playback logadas, uma por tentativa).
- `src/__tests__/hooks/useTTS.test.tsx::usa TTS nativo como fallback quando Speechify falha em um chunk` (atualizado) — trava que HTTP 500 continua com `transient: false` (não retenta o mesmo chunk) mas agora `silent: true` (não é acionável pelo usuário).
- `src/__tests__/screens/ReaderScreen.test.tsx::fallback silencioso (rede/servidor/créditos) cai pro nativo sem avisar nem persistir no livro` — trava o comportamento ponta a ponta na tela: sem toast, `updateBookSettings` nunca chamado, mas o mini-player reflete a troca de provider da sessão atual.
- 3 testes existentes de `ReaderScreen.test.tsx` ajustados pra passar `silent` explícito nas chamadas simuladas, refletindo o que o hook real envia pra cada tipo de razão.

## Local Verification

- `npm run lint` → limpo, sem erros/avisos.
- `npx tsc -p tsconfig.app.json --noEmit` → sem erros de tipo.
- `npx vitest run src/__tests__/hooks/useTTS.test.tsx` → 26/26 passed.
- `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` → 71/71 passed.
- `npm test` (suite completa) → 1069 passed, 2 skipped (pré-existentes, não relacionados), 0 falhas.
- `npm run build` → `tsc -b` + Vite build concluído sem erro (warning de chunk >500kB é pré-existente, não relacionado a este fix).
- Checagem manual: **não realizada** — não reproduzi em device real nesta fase (ver Follow-ups).

## Deviations from Assessment

A remediação **preferida** original do `assessment.md` (antes da correção de
escopo do usuário) propunha só ampliar o eixo de retry e deixar HTTP 429/5xx
de fora por conflitarem com o teste de erro 500. Durante esta fase, o usuário
esclareceu que falha de rede/servidor/créditos **deve** cair pro nativo
automaticamente — a pergunta em aberto era só se isso deveria continuar
gravando `ttsProvider: 'native'` no livro, e a resposta foi não. Isso levou a
um desenho com **dois eixos independentes** (retry vs. avisar+persistir) em
vez de um único booleano `transient`, o que na prática *resolveu* o conflito
com o teste de 500 em vez de exigir contorná-lo: o eixo de retry (se o
próximo chunk tenta premium de novo) ficou inalterado pra 5xx; só o eixo de
aviso/persistência mudou. Essa decisão está registrada em
`assessment.md` → "Correção de escopo do usuário" e refletida na seção
"Proposed Remediation" já atualizada lá (não ficou como desvio silencioso).

Fora isso, o fix ficou dentro dos arquivos previstos em "Files likely to
change" — nenhuma expansão de escopo não registrada.

## Follow-ups

- Capturar uma sessão real em device (skill `android-debug`, filtrando
  `tts.provider.fallback` no logcat) pra confirmar se `NotAllowedError`/
  `MediaError` da camada de playback é de fato o gatilho observado em campo,
  ou se há uma causa adicional ainda não mapeada — não bloqueou este fix
  (a classificação de 402/429/5xx já cobre o "mesmo com créditos
  disponíveis" do report, independente da confirmação).
- Confirmar se o sintoma também ocorre com Speechify/Fish Audio (mesma
  `playAudioBlob`) ou é específico de ElevenLabs — pergunta em aberto do
  assessment, não verificada nesta fase.
- Rodar a fase Test do `sdd-bugfix` pra validar contra o sintoma original,
  idealmente com uma sessão longa em device real (tela apagada, provider
  premium, 30+ min) além da suíte automatizada.
