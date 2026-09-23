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

**Iteração 2 (durante a fase Test, com evidência de device real)**: log real
de device (`RXCX103NMVZ`) capturado durante o teste manual mostrou o gatilho
de fato em campo: `Speechify error: 429` (rate limit), 2 ocorrências em ~45s
de playback contínuo — consistente com a concorrência do prefetch/lookahead
(feature 020, em execução) batendo no limite de requisições paralelas do
provider. O usuário apontou que esse caso é diferente de rede/servidor/
créditos genuínos: é **autoinfligido** pelo próprio app e tende a se resolver
rápido, então não deveria assentar em nativo tão cedo. Ajuste: 429 entra no
eixo de retry (não só no eixo silencioso) — ganha 1 retry com ~500ms de
respiro (mesmo padrão do prefetch) e, mesmo esgotado o retry pra este chunk,
o próximo chunk volta a tentar premium (não assenta em nativo pro resto da
sessão, diferente de 402/5xx).

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/hooks/useTTS.ts` | modified | `handleAudioError` normaliza `MediaError` numa mensagem reconhecível; `isTransientTtsFailure` ganha `NotAllowedError` + essa mensagem + HTTP 429 (iteração 2); nova `isUserActionableTtsFailure` (eixo 2); `speakChunk` ganha retry de 1 tentativa em falha transiente (playback: cache hit sem nova requisição; 429: requisição nova após ~500ms de respiro — iteração 2); `notifyProviderFallback` (em `play()` e `speakOne()`) passa `silent` no payload; `UseTTSOptions.onProviderFallback` ganha o campo `silent: boolean` |
| `src/screens/ReaderScreen.tsx` | modified | `onProviderFallback` pula toast + `switchToNativeTts()` quando `silent` (mas ainda atualiza `ttsProviderFallback` pro indicador do mini-player refletir a sessão atual) |
| `src/__tests__/hooks/useTTS.test.tsx` | modified | `FakeAudio` ganha `nextPlayErrorCount` (simula falha em N tentativas seguidas); teste antigo de `NotAllowedError` dividido em dois — retry recupera premium (falha só 1x) e fallback silencioso (falha nas 2 tentativas); teste de erro 500 ganha asserção de `silent: true`; 2 testes novos de 429 (iteração 2) — retry recupera, e retry esgotado mantém tentativa premium no próximo chunk |
| `src/__tests__/screens/ReaderScreen.test.tsx` | modified | 3 chamadas existentes de `onProviderFallback` ganham `silent` explícito (network → `true`, key inválida → `false`); novo teste do caminho silencioso completo (sem toast, sem `updateBookSettings`) |

## Tests Added or Updated

- `src/__tests__/hooks/useTTS.test.tsx::retry recupera o premium quando audio.play falha só na primeira tentativa (NotAllowedError)` — trava que 1 falha de playback não derruba a sessão: retry usa cache (sem 2a requisição HTTP), premium volta a tocar, `onProviderFallback` nunca é chamado.
- `src/__tests__/hooks/useTTS.test.tsx::cai pro nativo silenciosamente (sem persistir) quando audio.play falha nas duas tentativas` — trava que, esgotado o retry, o chunk cai pro nativo com `transient: true, silent: true` no payload (2 falhas de playback logadas, uma por tentativa).
- `src/__tests__/hooks/useTTS.test.tsx::usa TTS nativo como fallback quando Speechify falha em um chunk` (atualizado) — trava que HTTP 500 continua com `transient: false` (não retenta o mesmo chunk) mas agora `silent: true` (não é acionável pelo usuário).
- `src/__tests__/screens/ReaderScreen.test.tsx::fallback silencioso (rede/servidor/créditos) cai pro nativo sem avisar nem persistir no livro` — trava o comportamento ponta a ponta na tela: sem toast, `updateBookSettings` nunca chamado, mas o mini-player reflete a troca de provider da sessão atual.
- 3 testes existentes de `ReaderScreen.test.tsx` ajustados pra passar `silent` explícito nas chamadas simuladas, refletindo o que o hook real envia pra cada tipo de razão.
- `src/__tests__/hooks/useTTS.test.tsx::retry com atraso recupera premium quando 429 (rate limit) falha só na primeira tentativa` (iteração 2) — trava que 429 isolado não cai pro nativo: retry faz requisição HTTP nova após o respiro, `onProviderFallback` nunca é chamado.
- `src/__tests__/hooks/useTTS.test.tsx::mantém tentativa de premium no próximo chunk quando 429 persiste nas duas tentativas do chunk atual` (iteração 2) — trava que, mesmo esgotado o retry pra ESTE chunk, o próximo chunk tenta premium de novo (`transient: true`), diferente do 5xx que assenta em nativo pro resto da sessão.

## Local Verification

**Iteração 1:**
- `npm run lint` → limpo, sem erros/avisos.
- `npx tsc -p tsconfig.app.json --noEmit` → sem erros de tipo.
- `npx vitest run src/__tests__/hooks/useTTS.test.tsx` → 26/26 passed.
- `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` → 71/71 passed.
- `npm test` (suite completa) → 1069 passed, 2 skipped (pré-existentes, não relacionados), 0 falhas.
- `npm run build` → `tsc -b` + Vite build concluído sem erro (warning de chunk >500kB é pré-existente, não relacionado a este fix).
- Checagem manual: **não realizada** — não reproduzi em device real nesta fase (ver Follow-ups).

**Iteração 2 (fase Test):**
- Build+install real no device `RXCX103NMVZ` (gradlew assembleDebug + adb install) rodando o fix da iteração 1 — usuário tocou audiobook com Speechify, log capturado via `capture-android-diagnostics.ps1` mostrou 2 eventos `tts.provider.fallback` reais com `errorMessage: "Speechify error: 429"`, `transient: false, silent: true` — confirma que o fix da iteração 1 já eliminava toast+persistência nesse caso real, mas o usuário apontou que 429 autoinfligido não deveria nem assentar em nativo tão rápido.
- `npx tsc -p tsconfig.app.json --noEmit` → sem erros de tipo.
- `npx vitest run src/__tests__/hooks/useTTS.test.tsx` → 28/28 passed.
- `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` → 71/71 passed.
- `npm run lint` → limpo.
- `npm run build` → concluído sem erro.
- `npm test` (suite completa) → rodando em background no momento deste commit de doc; resultado será registrado em `test.md`.

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

**Iteração 2**: durante a fase Test (que é read-only por contrato), a
evidência de device real revelou que a classificação de 429 da iteração 1
(silencioso, mas assentando em nativo pro resto da sessão, igual 402/5xx) não
era suficiente — o usuário pediu tratamento diferenciado porque 429 é
tipicamente autoinfligido pelo próprio app, não uma indisponibilidade real.
Isso reabriu a fase Fix (registrado aqui, não como edição retroativa da
iteração 1) pra mover 429 do eixo "assenta em nativo" pro eixo "retry", com
um respiro de 500ms antes da nova tentativa.

## Follow-ups

- [RESOLVIDO na iteração 2] Capturar uma sessão real em device — feito;
  gatilho confirmado foi HTTP 429 (rate limit), não `NotAllowedError`/
  `MediaError` da camada de playback como a hipótese original sugeria (essa
  classificação continua correta/testada, só não foi o gatilho observado
  nesta sessão específica).
- Investigar se vale limitar a concorrência do prefetch/lookahead (feature
  020, em execução) pra reduzir a frequência de 429 na origem, em vez de só
  reagir a ele — o retry com respiro desta iteração mitiga, mas não elimina
  a causa (concorrência de requisições). Candidato a task da própria feature
  020 ou um novo bug, não deste fix.
- Confirmar se o sintoma também ocorre com ElevenLabs/Fish Audio (mesma
  `playAudioBlob`, mesma lógica de rate limit) ou é mais frequente em
  Speechify — pergunta em aberto do assessment, não verificada nesta fase.
