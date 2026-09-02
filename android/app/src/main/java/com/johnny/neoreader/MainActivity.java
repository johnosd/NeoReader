package com.johnny.neoreader;

import android.content.ComponentCallbacks2;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NeoReaderLibraryPlugin.class);
        registerPlugin(NeoReaderTtsPlaybackPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // Nada no app reagia a pressão de memória (achado do alerta de "bad
    // behavior" no Play Console) — TRIM_MEMORY_BACKGROUND é o nível que a
    // doc do Android recomenda como corte pra "liberar o que não é
    // essencial", batendo com o bucket "background" citado no alerta.
    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND) {
            WebView webView = bridge != null ? bridge.getWebView() : null;
            if (webView != null) {
                webView.clearCache(false);
            }
        }
    }
}
