package com.johnny.neoreader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Base64;
import android.util.Log;

import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.media.AudioAttributesCompat;
import androidx.media.AudioFocusRequestCompat;
import androidx.media.AudioManagerCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

/**
 * Mantém o audiobook (TTS contínuo) tocando com a tela apagada ou o app em
 * segundo plano: Service em foreground (foregroundServiceType=mediaPlayback)
 * + wake lock parcial + MediaSessionCompat. Não decide o que tocar — isso
 * continua 100% em JS (useTTS.ts); este Service só garante que processo/CPU
 * sigam vivos e expõe a notificação/controles de mídia exigidos pelo Android.
 */
public class TtsPlaybackService extends Service {
    private static final String TAG = "NeoReaderTtsPlayback";
    private static final String CHANNEL_ID = "neoreader_tts_playback";
    private static final int NOTIFICATION_ID = 4801;

    public static final String EXTRA_BOOK_ID = "bookId";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_CHAPTER_LABEL = "chapterLabel";

    public static final String ACTION_START = "com.johnny.neoreader.action.TTS_PLAYBACK_START";
    public static final String ACTION_STOP = "com.johnny.neoreader.action.TTS_PLAYBACK_STOP";

    private static TtsPlaybackService instance;

    static TtsPlaybackService getRunningInstance() {
        return instance;
    }

    private PowerManager.WakeLock wakeLock;
    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequestCompat audioFocusRequest;
    private String currentTitle;
    private String currentChapterLabel;
    private Bitmap currentCoverBitmap;
    private boolean isPlaying = true;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        createNotificationChannelIfNeeded();
        initMediaSession();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Botões de mídia (tela de bloqueio, fones bluetooth) chegam como
        // ACTION_MEDIA_BUTTON — MediaButtonReceiver traduz pro callback certo
        // do MediaSessionCompat (onPlay/onPause/etc.).
        if (intent != null && Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) {
            MediaButtonReceiver.handleIntent(mediaSession, intent);
            return START_NOT_STICKY;
        }

        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            // stopSelf(startId) (não stopSelf() sem argumento) é essencial aqui:
            // useTTS.ts frequentemente chama stop() seguido de start() quase
            // instantaneamente (avançar parágrafo, trocar provider/velocidade).
            // Com stopSelf() puro, um START entregue logo depois deste STOP
            // seria destruído de qualquer jeito quando o Android processasse
            // esta parada — matando uma sessão que acabou de ser reiniciada.
            // stopSelf(startId) só para o Service se este ainda for o último
            // startId entregue (nenhum start mais novo chegou depois).
            Log.d(TAG, "onStartCommand: ACTION_STOP recebido (startId=" + startId + "), parando o Service se não houver start mais novo");
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        if (intent != null) {
            if (intent.hasExtra(EXTRA_TITLE)) currentTitle = intent.getStringExtra(EXTRA_TITLE);
            if (intent.hasExtra(EXTRA_CHAPTER_LABEL)) currentChapterLabel = intent.getStringExtra(EXTRA_CHAPTER_LABEL);
        }

        // Wake lock adquirido ANTES de startForeground() devolver o controle,
        // pra não deixar uma janela de CPU podendo dormir logo no início.
        acquireWakeLock();
        requestAudioFocus();
        isPlaying = true;
        updatePlaybackStateCompat();
        updateMediaSessionMetadata();
        startForeground(NOTIFICATION_ID, buildNotification());
        Log.d(TAG, "onStartCommand: foreground service iniciado (title=" + currentTitle + ")");

        // Não sticky: se o Android matar o processo, o estado de reprodução
        // vive inteiramente no JS (useTTS.ts) — não há como o Service sozinho
        // retomar a narração sem esse estado, então recriar o Service vazio
        // não ajudaria em nada.
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        abandonAudioFocus();
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        instance = null;
        Log.d(TAG, "onDestroy: foreground service parado");
        super.onDestroy();
    }

    /** Atualiza metadata (título/capítulo/capa) sem reiniciar o Service — chamado pelo plugin. */
    void updateMetadata(String title, String chapterLabel, String coverBase64) {
        if (title != null) currentTitle = title;
        if (chapterLabel != null) currentChapterLabel = chapterLabel;
        if (coverBase64 != null) {
            try {
                byte[] bytes = Base64.decode(coverBase64, Base64.DEFAULT);
                currentCoverBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            } catch (Exception error) {
                Log.w(TAG, "updateMetadata: falha ao decodificar capa", error);
            }
        }
        updateMediaSessionMetadata();
        refreshNotification();
    }

    /** Sincroniza o estado play/pause exibido — chamado pelo plugin quando o JS pausa/retoma. */
    void updatePlaybackState(boolean playing) {
        isPlaying = playing;
        updatePlaybackStateCompat();
        refreshNotification();
    }

    private void refreshNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.notify(NOTIFICATION_ID, buildNotification());
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        // PARTIAL_WAKE_LOCK mantém a CPU acordada com a tela apagada, sem
        // acender a tela — o oposto do toggle "Manter tela ligada" existente
        // (FLAG_KEEP_SCREEN_ON), que só ajuda com o app em primeiro plano.
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NeoReader:TtsPlayback");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
        Log.d(TAG, "acquireWakeLock: wake lock adquirido");
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            Log.d(TAG, "releaseWakeLock: wake lock liberado");
        }
        wakeLock = null;
    }

    private void requestAudioFocus() {
        if (audioFocusRequest != null) return; // já solicitado nesta sessão
        AudioAttributesCompat attributes = new AudioAttributesCompat.Builder()
            .setUsage(AudioAttributesCompat.USAGE_MEDIA)
            .setContentType(AudioAttributesCompat.CONTENT_TYPE_SPEECH)
            .build();
        audioFocusRequest = new AudioFocusRequestCompat.Builder(AudioManagerCompat.AUDIOFOCUS_GAIN)
            .setAudioAttributes(attributes)
            .setOnAudioFocusChangeListener(this::handleAudioFocusChange)
            .build();
        int result = AudioManagerCompat.requestAudioFocus(audioManager, audioFocusRequest);
        Log.d(TAG, "requestAudioFocus: result=" + result);
    }

    private void abandonAudioFocus() {
        if (audioFocusRequest == null) return;
        AudioManagerCompat.abandonAudioFocusRequest(audioManager, audioFocusRequest);
        audioFocusRequest = null;
    }

    // Distingue perda PERMANENTE de foco (outro app assumiu deliberadamente,
    // ex: usuário abriu o Spotify) de perda TRANSITÓRIA (ex: chamada
    // telefônica) — só a transitória deve retomar sozinha ao reaver o foco
    // (decisão em plan.md → Decisões Invariantes, resolve o antigo FR-008).
    private void handleAudioFocusChange(int focusChange) {
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS:
                Log.d(TAG, "handleAudioFocusChange: AUDIOFOCUS_LOSS");
                NeoReaderTtsPlaybackPlugin.notifyAudioFocusChange("loss");
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                Log.d(TAG, "handleAudioFocusChange: AUDIOFOCUS_LOSS_TRANSIENT");
                NeoReaderTtsPlaybackPlugin.notifyAudioFocusChange("lossTransient");
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                Log.d(TAG, "handleAudioFocusChange: AUDIOFOCUS_GAIN");
                NeoReaderTtsPlaybackPlugin.notifyAudioFocusChange("gain");
                break;
            default:
                break;
        }
    }

    private void createNotificationChannelIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Narração (audiobook)",
            NotificationManager.IMPORTANCE_LOW
        );
        manager.createNotificationChannel(channel);
    }

    private void initMediaSession() {
        mediaSession = new MediaSessionCompat(this, "NeoReaderTtsPlayback");
        mediaSession.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                Log.d(TAG, "MediaSession: onPlay");
                NeoReaderTtsPlaybackPlugin.notifyPlaybackControl("play");
            }

            @Override
            public void onPause() {
                Log.d(TAG, "MediaSession: onPause");
                NeoReaderTtsPlaybackPlugin.notifyPlaybackControl("pause");
            }

            @Override
            public void onStop() {
                Log.d(TAG, "MediaSession: onStop");
                NeoReaderTtsPlaybackPlugin.notifyPlaybackControl("stop");
            }

            @Override
            public void onSkipToNext() {
                Log.d(TAG, "MediaSession: onSkipToNext");
                NeoReaderTtsPlaybackPlugin.notifyPlaybackControl("skipNext");
            }

            @Override
            public void onSkipToPrevious() {
                Log.d(TAG, "MediaSession: onSkipToPrevious");
                NeoReaderTtsPlaybackPlugin.notifyPlaybackControl("skipPrevious");
            }
        });

        Intent openAppIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (openAppIntent != null) {
            mediaSession.setSessionActivity(
                PendingIntent.getActivity(this, 0, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
            );
        }

        mediaSession.setActive(true);
    }

    private void updateMediaSessionMetadata() {
        if (mediaSession == null) return;
        MediaMetadataCompat.Builder builder = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle != null ? currentTitle : getString(R.string.app_name))
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentChapterLabel != null ? currentChapterLabel : "");
        if (currentCoverBitmap != null) {
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentCoverBitmap);
        }
        mediaSession.setMetadata(builder.build());
    }

    private void updatePlaybackStateCompat() {
        if (mediaSession == null) return;
        long actions = PlaybackStateCompat.ACTION_PLAY
            | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE
            | PlaybackStateCompat.ACTION_STOP
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
        PlaybackStateCompat state = new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(
                isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
                1f
            )
            .build();
        mediaSession.setPlaybackState(state);
    }

    private Notification buildNotification() {
        String title = currentTitle != null ? currentTitle : getString(R.string.app_name);
        String text = currentChapterLabel != null ? currentChapterLabel : "Narrando";

        PendingIntent playPauseIntent = MediaButtonReceiver.buildMediaButtonPendingIntent(
            this, isPlaying ? PlaybackStateCompat.ACTION_PAUSE : PlaybackStateCompat.ACTION_PLAY
        );
        PendingIntent nextIntent = MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT);
        PendingIntent prevIntent = MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS);

        Intent openAppIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent contentIntent = openAppIntent != null
            ? PendingIntent.getActivity(this, 0, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
            : null;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_previous, "Anterior", prevIntent))
            .addAction(new NotificationCompat.Action(
                isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                isPlaying ? "Pausar" : "Tocar",
                playPauseIntent
            ))
            .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_next, "Próximo", nextIntent))
            .setStyle(new MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));

        if (currentCoverBitmap != null) {
            builder.setLargeIcon(currentCoverBitmap);
        }
        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        return builder.build();
    }
}
