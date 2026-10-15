package com.plix.pms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

/**
 * Fired by the PendingIntent AirbnbHostPlugin.pinShortcut passes to
 * ShortcutManagerCompat.requestPinShortcut, strictly when the user accepts
 * the OS's own pin-shortcut confirmation prompt (requestPinShortcut's own
 * return value only means the request reached the launcher, not that the
 * user said yes) — gives a concrete, user-visible confirmation that the
 * shortcut actually landed on the Home Screen.
 */
public class ShortcutPinnedReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!AirbnbHostPlugin.ACTION_SHORTCUT_PINNED.equals(intent.getAction())) return;
        String spaceName = intent.getStringExtra(AirbnbHostPlugin.EXTRA_PINNED_SPACE_NAME);
        if (spaceName == null || spaceName.isEmpty()) spaceName = "Airbnb";
        Toast.makeText(context, "Added \"" + spaceName + "\" to your Home Screen", Toast.LENGTH_LONG).show();
    }
}
