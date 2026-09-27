package com.plix.pms;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PosPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
