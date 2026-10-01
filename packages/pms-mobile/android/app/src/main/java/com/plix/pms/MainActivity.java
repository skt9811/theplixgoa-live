package com.plix.pms;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PosPrinterPlugin.class);
        registerPlugin(AirbnbHostPlugin.class);
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

    // Android's WebView applies a Set-Cookie response (e.g. the PMS logout
    // endpoint's Max-Age=0 clear) to its in-memory cookie jar immediately,
    // but persists that change to the on-disk cookie store asynchronously,
    // on its own schedule. A user who logs out and then force-closes the app
    // from the recent-apps switcher within that window can kill the process
    // before the deletion was ever written to disk — the next cold start
    // reloads the stale on-disk cookie jar, and the old session cookie is
    // back, even though logout genuinely cleared it moments earlier. flush()
    // forces an immediate, synchronous write, so pairing it with onPause/
    // onStop (which Android calls before an activity can be removed from
    // the back stack, including a task-switcher swipe-dismiss) closes that
    // window for logout and for any other cookie change.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onStop() {
        super.onStop();
        CookieManager.getInstance().flush();
    }
}
