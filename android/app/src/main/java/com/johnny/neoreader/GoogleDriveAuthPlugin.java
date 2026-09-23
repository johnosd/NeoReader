package com.johnny.neoreader;

import android.app.Activity;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;

import java.util.Collections;

/**
 * Plugin nativo para obtenção de token do Google Drive em background sem UI.
 * Criado para a automatização do sync de bookmarks ao fechar (Feature 021).
 */
@CapacitorPlugin(name = "GoogleDriveAuth")
public class GoogleDriveAuthPlugin extends Plugin {
    private static final String TAG = "GoogleDriveAuth";
    private static final String DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

    @PluginMethod
    public void authorizeSilent(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is null");
            return;
        }

        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_APPDATA_SCOPE)))
            .build();

        Identity.getAuthorizationClient(activity)
            .authorize(request)
            .addOnSuccessListener(result -> {
                JSObject ret = new JSObject();
                ret.put("needsUi", result.hasResolution());

                if (result.hasResolution()) {
                    Log.i(TAG, "authorizeSilent needs UI (hasResolution=true)");
                    call.resolve(ret);
                    return;
                }

                String token = result.getAccessToken();
                ret.put("accessToken", token);
                
                call.resolve(ret);
            })
            .addOnFailureListener(error -> {
                Log.w(TAG, "authorizeSilent failure", error);
                call.reject("authorize silent failed: " + error.getMessage(), error);
            });
    }
}

