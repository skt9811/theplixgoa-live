package com.plix.pms;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
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
    private static final String INBOX_URL = "https://www.airbnb.com/hosting/inbox";
    private static final String CALENDAR_URL = "https://www.airbnb.com/multicalendar";
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
        // Draws edge-to-edge and hands the status-bar/nav-bar insets to the
        // listeners below instead of letting the OS pick where content
        // starts — without this, Android 15+ (API 35, this app's own
        // targetSdk) enforces edge-to-edge by default, which is exactly
        // what put the toolbar's text under the status bar/clock/battery
        // icons before this fix.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        String url = getIntent().getStringExtra(EXTRA_URL);
        if (TextUtils.isEmpty(url)) url = DEFAULT_URL;
        String spaceId = getIntent().getStringExtra(EXTRA_SPACE_ID);
        String spaceName = getIntent().getStringExtra(EXTRA_SPACE_NAME);
        if (TextUtils.isEmpty(spaceName)) spaceName = "Airbnb";

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout header = buildHeader(spaceName);
        root.addView(header);

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

        // Status bar inset becomes top padding on the header (its colored
        // background still extends up behind the status bar; only its
        // content — back arrow/title/icons — moves below the clock/battery
        // icons). Bottom inset (gesture nav bar / 3-button bar) becomes
        // padding on the WebView so the page content isn't drawn under it
        // either.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            header.setPadding(header.getPaddingLeft(), bars.top, header.getPaddingRight(), header.getPaddingBottom());
            webView.setPadding(webView.getPaddingLeft(), webView.getPaddingTop(), webView.getPaddingRight(), bars.bottom);
            return insets;
        });

        setContentView(root);
        webView.loadUrl(url);
    }

    private LinearLayout buildHeader(String spaceName) {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(Color.parseColor("#0E231D")); // pms_midnight_emerald, same brand color as the launch splash
        int sidePad = dp(4);
        header.setPadding(sidePad, 0, sidePad, 0);
        // 56dp content height (the window-insets listener above adds the
        // status bar's own height as extra top padding on top of this).
        header.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));

        header.addView(iconButton("←", "Back", v -> finish())); // ←

        LinearLayout titleBlock = new LinearLayout(this);
        titleBlock.setOrientation(LinearLayout.VERTICAL);
        titleBlock.setGravity(Gravity.CENTER_VERTICAL);
        titleBlock.setPadding(dp(4), 0, dp(4), 0);
        titleBlock.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView title = new TextView(this);
        title.setText(spaceName);
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        titleBlock.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Airbnb Host Dashboard");
        subtitle.setTextColor(Color.parseColor("#9CA3AF"));
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        subtitle.setSingleLine(true);
        titleBlock.addView(subtitle);

        header.addView(titleBlock);

        header.addView(iconButton("✉", "Inbox", v -> webView.loadUrl(INBOX_URL))); // ✉
        header.addView(iconButton("📅", "Calendar", v -> webView.loadUrl(CALENDAR_URL))); // 📅
        header.addView(iconButton("↻", "Refresh", v -> webView.reload())); // ↻

        return header;
    }

    /** A square, min-48dp touch target with a borderless ripple — not raw unstyled text crammed against its neighbors. */
    private TextView iconButton(String label, String contentDescription, View.OnClickListener onClick) {
        TextView tv = new TextView(this);
        tv.setText(label);
        tv.setContentDescription(contentDescription);
        tv.setTextColor(Color.WHITE);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        tv.setGravity(Gravity.CENTER);
        int size = dp(48);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(size, size);
        params.setMargins(dp(2), dp(4), dp(2), dp(4));
        tv.setLayoutParams(params);
        TypedValue ripple = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, ripple, true);
        tv.setBackgroundResource(ripple.resourceId);
        tv.setClickable(true);
        tv.setFocusable(true);
        tv.setOnClickListener(onClick);
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
