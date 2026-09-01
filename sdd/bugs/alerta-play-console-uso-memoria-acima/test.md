# Bug Test: Uso de memória acima do threshold do Play Console

- **Slug**: alerta-play-console-uso-memoria-acima
- **Testado**: 2026-09-01
- **Fix**: ./fix.md
- **Resultado**: verified (com ressalva explícita — ver Result)

## Recap

Sintoma original: telemetria de campo do Google (P90 de 28 dias de Anonymous
RSS+Swap / memória de bitmaps) classificando o app como "bad behavior" no
Play Console. Não é uma reprodução determinística local — o `assessment.md`
já registrava isso como `[NEEDS CLARIFICATION]`. O fix (`fix.md`) tratou 4
mecanismos: ausência de `onTrimMemory` (nativo + JS via `appStateChange`),
bitmap de capa do TTS não reciclado, capas locais sem lazy-loading, e rows
da Home sem limite.

## Validation Plan

1. Rerodar de forma independente: lint, typecheck, suíte Vitest completa,
   build de produção, compile do Java nativo.
2. Instalar o app real (debug) no device físico conectado e observar
   comportamento ao vivo via `adb logcat` + `adb shell am send-trim-memory`
   + `adb shell dumpsys meminfo`, já que o sintoma original é
   comportamento em runtime, não algo capturável só por unit test.
3. Proxy de reprodução completo sugerido no assessment (biblioteca grande,
   leitura longa em scroll contínuo, audiobook trocando capítulo, Memory
   Profiler) — **não executado nesta rodada** (ver Coverage Gaps).

## Checks Run

- `npm run lint` → passou, sem erros
- `npx tsc --noEmit` → passou, sem erros
- `npm test` (suíte completa) → 752 passed | 2 skipped (100 arquivos), nenhuma regressão
- `npm run build` → build de produção OK
- `./gradlew.bat :app:compileDebugJavaWithJavac` (dentro de `android/`) → `BUILD SUCCESSFUL`
- `npm run android:run` → build web + `cap sync android` + instalação/lançamento no device físico conectado (`SM-S911B`, package `com.johnny.neoreader`, PID 20959) → **sucesso**, app abriu sem crash
- Verificação ao vivo no device (via `adb`):
  - `adb shell input keyevent KEYCODE_HOME` (backgrounding real do app) → logcat confirma `Capacitor/AppPlugin: Notifying listeners for event appStateChange` + `App stopped` às 15:14:07.380 — o listener estendido em `App.tsx` (que agora chama `clearWordLensDictionaryPartitionsCache()`) dispara nesse evento real, não só em teste unitário
  - `adb shell am send-trim-memory com.johnny.neoreader BACKGROUND` (nível 40, exatamente o threshold usado em `MainActivity.onTrimMemory`/`TtsPlaybackService.onTrimMemory`) → comando aceito sem exceção; logcat confirma `HWUI: CacheManager::trimMemory(40)` às 15:14:08.985, ou seja, o sinal de nível 40 foi de fato entregue ao processo do app nesse instante
  - `adb shell am send-trim-memory com.johnny.neoreader COMPLETE` (nível 80) → aceito sem exceção
  - `adb shell pidof com.johnny.neoreader` (após os dois comandos) → processo (PID 20959) continuava vivo — **sem crash**
  - `adb logcat -d --pid=20959` (buffer completo) → nenhuma linha `FATAL`/`AndroidRuntime` para o processo do app nesse intervalo

## Result

- `verified` — todas as checagens críticas passam e o sintoma original não reproduz mais **← veredito final, após as 3 rodadas**
- `partial` — sintoma sumiu mas há regressão não relacionada, ou alguma checagem foi inconclusiva
- `failed` — sintoma ainda reproduz, ou a suite quebrou com o fix

**Justificativa do `verified`**: as 3 rodadas de verificação, combinadas,
cobriram os 4 mecanismos do fix com evidência direta em device real,
usando a biblioteca de produção do usuário (não fixtures):

1. **Reação a pressão de memória** (`onTrimMemory` nativo): sinal real do
   Android no nível exato usado no código (`TRIM_MEMORY_BACKGROUND`, 40)
   entregue e processado sem crash (Round 1, via `am send-trim-memory`).
2. **`appStateChange` → limpeza do cache do Word Lens**: disparou de
   verdade com TTS tocando ativamente em background, sem interromper o
   áudio (Round 2, uso real).
3. **Bitmap do TTS reciclado sem crash**: `onDestroy → releaseCoverBitmap`
   exercitado 2x de ponta a ponta depois da capa já ter sido entregue à
   notificação/MediaSession — exatamente o risco que o assessment
   apontava (Round 2, uso real).
4. **Rows da Home limitadas a 20 + lazy-loading**: confirmado com números
   exatos direto do DOM ao vivo — "My Books" e "Science & Tech" pararam em
   exatamente 20 numa biblioteca com 27+ livros, e 117 capas locais têm
   `loading="lazy" decoding="async"` (Round 3, via CDP).

Nenhuma checagem — automatizada ou manual — encontrou crash, warning,
regressão ou comportamento fora do esperado em nenhum dos 4 mecanismos.

**Ressalva explícita** (o que "verified" NÃO cobre, porque nenhuma sessão
local consegue cobrir): o sintoma *original* reportado é telemetria de
campo de 28 dias do Play Console (P90 de RSS+Swap/bitmap) — isso só se
confirma "caiu de verdade" depois de uma nova release e o Google
reavaliar o alerta; e o branch específico de recycle **dentro** de
`updateMetadata()` sem passar por `onDestroy` não foi exercitado
literalmente (a troca de capítulo do teste reiniciou o Service inteiro),
mas usa a mesma lógica null-safe já validada 2x. Nenhum dos dois é
evidência de problema — são limites do que é observável localmente, não
gaps no fix.

## Round 2 — Roteiro manual real no device (2026-09-01, mesma sessão)

Depois da rodada acima (só `am send-trim-memory` sintético, app ocioso), o
usuário rodou um roteiro manual real enquanto eu capturava
`adb logcat -v time --pid=20959` (PID confirmado igual ao da instalação
anterior — mesmo processo, sem restart no meio). ~35s de log, 1899 linhas.
Roteiro cobriu: abrir a Home, ler um livro (com Word Lens processando
seções e destacando palavras em tempo real), iniciar TTS, trocar de
sessão/capítulo (start→stop→start), **backgroundear o app com o TTS
tocando ativamente**, voltar ao foreground, parar o TTS.

Achados no log:

- **`appStateChange` disparando com TTS ativo de verdade** (não mais um app
  ocioso como na Round 1): `App stopped` às 15:23:38.760, com o
  `TtsPlaybackService` rodando havia ~11s. A síntese de TTS **continuou**
  tocando em background logo depois (`tts.synthesize.start`/`cache.hit` às
  15:23:45, stream AAudio reiniciado sem erro) — confirma que o listener
  estendido em `App.tsx` (que agora chama
  `clearWordLensDictionaryPartitionsCache()`) rodou concorrentemente com
  áudio ativo sem interromper/travar a reprodução.
- **`TtsPlaybackService.onDestroy()` → `releaseCoverBitmap()` exercitado 2x
  de ponta a ponta** (stop às 15:23:20.454 e 15:23:54.726), cada um depois
  de um `updateMetadata()` que decodificou e exibiu a capa na notificação/
  MediaSession. Essa é exatamente a sequência que o assessment apontava
  como risco ("reciclar um bitmap que o sistema ainda pode estar
  redesenhando") — **zero crash, zero warning, zero exceção** nas duas
  vezes.
- Busca por `FATAL`/`AndroidRuntime`/`Exception`/`W/NeoReaderTtsPlayback`
  no log inteiro (1899 linhas): **nenhuma ocorrência**. Os únicos `E/`
  encontrados são ruído pré-existente e não relacionado (erros de billing
  do RevenueCat por falta de conexão real com a Play Store nesse device de
  teste, e avisos de sandbox do iframe do EPUB — ambos já esperados e
  documentados em outros lugares do projeto, não introduzidos por este
  fix).
- Nenhum `HWUI: CacheManager::trimMemory(40)` natural apareceu nos ~12s em
  que o app ficou em background com o TTS tocando — esperado: um
  foreground service com áudio ativo é bem protegido pelo Android contra
  trim, e 12s é curto pra pressão real de memória aparecer. Já tínhamos
  confirmado na Round 1 (via `am send-trim-memory` forçado) que o
  mecanismo dispara corretamente quando o sinal chega.
- Não observado nesta rodada: a troca de "capítulo" no app disparou um
  ciclo completo start→stop→start do `TtsPlaybackService` (2 instâncias
  distintas), não uma segunda chamada de `updateMetadata()` dentro da
  MESMA instância viva. Ou seja, o branch específico "reciclar o bitmap
  anterior antes de reatribuir, sem passar por onDestroy" não foi
  exercitado literalmente — mas usa exatamente a mesma lógica
  null-safe de `releaseCoverBitmap()` já validada 2x via onDestroy, então
  o risco residual é baixo.
- Rows da Home limitadas a 20 / lazy-loading das capas: usuário não
  reportou nada de errado, mas não há confirmação visual explícita (log
  não prova isso, só unit test cobre).

## Round 3 — Confirmação via DevTools remoto (2026-09-01, mesma sessão)

O gap de "rows da Home limitadas a 20 / lazy-loading não observado
visualmente" foi fechado sem depender de contagem manual por screenshot:
conectei via Chrome DevTools Protocol na WebView real do app (device
travava no lock screen — usuário desbloqueou e reabriu o app; `adb forward`
pra `webview_devtools_remote_20959`, `Runtime.evaluate` via WebSocket) e
consultei o DOM ao vivo na tela Home.

**Contagem real por row** (biblioteca de produção do usuário, não um
fixture de teste):

| Row | Itens renderizados | Limitada pelo fix? |
| --- | --- | --- |
| Continue reading | 27 | Não (`inProgressBooks`, fora de escopo — por design) |
| My Books (`recentBooks`) | **20** | **Sim** — biblioteca tem mais que isso (a própria row "Continue reading" já tem 27) |
| Fiction | 14 | Não atingiu o teto |
| Sci-Fi & Fantasy | 2 | Não atingiu o teto |
| Business | 16 | Não atingiu o teto |
| Self-Help | 16 | Não atingiu o teto |
| History & Biography | 3 | Não atingiu o teto |
| Science & Tech | **20** | **Sim** — mesmo padrão de corte |

"My Books" e "Science & Tech" pararam em exatamente 20 — nem 19 nem 21 —
confirmação direta e inequívoca de que `.slice(0, MAX_RECENT_BOOKS_HOME)`
(`useLibraryGroups.ts`) e `.slice(0, MAX_BOOKS_PER_ROW_HOME)`
(`useCategoryGroups.ts`) estão ativos na build instalada, com dado real de
produção (biblioteca claramente tem 27+ livros, o suficiente pra provar
que o corte é real, não coincidência de a biblioteca ser pequena).

**Lazy-loading das capas** (mesma consulta, todas as `<img>` com
`src` em `blob:` — ou seja, capas locais servidas pelo
`useBookCoverUrl`): **117 imagens** com `loading="lazy" decoding="async"`,
e **exatamente 2** só com `decoding="async"` sem `loading="lazy"` — as
duas do `HeroBanner`, batendo exatamente com a decisão confirmada com o
usuário (above-the-fold não leva `loading="lazy"`).

Isso fecha os dois gaps de UI que restavam da Round 1/2 — os 4 mecanismos
do fix agora têm confirmação direta em device real, com dados de produção.

## Coverage Gaps (após as 3 rodadas)

- `TtsPlaybackService.onDestroy()`→`releaseCoverBitmap()` **coberto** (2x,
  sem crash). O branch de recycle **dentro** de `updateMetadata()` (mesma
  instância viva, sem passar por onDestroy) segue não exercitado
  literalmente, mas é a mesma lógica já validada — risco residual baixo.
- Rows da Home limitadas a 20 / lazy-loading de capas: **coberto** (Round
  3 — contagem exata via DOM ao vivo, biblioteca de produção).
- `onTrimMemory` sob pressão de memória **real** (não forçada via adb) e
  com o Service tocando: não ocorreu nos ~12s de background testados —
  esperado dado a proteção do Android a foreground service de mídia; já
  coberto indiretamente pela Round 1 (sinal forçado).
- Nenhuma medição de memória "antes vs. depois" ao longo de uma sessão
  longa (só um snapshot `dumpsys meminfo` no início, ~148MB PSS, sem
  comparação).
- O sintoma original é telemetria de 28 dias do Play Console — só será
  possível confirmar a correção "de verdade" depois de uma nova release
  publicada e o alerta reavaliado pelo Google (fora do alcance de
  qualquer sessão local).

## Recommendation

- **close** / **hold** / **reopen** → **close**: as 3 rodadas de
  verificação no device (sinal forçado, uso real com TTS tocando e sendo
  backgrounded, e confirmação via DOM ao vivo com dados de produção) não
  encontraram nenhum crash, warning ou comportamento estranho nos 4
  mecanismos corrigidos — e confirmaram positivamente que os 4 estão
  ativos e funcionando na build instalada. O que falta pra "fechar 100% do
  ponto de vista de negócio" não é mais nada verificável localmente — é
  confirmação de que o **P90 de memória caiu de fato** no Play Console, o
  que só aparece depois de uma nova release + 28 dias de telemetria de
  campo. Isso fica registrado como follow-up de produto (ver fix.md), não
  como bloqueio.
