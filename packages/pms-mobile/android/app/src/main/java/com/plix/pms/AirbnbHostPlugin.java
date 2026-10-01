package com.plix.pms;

import android.content.Intent;

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
}
