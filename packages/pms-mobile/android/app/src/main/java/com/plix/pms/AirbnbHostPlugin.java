package com.plix.pms;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;

import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Launches AirbnbHostActivity — a native full-screen WebView, not the
 * system browser — for one "Airbnb Space"
 * (src/components/pms/airbnb-spaces-view.tsx). Exists specifically because
 * opening airbnb.com via window.open()/the system browser hands navigation
 * off to the installed Airbnb app through Android App Links the moment it
 * loads; this plugin's whole purpose is to avoid that handoff happening at
 * all.
 */
@CapacitorPlugin(name = "AirbnbHost")
public class AirbnbHostPlugin extends Plugin {
    private static final String SHORTCUT_ICON_COLOR = "#FF385C";
    private static final String SHORTCUT_BADGE_COLOR = "#0F172A";

    @PluginMethod
    public void openSpace(PluginCall call) {
        String spaceId = call.getString("spaceId");
        String spaceName = call.getString("spaceName", "Airbnb");
        String url = call.getString("url", "https://www.airbnb.com/hosting");

        Intent intent = new Intent(getActivity(), AirbnbHostActivity.class);
        intent.putExtra(AirbnbHostActivity.EXTRA_URL, url);
        intent.putExtra(AirbnbHostActivity.EXTRA_SPACE_ID, spaceId);
        intent.putExtra(AirbnbHostActivity.EXTRA_SPACE_NAME, spaceName);
        getActivity().startActivity(intent);

        JSObject ret = new JSObject();
        ret.put("launched", true);
        call.resolve(ret);
    }

    /**
     * Pins a Home Screen shortcut that launches directly into
     * AirbnbHostActivity for this Space — no PMS dashboard in between (see
     * the manifest comment on why AirbnbHostActivity has to be the
     * shortcut's own target, not MainActivity). Resolves {requested:
     * false} rather than rejecting when the launcher doesn't support
     * pinned shortcuts at all, so the JS side can fall back to the
     * "Add to Home screen" browser instructions instead of surfacing a
     * hard error for something that isn't really a failure.
     */
    @PluginMethod
    public void pinShortcut(PluginCall call) {
        String spaceId = call.getString("spaceId");
        String spaceName = call.getString("spaceName", "Airbnb");
        String url = call.getString("url", "https://www.airbnb.com/hosting");
        int indexNumber = call.getInt("indexNumber", 0);

        if (spaceId == null || spaceId.isEmpty()) {
            call.reject("Missing spaceId");
            return;
        }

        Context context = getContext();
        if (!ShortcutManagerCompat.isRequestPinShortcutSupported(context)) {
            JSObject ret = new JSObject();
            ret.put("requested", false);
            call.resolve(ret);
            return;
        }

        Intent intent = new Intent(context, AirbnbHostActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.putExtra(AirbnbHostActivity.EXTRA_URL, url);
        intent.putExtra(AirbnbHostActivity.EXTRA_SPACE_ID, spaceId);
        intent.putExtra(AirbnbHostActivity.EXTRA_SPACE_NAME, spaceName);

        String label = "Airbnb - " + spaceName;
        if (label.length() > 25) label = label.substring(0, 25);

        ShortcutInfoCompat shortcut = new ShortcutInfoCompat.Builder(context, "airbnb_space_" + spaceId)
            .setShortLabel(label)
            .setLongLabel("Airbnb - " + spaceName)
            .setIcon(IconCompat.createWithBitmap(buildShortcutIcon(indexNumber)))
            .setIntent(intent)
            .build();

        boolean requested = ShortcutManagerCompat.requestPinShortcut(context, shortcut, null);

        JSObject ret = new JSObject();
        ret.put("requested", requested);
        call.resolve(ret);
    }

    /** Coral rounded-square tile with a white house glyph and a numbered
     * badge — the same look as the Space's own tile in the Airbnb Spaces
     * grid (airbnb-spaces-view.tsx), so the pinned icon is recognizable as
     * "that one" at a glance among a phone's other home-screen icons. */
    private Bitmap buildShortcutIcon(int indexNumber) {
        int size = 192;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgPaint.setColor(Color.parseColor(SHORTCUT_ICON_COLOR));
        float corner = size * 0.28f;
        canvas.drawRoundRect(new RectF(0, 0, size, size), corner, corner, bgPaint);

        Paint glyphPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        glyphPaint.setColor(Color.WHITE);
        glyphPaint.setStyle(Paint.Style.FILL);

        float cx = size / 2f;
        float bodyTop = size * 0.46f;
        float bodyBottom = size * 0.72f;
        RectF bodyRect = new RectF(size * 0.32f, bodyTop, size * 0.68f, bodyBottom);
        canvas.drawRoundRect(bodyRect, size * 0.02f, size * 0.02f, glyphPaint);

        Path roof = new Path();
        roof.moveTo(cx, size * 0.26f);
        roof.lineTo(size * 0.26f, bodyTop + size * 0.02f);
        roof.lineTo(size * 0.74f, bodyTop + size * 0.02f);
        roof.close();
        canvas.drawPath(roof, glyphPaint);

        if (indexNumber > 0) {
            float badgeRadius = size * 0.15f;
            float badgeCx = size * 0.82f;
            float badgeCy = size * 0.82f;

            Paint badgeBg = new Paint(Paint.ANTI_ALIAS_FLAG);
            badgeBg.setColor(Color.parseColor(SHORTCUT_BADGE_COLOR));
            canvas.drawCircle(badgeCx, badgeCy, badgeRadius, badgeBg);

            Paint badgeBorder = new Paint(Paint.ANTI_ALIAS_FLAG);
            badgeBorder.setColor(Color.WHITE);
            badgeBorder.setStyle(Paint.Style.STROKE);
            badgeBorder.setStrokeWidth(size * 0.015f);
            canvas.drawCircle(badgeCx, badgeCy, badgeRadius, badgeBorder);

            Paint badgeText = new Paint(Paint.ANTI_ALIAS_FLAG);
            badgeText.setColor(Color.WHITE);
            badgeText.setTextSize(size * 0.16f);
            badgeText.setTextAlign(Paint.Align.CENTER);
            badgeText.setFakeBoldText(true);
            Paint.FontMetrics fm = badgeText.getFontMetrics();
            float textY = badgeCy - (fm.ascent + fm.descent) / 2f;
            canvas.drawText(String.valueOf(indexNumber), badgeCx, textY, badgeText);
        }

        return bitmap;
    }
}
