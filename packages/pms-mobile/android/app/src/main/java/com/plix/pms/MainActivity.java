package com.plix.pms;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PosPrinterPlugin.class);
        super.onCreate(savedInstanceState);
        // Cold start is dominated by the WebView re-fetching and re-parsing
        // theplixgoa.com/pms from scratch every launch (this app has no
        // bundled webDir — see capacitor.config.ts). LOAD_DEFAULT lets the
        // WebView honor normal HTTP cache headers instead of always
        // revalidating, and DOM/database storage keep localStorage/session
        // state surviving between launches. DOM storage is already enabled
        // by Capacitor's own Bridge setup; set explicitly here too so this
        // isn't silently dependent on that staying true upstream.
        WebSettings settings = this.bridge.getWebView().getSettings();
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
    }
}
