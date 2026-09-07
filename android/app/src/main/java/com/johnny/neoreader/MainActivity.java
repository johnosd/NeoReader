package com.johnny.neoreader;

import android.content.ComponentCallbacks2;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Ligado apenas enquanto o leitor está montado (ReaderScreen liga no mount
    // e desliga no unmount, via NeoReaderLibraryPlugin) — fora do leitor o
    // menu de seleção do sistema tem que continuar funcionando normalmente,
    // ex: no campo de busca da biblioteca.
    private volatile boolean selectionMenuSuppressed = false;

    void setSelectionMenuSuppressed(boolean suppressed) {
        this.selectionMenuSuppressed = suppressed;
    }

    // Lido pelo NeoReaderWebView, que é quem de fato recusa a barra flutuante.
    // Tentar recusar aqui, em onWindowStartingActionMode, NÃO funciona:
    // verificado em device (Samsung, Android 16) que o hook é chamado e, mesmo
    // devolvendo null, o DecorView cria o ActionMode — null ali significa
    // apenas "a app não fornece um ActionMode próprio".
    boolean isSelectionMenuSuppressed() {
        return selectionMenuSuppressed;
    }

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
