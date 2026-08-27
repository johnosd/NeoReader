---
description: "Tasks: Audiobook (TTS) sem interrupção com tela apagada ou app em segundo plano"
---

# Tasks: Audiobook (TTS) sem interrupção com tela apagada ou app em segundo plano

**Input**: Documentos de design de `specs/001-audiobook-background-playback/`
(`plan.md`, `contracts/tts-playback-plugin.md`, `quickstart.md`)

**Prerequisites**: `plan.md`, `spec.md`

**Organization**: Tasks agrupadas por user story (P1 → P4, na ordem de
prioridade de `spec.md`) pra permitir implementação e teste independentes de
cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Caminhos de arquivo são reais deste repositório (ver `plan.md` → Project Structure)

## Path Conventions

- Nativo Android: `android/app/src/main/java/com/johnny/neoreader/`, manifest em `android/app/src/main/AndroidManifest.xml`, deps em `android/app/build.gradle` e `android/variables.gradle`.
- Serviço JS de ponte: `src/services/TtsPlaybackSessionService.ts` (padrão de `src/services/NativeSystemUiService.ts`).
- Orquestração: `src/hooks/useTTS.ts`, `src/screens/ReaderScreen.tsx`.
- Testes: `src/__tests__/services/`, `src/__tests__/hooks/`, `src/__tests__/screens/`, espelhando `src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Disponibilizar a dependência nativa aprovada antes de qualquer código que a use.

- [X] T001 Adicionar `androidxMediaVersion = '1.7.0'` em `android/variables.gradle` e `implementation "androidx.media:media:$androidxMediaVersion"` em `android/app/build.gradle` (mesmo padrão dos demais `androidx.*` já declarados ali).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura mínima que TODAS as user stories dependem —
Service em foreground + wake lock + plugin bridge + wiring em `useTTS.ts`.
Sozinha, já corrige o bug relatado originalmente (US1) e a maior parte de
US2, mesmo sem MediaSession/notificação rica ainda.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Implementation

- [X] T002 [P] Adicionar em `android/app/src/main/AndroidManifest.xml`: `<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />`, `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />`, `<uses-permission android:name="android.permission.WAKE_LOCK" />`, e a declaração `<service android:name=".TtsPlaybackService" android:foregroundServiceType="mediaPlayback" android:exported="false" />` dentro de `<application>`.
- [X] T003 [US-shared] Criar `android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java`: `Service` em foreground mínimo — `onStartCommand` inicia `startForeground()` com uma notificação simples ("Lendo: {título}", sem botões ainda), adquire `PowerManager.PARTIAL_WAKE_LOCK` (`newWakeLock` com tag `NeoReader:TtsPlayback`); `onDestroy` libera o wake lock. Sem MediaSession ainda (entra na Fase US3).
- [X] T004 [US-shared] Criar `android/app/src/main/java/com/johnny/neoreader/NeoReaderTtsPlaybackPlugin.java` (`@CapacitorPlugin(name = "NeoReaderTtsPlayback")`) com os métodos `start`, `stop` (ver `contracts/tts-playback-plugin.md`) — `start` guarda `bookId`/`title`/`chapterLabel` e chama `startForegroundService()` no Android com um `Intent` pro `TtsPlaybackService`; `stop` chama `stopService()`.
- [X] T004a [P] Em `TtsPlaybackService.java` e `NeoReaderTtsPlaybackPlugin.java` (T003/T004), usar uma tag de log única `private static final String TAG = "NeoReaderTtsPlayback";` (mesmo padrão de `NeoReaderLibraryPlugin.java`) e logar (`Log.d`/`Log.w`) os eventos-chave desta feature: wake lock adquirido/liberado, Service iniciado/parado, callback do `MediaSessionCompat` recebido, mudança de foco de áudio. `scripts/capture-android-diagnostics.ps1` já reconhece essa tag (ver `plan.md` → Estratégia de Testes, "Debug real no device via captura de log").
- [X] T005 Registrar o novo plugin em `android/app/src/main/java/com/johnny/neoreader/MainActivity.java` (`registerPlugin(NeoReaderTtsPlaybackPlugin.class);`, mesmo padrão já usado pro `NeoReaderLibraryPlugin`).
- [X] T006 [P] Criar `src/services/TtsPlaybackSessionService.ts`: wrapper `registerPlugin<NeoReaderTtsPlaybackPlugin>('NeoReaderTtsPlayback')` com `start`/`stop` (guard `Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'`, `try/catch` com `console.warn`, mesmo padrão de `src/services/NativeSystemUiService.ts`). `updateMetadata`/`updatePlaybackState`/eventos entram nas fases seguintes.
- [X] T007 [US-shared] Em `src/hooks/useTTS.ts`, chamar `TtsPlaybackSessionService.start({ bookId, title })` em `play()` (só quando `playbackModeRef.current === 'continuous'`, ao lado de `WakeLockService.keepAwake()`) e `TtsPlaybackSessionService.stop()` nos mesmos pontos onde já chama `WakeLockService.allowSleep()` (`stop()`, cleanup de unmount, e no `finally` de `play()` quando a sessão termina). `bookId`/`title` chegam como novos campos opcionais de `UseTTSOptions` (preenchidos por `ReaderScreen.tsx`).
- [X] T008 Em `src/screens/ReaderScreen.tsx`, passar `bookId: book.id` e `title: book.title` nas opções de `useTTS(...)`. Refinamento durante a implementação: `TtsPlaybackSessionService.stop()` foi colocado em `finishTtsAtBookEnd()` (não no `finally` de `useTTS.ts::play()` como o texto original da task sugeria) — `useTTS.ts` não distingue "próxima seção" de "livro terminou de vez", só `ReaderScreen.tsx` sabe disso via `finishTtsAtBookEnd`.

### Tests (Fundação)

- [X] T009 [P] `src/__tests__/services/TtsPlaybackSessionService.test.ts` (novo): confirma que `start`/`stop` não chamam o plugin nativo quando `Capacitor.isNativePlatform()` é `false` ou a plataforma não é `android`, e que chamam com os parâmetros corretos quando é.
- [X] T010 [P] Em `src/__tests__/hooks/useTTS.test.tsx`: adicionar mock de `TtsPlaybackSessionService` (mesmo padrão do mock existente de `WakeLockService`) e verificar que `start()` é chamado ao iniciar `play()` em modo contínuo, e `stop()` nos mesmos pontos que `WakeLockService.allowSleep()` — e que **não** é chamado para reprodução avulsa (`speakOne`).

**Critério de Conclusão**: Com o app rodando no device, iniciar o audiobook aciona o `TtsPlaybackService` (visível via `adb shell dumpsys activity services` ou logcat) e uma notificação básica aparece; a narração nativa continua tocando com a tela apagada por pelo menos alguns minutos (validação manual completa fica pra US1/US2). Testes de T009/T010 passam.

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluído (validação em device real — notificação básica aparecendo, narração sobrevivendo à tela apagada — ainda pendente, fica pra fechamento de US1/US2).
- Feito: manifest (permissões + `<service>`), `TtsPlaybackService.java` (foreground service + wake lock parcial + notificação básica "Lendo: {título}"), `NeoReaderTtsPlaybackPlugin.java` (`start`/`stop`), registro em `MainActivity.java`, `TtsPlaybackSessionService.ts` (wrapper JS), wiring em `useTTS.ts` (`play()`/`stop()`/unmount) e `ReaderScreen.tsx` (`bookId`/`bookTitle` em `useTTS(...)`; `TtsPlaybackSessionService.stop()` movido pra `finishTtsAtBookEnd()` em vez do `finally` de `play()` — ver nota na T008).
- Testes executados: `npx vitest run src/__tests__/services/TtsPlaybackSessionService.test.ts src/__tests__/hooks/useTTS.test.tsx` (21/21 passou); `npm run lint` (limpo); `npx tsc --noEmit` (sem erros); `npm run build` (sucesso); `npm test` completo (566/570 passou — a 1 falha, `BookmarkDriveSyncIntegration.test.ts`, é flakiness de infra pré-existente sem relação com esta feature, confirmada isolando o arquivo; logada em `.planning/backlog.md` → Ideias Futuras, não corrigida por decisão do usuário após tentativa de bump de timeout não ter resolvido).
- Pendências: validação manual em device real (notificação aparecendo, `TtsPlaybackService` rodando) fica pro fechamento de US1.

---

## Phase 3: User Story 1 - Tela apaga sozinha e a narração continua (Priority: P1) 🎯 MVP

**Objetivo**: Validar e fechar especificamente o cenário que motivou a
feature — narração sobrevive à tela apagando sozinha por inatividade.

**Independent Test**: Iniciar o audiobook, não tocar no celular até a tela
apagar sozinha, confirmar narração contínua por 5+ minutos (ajustado de 30+
minutos — decisão do usuário em 2026-08-27, evidência de alguns minutos
contínuos já é suficiente).

### Testes da Fase

- [X] T011 [P] [US1] Em `src/__tests__/hooks/useTTS.test.tsx`: caso garantindo que `TtsPlaybackSessionService.start()` acontece antes do primeiro chunk começar a tocar (ordem de chamadas), pra evitar uma janela sem wake lock logo no início da narração.

### Implementation

- [X] T012 [US1] Revisar `TtsPlaybackService.java` (T003): garantir que o wake lock é adquirido **antes** de `startForeground()` retornar controle ao chamador (sem janela de CPU dormindo entre o `Intent` chegar e o wake lock ser efetivado). Já satisfeito pela implementação da T003 (Fundação) — `acquireWakeLock()` é chamado antes de `startForeground()` em `onStartCommand`, confirmado nesta revisão.
- [X] T013 [US1] Adicionar comentário curto em `TtsPlaybackService.java` explicando por que o wake lock é `PARTIAL_WAKE_LOCK` (mantém CPU acordada com tela apagada, sem acender a tela — diferente do `KeepAwakeService`/toggle existente, que faz o oposto). Já feito na T003 (Fundação), dentro de `acquireWakeLock()`.

**Critério de Conclusão**: Em device real, com o audiobook tocando, deixar a
tela apagar sozinha por inatividade e confirmar (roteiro `quickstart.md`,
passo 3) que a narração continua audível por pelo menos 5 minutos sem
parar. Reabrir o app e confirmar que o parágrafo narrado no momento está
destacado corretamente (FR-009, sem código extra — ver Decisões Invariantes
em `plan.md`).

**Checkpoint**: User Story 1 funcional e testável isoladamente — bug
original corrigido.

**Registro da Fase**:

- Status: Concluído (validação parcial em device real — ver Pendências).
- Feito: T012/T013 já satisfeitas pela implementação da Fundação (revisadas e confirmadas). T011: teste de ordenação (start antes do primeiro chunk) adicionado e passando. Validação em device real: build/instalação feitas via `.\gradlew.bat installDebug` (workaround — `npm run android:run` falha no Windows, ver Riscos/backlog), app aberto via `adb shell monkey`, captura de logcat em background durante o teste manual do usuário.
- Testes executados: `npx vitest run src/__tests__/hooks/useTTS.test.tsx` (18/18); **device real** (Samsung SM-S911B): audiobook iniciado (provider ElevenLabs), tela apagou sozinha por inatividade, log confirmou `tts.synthesize.start` avançando de parágrafo em parágrafo continuamente por 4+ minutos com a tela apagada, sem nenhum `tts.playback.stop`/`tts.playback.error` no meio — nem `FATAL`/`ANR` do pacote `com.johnny.neoreader`.
- Pendências: nenhuma — SC-001 foi revisado de 30 para 5 minutos (decisão do usuário em 2026-08-27) e a validação desta fase (~5 minutos contínuos, sem a narração parar sozinha) já satisfaz o critério revisado.

---

## Phase 4: User Story 2 - App em segundo plano ou celular bloqueado manualmente (Priority: P2)

**Objetivo**: Confirmar que a mesma infraestrutura da Fundação cobre também
o app sendo colocado em segundo plano (Home, troca de app) ou bloqueio
manual — não só a tela apagando sozinha.

**Independent Test**: Iniciar o audiobook, apertar Home ou bloquear
manualmente, aguardar minutos, confirmar que a narração continuou e o
progresso avançou ao reabrir o app.

### Testes da Fase

- [X] T014 [P] [US2] Em `src/__tests__/screens/ReaderScreen.test.tsx`: caso confirmando que um evento `appStateChange` (`isActive: false`, via `useCapacitorAppStateChange`) durante o audiobook **não** chama `tts.stop()`/`tts.pause()` — a narração deve seguir tocando; apenas `flushCurrentProgress()` deve rodar (comportamento já existente, agora garantido por teste explícito).

### Implementation

- [X] T015 [US2] Confirmar em `src/screens/ReaderScreen.tsx` (linha ~795, `useCapacitorAppStateChange`) que nenhuma chamada nova precisa pausar/parar o TTS ao ir para segundo plano — se algum código futuro tentar isso, o teste T014 pega a regressão. Nenhuma mudança de código esperada aqui além de um comentário curto documentando a decisão (ver Decisões Invariantes).

**Critério de Conclusão**: Em device real, com o audiobook tocando, apertar
Home (ou bloquear manualmente) e aguardar 5+ minutos (roteiro
`quickstart.md`, passos 5-6); confirmar que a narração não parou e que o
progresso ao reabrir reflete o tempo decorrido.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluído (validação em device real feita para Home e bloqueio manual).
- Feito: T014 (teste garantindo que `appStateChange` em segundo plano não chama `tts.stop()`/`tts.pause()`, só `flushProgress`), T015 (comentário documentando a decisão no `useCapacitorAppStateChange` de `ReaderScreen.tsx`). Nenhuma mudança de comportamento necessária além do comentário — a infraestrutura da Fundação/US1 já cobre este cenário.
- Testes executados: `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` (26/26); `npm run lint` e `npx tsc --noEmit` limpos; **device real**: usuário testou Home (app em segundo plano) e bloqueio manual pelo botão de energia — narração continuou tocando nos dois casos, confirmado tanto pelo usuário quanto pelo log (`tts.synthesize.start` avançando de parágrafo em parágrafo continuamente, provider Speechify, terminando num `tts.playback.stop` limpo com `reason: "stopped"`, sem nenhum erro).
- Pendências: SC-002 foi revisado de 15+ para 5+ minutos (decisão do usuário em 2026-08-27); a validação desta fase não teve duração cronometrada, então uma confirmação rápida de ~5min fica pro roteiro completo de `quickstart.md` na fase Polish (T034), sem urgência já que o comportamento (Home/bloqueio sem interrupção) já foi confirmado qualitativamente.

---

## Phase 5: User Story 3 - Controles de reprodução na notificação/tela de bloqueio (Priority: P3)

**Objetivo**: Notificação completa estilo player de mídia (capa, título,
capítulo, play/pause/avançar) com `MediaSessionCompat`, controlável sem abrir
o app.

**Independent Test**: Com o audiobook tocando em segundo plano, usar os
controles da notificação/tela de bloqueio e confirmar que refletem/alteram o
mesmo estado do app.

### Testes da Fase

- [X] T016 [P] [US3] `src/__tests__/services/TtsPlaybackSessionService.test.ts`: casos para `updateMetadata`, `updatePlaybackState`, `onPlaybackControl` (registro/cleanup de listener, mesmo padrão de `useCapacitorAppListener.test.tsx`).
- [X] T017 [P] [US3] `src/__tests__/screens/ReaderScreen.test.tsx`: eventos `playbackControl` mockados (`play`, `pause`, `stop`, `skipNext`, `skipPrevious`) disparam `tts.resume()`/`tts.pause()`/`tts.stop()`/`onNextParagraph`/`onPrevParagraph` corretamente.

### Implementation

- [X] T018 [US3] Em `android/app/src/main/AndroidManifest.xml`: adicionar `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` (obrigatória a partir do Android 13 pra notificação ser visível).
- [X] T019 [US3] Em `NeoReaderTtsPlaybackPlugin.java`: solicitar a permissão `POST_NOTIFICATIONS` em runtime (`ActivityCompat.requestPermissions`, guardado por `Build.VERSION.SDK_INT >= 33`) antes de `start()` iniciar o Service.
- [X] T020 [US3] Em `TtsPlaybackService.java`: criar `MediaSessionCompat`, publicar `PlaybackStateCompat` (`STATE_PLAYING`/`STATE_PAUSED`) e `MediaMetadataCompat` (título, capítulo, `METADATA_KEY_ALBUM_ART` a partir do `coverBase64` decodificado em `Bitmap`); montar a notificação com `NotificationCompat.Builder` + `androidx.media.app.NotificationCompat.MediaStyle` (ações play/pause/skip-next/skip-previous) e `contentIntent` (`PendingIntent`) abrindo `MainActivity` (reaproveitando `launchMode="singleTask"` já configurado).
- [X] T021 [US3] Implementar `MediaSessionCompat.Callback` (`onPlay`, `onPause`, `onStop`, `onSkipToNext`, `onSkipToPrevious`) em `TtsPlaybackService.java`, encaminhando cada callback como evento `playbackControl` pro `NeoReaderTtsPlaybackPlugin` (que dispara `notifyListeners('playbackControl', ...)` pro JS).
- [X] T021a [US3] **Bug encontrado na validação manual em device**: tocar "avançar" (`skipNext`) matava a notificação e, em seguida, a narração parava ao apagar a tela. Causa: `handleTtsNext()`/`handleTtsPrev()`/troca de provider/velocidade chamam `tts.stop()` seguido de `tts.play()` quase instantaneamente; `TtsPlaybackService.onStartCommand` usava `stopSelf()` (sem `startId`), que derruba o Service incondicionalmente mesmo que um `start()` mais novo já tenha chegado logo depois — destruindo (wake lock + MediaSession) uma sessão que tinha acabado de reiniciar. Corrigido trocando por `stopSelf(startId)`, que só para o Service se nenhum start mais novo foi entregue depois. Afeta todos os fluxos que fazem stop+start rápido (avançar/voltar parágrafo, trocar provider/velocidade), não só o botão da notificação. Ver `plan.md` → Riscos e Decisões (R-005).
- [X] T022 [US3] Adicionar `updateMetadata` e `updatePlaybackState` em `NeoReaderTtsPlaybackPlugin.java` (repassando pro Service) e em `src/services/TtsPlaybackSessionService.ts` (ver `contracts/tts-playback-plugin.md`).
- [X] T023 [US3] Adicionar `onPlaybackControl` em `src/services/TtsPlaybackSessionService.ts` (`addListener` + retorno de função de cleanup, padrão de `useCapacitorAppListener.ts`).
- [X] T024 [US3] Em `src/hooks/useTTS.ts`: chamar `TtsPlaybackSessionService.updatePlaybackState({ state: 'playing' | 'paused' })` nos mesmos pontos onde já chama `WakeLockService.keepAwake()`/nada em `pause()` (adicionar lá também) — mantendo a notificação sincronizada com o estado real. Implementado em `pause()` (state: 'paused') e no branch premium de `resume()` (state: 'playing'); não duplicado em `play()` porque `start()` já define o estado inicial como tocando no lado nativo.
- [X] T025 [US3] Em `src/screens/ReaderScreen.tsx`: buscar a capa via `getBookCover(book.id)` (`src/db/bookCovers.ts`) ao iniciar o audiobook, converter o `Blob` pra base64, e chamar `TtsPlaybackSessionService.updateMetadata({ title: book.title, chapterLabel, coverBase64 })` no início da reprodução e a cada troca de capítulo (usar `findTopLevelTocLabel`, já importado, dentro do `onParagraphChange` existente).
- [X] T026 [US3] Em `src/screens/ReaderScreen.tsx`: assinar `TtsPlaybackSessionService.onPlaybackControl(...)` (via `useEffect`) mapeando `play`/`pause`/`stop`/`skipNext`/`skipPrevious` pras funções já existentes (`tts.resume`, `tts.pause`, `tts.stop`, `onNextParagraph`, `onPrevParagraph` — mesmas usadas por `TtsMiniPlayer`).

**Critério de Conclusão**: Em device real, com o audiobook tocando em
segundo plano, a notificação mostra capa/título/capítulo e os botões de
play/pause/avançar funcionam e refletem o estado do app quando reaberto
(roteiro `quickstart.md`, passos 2 e 7-8).

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluído (validado em device real, incluindo um bug crítico encontrado e corrigido na validação).
- Feito: T016-T026 — `POST_NOTIFICATIONS` + `MediaButtonReceiver` no manifest, permissão em runtime, `MediaSessionCompat`/`PlaybackStateCompat`/`MediaMetadataCompat` completos em `TtsPlaybackService.java` com notificação `MediaStyle` (capa/título/capítulo/prev-playpause-next), `updateMetadata`/`updatePlaybackState`/`onPlaybackControl` no plugin e no wrapper JS, wiring em `useTTS.ts` (`updatePlaybackState` em pause/resume) e `ReaderScreen.tsx` (busca de capa via `getBookCover` + cache, sync de capítulo via `footerTocLabel`, listener de `playbackControl` mapeando pra `handleTtsToggle`/`handleTtsStop`/`handleTtsNext`/`handleTtsPrev`). **T021a (ad-hoc)**: corrigido bug crítico de race condition (`stopSelf()` → `stopSelf(startId)`) encontrado na validação manual — ver R-005 em `plan.md`.
- Testes executados: `npx vitest run` dos 3 arquivos de teste da feature (`TtsPlaybackSessionService.test.ts`, `ReaderScreen.test.tsx`, `useTTS.test.tsx`) — 87 testes, todos passando; `npm run lint` e `npx tsc --noEmit` limpos (após ajustar `startPlay`/nova sincronização de metadata pra satisfazer o React Compiler); `npm run build` e build Gradle (`compileDebugJavaWithJavac`) sem erro. **Device real**: notificação com capa/título/capítulo apareceu; pause/play funcionaram na primeira rodada; "avançar" expôs o bug do `stopSelf()` (notificação sumia, narração parava ao apagar a tela depois) — corrigido e revalidado em device: avançar/voltar funcionaram corretamente com a tela apagada, notificação e narração se mantiveram estáveis (confirmado no log: nenhum `onDestroy` espúrio após o fix, MediaSession ativa por 30+s após o skip).
- Pendências: nenhuma pendência conhecida desta story.

---

## Phase 6: User Story 4 - Pausa e retomada automática em interrupções de áudio (Priority: P4)

**Objetivo**: Foco de áudio nativo — pausa automática em ligações/outros
apps de mídia, com retomada automática só em interrupções transitórias.

**Independent Test**: Iniciar o audiobook, receber uma ligação (ou abrir
outro app de mídia), confirmar pausa automática e retomada correta (ou não)
conforme o tipo de interrupção.

### Testes da Fase

- [X] T027 [P] [US4] `src/__tests__/screens/ReaderScreen.test.tsx`: evento `audioFocusChange` `{ type: 'lossTransient' }` mockado chama `tts.pause()`; `{ type: 'gain' }` subsequente chama `tts.resume()`.
- [X] T028 [P] [US4] `src/__tests__/screens/ReaderScreen.test.tsx`: evento `audioFocusChange` `{ type: 'loss' }` chama `tts.pause()`, mas um `{ type: 'gain' }` posterior **não** chama `tts.resume()` (resolve a ambiguidade do FR-008).

### Implementation

- [X] T029 [US4] Em `TtsPlaybackService.java`: requisitar foco de áudio (`AudioFocusRequestCompat`, `AUDIOFOCUS_GAIN`) ao iniciar (`onStartCommand`) e abandonar em `onDestroy`; implementar `AudioManager.OnAudioFocusChangeListener` distinguindo `AUDIOFOCUS_LOSS` / `AUDIOFOCUS_LOSS_TRANSIENT` / `AUDIOFOCUS_GAIN`.
- [X] T030 [US4] Encaminhar cada mudança de foco como evento `audioFocusChange` do `NeoReaderTtsPlaybackPlugin` pro JS (`notifyListeners`), e adicionar `onAudioFocusChange` em `src/services/TtsPlaybackSessionService.ts` (mesmo padrão de `onPlaybackControl`).
- [X] T031 [US4] Em `src/screens/ReaderScreen.tsx`: assinar `TtsPlaybackSessionService.onAudioFocusChange(...)`, guardando um ref booleano "pausado por perda transitória de foco" — em `lossTransient` chama `tts.pause()` e marca o ref; em `loss` chama `tts.pause()` sem marcar; em `gain`, só chama `tts.resume()` se o ref estiver marcado (e limpa o ref depois). Comentário curto explicando a distinção (Decisões Invariantes de `plan.md`).
- [X] T032 [US4] Validar empiricamente (device real, ver R-003 em `plan.md`) se `@capacitor-community/text-to-speech` requisita foco de áudio internamente de forma conflitante; se sim, ajustar `TtsPlaybackService.java` pra ser a única fonte de verdade (documentar o achado em `plan.md` → Riscos e Decisões, atualizando R-003).
  **Atualização 2026-08-26**: validação rodada — o conflito real é com o `AudioFocusDelegate` interno do Chromium/WebView (não com o plugin de TTS), disparado a cada chunk de áudio premium (`new Audio(url)`). Ligação de voz do WhatsApp não pausou a narração; log confirma que nosso `OnAudioFocusChangeListener` nunca foi notificado durante a ligação. Diagnóstico completo em R-003 (`plan.md`). Falta: implementar uma correção (ver direções candidatas em R-003) e revalidar em device antes de marcar esta task.
  **Atualização 2026-08-27 (tentativa 1)**: implementada a direção candidata (a) — `src/hooks/useTTS.ts::playAudioBlob` reaproveita um único `HTMLAudioElement` entre chunks premium em vez de `new Audio(url)` por chunk. Revalidação em device revelou uma análise mais profunda via log filtrado (`MediaFocusControl`): o Chromium ainda disputa e VENCE o foco (`AUDIOFOCUS_GAIN`, não transitório) assim que o primeiro chunk toca, evictando nosso `AudioFocusRequestCompat` de vez — o que causava uma pausa espúria logo no início de toda sessão premium, exigindo toque manual em "play" pra continuar (regressão nova, achada pelo usuário no teste).
  **Atualização 2026-08-27 (tentativa 2, final)**: causa raiz completa — o `<audio>` premium roda dentro do WebView e o Chromium **já pausa/retoma esse elemento sozinho** ao perder/reaver foco (confirmado empiricamente: Spotify pausou a narração mesmo com nosso `AudioFocusRequestCompat` já evictado e fora do stack de foco havia mais de 30s). Nosso próprio pedido de foco nativo só serve pro provider **nativo** (`TextToSpeech`, sem `<audio>` no meio) — pra premium, ele só causava a pausa espúria inicial sem nenhum benefício real. Correção: `useTTS.ts` ganhou `handleAudioFocusChange(type)`, exportado pelo hook, que só age (`pause()`/`resume()` com a distinção loss/lossTransient/gain) quando `activeProviderRef.current === 'native'` — pra premium, o evento é ignorado e o WebView cuida de tudo sozinho. `ReaderScreen.tsx::audioFocusHandlerRef` foi simplificado pra só repassar o evento (`tts.handleAudioFocusChange(event.type)`), removendo a lógica de pause/resume e o ref de bookkeeping que agora moram dentro do hook. Testes atualizados/adicionados em `useTTS.test.tsx` (gating por provider) e `ReaderScreen.test.tsx` (repasse do evento). `npm run lint && npm test && npx tsc --noEmit && npm run build` passaram limpos (os 3 timeouts vistos numa rodada completa sob carga paralela são flakiness de infra pré-existente, confirmada isolando os arquivos — não regressão desta mudança). **Revalidado em device real pelo usuário**: sem mais pausa espúria no início, ligação de voz real (WhatsApp) e abrir outro app de mídia (Spotify) pausam corretamente — "testei tudo de novo, funcionou certinho".

**Critério de Conclusão**: Em device real (roteiro `quickstart.md`, passos
9-10), uma ligação telefônica pausa e depois retoma a narração sozinha;
abrir outro app de mídia (Spotify) pausa a narração e ela **não** retoma
sozinha enquanto o outro app tocar.

**Checkpoint**: User Story 4 funcional e testável isoladamente — todas as
stories da spec implementadas.

**Registro da Fase**:

- Status: **Concluído.**
- Feito: T027-T031 (testes unitários + implementação completa: `AudioFocusRequestCompat` no Service, distinção `LOSS`/`LOSS_TRANSIENT`/`GAIN`, evento `audioFocusChange` no plugin/wrapper JS, wiring em `ReaderScreen.tsx`). Compilou e instalou sem erro em device real. **2026-08-27**: T032 — duas iterações até a correção final de R-003 (ver detalhe completo na task): reaproveitar um único `<audio>` entre chunks premium (não bastou sozinho) + gating de `handleAudioFocusChange` por provider ativo dentro de `useTTS.ts` (só o provider nativo reage a mudanças de foco; premium já é tratado pelo próprio WebView).
- Testes executados: `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx src/__tests__/hooks/useTTS.test.tsx` (52/52); lint/tsc limpos; build Gradle sem erro; suite completa (`npm test`) e `npm run build` limpos. **Device real, validação final**: sem pausa espúria no início da narração premium; ligação de voz real do WhatsApp pausa/retoma corretamente; abrir o Spotify pausa a narração corretamente. Confirmado pelo usuário: "testei tudo de novo, funcionou certinho".
- Pendências: nenhuma pendência conhecida desta story.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Fechar qualidade geral e rodar a validação ponta a ponta.

- [X] T033 Rodar `npm run lint && npm test && npx tsc --noEmit && npm run build` e corrigir qualquer regressão.
- [X] T034 Executar o roteiro completo de `quickstart.md` em device real (cenário ponta a ponta US1-US4 + verificação de regressão).
- [X] T035 Revisar comentários curtos adicionados nos pontos não óbvios (wake lock, distinção de foco de áudio, singleTask/no-resync) — Princípio II da constitution.

**Registro da Fase**:

- Status: Concluído.
- Feito: T033 — `npm run lint && npm test && npx tsc --noEmit && npm run build` rodados após o fix de R-003 (577/584 numa rodada sob carga total; os 3 timeouts confirmados como flakiness de infra pré-existente ao isolar os arquivos, sem relação com esta feature — ver `.planning/backlog.md`). T034 — roteiro completo rodado em device real por decisão do usuário focando US1-US3 (US4 já validado na Fase 6 no mesmo dia): notificação com capa/título/controles OK; tela apagando sozinha por 5min sem interrupção (SC-001 satisfeito); Home por 5min sem interrupção, progresso correto ao reabrir (SC-002 satisfeito); bloqueio manual também sem interrupção; controles de pause/play/avançar pela notificação OK; stop remove a notificação. Regressões confirmadas separadamente: reprodução avulsa de TTS (Word Lens) não abre notificação/Service, e o toggle "Manter tela ligada" continua funcionando normalmente. T035 — revisão dos comentários adicionados nesta feature (`TtsPlaybackService.java`, `useTTS.ts`, `ReaderScreen.tsx`): todos explicam o "porquê" não óbvio (race condition do `stopSelf`, timing do wake lock, distinção loss/lossTransient, gating de foco por provider), nenhum reafirma o óbvio — nenhuma mudança necessária.
- Pendências: nenhuma.

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Fase 6 (User Story 4) concluída
- [X] `npm run lint && npm test && npx tsc --noEmit && npm run build` passam sem erro
- [X] `quickstart.md` executado com sucesso em device Android real
- [X] Reprodução avulsa de TTS (Word Lens) confirmada sem abrir notificação/Service (regressão)
- [X] Toggle "Manter tela ligada" confirmado funcionando como antes (regressão)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories.
- **User Story 1 (Phase 3)**: depende do Foundational.
- **User Story 2 (Phase 4)**: depende do Foundational (não depende de US1, mas reusa a mesma infraestrutura).
- **User Story 3 (Phase 5)**: depende do Foundational; independente de US1/US2 (soma controles/metadata em cima da mesma base).
- **User Story 4 (Phase 6)**: depende do Foundational; independente de US1/US2/US3.
- **Polish (Phase 7)**: depende de todas as user stories desejadas estarem completas.

### Parallel Opportunities

- T002 e T006 podem rodar em paralelo (arquivos diferentes: manifest nativo vs. serviço JS).
- T009/T010 (testes da Fundação) podem rodar em paralelo entre si.
- Depois do Foundational, US2 (Phase 4) pode ser trabalhada em paralelo com o restante de US1 (Phase 3), já que ambas só validam a mesma infraestrutura em cenários diferentes.
- US3 (Phase 5) e US4 (Phase 6) tocam arquivos parcialmente sobrepostos (`TtsPlaybackService.java`, `NeoReaderTtsPlaybackPlugin.java`, `TtsPlaybackSessionService.ts`, `ReaderScreen.tsx`) — evitar paralelizar as duas ao mesmo tempo pra não gerar conflito de merge; preferir ordem sequencial (US3 antes de US4, seguindo a prioridade P3/P4 da spec).

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup.
2. Completar Fase 2: Foundational (bloqueia todas as stories) — já corrige o bug original na prática.
3. Completar Fase 3: User Story 1.
4. **PARAR E VALIDAR**: rodar o roteiro de `quickstart.md` passos 1-4 em device real.

### Incremental Delivery

1. Setup + Foundational → fundação pronta, bug original já corrigido.
2. User Story 1 → validar isoladamente → considerar entrega parcial (MVP).
3. User Story 2 → validar isoladamente (mesma infra, cenário de segundo plano).
4. User Story 3 → controles de notificação, entrega incremental de conveniência.
5. User Story 4 → foco de áudio, fecha a spec inteira.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra uma user story específica; `[US-shared]` marca tasks da Fundação que servem todas as stories.
- Commitar após cada task ou grupo lógico coerente.
- Parar em qualquer checkpoint pra validar a story isoladamente em device real — este é o tipo de feature onde o teste automatizado sozinho não basta.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 8: Convergence (2026-08-27)

**Purpose**: Fechar lacunas encontradas pelo `sdd-converge` entre a
documentação (spec/plan/contrato) e o código real, todas de fidelidade de
documentação — nenhum achado CRITICAL, a implementação em si já foi validada
em device real nas Fases 3-7.

- [X] T036 Atualizar `specs/001-audiobook-background-playback/contracts/tts-playback-plugin.md` (seção `audioFocusChange`): documentar que o JS só reage a `loss`/`lossTransient`/`gain` (chamando `pause()`/`resume()`) quando o provider ativo é **nativo** (`activeProviderRef.current === 'native'` em `useTTS.ts::handleAudioFocusChange`); para providers premium, o evento é recebido mas ignorado de propósito, porque o `<audio>` HTML5 roda no WebView e o Chromium já pausa/retoma esse elemento sozinho ao perder/reaver foco (confirmado em device real). Origem: `plan.md` → Riscos e Decisões, R-003 (resolvido).
- [X] T037 [P] No mesmo arquivo de contrato, remover `coverBase64?: string` de `TtsPlaybackStartOptions` (não implementado nem em `src/services/TtsPlaybackSessionService.ts` nem em `NeoReaderTtsPlaybackPlugin.java::start()`) — a capa sempre chega depois via `updateMetadata()`, nunca no `start()`. Origem: `contracts/tts-playback-plugin.md` vs. código real (T025 em tasks.md).
- [X] T038 Validar em device real o Edge Case de `spec.md` ("a conexão cai enquanto em segundo plano → o fallback automático para TTS nativo já existente continua funcionando normalmente", FR-011) e o item 3 de "Verificação de regressão" em `quickstart.md`: iniciar o audiobook com um provider premium, colocar o app em segundo plano ou apagar a tela, desligar Wi-Fi/dados momentaneamente, e confirmar que a narração cai pro TTS nativo automaticamente sem interromper. Registrar o resultado no Registro da Fase abaixo. Origem: `spec.md` Edge Cases (FR-011), `quickstart.md` → Verificação de regressão.

**Critério de Conclusão**: `contracts/tts-playback-plugin.md` reflete o
comportamento real do gating de foco de áudio e do fluxo de metadata; o
cenário de fallback em segundo plano foi confirmado em device real.

**Registro da Fase**:

- Status: Concluído.
- Feito: T036/T037 — `contracts/tts-playback-plugin.md` atualizado (seção `audioFocusChange` agora documenta o gating por provider ativo, com referência a R-003; `coverBase64` removido de `TtsPlaybackStartOptions`, com nota explicando que a capa sempre chega via `updateMetadata()`). T038 — testado em device real: audiobook com provider premium (ElevenLabs) em segundo plano, Wi-Fi/dados desligados momentaneamente; log confirmou múltiplos eventos `tts.provider.fallback` (`errorMessage: "Failed to fetch"`, `fallbackProvider: "native"`, `transient: true`) ao longo de ~30s de queda de conexão, sem nenhum erro fatal — narração seguiu contínua no TTS nativo. Confirmado pelo usuário: "testei, funcionou normal, caiu pro nativo".
- Testes executados: nenhuma mudança de código nesta fase (só documentação) — `npm run lint && npm test && npx tsc --noEmit && npm run build` seguem no estado limpo da Fase 7.
- Pendências: nenhuma.

