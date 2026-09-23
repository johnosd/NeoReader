package com.johnny.neoreader;

import android.app.Activity;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;

/**
 * SPIKE (assessment automatizacao-sync-bookmarks-ao-fechar) — descartável.
 * Pergunta: o AuthorizationClient do Google Identity Services devolve access
 * token do Drive SEM UI quando o escopo drive.appdata já foi concedido?
 * Diferente do @capacitor-firebase/authentication, aqui NÃO chamamos
 * requestOfflineAccess(..., forceCodeForRefreshToken=true) — é esse flag que
 * força re-consentimento a cada renovação no plugin atual.
 * Disparado via DevTools/CDP: Capacitor.nativePromise('DriveAuthSpike', ...).
 */
@CapacitorPlugin(name = "DriveAuthSpike")
public class DriveAuthSpikePlugin extends Plugin {
    private static final String TAG = "DriveAuthSpike";
    private static final String DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
    private static final int RESOLUTION_REQUEST_CODE = 4911;

    // Último token recebido — usado por clearLastToken pra simular expiração.
    private volatile String lastToken;

    /** allowUi=false: só relata se precisaria de UI. allowUi=true: abre a UI de consentimento. */
    @PluginMethod
    public void authorize(PluginCall call) {
        boolean allowUi = Boolean.TRUE.equals(call.getBoolean("allowUi", false));
        Activity activity = getActivity();
        long startedAt = System.currentTimeMillis();

        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_APPDATA_SCOPE)))
            .build();

        Identity.getAuthorizationClient(activity)
            .authorize(request)
            .addOnSuccessListener(result -> handleResult(call, result, allowUi, startedAt))
            .addOnFailureListener(error -> {
                Log.w(TAG, "authorize failure", error);
                call.reject("authorize failed: " + error.getMessage(), error);
            });
    }

    private void handleResult(PluginCall call, AuthorizationResult result, boolean allowUi, long startedAt) {
        long elapsedMs = System.currentTimeMillis() - startedAt;
        JSObject ret = new JSObject();
        ret.put("elapsedMs", elapsedMs);
        ret.put("needsUi", result.hasResolution());

        if (result.hasResolution()) {
            Log.i(TAG, "authorize needs UI (hasResolution=true), allowUi=" + allowUi);
            if (allowUi && result.getPendingIntent() != null) {
                try {
                    // Não capturamos o retorno: depois de consentir, o teste é
                    // chamar authorize de novo com allowUi=false e ver se vem
                    // token sem UI — que é exatamente a pergunta do spike.
                    getActivity().startIntentSenderForResult(
                        result.getPendingIntent().getIntentSender(),
                        RESOLUTION_REQUEST_CODE, null, 0, 0, 0, null);
                    ret.put("launchedUi", true);
                } catch (Exception e) {
                    Log.w(TAG, "failed to launch resolution", e);
                    ret.put("launchError", e.getMessage());
                }
            }
            call.resolve(ret);
            return;
        }

        String token = result.getAccessToken();
        lastToken = token;
        ret.put("hasToken", token != null && !token.isEmpty());
        ret.put("tokenPrefix", token != null && token.length() > 8 ? token.substring(0, 8) : token);
        ret.put("grantedScopes", String.valueOf(result.getGrantedScopes()));
        Log.i(TAG, "authorize silent OK in " + elapsedMs + "ms, scopes=" + result.getGrantedScopes());

        // Prova que o token serve de verdade pro appDataFolder (HTTP fora da main thread).
        new Thread(() -> {
            ret.put("driveListStatus", probeDrive(token));
            call.resolve(ret);
        }).start();
    }

    /** Invalida o último token no cache do Google Play Services (simula expiração). */
    @PluginMethod
    public void clearLastToken(PluginCall call) {
        String token = lastToken;
        if (token == null) {
            call.reject("no token to clear — call authorize first");
            return;
        }
        // clearToken é bloqueante; métodos de plugin já rodam fora da main thread.
        try {
            GoogleAuthUtil.clearToken(getContext(), token);
            lastToken = null;
            Log.i(TAG, "cleared token " + token.substring(0, Math.min(8, token.length())));
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "clearToken failed", e);
            call.reject("clearToken failed: " + e.getMessage(), e);
        }
    }

    private int probeDrive(String token) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1&fields=files(id)");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            int status = conn.getResponseCode();
            InputStream ignored = status < 400 ? conn.getInputStream() : conn.getErrorStream();
            if (ignored != null) ignored.close();
            Log.i(TAG, "drive probe status=" + status);
            return status;
        } catch (Exception e) {
            Log.w(TAG, "drive probe failed", e);
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
