package com.johnny.neoreader;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NeoReaderLibraryPlugin.class);
        registerPlugin(NeoReaderTtsPlaybackPlugin.class);
        super.onCreate(savedInstanceState);
    }

}
