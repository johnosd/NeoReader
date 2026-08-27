# Implementation Plan: Audiobook (TTS) sem interrupção com tela apagada ou app em segundo plano

**Slug**: `001-audiobook-background-playback` | **Date**: 2026-08-26 | **Spec**: `specs/001-audiobook-background-playback/spec.md`

## Summary

Hoje o loop de reprodução do audiobook roda inteiramente em JS dentro do
`useTTS.ts` (`play()`), sem nenhum mecanismo que impeça o Android de deixar a
CPU dormir quando a tela apaga, nem de reduzir a prioridade do processo quando
o app vai para segundo plano — por isso a narração para sozinha. A correção
proposta é um **Service Android em foreground** (`foregroundServiceType=
"mediaPlayback"`) que mantém um `PARTIAL_WAKE_LOCK` enquanto o audiobook toca,
expõe uma `MediaSessionCompat` com notificação estilo player (capa, título,
play/pause/avançar) e gerencia foco de áudio (pausa/retoma em ligações e
outros apps de mídia). Esse Service é acessado do lado JS por um novo plugin
Capacitor customizado (`NeoReaderTtsPlaybackPlugin`), seguindo exatamente o
padrão já usado por `NeoReaderLibraryPlugin`/`NativeSystemUiService.ts`. O
sequenciamento de qual trecho tocar a seguir continua 100% em `useTTS.ts` —
o nativo só garante que o processo/CPU sigam vivos e expõe controles/estado.

## Technical Context

**Language/Version**: TypeScript 5 (React 19, Vite 8) no lado app; Java 17
(Android Gradle Plugin, `com.android.application`) no lado nativo Android.

**Primary Dependencies**: `@capacitor/android` 8.3, `@capacitor-community/
text-to-speech` 8.0 (TTS nativo), providers premium via `fetch`+`HTMLAudio
Element` (`TtsProviderRegistry.ts`), `@capacitor-community/keep-awake` 8.0
(toggle "Manter tela ligada", independente desta feature). Nova dependência
nativa: `androidx.media:media` (MediaSessionCompat/NotificationCompat.
MediaStyle/MediaButtonReceiver) — aprovada explicitamente pelo usuário nesta
sessão de planejamento.

**Storage**: N/A — feature não introduz nem altera dados persistidos
(Dexie/IndexedDB inalterado).

**Testing**: Vitest + Testing Library (unitário/JSDOM) para o wrapper JS do
plugin, `useTTS.ts` e `ReaderScreen.tsx`; verificação manual em device Android
real via `npm run android:run` + `adb logcat` para o comportamento nativo
(Service em foreground, tela apagada, chamada telefônica, Doze) — não
simulável em JSDOM.

**Target Platform**: Android nativo (Capacitor 8), minSdk 24 / compileSdk e
targetSdk 36. Web/PWA explicitamente fora de escopo (FR-012) — toda chamada
ao novo plugin é guardada por `Capacitor.isNativePlatform() && Capacitor.
getPlatform() === 'android'`.

**Performance Goals**: Narração contínua por 5+ minutos com tela apagada e
por 5+ minutos com app em segundo plano, sem interrupção perceptível
(SC-001, SC-002 — reduzido de 30min/15+min pra 5min por decisão do usuário
em 2026-08-27).

**Constraints**: `targetSdk 36` (Android 15) exige declarar
`foregroundServiceType="mediaPlayback"` e as permissões `FOREGROUND_SERVICE`
+ `FOREGROUND_SERVICE_MEDIA_PLAYBACK`; Android só permite iniciar um
foreground service desse tipo enquanto o app está em primeiro plano (por
isso o Service só pode ser iniciado a partir de `play()`, nunca de um evento
que já aconteça em segundo plano — ver R-001).

**Scale/Scope**: App single-user local-first, um único audiobook tocando por
vez (não há fila/múltiplos livros simultâneos).

## Decisões Invariantes

- **Gatilho único**: o Service/MediaSession nativo só inicia quando
  `useTTS.ts::play()` roda com `playbackModeRef.current === 'continuous'`
  (modo audiobook). Reprodução avulsa (`speakOne`, preview de voz, pronúncia
  de palavra) nunca aciona o Service (FR-013).
- **Simetria com `WakeLockService`**: `useTTS.ts` chama o novo
  `TtsPlaybackSessionService` (start/updatePlaybackState/stop) exatamente nos
  mesmos pontos onde já chama `WakeLockService` hoje (`play()`, `pause()`,
  `resume()`, `stop()`, cleanup de unmount) — mesma categoria de efeito
  colateral (manter a reprodução viva), sem duplicar ou substituir o toggle
  "Manter tela ligada" existente, que continua uma preferência independente.
- **Metadados são responsabilidade de `ReaderScreen.tsx`**: capa, título e
  capítulo atual exibidos na notificação vêm de `ReaderScreen.tsx` (que já
  tem acesso a `book` e ao TOC) via `TtsPlaybackSessionService.
  updateMetadata(...)`. `useTTS.ts` continua agnóstico de `Book` — não passa
  a conhecer capa/título.
- **Nativo nunca decide o que tocar**: o sequenciamento de chunks continua
  inteiramente em `useTTS.ts`. O Service nativo não reimplementa lógica de
  qual texto vem a seguir; ele só mantém processo/CPU vivos e expõe
  controles, metadata e sinais de foco de áudio.
- **Foco de áudio distingue perda permanente de transitória**: `AUDIOFOCUS_
  LOSS` (outro app assumiu deliberadamente, ex: usuário abriu o Spotify) só
  pausa, sem retomar sozinho; `AUDIOFOCUS_LOSS_TRANSIENT` (ex: chamada
  telefônica) pausa e retoma automaticamente ao reaver o foco
  (`AUDIOFOCUS_GAIN`). Isso resolve a ambiguidade sinalizada em `spec.md`
  FR-008.
- **Reabertura do app sem resync dedicado (FR-009)**: `MainActivity` já é
  `singleTask` e, com o Service em foreground mantendo o processo vivo, a
  mesma instância de Activity/estado React nunca é destruída durante o
  playback em segundo plano — o highlight/scroll já refletem o parágrafo
  atual quando a tela volta, sem precisar de um mecanismo de sincronização à
  parte.
- **Guarda de plataforma única**: toda a integração nativa passa por
  `Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'`,
  mesmo padrão já usado em `NativeSystemUiService.ts` (FR-012).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | PASS | PASS | Este `plan.md` + `tasks.md` são o plano de arquivos; segue para aprovação do usuário antes do `sdd-execute`. |
| II. Comentários só onde o "porquê" não é óbvio | PASS (a cumprir na implementação) | PASS | Pontos não óbvios já identificados (distinção `LOSS`/`LOSS_TRANSIENT`, por que `singleTask` dispensa resync) viram comentários previstos nas tasks correspondentes. |
| III. Explícito antes de mágico | PASS | PASS | Plugin nativo customizado explícito, sem lib de terceiros genérica que não se encaixa no modelo multi-provider (nativo + 3 APIs premium) já existente. |
| IV. Build limpo é a definição de "pronto" | PASS (a cumprir na implementação) | PASS | `npm run build` mantido como gate no Checklist de Release de `tasks.md`. |
| V. Dependências novas exigem justificativa | PASS | PASS | `androidx.media:media` justificada (única forma de expor MediaSession/notificação de mídia nativa) e aprovada explicitamente pelo usuário nesta sessão. |

Nenhuma violação — `## Complexity Tracking` fica vazia.

## Project Structure

### Documentation (this feature)

```text
specs/001-audiobook-background-playback/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo (saída do sdd-plan)
├── contracts/
│   └── tts-playback-plugin.md   # Contrato JS <-> plugin nativo
├── quickstart.md          # Roteiro de verificação manual (device Android real)
├── tasks.md               # Saída do sdd-plan (fase de tasks)
└── history.md              # Condicional, criado pelo sdd-execute quando arquivar
```

*(Sem `research.md`: as únicas incertezas técnicas identificadas — biblioteca
de MediaSession e estratégia de entrega da capa — já foram resolvidas na
exploração/decisão acima. Sem `data-model.md`: feature não introduz entidades
persistidas.)*

### Source Code (repository root)

```text
android/
└── app/
    ├── build.gradle                                  # + androidx.media:media
    └── src/main/
        ├── AndroidManifest.xml                        # + permissions + <service>
        └── java/com/johnny/neoreader/
            ├── MainActivity.java                       # + registerPlugin(NeoReaderTtsPlaybackPlugin.class)
            ├── NeoReaderLibraryPlugin.java              # existente — referência de padrão/Base64
            ├── NeoReaderTtsPlaybackPlugin.java          # NOVO — bridge Capacitor <-> Service
            └── TtsPlaybackService.java                  # NOVO — foreground service, wake lock, MediaSession, audio focus

src/
├── services/
│   ├── WakeLockService.ts                # existente — inalterado
│   ├── NativeSystemUiService.ts          # existente — padrão de referência (registerPlugin + guard de plataforma)
│   └── TtsPlaybackSessionService.ts      # NOVO — wrapper JS do NeoReaderTtsPlaybackPlugin
├── hooks/
│   └── useTTS.ts                          # + chamadas de lifecycle (start/updatePlaybackState/stop)
└── screens/
    └── ReaderScreen.tsx                   # + updateMetadata (capa/título/capítulo) + listeners de controle/foco

src/__tests__/
├── services/
│   └── TtsPlaybackSessionService.test.ts  # NOVO
├── hooks/
│   └── useTTS.test.tsx                    # + casos de lifecycle nativo
└── screens/
    └── ReaderScreen.test.tsx              # + casos de controle via notificação e foco de áudio
```

**Structure Decision**: projeto único (React+Capacitor), sem separação
backend/frontend. A feature toca três camadas já existentes no repositório
real — nativo Android (`android/app/src/main/java/com/johnny/neoreader/`),
serviço JS de ponte (`src/services/`, mesmo padrão de `NativeSystemUiService.
ts`) e orquestração de leitor (`src/hooks/useTTS.ts` + `src/screens/
ReaderScreen.tsx`) — sem criar novas pastas de nível superior.

## Complexity Tracking

*Vazio — nenhuma violação da constitution a justificar.*

## Estratégia de Testes

Prioridade: unitário → integração leve (JSDOM) → manual em device real
(último recurso, mas obrigatório aqui — comportamento de Service em
foreground, tela apagada, chamada telefônica e Doze não são simuláveis em
Vitest/JSDOM).

- **Unitário**: `TtsPlaybackSessionService.test.ts` cobre o guard de
  plataforma (nunca chama o plugin fora de Android) e o mapeamento de
  parâmetros; `useTTS.test.tsx` ganha casos verificando que start/
  updatePlaybackState/stop do novo serviço são chamados nos mesmos pontos
  que `WakeLockService` hoje (mesmo padrão de mock já usado pra
  `@capacitor-community/text-to-speech`).
- **Integração leve (JSDOM)**: `ReaderScreen.test.tsx` ganha casos simulando
  eventos `playbackControl` (play/pause/skipNext/skipPrevious) e
  `audioFocusChange` (`loss` vs `lossTransient` vs `gain`) emitidos pelo
  plugin mockado, verificando que disparam `tts.pause()/resume()` e navegação
  de parágrafo corretos — e que perda **permanente** de foco não causa
  retomada automática, só a transitória.
- **Manual (device Android real)**: roteiro em `quickstart.md`, cobrindo os
  Acceptance Scenarios de US1-US4 (tela apagando sozinha, Home/bloqueio
  manual, controles de notificação, chamada telefônica/outro app de áudio).
- **Debug real no device via captura de log**: como o comportamento central
  desta feature (wake lock, foreground service, MediaSession, foco de
  áudio) só existe no Android real e é invisível ao Vitest/JSDOM, a
  ferramenta primária de diagnóstico durante o `sdd-execute` é rodar o app
  no celular conectado por USB e capturar o logcat enquanto o cenário
  acontece de verdade (tela apaga sozinha, app em segundo plano, ligação),
  em vez de tentar inferir o comportamento só lendo código:
  1. `npm run android:run` — build + `cap sync` + instala/abre no device.
  2. Capturar log em background enquanto o cenário roda:
     - Uso pontual/curto: `npm run android:logs:diagnostics:run` (grava em
       `logs/android-diagnostics-<timestamp>-{full,filtered}.log`, já
       filtra por `NeoReaderEvent`/`NeoReaderImport`/crash/ANR/frame-drop).
     - Cenários longos (ex: aguardar a tela apagar sozinha por até 5 min, ou
       esperar uma ligação real): `adb logcat -v threadtime *>
       android-tts-playback.log` rodado em background (`run_in_background`
       no Claude Code, ou `Start-Job` no PowerShell), sem limite de tempo,
       parado manualmente quando o cenário terminar.
  3. Ler o arquivo de log gerado para confirmar (ou diagnosticar a falta
     de) cada evento nativo esperado: wake lock adquirido/liberado,
     `TtsPlaybackService` iniciado/parado, callback do `MediaSessionCompat`
     recebido, mudança de foco de áudio detectada.
  4. Para isso ser rastreável no log, todo evento nativo relevante desta
     feature (`TtsPlaybackService.java`, `NeoReaderTtsPlaybackPlugin.java`)
     DEVE usar a tag de log `"NeoReaderTtsPlayback"` (`Log.d`/`Log.w`, mesmo
     padrão de tag única por componente já usado em `NeoReaderLibraryPlugin`
     — `TAG = "NeoReaderLibrary"`) — isso também já cai no filtro
     `neoreader`/padrão de `scripts/capture-android-diagnostics.ps1`, que
     foi atualizado para reconhecer essa tag (ver T004a em `tasks.md`).

Comandos-base:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
npm run android:run
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (dependência nativa) | Concluído — `androidx.media:media:1.7.0` declarada |
| Foundational (Service/plugin/wiring) | Concluído |
| US1 (tela apaga sozinha) | Concluído — validado em device real (~5 min contínuos sem interrupção); SC-001 revisado de 30min pra 5min (decisão do usuário, 2026-08-27) — satisfeito |
| US2 (segundo plano/bloqueio manual) | Concluído — validado em device real (Home + bloqueio manual, ambos sem interrupção, 5min cronometrados na Fase 7); SC-002 revisado de 15+min pra 5+min (decisão do usuário, 2026-08-27) — satisfeito |
| Polish (Fase 7) | Concluído — lint/test/tsc/build limpos, `quickstart.md` completo (US1-US3) em device real, regressões (Word Lens avulso, toggle "Manter tela ligada") confirmadas |
| US3 (notificação/MediaSession) | Concluído — validado em device real; um bug crítico (race condition stop/start) encontrado e corrigido durante a validação (R-005) |
| US4 (foco de áudio) | Concluído — validado em device real (ligação de voz real + Spotify); R-003 resolvido após duas iterações (ver detalhe no risco) |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Android 14+/15 só permite iniciar um foreground service tipo `mediaPlayback` enquanto o app está em primeiro plano. | Se o Service for iniciado tarde ou de um contexto errado, `startForeground()` lança `ForegroundServiceStartNotAllowedException` e a feature inteira falha silenciosamente. | Resolvido: confirmado por auditoria de código (`sdd-converge`, 2026-08-27) que `TtsPlaybackSessionService.start()` só é chamado dentro de `useTTS.ts::play()` — nenhum outro call site encontrado; nenhuma falha desse tipo relatada em nenhuma validação de device real das Fases 3-8. |
| R-002 | Gerenciadores de bateria agressivos de fabricante (MIUI, ColorOS, One UI extremo) podem matar o processo mesmo com foreground service + wake lock. | Usuários desses fabricantes podem continuar vendo a narração parar. | Resolvido: decisão confirmada por auditoria (`sdd-converge`, 2026-08-27) — fora de escopo por design (spec.md → Assumptions), sem mitigação de código; nenhuma tentativa de mitigação divergente encontrada no código. |
| R-003 | **Resolvido em 2026-08-27, após duas iterações.** Diagnóstico original — confirmado em device real (T032, 2026-08-26) — não é o `@capacitor-community/text-to-speech`, é o **WebView/Chromium**: toda vez que um provider premium (Speechify/ElevenLabs/Fish Audio) toca um chunk via `new Audio(url)` em `playAudioBlob` (useTTS.ts), o Chromium interno pede/devolve foco de áudio sozinho (log: `MediaFocusControl: requestAudioFocus()/abandonAudioFocus() ... clientId=...org.chromium.content.browser.AudioFocusDelegate... callingPack=com.johnny.neoreader`) — isso acontece a cada poucos segundos, o tempo todo. Nosso `TtsPlaybackService.requestAudioFocus()` (`AudioFocusRequestCompat`) fica "soterrado": como o Chromium fica se re-registrando como o pedido mais recente do mesmo app, quando uma ligação real chega (testado com chamada de voz do WhatsApp — integra via Telecom/`ConnectionService`, pede foco com `AA=USAGE_NOTIFICATION_RINGTONE` depois `USAGE_VOICE_COMMUNICATION`), o Android **não notificou nosso `OnAudioFocusChangeListener`** (nenhum `handleAudioFocusChange: AUDIOFOCUS_LOSS*` no log durante a janela da ligação) — a narração simplesmente continuou por cima da ligação. | **Bloqueia US4 (SC-004)**: pausa automática em ligação não funciona quando o provider ativo é premium (via `<audio>` do WebView). Não testado ainda se o mesmo problema ocorre com provider **nativo** (TextToSpeech do Android, sem elemento `<audio>` — nesse caso só nosso `AudioFocusRequestCompat` existiria, sem o concorrente do Chromium; provável que funcione, mas não confirmado). | **Tentativa 1 (direção a)**: `src/hooks/useTTS.ts::playAudioBlob` passou a reaproveitar um único `HTMLAudioElement` (`sharedPremiumAudioElementRef`) por toda a vida do hook, trocando só `.src` a cada chunk em vez de `new Audio(url)`. Isso reduziu drasticamente o churn de request/abandon do Chromium (de "a cada poucos segundos" pra praticamente zero durante a reprodução), mas revelou um problema mais fundamental via log filtrado (`MediaFocusControl`): o `AudioFocusDelegate` do Chromium pede `AUDIOFOCUS_GAIN` (não transitório) assim que o primeiro chunk toca, e Android **evicta permanentemente** nosso `AudioFocusRequestCompat` (não é uma perda transitória com retomada automática — é uma remoção completa do stack de foco). Resultado: toda sessão premium tinha uma pausa espúria ~4s após iniciar, exigindo toque manual em "play" pra continuar (achado pelo usuário no teste real). **Causa raiz completa**: o `<audio>` HTML5 dos providers premium roda dentro do WebView, e o **Chromium já pausa/retoma esse elemento sozinho** ao perder/reaver foco de áudio — comportamento nativo do Chromium para elementos de mídia, independente de qualquer código nosso. Confirmado empiricamente: no teste do Spotify, a narração pausou corretamente mesmo com nosso `AudioFocusRequestCompat` já evictado e fora do stack de foco havia mais de 30 segundos (ou seja, quem pausou foi o próprio WebView, não nosso `OnAudioFocusChangeListener`). **Tentativa 2 (final, resolvida)**: como o WebView já cuida corretamente do caso premium (pausa em perda transitória/permanente e retoma sozinho só na transitória — exatamente o comportamento desejado por FR-008), nosso próprio pedido de foco nativo só é útil pro provider **nativo** (`@capacitor-community/text-to-speech`, sem `<audio>` no meio — não tem ninguém cuidando disso por fora). Correção: `useTTS.ts` ganhou `handleAudioFocusChange(type)` (exportado pelo hook), que só age quando `activeProviderRef.current === 'native'`; pra premium, o evento é ignorado e o WebView resolve sozinho. `ReaderScreen.tsx::audioFocusHandlerRef` foi simplificado pra só repassar o evento (`tts.handleAudioFocusChange(event.type)`) — a lógica de pause/resume e o bookkeeping de perda transitória-vs-permanente saíram do componente e passaram a viver dentro do hook. Revalidado em device real pelo usuário: sem pausa espúria no início, ligação de voz real (WhatsApp) e Spotify pausam/retomam corretamente. |
| R-004 | `useTtsSleepTimer.ts` usa `setInterval`/`setTimeout` de JS puro; throttling de aba em segundo plano poderia atrasar o disparo. | Sleep timer dispara com atraso quando o app está em segundo plano. | Resolvido: decisão confirmada por auditoria (`sdd-converge`, 2026-08-27) — fora do escopo desta feature (comportamento pré-existente, não citado nos FRs), `useTtsSleepTimer.ts` não foi tocado; risco conhecido, não bloqueador. |
| R-005 | `TtsPlaybackService.onStartCommand` usava `stopSelf()` sem `startId` — um `start()` entregue logo após um `stop()` (padrão comum em `useTTS.ts`/`ReaderScreen.tsx`: avançar/voltar parágrafo, trocar provider/velocidade) podia ser destruído pelo stop antigo mesmo já tendo reiniciado a sessão. | Achado na validação manual de US3 (device real): tocar "avançar" na notificação derrubava a notificação e, ao apagar a tela em seguida, a narração parava (wake lock já tinha sido liberado). | Resolvido: trocado por `stopSelf(startId)`, que só efetiva a parada se nenhum start mais novo tiver sido entregue depois — mesma correção protege todos os fluxos JS que fazem stop+start em sequência rápida. |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-08-26 | Fase 1 (Setup) | T001: `androidxMediaVersion = '1.7.0'` em `variables.gradle` + `implementation "androidx.media:media:$androidxMediaVersion"` em `app/build.gradle`. | Nenhuma — pronto pra Fase 2 (Foundational). |
| 2026-08-26 | Fase 2 (Foundational) | T002-T010: manifest (permissões + `<service>`), `TtsPlaybackService.java` (foreground service + wake lock + notificação básica), `NeoReaderTtsPlaybackPlugin.java` (`start`/`stop`), registro em `MainActivity.java`, `TtsPlaybackSessionService.ts`, wiring em `useTTS.ts`/`ReaderScreen.tsx`. Lint/tsc/build/testes-alvo passaram; suite completa 566/570 (1 falha de infra pré-existente e não relacionada, logada em backlog). | Validação em device real (notificação + narração com tela apagada) fica pro fechamento de US1. |

| 2026-08-26 | Fase 3 (User Story 1) | T011-T013 concluídas (T012/T013 já satisfeitas pela Fundação). Validação em device real (Samsung SM-S911B): áudio (ElevenLabs) continuou tocando e avançando de parágrafo com a tela apagada por 4+ min contínuos, sem `stop`/`error` no log. Encerrado por decisão do usuário antes de completar os 30min da SC-001. | Rodar o teste completo de 30min continua pendente pro `quickstart.md` da fase Polish (T034). |

| 2026-08-26 | Fase 4 (User Story 2) | T014-T015 concluídas — sem mudança de comportamento necessária (só comentário), infra da Fundação já cobria o cenário. Validação em device real: Home e bloqueio manual, ambos sem interrupção (confirmado pelo usuário e pelo log — narração avançou continuamente até um `tts.playback.stop` limpo). | Teste estendido de 15+min fica pro `quickstart.md` da fase Polish. |
| 2026-08-27 | Fase 7 (Polish) — decisão de escopo | Usuário decidiu reduzir os testes estendidos de SC-001 (30min) e SC-002 (15+min) pra um máximo de 5min — evidência de alguns minutos contínuos já é suficiente. `spec.md` (SC-001/SC-002 + Clarifications), `tasks.md` (Fases 3/4) e este `plan.md` (Performance Goals, Estado Atual) atualizados. A validação de ~5min já feita na Fase 3 (US1) passa a satisfazer SC-001 diretamente. | Confirmar ~5min cronometrados pra US2 (SC-002) dentro do roteiro completo de `quickstart.md` (T034). |

| 2026-08-26 | Fase 5 (User Story 3) | T016-T026 concluídas: notificação `MediaStyle` completa (capa/título/capítulo/prev-playpause-next) com `MediaSessionCompat`, controles ida-e-volta JS↔nativo, `POST_NOTIFICATIONS` em runtime. **Bug crítico encontrado e corrigido na validação em device** (T021a): `stopSelf()` sem `startId` derrubava a sessão quando um `start()` chegava logo após um `stop()` (padrão usado por avançar/voltar parágrafo e troca de provider/velocidade) — corrigido pra `stopSelf(startId)`. Revalidado em device com sucesso (avançar/voltar com tela apagada, sem queda). | Nenhuma. |

| 2026-08-26 | Fase 6 (User Story 4) | T027-T031 implementadas e testadas (unitário + build + device). T032: validação empírica em device revelou bug real de R-003 (Chromium `AudioFocusDelegate` conflita com nosso `AudioFocusRequestCompat` durante playback premium — ligação de voz do WhatsApp não pausou a narração). Diagnóstico completo registrado, correção ainda não implementada. **Sessão pausada pelo usuário nesse ponto.** | Implementar uma das direções candidatas de R-003, revalidar em device (ligação real + abrir outro app de mídia, que ainda não foi testado), então fechar T032 e o checkpoint da Fase 6. |
| 2026-08-27 | Fase 6 (User Story 4) | T032, tentativa 1: `useTTS.ts::playAudioBlob` reaproveita um único `HTMLAudioElement` entre chunks premium em vez de `new Audio(url)` por chunk. Reduziu o churn de foco do Chromium, mas revalidação em device (log filtrado `MediaFocusControl`) mostrou uma pausa espúria no início de toda sessão premium (Chromium evicta nosso foco de vez, não transitoriamente) — regressão nova achada pelo usuário. | Investigar por que a pausa inicial precisa de toque manual e corrigir antes de fechar T032. |
| 2026-08-27 | Fase 6 (User Story 4) | T032, tentativa 2 (final): causa raiz completa identificada — o `<audio>` premium roda no WebView, e o Chromium já pausa/retoma esse elemento sozinho ao perder/reaver foco (confirmado: Spotify pausou a narração mesmo com nosso foco nativo já evictado há 30+s). Nosso pedido de foco só é útil pro provider nativo. Correção: `useTTS.ts` ganhou `handleAudioFocusChange(type)` exportado, gated por `activeProviderRef.current === 'native'`; `ReaderScreen.tsx` simplificado pra só repassar o evento. Testes atualizados (`useTTS.test.tsx`, `ReaderScreen.test.tsx`); `npm run lint && npm test && npx tsc --noEmit && npm run build` limpos (577/584 na rodada sob carga total — 3 timeouts em arquivos não relacionados, confirmados como flakiness de infra pré-existente ao isolar os arquivos, não regressão). **Revalidado em device real pelo usuário**: "testei tudo de novo, funcionou certinho" — sem pausa espúria, ligação real e Spotify pausando/retomando corretamente. T032 e Fase 6 (US4) concluídos. | Nenhuma — seguir pra Fase 7 (Polish). |
| 2026-08-27 | Fase 7 (Polish) | T033-T035 concluídas. `npm run lint && npm test && npx tsc --noEmit && npm run build` limpos. **Device real (roteiro `quickstart.md`, US1-US3 — US4 já validado na Fase 6 no mesmo dia)**: notificação completa OK; tela apagando sozinha por 5min sem interrupção (SC-001); Home por 5min sem interrupção com progresso correto ao reabrir (SC-002); bloqueio manual sem interrupção; controles de pause/play/avançar pela notificação OK; stop remove a notificação. Regressões confirmadas separadamente pelo usuário: TTS avulso (Word Lens) não abre notificação/Service; toggle "Manter tela ligada" funcionando normalmente. Checklist de Release completo. | Nenhuma — feature completa. |
| 2026-08-27 | Fase 8 (Convergence) | `sdd-converge` encontrou 3 lacunas de documentação (nenhuma CRITICAL): contrato desatualizado quanto ao gating de `audioFocusChange` por provider ativo (CF-01), `coverBase64` documentado em `start()` mas nunca implementado (CF-02), e o Edge Case de fallback premium→nativo com o audiobook em segundo plano nunca validado em device (CF-03). T036-T038 anexadas e concluídas: `contracts/tts-playback-plugin.md` corrigido; T038 validado em device real (Wi-Fi desligado durante narração premium em segundo plano — log confirmou múltiplos `tts.provider.fallback` sem erro fatal, narração seguiu contínua no nativo). Segunda rodada de `sdd-converge` não encontrou nenhum achado novo — convergência limpa. | Nenhuma — feature convergida. |

**PRÓXIMO**: Feature `001-audiobook-background-playback` convergida — nenhum trabalho pendente conhecido.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java` (requestAudioFocus/handleAudioFocusChange) — inalterado nesta feature; segue pedindo foco sempre, mas isso só importa de fato pro provider nativo agora
- `src/hooks/useTTS.ts` (`playAudioBlob` usa `sharedPremiumAudioElementRef`, um `HTMLAudioElement` reaproveitado entre chunks; novo `handleAudioFocusChange(type)` exportado, gated por `activeProviderRef.current === 'native'`)
- `src/screens/ReaderScreen.tsx` (`audioFocusHandlerRef` simplificado — só repassa `event.type` pro hook)
- `src/__tests__/hooks/useTTS.test.tsx` / `src/__tests__/screens/ReaderScreen.test.tsx` (testes ajustados pros dois pontos acima)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `npm run android:run` (`npx cap run android`) falha neste ambiente Windows com `'gradlew' is not recognized...` — a Capacitor CLI não resolve o `gradlew`/`gradlew.bat` corretamente ao invocar o Gradle. Workaround pra instalar/testar em device real nas próximas fases: `npm run build && npx cap sync android` (isso funciona) seguido de `cd android; .\gradlew.bat installDebug` e `adb shell monkey -p com.johnny.neoreader -c android.intent.category.LAUNCHER 1` pra abrir o app. Logado em `.planning/backlog.md` como `[Bug]` de tooling, fora do escopo desta feature corrigir a causa raiz.
- Device adb pode aparecer como `unauthorized` na primeira conexão da sessão — é preciso autorizar manualmente o prompt de depuração USB na tela do celular antes de qualquer comando `adb`/`gradlew installDebug` funcionar.
- **US4 parada no meio (2026-08-26)**: T027-T031 feitos e testados (unitário + device parcial: pausa/retoma OK com `lossTransient`/`gain` simulados, mas a ligação real do WhatsApp não pausou — ver R-003 acima). T032 (validação empírica) ficou pendente de correção, não de teste — o teste já rodou e revelou o bug do Chromium `AudioFocusDelegate`. Ao retomar: não repetir a investigação, já está documentada em R-003; ir direto pra uma das direções candidatas de fix.

## Resultado Final

Feature concluída e convergida em 2026-08-27, após 8 fases (Setup,
Foundational, US1-US4, Polish, Convergence).

**O que foi construído**: um `TtsPlaybackService` Android em foreground
(`foregroundServiceType="mediaPlayback"`) que mantém `PARTIAL_WAKE_LOCK` +
`MediaSessionCompat` + notificação estilo player enquanto o audiobook toca,
acessado do JS via o plugin Capacitor customizado `NeoReaderTtsPlaybackPlugin`
e seu wrapper `TtsPlaybackSessionService.ts`. `useTTS.ts` continua sendo a
única fonte de verdade sobre o que tocar; o nativo só garante processo/CPU
vivos, expõe controles de mídia (play/pause/avançar) e, pro provider TTS
nativo, participa do sistema de foco de áudio do Android pra pausar/retomar
em ligações e outros apps de mídia.

**Desvios acumulados em relação ao plano original**:

- **R-005 (não previsto no plano original)**: `stopSelf()` sem `startId` no
  `TtsPlaybackService` causava uma race condition — um `start()` entregue
  logo após um `stop()` (padrão comum em avançar/voltar parágrafo, troca de
  provider/velocidade) podia ser destruído pelo stop antigo. Corrigido pra
  `stopSelf(startId)`; a correção protege todos os fluxos JS que fazem
  stop+start em sequência rápida, não só os desta feature.
- **R-003, a descoberta mais significativa da feature**: o plano original
  presumia que um `AudioFocusRequestCompat` nativo bastaria pra cobrir tanto
  o provider nativo quanto os premium. Na prática, o `<audio>` HTML5 dos
  providers premium roda dentro do WebView, e o Chromium já gerencia foco de
  áudio sozinho pra esse elemento — inclusive pausando/retomando
  corretamente em ligações e outros apps de mídia, sem nenhuma participação
  do app. Competir com esse mecanismo (pedindo foco nativo também pro caso
  premium) só causava uma pausa espúria no início de toda sessão. A decisão
  final: `useTTS.ts::handleAudioFocusChange` só age quando o provider ativo
  é nativo; pra premium, o app conscientemente cede essa responsabilidade ao
  WebView. Ver R-003 (resolvido) pro diagnóstico completo.
- **Critérios de sucesso reduzidos por decisão do usuário**: SC-001 (30min)
  e SC-002 (15+min) foram reduzidos pra 5min cada — evidência de alguns
  minutos contínuos sem interrupção já foi considerada suficiente pra
  validar o mecanismo, sem necessidade de esperar a duração completa em toda
  execução manual do roteiro.
- **Fase 8 (Convergence)**: encontrou e corrigiu 3 lacunas de fidelidade de
  documentação (contrato desatualizado quanto ao gating de foco por
  provider e ao fluxo real da capa em `start()`/`updateMetadata()`) e uma
  verificação de regressão prevista mas nunca executada (fallback
  premium→nativo com o audiobook em segundo plano) — todas de baixo/médio
  risco, nenhuma indicando um defeito funcional não descoberto antes.

**Decisões técnicas que ficaram diferentes do plano original**: nenhuma
mudança de dependência ou arquitetura além do já registrado acima — a
dependência `androidx.media:media` e a estrutura de arquivos seguiram
exatamente o plano original.
