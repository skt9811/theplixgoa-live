package com.plix.pms;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Classic Bluetooth (RFCOMM / Serial Port Profile) bridge for 58mm ESC/POS
 * receipt printers such as the Everycom EC-58B. Web Bluetooth (used by the
 * web app in a browser) only reaches BLE/GATT devices — a printer that
 * speaks classic SPP is invisible to it — so this native plugin is the path
 * src/lib/pms-pos-print.ts tries first inside this app. It connects
 * straight to an already-paired MAC address the operator entered in
 * Printer settings; it never scans and never shows the OS Bluetooth
 * chooser.
 */
@CapacitorPlugin(
    name = "PosPrinter",
    permissions = { @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth") }
)
public class PosPrinterPlugin extends Plugin {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");

    // Kept open across print jobs (KOT then bill, one after another) so
    // repeated prints do not each pay the RFCOMM handshake cost.
    private final ConcurrentHashMap<String, BluetoothSocket> sockets = new ConcurrentHashMap<>();

    @PluginMethod
    public void write(PluginCall call) {
        String mac = call.getString("mac");
        String data = call.getString("data");
        if (mac == null || mac.isEmpty() || data == null) {
            call.reject("mac and data (base64) are required");
            return;
        }
        // Android 12+ (API 31) gates classic-Bluetooth connect behind the
        // runtime BLUETOOTH_CONNECT permission; earlier versions grant it at
        // install time from the manifest entries above.
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED) {
            call.setKeepAlive(true);
            saveCall(call);
            requestPermissionForAlias("bluetooth", call, "writeAfterPermission");
            return;
        }
        doWrite(mac, data, call);
    }

    @PermissionCallback
    private void writeAfterPermission(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) {
            call.reject("Bluetooth permission was not granted");
            return;
        }
        doWrite(call.getString("mac"), call.getString("data"), call);
    }

    private void doWrite(String mac, String base64Data, PluginCall call) {
        try {
            BluetoothSocket socket = sockets.get(mac);
            if (socket == null || !socket.isConnected()) {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null) {
                    call.reject("This device has no Bluetooth adapter");
                    return;
                }
                BluetoothDevice device = adapter.getRemoteDevice(mac);
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                adapter.cancelDiscovery();
                socket.connect();
                sockets.put(mac, socket);
            }
            OutputStream out = socket.getOutputStream();
            out.write(Base64.decode(base64Data, Base64.NO_WRAP));
            out.flush();
            call.resolve();
        } catch (Exception e) {
            BluetoothSocket dead = sockets.remove(mac);
            if (dead != null) {
                try {
                    dead.close();
                } catch (Exception ignored) {
                    // already gone
                }
            }
            call.reject(e.getMessage() != null ? e.getMessage() : "Could not reach the printer", e);
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", BluetoothAdapter.getDefaultAdapter() != null);
        call.resolve(ret);
    }
}
