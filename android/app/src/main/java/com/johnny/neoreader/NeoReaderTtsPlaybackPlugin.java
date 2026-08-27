package com.johnny.neoreader;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ponte JS <-> TtsPlaybackService. Não decide nada sobre reprodução — só
 * repassa start/stop/metadata pro Service e encaminha controles de
 * notificação/tela de bloqueio de volta pro JS via notifyListeners.
 * Ver specs/001-audiobook-background-playback/contracts/tts-playback-plugin.md.
 */
@CapacitorPlugin(name = "NeoReaderTtsPlayback")
public class NeoReaderTtsPlaybackPlugin extends Plugin {
    private static final String TAG = "NeoReaderTtsPlayback";
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 4802;

    private static NeoReaderTtsPlaybackPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** Chamado pelo TtsPlaybackService quando um controle da notificação/tela de bloqueio é tocado. */
    static void notifyPlaybackControl(String action) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        instance.notifyListeners("playbackControl", data);
    }

    /** Chamado pelo TtsPlaybackService quando o AudioManager notifica mudança de foco. */
    static void notifyAudioFocusChange(String type) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("type", type);
        instance.notifyListeners("audioFocusChange", data);
    }

    @PluginMethod
    public void start(PluginCall call) {
        requestNotificationPermissionIfNeeded();

        String title = call.getString("title");
        String chapterLabel = call.getString("chapterLabel");

        Context context = getContext();
        Intent intent = new Intent(context, TtsPlaybackService.class);
        intent.setAction(TtsPlaybackService.ACTION_START);
        intent.putExtra(TtsPlaybackService.EXTRA_BOOK_ID, call.getInt("bookId", 0));
        intent.putExtra(TtsPlaybackService.EXTRA_TITLE, title);
        if (chapterLabel != null) {
            intent.putExtra(TtsPlaybackService.EXTRA_CHAPTER_LABEL, chapterLabel);
        }

        Log.d(TAG, "start: iniciando TtsPlaybackService (title=" + title + ")");
        ContextCompat.startForegroundService(context, intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, TtsPlaybackService.class);
        intent.setAction(TtsPlaybackService.ACTION_STOP);
        Log.d(TAG, "stop: solicitando parada do TtsPlaybackService");
        // startService (não startForegroundService) — o Service já está em
        // foreground; este Intent só entrega a ACTION_STOP pro onStartCommand,
        // que chama stopSelf() (ver TtsPlaybackService).
        context.startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        TtsPlaybackService service = TtsPlaybackService.getRunningInstance();
        if (service != null) {
            service.updateMetadata(call.getString("title"), call.getString("chapterLabel"), call.getString("coverBase64"));
        }
        call.resolve();
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        TtsPlaybackService service = TtsPlaybackService.getRunningInstance();
        if (service != null) {
            service.updatePlaybackState("playing".equals(call.getString("state")));
        }
        call.resolve();
    }

    // POST_NOTIFICATIONS (Android 13+) é exigida pro usuário ver a notificação
    // de reprodução — sem ela o Service em foreground continua rodando
    // normalmente (áudio não para), só a notificação fica invisível. Por isso
    // o pedido aqui é "fire and forget": não bloqueia start() nem trata o
    // resultado, o app simplesmente ganha a notificação assim que concedida.
    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        Activity activity = getActivity();
        if (activity == null) return;
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        ActivityCompat.requestPermissions(activity, new String[] { Manifest.permission.POST_NOTIFICATIONS }, NOTIFICATION_PERMISSION_REQUEST_CODE);
    }
}
