# Contrato: NeoReaderTtsPlaybackPlugin (JS ↔ Nativo Android)

Superfície interna entre `src/services/TtsPlaybackSessionService.ts` (JS) e
`android/app/src/main/java/com/johnny/neoreader/NeoReaderTtsPlaybackPlugin.java`
(nativo). Segue o mesmo padrão de `NativeSystemUiService.ts` /
`NeoReaderLibraryPlugin.java` já existentes no repositório: plugin Capacitor
registrado por nome, wrapper JS fino que guarda plataforma e falha em
silêncio (loga, não lança) fora de Android.

Nome do plugin (Capacitor): `NeoReaderTtsPlayback`.

## Métodos (JS chama → Nativo executa)

### `start(options): Promise<void>`

Inicia o `TtsPlaybackService` em foreground, adquire o `PARTIAL_WAKE_LOCK`,
cria a `MediaSessionCompat` + notificação, e requisita foco de áudio
(`AUDIOFOCUS_GAIN`). Chamado por `useTTS.ts::play()` quando
`playbackModeRef.current === 'continuous'` (nunca para `speakOne`/preview).

```ts
interface TtsPlaybackStartOptions {
  bookId: number
  title: string          // título do livro
  chapterLabel?: string  // capítulo/seção atual, se disponível
}
```

A capa nunca é enviada em `start()` — chega logo em seguida via
`updateMetadata()`, chamado por `ReaderScreen.tsx` assim que a reprodução
começa (ver T025 em `tasks.md`).

Idempotente: se já houver uma sessão ativa para o mesmo `bookId`, apenas
atualiza os campos passados (equivalente a `updateMetadata`).

### `updateMetadata(options): Promise<void>`

Atualiza título/capítulo/capa da notificação e da `MediaSessionCompat` sem
reiniciar o Service. Chamado por `ReaderScreen.tsx` quando o parágrafo
narrado muda de capítulo (ela é quem tem acesso a `book`/TOC — ver Decisões
Invariantes em `plan.md`).

```ts
interface TtsPlaybackMetadata {
  title?: string
  chapterLabel?: string
  coverBase64?: string
}
```

### `updatePlaybackState(options): Promise<void>`

Sincroniza o ícone de play/pause da notificação e o `PlaybackStateCompat`
com o estado real do JS. Chamado por `useTTS.ts` nos mesmos pontos onde já
chama `WakeLockService.keepAwake()`/`allowSleep()` (`play`, `pause`,
`resume`).

```ts
interface TtsPlaybackStateOptions {
  state: 'playing' | 'paused'
}
```

### `stop(): Promise<void>`

Encerra o Service, libera o wake lock, remove a notificação e abandona o
foco de áudio. Chamado por `useTTS.ts::stop()` e no `finally` de `play()`
quando a reprodução termina por qualquer motivo (fim do livro, erro, stop
explícito), e no cleanup de unmount — mesmos pontos onde hoje chama
`WakeLockService.allowSleep()`.

## Eventos (Nativo dispara → JS escuta via `addListener`)

### `playbackControl`

Disparado quando o usuário toca um controle na notificação ou na tela de
bloqueio.

```ts
type TtsPlaybackControlEvent =
  | { action: 'play' | 'pause' | 'stop' }
  | { action: 'skipNext' | 'skipPrevious' }
```

Mapeamento no lado JS (`ReaderScreen.tsx`): `play`/`pause` → `tts.resume()`/
`tts.pause()`; `stop` → `tts.stop()`; `skipNext`/`skipPrevious` →
`onNextParagraph`/`onPrevParagraph` (já existentes em `TtsMiniPlayer.tsx`).

### `audioFocusChange`

Disparado quando o `AudioManager` nativo notifica mudança de foco. O evento
sempre é emitido pelo nativo (o `TtsPlaybackService` sempre pede
`AUDIOFOCUS_GAIN` ao iniciar, independente do provider ativo), mas **o JS só
age sobre ele quando o provider ativo é nativo** — ver nota de gating logo
abaixo.

```ts
type TtsAudioFocusEvent = { type: 'loss' | 'lossTransient' | 'gain' }
```

- `loss` (`AUDIOFOCUS_LOSS` — outro app assumiu deliberadamente, ex:
  usuário abriu o Spotify): JS chama `tts.pause()` e **não** agenda
  retomada automática.
- `lossTransient` (`AUDIOFOCUS_LOSS_TRANSIENT` — ex: chamada telefônica):
  JS chama `tts.pause()` e marca que deve retomar ao reaver o foco.
- `gain` (`AUDIOFOCUS_GAIN`): JS chama `tts.resume()` **somente** se a
  pausa anterior foi causada por `lossTransient` (nunca depois de `loss`
  nem depois de uma pausa manual do usuário).

**Gating por provider ativo (achado em R-003, `plan.md` → Riscos e
Decisões)**: o `<audio>` HTML5 usado pelos providers premium
(Speechify/ElevenLabs/Fish Audio) roda dentro do WebView, e o Chromium já
pausa/retoma esse elemento sozinho ao perder/reaver foco de áudio —
comportamento nativo do WebView, confirmado em device real (o Spotify pausou
a narração corretamente mesmo com o `AudioFocusRequestCompat` do
`TtsPlaybackService` já evictado do stack de foco havia 30+ segundos). Por
isso, `useTTS.ts::handleAudioFocusChange(type)` (a implementação real da
lógica acima) só executa a lógica de `pause()`/`resume()` quando
`activeProviderRef.current === 'native'`; para os providers premium, o
evento chega mas é ignorado de propósito, e o comportamento correto (pausar
em `loss`/`lossTransient`, retomar sozinho só na transitória) já acontece
via o próprio WebView, sem participação do app.

## Wrapper JS (`src/services/TtsPlaybackSessionService.ts`)

Mesmo padrão de `NativeSystemUiService.ts`: guarda
`Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'`,
`try/catch` com `console.warn` em vez de propagar erro (efeito colateral de
plataforma, nunca deve derrubar a reprodução em si).

```ts
export const TtsPlaybackSessionService = {
  start(options: TtsPlaybackStartOptions): Promise<void>
  updateMetadata(options: TtsPlaybackMetadata): Promise<void>
  updatePlaybackState(options: TtsPlaybackStateOptions): Promise<void>
  stop(): Promise<void>
  onPlaybackControl(handler: (event: TtsPlaybackControlEvent) => void): () => void
  onAudioFocusChange(handler: (event: TtsAudioFocusEvent) => void): () => void
}
```

Os dois `on*` retornam uma função de cleanup (remove o listener), no mesmo
espírito de `useCapacitorAppListener.ts`.
