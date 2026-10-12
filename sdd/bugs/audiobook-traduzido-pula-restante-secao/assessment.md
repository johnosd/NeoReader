# Bug Assessment: Audiobook traduzido pula o restante da seção

- **Slug**: audiobook-traduzido-pula-restante-secao
- **Criado**: 2026-10-12
- **Origem**: `reports/code-review-2026-10-10.md` — R09 (P1), probe `reports/code-review-2026-10-10/tts.probe.tsx` (teste "R09")
- **Veredito**: valid
- **Severidade**: high

## Report

> **R09 — P1 — Audiobook traduzido pode pular o restante da seção.** O TTS itera
> um array mutável até `index < chunks.length`. A tradução seguinte acontece em
> segundo plano e acrescenta chunks depois. Se a fala termina antes dela, o loop
> encontra o fim momentâneo do array e dispara `onFinished`. No leitor, esse
> callback inicia avanço de seção. `hasPendingTranslation` protege avanços
> manuais, mas não coordena o fim natural.
>
> **Correção sugerida:** fila assíncrona/iterador que espere novos chunks e
> receba sinal explícito de fim. Coordenar erro, cancelamento e prefetch por
> sessão. Bloquear só o callback de fim não garante retomada do áudio.
>
> **Aceitação:** atraso na tradução espera e depois continua; fim somente quando
> a fonte terminou. Cobrir cancelamento durante espera e erro do produtor.

## Symptom

Na leitura traduzida (feature 018), se a fala do último chunk disponível termina
antes da tradução do próximo parágrafo voltar, o `useTTS.play()` encerra como
"fim natural" e o `ReaderScreen` avança para a próxima seção — o resto do
capítulo nunca é narrado. Esperado: esperar a tradução e continuar.

## Reproduction

1. Integrar `useTranslatedAudiobook` + `useTTS` reais (probe R09): parágrafos
   `['First.', 'Second.']`, 1ª tradução resolve na hora, 2ª fica pendente.
2. `buildInitialChunks(0, ...)` e `tts.play(chunks)`; o `onParagraphChange`
   dispara `advanceToNextParagraph`.
3. Após a 1ª fala: `hasPendingTranslation() === true` e `onFinished` já foi
   chamado 1x; resolver a 2ª tradução depois não gera nova chamada a `speak`.

Validado também por leitura de código (orquestrador confirmou).

## Suspected Code Paths

- `src/hooks/useTTS.ts` (~927, loop `for (index < chunks.length)` em `play()`) — sai do loop no fim momentâneo do array e cai no `finally` que chama `onFinished`.
- `src/hooks/useTranslatedAudiobook.ts:108` (`advanceToNextParagraph`) — `push` assíncrono, sem sinal para o consumidor esperar.
- `src/screens/ReaderScreen.tsx:676` (`onFinished` → `advanceTtsToNextSection()`) — não consulta `hasPendingTranslation()`, ao contrário dos controles manuais (~948/~968).

## Root Cause Hypothesis

Corrida produtor/consumidor: o consumidor (`useTTS.play`) trata "array acabou
agora" como "fonte terminou", porque não existe canal para o produtor
(`useTranslatedAudiobook`) dizer "tem mais vindo". Confiança: high (reproduzido
com os hooks reais no probe).

## Proposed Remediation

**Preferida**: callback opcional de espera no `useTTS`.

- `useTTS` ganha a opção opcional `waitForMoreChunks?: () => Promise<'more' | 'end' | 'interrupted'>`.
  No `play()`, quando `index` chega ao fim do array, se a opção existir, espera
  o resultado: `'more'` → segue o loop; `'end'` → fim natural (comportamento
  atual, `onFinished`); `'interrupted'` (sessão cancelada/erro do produtor) →
  encerra sem `onFinished`. Sem a opção, o comportamento é idêntico ao atual
  (leitura não traduzida inalterada).
- A espera corre contra um "despertador" (`ref` com resolver) que `stop()` e
  `pause()` disparam — cancelamento durante a espera encerra a sessão na hora,
  sem depender da tradução nem do `TextToSpeech.stop()` nativo (o
  `nativeSpeakStopAckRef`/`Promise.race` existente não é tocado). Ao pausar
  durante a espera, `lastChunkIdxRef` aponta para o próximo índice, para o
  resume tocar o chunk que ainda não foi falado.
- `useTranslatedAudiobook` guarda a promessa do prefetch em voo e expõe
  `waitForMoreChunks()`: `'more'` quando fez `push`, `'end'` quando não há mais
  parágrafos (ou nada em voo), `'interrupted'` quando a sessão foi cancelada ou
  a tradução falhou (após `onFatalFailure`).
- `ReaderScreen` só repassa `waitForMoreChunks` ao `useTTS` quando a sessão
  traduzida está ativa (ou: o callback retorna `'end'` quando inativa).

**Alternativas**:
- Só checar `hasPendingTranslation()` no `onFinished` e chamar `startPlay` do
  próximo índice quando a tradução concluir — mais frágil: `isPlaying` pisca
  `false`, o `finally` derruba listeners/estado, e o retorno teria que ser
  orquestrado fora do hook (o relatório já alerta que bloquear só o callback
  não basta).
- Fila/iterador assíncrono substituindo o array — refatoração maior do
  `useTTS`, fora do escopo de "mudança mínima".

**Files likely to change**:
- `src/hooks/useTTS.ts`
- `src/hooks/useTranslatedAudiobook.ts`
- `src/screens/ReaderScreen.tsx`

**Tests to add or update**:
- Novo `src/__tests__/hooks/useTranslatedAudiobookPlayback.test.tsx` (adaptado
  do probe R09, expectativa invertida): tradução atrasada → espera e fala o 2º
  parágrafo, `onFinished` só depois; `stop()` durante a espera encerra sem
  `onFinished`; erro do produtor durante a espera encerra sem `onFinished` e
  chama `onFatalFailure`; fim real (sem mais parágrafos) ainda chama `onFinished`.
- Rodar `useTTS.test.tsx` e `ReaderScreen.test.tsx` existentes como regressão.

## Risks & Considerations

- Não quebrar o `Promise.race` com `nativeSpeakStopAckRef` (deadlock do
  `TextToSpeech.speak()` após `stop()` no Android) — a espera nova não envolve
  o speak nativo.
- Pausa premium durante a espera: não há `<audio>` ativo, então o `resume()`
  devolve `false` e o `ReaderScreen` recomeça por `lastChunkIdx` — por isso o
  índice do próximo chunk deve ser gravado ao pausar na espera.
- Leitura não traduzida: `waitForMoreChunks` ausente/`'end'` imediato ⇒ mesmo
  fluxo de hoje.
- QA real em device (rede lenta + diálogo curto) não é coberto por jsdom.

## Open Questions

- Nenhuma bloqueante.
