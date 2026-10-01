package com.plix.pms;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

/**
 * A dedicated full-screen native WebView for one Airbnb host login
 * ("Airbnb Space") — launched by AirbnbHostPlugin from the PMS web app's
 * Airbnb Spaces grid (src/components/pms/airbnb-spaces-view.tsx). Two
 * things a plain window.open()/system-browser tab can't do:
 *
 *   1. shouldOverrideUrlLoading below keeps every http(s) navigation inside
 *      THIS WebView instead of letting Android's WebView hand off to the
 *      installed Airbnb app via its registered App Links — the actual
 *      defect this screen exists to fix. The rule is simple on purpose:
 *      http/https always stays here (covers airbnb.com and any SSO/login
 *      redirect through another https domain); every other scheme
 *      (intent://, market://, airbnb://, mailto:, tel:...) — the actual
 *      hijack path — is consumed and dropped.
 *   2. When the device's WebView provider supports it (Chrome 108+;
 *      checked at runtime via WebViewFeature, never assumed), each Space
 *      gets its own androidx.webkit Profile — a real separate cookie jar,
 *      localStorage and cache keyed by the space's own partitionKey, so
 *      logging into one Airbnb account here doesn't log out another
 *      Space's. On an older WebView provider this silently falls back to
 *      the single shared default profile instead of crashing.
 */
public class AirbnbHostActivity extends Activity {
    private static final String TAG = "AirbnbHostActivity";
    public static final String EXTRA_URL = "extra_url";
    public static final String EXTRA_SPACE_ID = "extra_space_id";
    public static final String EXTRA_SPACE_NAME = "extra_space_name";
    private static final String DEFAULT_URL = "https://www.airbnb.com/hosting";
    // No "; wv" WebView marker, no app package token — Airbnb's own
    // client-side code also uses the UA to decide whether to show its
    // "open in the app" interstitial, a second path to the same hijack
    // shouldOverrideUrlLoading below exists to prevent.
    private static final String DESKTOP_UA =
        "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String url = getIntent().getStringExtra(EXTRA_URL);
        if (TextUtils.isEmpty(url)) url = DEFAULT_URL;
        String spaceId = getIntent().getStringExtra(EXTRA_SPACE_ID);
        String spaceName = getIntent().getStringExtra(EXTRA_SPACE_NAME);
        if (TextUtils.isEmpty(spaceName)) spaceName = "Airbnb";

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(buildHeader(spaceName));

        webView = new WebView(this);
        // setProfile (when supported) must be the very first call made on a
        // freshly constructed WebView — before getSettings(), before
        // setWebViewClient(), before anything else — per
        // WebViewCompat.setProfile's own documented contract.
        if (!TextUtils.isEmpty(spaceId) && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            String profileName = "airbnb_" + spaceId.replaceAll("[^a-zA-Z0-9_]", "_");
            try {
                WebViewCompat.setProfile(webView, profileName);
                ProfileStore.getInstance().getOrCreateProfile(profileName).getCookieManager().setAcceptCookie(true);
                Log.i(TAG, "Using isolated WebView profile: " + profileName);
            } catch (Exception e) {
                // Never worth crashing this screen over an isolation
                // nicety — falls back to the shared default profile.
                Log.w(TAG, "Could not set WebView profile, continuing unisolated", e);
            }
        } else {
            Log.i(TAG, "Multi-profile WebView unsupported on this device; Spaces share one session here");
        }

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setUserAgentString(DESKTOP_UA);
        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    String scheme = request.getUrl().getScheme();
                    if ("http".equals(scheme) || "https".equals(scheme)) {
                        return false; // let the WebView load it itself — stays on this screen
                    }
                    Log.i(TAG, "Blocked external scheme: " + scheme);
                    return true; // consumed, never handed to the OS
                }
            }
        );
        webView.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(webView);

        setContentView(root);
        webView.loadUrl(url);
    }

    private LinearLayout buildHeader(String spaceName) {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(Color.parseColor("#0E231D"));
        int pad = dp(10);
        header.setPadding(pad, pad, pad, pad);
        header.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView back = textButton("←"); // ←
        back.setOnClickListener(v -> finish());
        header.addView(back);

        TextView title = new TextView(this);
        title.setText(spaceName + " - Hosting");
        title.setTextColor(Color.WHITE);
        title.setTextSize(15);
        title.setPadding(dp(8), 0, dp(8), 0);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        header.addView(title);

        TextView inbox = textButton("Inbox");
        inbox.setOnClickListener(v -> webView.loadUrl("https://www.airbnb.com/hosting/inbox"));
        header.addView(inbox);

        TextView calendar = textButton("Calendar");
        calendar.setOnClickListener(v -> webView.loadUrl("https://www.airbnb.com/multicalendar"));
        header.addView(calendar);

        TextView refresh = textButton("↻"); // ↻
        refresh.setOnClickListener(v -> webView.reload());
        header.addView(refresh);

        return header;
    }

    private TextView textButton(String label) {
        TextView tv = new TextView(this);
        tv.setText(label);
        tv.setTextColor(Color.WHITE);
        tv.setTextSize(13);
        int padH = dp(8);
        int padV = dp(6);
        tv.setPadding(padH, padV, padH, padV);
        tv.setClickable(true);
        tv.setFocusable(true);
        return tv;
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
        }
        super.onDestroy();
    }
}
