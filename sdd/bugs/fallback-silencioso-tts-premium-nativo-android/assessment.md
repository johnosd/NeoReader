# Bug Assessment: Fallback silencioso do TTS premium para o nativo Android

- **Slug**: fallback-silencioso-tts-premium-nativo-android
- **Criado**: 2026-09-23
- **Origem**: `.planning/backlog.md` → Ideias Futuras (triado antes via
  `sdd-assess`, veredito `go`; ver
  `sdd/assessments/fallback-silencioso-tts-premium-nativo-android/decision.md`)
- **Veredito**: valid
- **Severidade**: high

## Report

> Investigar a troca não intencional e silenciosa do TTS Premium (ex. Eleven
> Labs) para o TTS default do Android após alguns minutos. Isso ocorre sem
> erros visíveis no app e mesmo com saldo de créditos disponível na
> plataforma Premium.

## Symptom

Durante audiobook com provider premium (ElevenLabs/Speechify/Fish Audio), a
voz troca para o TTS nativo do Android depois de alguns minutos, sem
mensagem de erro perceptível — mesmo com créditos disponíveis no provider.
Esperado: a voz premium continuar tocando (ou, se falhar, o usuário ser
avisado de forma que dê pra perceber e o provider voltar a ser tentado depois).

## Reproduction

1. Configurar um provider premium (ex. ElevenLabs) com key válida e créditos.
2. Iniciar audiobook num livro, deixar tocando alguns minutos — cenário
   relatado inclui tela apagada / app em segundo plano (uso típico de
   audiobook, feature 001).
3. Em algum momento a voz muda para a do Android; reabrir o app mostra que
   `ttsProvider` do livro virou `native`.

[NEEDS CLARIFICATION: não reproduzido em device nesta fase — Assess é
read-only. O mecanismo abaixo está confirmado por leitura de código; o
gatilho exato (qual erro específico) não foi capturado via log real.]

## Suspected Code Paths

- `src/hooks/useTTS.ts:132-141` (`isTransientTtsFailure`) — só classifica
  como transiente `AbortError` e mensagens contendo "failed to fetch" /
  "networkerror". Qualquer outro erro (inclusive os de playback abaixo) é
  tratado como permanente.
- `src/hooks/useTTS.ts:454-463` (`playAudioBlob` → `handleAudioError`) — erro
  do evento `'error'` do `<audio>` (`audio.error`, um `MediaError`) é
  repassado como está. `MediaError` não é `DOMException` nem `Error`, então
  `getErrorMessage` (linha 76-80) cai no `String(error)` genérico
  (`"[object MediaError]"`), sem informação útil pra classificar ou explicar.
- `src/hooks/useTTS.ts:472` (`void audio.play().catch(finish)`) — se o
  `<audio>` compartilhado (`sharedPremiumAudioElementRef`) for retomado
  depois que o Chromium já suspendeu por perda de foco de áudio (ver
  `feedback_webview_audio_focus.md`: "Chromium já pausa/retoma `<audio>`
  sozinho em foco de áudio"), `.play()` pode rejeitar com
  `NotAllowedError` — não é `AbortError`, então também cai como permanente.
- `src/hooks/useTTS.ts:697-741` (`speakChunk`) — uma falha em UM chunk decide
  o provider da sessão inteira: se não-transiente, `usedProvider: 'native'`
  é propagado e o loop em `play()` (linha 893-894) troca
  `playbackProvider` pro resto da sessão. Não há retry no chunk principal
  (só o prefetch tem 1 retry, linhas 774-799).
- `src/screens/ReaderScreen.tsx:614-622` (`onProviderFallback`) — em falha
  não-transiente, chama `switchToNativeTts()`
  (`src/hooks/useReaderAppearance.ts:231-235`), que grava
  `ttsProvider: 'native'` no livro via `updateBookSettings`. A troca fica
  permanente mesmo reabrindo o livro depois.
- `src/screens/ReaderScreen.tsx:1703-1706` (`TtsFallbackToast`) — desaparece
  sozinho em 6,5 s e só aparece uma vez por provider por sessão de leitura
  (`ttsFallbackNoticeShownRef`). Com a tela apagada (uso típico de
  audiobook), o aviso nunca é visto.

## Root Cause Hypothesis

**Confiança: medium.** O mecanismo que torna a troca *silenciosa e
permanente* está confirmado por leitura de código com alta confiança:
qualquer erro que não seja `AbortError`/erro de rede — incluindo erros da
camada de **playback** do `<audio>` (não só da API de síntese) — derruba a
sessão premium inteira, persiste `native` no livro, e o único aviso some em
6,5 s. Isso por si só já é um bug reproduzível na leitura do código,
independente da causa exata.

A hipótese mais provável para o **gatilho** específico é uma interação com
foco de áudio da WebView: o app reaproveita um único elemento `<audio>` para
todos os chunks premium (comentário em `useTTS.ts:224-226`, decisão tomada
justamente para não confundir o foco de áudio nativo). Se o Chromium
suspende esse `<audio>` sozinho ao perder foco (já documentado como
comportamento observado — `feedback_webview_audio_focus.md`) durante
segundos/minutos de app em segundo plano, uma tentativa seguinte de
`audio.play()` pode ser rejeitada com `NotAllowedError` pela política de
autoplay do Chromium (retomar mídia via script sem gesto do usuário, com a
página não em primeiro plano). Isso bate com todos os detalhes do report:
"depois de alguns minutos" (tempo até a WebView ficar em segundo plano o
bastante), "sem erros visíveis" (o toast de 6,5 s passa despercebido com
tela apagada, e a mensagem cairia no bucket genérico
`tts.fallbackReason.unexpected` por não ser reconhecida), e "com créditos
disponíveis" (não é erro de autenticação/cota — é um erro que nunca chega a
bater na API).

**Correção de escopo do usuário (2026-09-23)**: falha por rede/servidor/
créditos **deve** cair pro nativo automaticamente — isso é comportamento
correto, não o bug. O bug é: (a) isso acontece por uma causa que NÃO é
rede/servidor/créditos (a hipótese de playback acima) e é tratado do mesmo
jeito sem ninguém saber por quê; e (b) mesmo os casos legítimos de rede/
servidor/créditos hoje avisam (toast) e gravam a troca no livro
permanentemente — o usuário confirmou que, pra esses três, o fallback deve
ser automático e silencioso, **sem persistir** no livro (a sessão de leitura
seguinte deve tentar o premium de novo sozinha; só fica presa em nativo
enquanto a causa durar). Isso muda a remediação: em vez de decidir "422/429/
5xx são transientes ou não" como um único eixo (o que geraria o conflito com
o teste citado abaixo), a classificação passa a ter **dois eixos
independentes** — decisão tomada com o usuário, documentada aqui em vez de
inferida:

1. **Retry na sessão** (chunk seguinte tenta premium de novo ou a sessão
   assenta em nativo pro resto do playback) — critério inalterado:
   `AbortError`/texto de rede continuam retryable; **adiciona-se**
   `NotAllowedError` (rejeição de `.play()`) e o erro normalizado de
   `MediaError` (evento `'error'` do `<audio>`) a este mesmo grupo.
2. **Avisar (toast) + persistir no livro** (`switchToNativeTts`) — passa a
   ser restrito a causas **acionáveis pelo usuário**: key inválida/não
   configurada, voz ausente/rejeitada, request malformado, erro
   inesperado/não reconhecido. HTTP 402 (sem créditos), 429 (rate limit) e
   5xx (servidor) saem desse grupo: continuam assentando em nativo pro resto
   *desta* sessão (evita martelar a API), mas **não** avisam nem persistem
   — a assinatura de `onProviderFallback` ganha um campo `silent: boolean`
   pra carregar essa decisão até o `ReaderScreen`.

Esse desenho resolve o conflito que existia antes entre "reclassificar 5xx"
e o teste `useTTS.test.tsx:938`: aquele teste verifica o eixo 1 (não tenta
Speechify de novo no chunk seguinte após um 500), que continua **inalterado**
— só o eixo 2 (aviso/persistência) muda pra esse caso.

**Preferida**: implementar os dois eixos acima em `isTransientTtsFailure`
(eixo 1, ampliado) + uma nova função de classificação "acionável pelo
usuário" (eixo 2) em `useTTS.ts`; `notifyProviderFallback` passa `silent`
pro callback; `ReaderScreen.onProviderFallback` pula aviso+persistência
quando `silent`. Adicionar 1 retry no chunk principal em falha do eixo 1
(espelhando o retry que o prefetch já tem), já que essas falhas costumam ser
momentâneas.

**Alternativas**:
- Circuit breaker (N falhas seguidas antes de cair pro nativo) — maior
  escopo, considerada no `decision.md` do assessment original como
  abordagem separada; não faz parte deste fix.

**Files likely to change**:
- `src/hooks/useTTS.ts` (`isTransientTtsFailure` ampliado; nova função de
  classificação "acionável"; `getErrorMessage`/`handleAudioError` — normalizar
  `MediaError` numa mensagem reconhecível; `notifyProviderFallback` — novo
  campo `silent`; retry no chunk principal em falha do eixo 1)
- `src/screens/ReaderScreen.tsx` (`onProviderFallback` — pular toast +
  `switchToNativeTts` quando `silent`)

**Tests to add or update**:
- Novo: `audio.play()` rejeitando com `NotAllowedError` → chunk seguinte
  tenta premium de novo, `updateBookSettings` NÃO é chamado com
  `ttsProvider: 'native'`.
- Novo: evento `'error'` do `<audio>` (`MediaError`) → mesmo tratamento do
  eixo 1 acima.
- Novo: falha do eixo 1 no chunk principal → 1 retry antes de cair pro
  nativo (mirror do teste de retry do prefetch).
- Novo: HTTP 402/429/5xx → `onProviderFallback` chamado com `silent: true`;
  em `ReaderScreen.test.tsx`, esse caso NÃO deve chamar `updateBookSettings`
  nem mostrar `TtsFallbackToast`.
- Atualizar `useTTS.test.tsx:885`/`:938` (erro HTTP 500) — eixo 1
  (retry/assentar em nativo) continua igual; adicionar asserção de
  `silent: true` no payload de `onProviderFallback` pra refletir o eixo 2
  novo.
- Atualizar `ReaderScreen.test.tsx` — casos que hoje chamam
  `onProviderFallback` com razão de rede (`'Falha de rede ao conectar com
  Speechify.'`) sem o campo `silent`: ajustar pra `silent: true`, já que é
  isso que o hook real vai enviar pra esse tipo de causa.

## Risks & Considerations

- Sem captura de log real em device, o gatilho exato não está confirmado —
  a remediação cobre um mecanismo plausível e bem fundamentado (inclusive
  por um gotcha de WebView já documentado no projeto), mas pode não ser
  *o único* gatilho. Recomendo, em paralelo à fase Fix, capturar uma sessão
  real via skill `android-debug` filtrando `tts.provider.fallback` pra
  confirmar — não bloqueia o fix, mas valida se cobre o caso real.
- Tratar `NotAllowedError` como transiente sem limite pode, em teoria, gerar
  retries indefinidos se o foco de áudio ficar perdido por muito tempo (ex.
  outro app tocando mídia por longos períodos). Mitigado por ser 1 retry por
  chunk (não um loop) — o próximo chunk tenta de novo naturalmente, sem
  acumular estado.
- Mexer no `TtsFallbackToast`/indicador de fallback é uma área com histórico
  de bugs sutis já corrigidos via code review (comentários em
  `ReaderScreen.tsx` sobre pausa perdida, listeners vazando) — mudança deve
  ser aditiva, sem tocar no fluxo de pause/resume existente.

## Open Questions

- [NEEDS CLARIFICATION: confirmar via log real (`tts.provider.fallback` no
  logcat, skill `android-debug`) se o erro observado em campo é mesmo
  `NotAllowedError`/`MediaError` da camada de playback — não bloqueia o fix
  (a classificação "acionável vs. silenciosa" já cobre 402/429/5xx
  independente disso), mas confirma se o mecanismo de playback é de fato o
  gatilho relatado ou se há uma terceira causa ainda não mapeada.]
- [NEEDS CLARIFICATION: o sintoma acontece igual com Speechify/Fish Audio
  (que passam pelo mesmo `playAudioBlob`) ou é específico de ElevenLabs?]
