import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

interface TtsPlaybackStartOptions {
  bookId: number
  title: string
  chapterLabel?: string
}

interface TtsPlaybackMetadata {
  title?: string
  chapterLabel?: string
  coverBase64?: string
}

interface TtsPlaybackStateOptions {
  state: 'playing' | 'paused'
}

export type TtsPlaybackControlAction = 'play' | 'pause' | 'stop' | 'skipNext' | 'skipPrevious'
export type TtsPlaybackControlEvent = { action: TtsPlaybackControlAction }

export type TtsAudioFocusType = 'loss' | 'lossTransient' | 'gain'
export type TtsAudioFocusEvent = { type: TtsAudioFocusType }

interface NeoReaderTtsPlaybackPlugin {
  start(options: TtsPlaybackStartOptions): Promise<void>
  stop(): Promise<void>
  updateMetadata(options: TtsPlaybackMetadata): Promise<void>
  updatePlaybackState(options: TtsPlaybackStateOptions): Promise<void>
  addListener(eventName: 'playbackControl', listener: (event: TtsPlaybackControlEvent) => void): Promise<PluginListenerHandle>
  addListener(eventName: 'audioFocusChange', listener: (event: TtsAudioFocusEvent) => void): Promise<PluginListenerHandle>
}

const NeoReaderTtsPlayback = registerPlugin<NeoReaderTtsPlaybackPlugin>('NeoReaderTtsPlayback')

function isSupportedPlatform() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

// Ponte pro TtsPlaybackService nativo (Service em foreground + wake lock +
// MediaSessionCompat que mantém o audiobook tocando e controlável com a tela
// apagada ou o app em segundo plano). Guarda de plataforma: só faz sentido no
// Android nativo (FR-012). Ver contracts/tts-playback-plugin.md.
export const TtsPlaybackSessionService = {
  async start(options: TtsPlaybackStartOptions): Promise<void> {
    if (!isSupportedPlatform()) return

    try {
      await NeoReaderTtsPlayback.start(options)
    } catch (error) {
      console.warn('[TtsPlaybackSession] Failed to start playback session.', error)
    }
  },

  async stop(): Promise<void> {
    if (!isSupportedPlatform()) return

    try {
      await NeoReaderTtsPlayback.stop()
    } catch (error) {
      console.warn('[TtsPlaybackSession] Failed to stop playback session.', error)
    }
  },

  async updateMetadata(options: TtsPlaybackMetadata): Promise<void> {
    if (!isSupportedPlatform()) return

    try {
      await NeoReaderTtsPlayback.updateMetadata(options)
    } catch (error) {
      console.warn('[TtsPlaybackSession] Failed to update playback metadata.', error)
    }
  },

  async updatePlaybackState(options: TtsPlaybackStateOptions): Promise<void> {
    if (!isSupportedPlatform()) return

    try {
      await NeoReaderTtsPlayback.updatePlaybackState(options)
    } catch (error) {
      console.warn('[TtsPlaybackSession] Failed to update playback state.', error)
    }
  },

  // Retorna uma função de cleanup síncrona (mesmo espírito de useCapacitorAppListener.ts),
  // pra poder ser usada direto num useEffect sem precisar lidar com a Promise do addListener.
  onPlaybackControl(handler: (event: TtsPlaybackControlEvent) => void): () => void {
    if (!isSupportedPlatform()) return () => {}

    let disposed = false
    const listenerPromise = NeoReaderTtsPlayback.addListener('playbackControl', (event) => {
      if (!disposed) handler(event)
    })

    return () => {
      disposed = true
      void listenerPromise.then((listener) => listener.remove()).catch(() => undefined)
    }
  },

  onAudioFocusChange(handler: (event: TtsAudioFocusEvent) => void): () => void {
    if (!isSupportedPlatform()) return () => {}

    let disposed = false
    const listenerPromise = NeoReaderTtsPlayback.addListener('audioFocusChange', (event) => {
      if (!disposed) handler(event)
    })

    return () => {
      disposed = true
      void listenerPromise.then((listener) => listener.remove()).catch(() => undefined)
    }
  },
}
