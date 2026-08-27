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

**Performance Goals**: Narração contínua por 30+ minutos com tela apagada e
por 15+ minutos com app em segundo plano, sem interrupção perceptível
(SC-001, SC-002).

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
     - Cenários longos (ex: aguardar a tela apagar sozinha por 30 min, ou
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
| US1 (tela apaga sozinha) | Concluído — validado em device real (4+ min contínuos sem interrupção); teste completo de 30min fica pro `quickstart.md` da fase Polish |
| US2 (segundo plano/bloqueio manual) | Concluído — validado em device real (Home + bloqueio manual, ambos sem interrupção); teste estendido de 15+min fica pro `quickstart.md` da fase Polish |
| US3 (notificação/MediaSession) | Concluído — validado em device real; um bug crítico (race condition stop/start) encontrado e corrigido durante a validação (R-005) |
| US4 | Não iniciado |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Android 14+/15 só permite iniciar um foreground service tipo `mediaPlayback` enquanto o app está em primeiro plano. | Se o Service for iniciado tarde ou de um contexto errado, `startForeground()` lança `ForegroundServiceStartNotAllowedException` e a feature inteira falha silenciosamente. | Iniciar o Service exclusivamente dentro de `useTTS.ts::play()` (sempre chamado com o app em primeiro plano/visível), nunca a partir de um listener que já dispare em segundo plano. |
| R-002 | Gerenciadores de bateria agressivos de fabricante (MIUI, ColorOS, One UI extremo) podem matar o processo mesmo com foreground service + wake lock. | Usuários desses fabricantes podem continuar vendo a narração parar. | Fora de escopo por decisão da spec (Assumptions) — nenhuma mitigação de código é confiável contra isso; não bloqueia a feature. |
| R-003 | `@capacitor-community/text-to-speech` pode requisitar foco de áudio internamente de forma não coordenada com o `AudioFocusRequestCompat` do novo Service. | Dois pedidos de foco conflitantes podem causar pausas/retomadas espúrias. | Validar empiricamente na implementação da US4 (device real); se houver conflito, o novo Service nativo deve ser a única fonte de verdade de foco. |
| R-004 | `useTtsSleepTimer.ts` usa `setInterval`/`setTimeout` de JS puro; throttling de aba em segundo plano poderia atrasar o disparo. | Sleep timer dispara com atraso quando o app está em segundo plano. | Fora do escopo desta feature (comportamento pré-existente, não citado nos FRs); risco conhecido, não bloqueador. |
| R-005 | `TtsPlaybackService.onStartCommand` usava `stopSelf()` sem `startId` — um `start()` entregue logo após um `stop()` (padrão comum em `useTTS.ts`/`ReaderScreen.tsx`: avançar/voltar parágrafo, trocar provider/velocidade) podia ser destruído pelo stop antigo mesmo já tendo reiniciado a sessão. | Achado na validação manual de US3 (device real): tocar "avançar" na notificação derrubava a notificação e, ao apagar a tela em seguida, a narração parava (wake lock já tinha sido liberado). | Resolvido: trocado por `stopSelf(startId)`, que só efetiva a parada se nenhum start mais novo tiver sido entregue depois — mesma correção protege todos os fluxos JS que fazem stop+start em sequência rápida. |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-08-26 | Fase 1 (Setup) | T001: `androidxMediaVersion = '1.7.0'` em `variables.gradle` + `implementation "androidx.media:media:$androidxMediaVersion"` em `app/build.gradle`. | Nenhuma — pronto pra Fase 2 (Foundational). |
| 2026-08-26 | Fase 2 (Foundational) | T002-T010: manifest (permissões + `<service>`), `TtsPlaybackService.java` (foreground service + wake lock + notificação básica), `NeoReaderTtsPlaybackPlugin.java` (`start`/`stop`), registro em `MainActivity.java`, `TtsPlaybackSessionService.ts`, wiring em `useTTS.ts`/`ReaderScreen.tsx`. Lint/tsc/build/testes-alvo passaram; suite completa 566/570 (1 falha de infra pré-existente e não relacionada, logada em backlog). | Validação em device real (notificação + narração com tela apagada) fica pro fechamento de US1. |

| 2026-08-26 | Fase 3 (User Story 1) | T011-T013 concluídas (T012/T013 já satisfeitas pela Fundação). Validação em device real (Samsung SM-S911B): áudio (ElevenLabs) continuou tocando e avançando de parágrafo com a tela apagada por 4+ min contínuos, sem `stop`/`error` no log. Encerrado por decisão do usuário antes de completar os 30min da SC-001. | Rodar o teste completo de 30min continua pendente pro `quickstart.md` da fase Polish (T034). |

| 2026-08-26 | Fase 4 (User Story 2) | T014-T015 concluídas — sem mudança de comportamento necessária (só comentário), infra da Fundação já cobria o cenário. Validação em device real: Home e bloqueio manual, ambos sem interrupção (confirmado pelo usuário e pelo log — narração avançou continuamente até um `tts.playback.stop` limpo). | Teste estendido de 15+min fica pro `quickstart.md` da fase Polish. |

| 2026-08-26 | Fase 5 (User Story 3) | T016-T026 concluídas: notificação `MediaStyle` completa (capa/título/capítulo/prev-playpause-next) com `MediaSessionCompat`, controles ida-e-volta JS↔nativo, `POST_NOTIFICATIONS` em runtime. **Bug crítico encontrado e corrigido na validação em device** (T021a): `stopSelf()` sem `startId` derrubava a sessão quando um `start()` chegava logo após um `stop()` (padrão usado por avançar/voltar parágrafo e troca de provider/velocidade) — corrigido pra `stopSelf(startId)`. Revalidado em device com sucesso (avançar/voltar com tela apagada, sem queda). | Nenhuma. |

**PRÓXIMO**: Fase 6 (User Story 4) — T027-T032: foco de áudio nativo (`AudioFocusRequestCompat`, distinção `LOSS`/`LOSS_TRANSIENT`), evento `audioFocusChange` no plugin/wrapper JS, wiring em `ReaderScreen.tsx`, e validação empírica de conflito com `@capacitor-community/text-to-speech` (R-003).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java`
- `android/app/src/main/java/com/johnny/neoreader/NeoReaderTtsPlaybackPlugin.java`
- `src/services/TtsPlaybackSessionService.ts`
- `src/screens/ReaderScreen.tsx`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `npm run android:run` (`npx cap run android`) falha neste ambiente Windows com `'gradlew' is not recognized...` — a Capacitor CLI não resolve o `gradlew`/`gradlew.bat` corretamente ao invocar o Gradle. Workaround pra instalar/testar em device real nas próximas fases: `npm run build && npx cap sync android` (isso funciona) seguido de `cd android; .\gradlew.bat installDebug` e `adb shell monkey -p com.johnny.neoreader -c android.intent.category.LAUNCHER 1` pra abrir o app. Logado em `.planning/backlog.md` como `[Bug]` de tooling, fora do escopo desta feature corrigir a causa raiz.
- Device adb pode aparecer como `unauthorized` na primeira conexão da sessão — é preciso autorizar manualmente o prompt de depuração USB na tela do celular antes de qualquer comando `adb`/`gradlew installDebug` funcionar.
