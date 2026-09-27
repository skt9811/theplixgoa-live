// Delivers ESC/POS bytes to a thermal printer. Order of attempts:
//  1. The native Bluetooth bridge (Android app only — see PosPrinterPlugin in
//     packages/pms-mobile). Classic-Bluetooth (SPP) printers like the
//     Everycom EC-58B are RFCOMM devices, which the browser's Web Bluetooth
//     API cannot reach at all (it is BLE/GATT-only), so this is the only path
//     that works for them; it connects straight to the paired MAC address
//     with no OS chooser dialog.
//  2. Web Bluetooth (Chrome / Android Chrome) to a BLE printer.
//  3. RawBT (rawbt: URL scheme), which the Android WebView can hand to the
//     free RawBT app that owns the Bluetooth/USB/LAN connection.
//  4. On-screen slip preview, so a bill is never lost when nothing prints.
// Network / USB printers need a native plugin and are not driven from here.
// Inside the Android app, a Bluetooth job never falls from (1) through to (3)/(4):
// a native failure is reported back as `mode: "native-error"` with the real reason
// instead of silently landing on an unaddressed RawBT intent that looks like success.
import { Capacitor } from "@capacitor/core";
import { withTimeout } from "@/lib/capacitor-utils";
import { EC58B, slipBytes, slipText, type PaperSize, type SlipLine } from "@/lib/pms-escpos";

export type PrinterSettings = { printer_type?: string | null; printer_name?: string | null; mac_address?: string | null; left_margin?: number | null; paper_size?: string | null; assigned_role?: string | null } | null;
export type PrintResult = { mode: "native" | "bluetooth" | "rawbt" | "preview" | "native-error" | "queued"; message: string };

const PRINT_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  EC58B.sppUuid,
];

export type PairedBtDevice = { name: string | null; address: string };
type NativePrinterPlugin = { write(opts: { mac: string; data: string }): Promise<void>; getPairedDevices(): Promise<{ devices: PairedBtDevice[] }> };

const log = (...args: unknown[]) => console.info("[pms-pos-print]", ...args);
const logErr = (...args: unknown[]) => console.error("[pms-pos-print]", ...args);

/** The Android app's PosPrinterPlugin, when running inside that native shell — null in the browser or if the plugin isn't registered (an older app build). */
function nativePrinter(): NativePrinterPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  const plugins = (Capacitor as unknown as { Plugins?: Record<string, NativePrinterPlugin> }).Plugins;
  return plugins?.["PosPrinter"] ?? null;
}

/**
 * Already-*paired* classic-Bluetooth devices (not a scan — the EC-58B and
 * printers like it have to be paired once in the phone's system Bluetooth
 * settings first). Null means there is no native bridge to ask (a browser,
 * or an app build older than the plugin) — the Printer settings screen
 * falls back to Web Bluetooth's scan-and-pick chooser, or typing a MAC by
 * hand, in that case.
 */
export async function listPairedBluetoothDevices(): Promise<PairedBtDevice[] | null> {
  const native = nativePrinter();
  if (!native) return null;
  try {
    const res = await withTimeout(native.getPairedDevices().then((r) => ({ ok: true as const, devices: r.devices })).catch((err: unknown) => {
      logErr("getPairedDevices failed:", err instanceof Error ? err.message : err);
      return { ok: false as const, devices: [] };
    }), 6000, { ok: false as const, devices: [] });
    if (!res.ok) logErr("getPairedDevices timed out or failed — check Bluetooth is on and the app has permission");
    return res.devices;
  } catch (err) {
    logErr("getPairedDevices threw unexpectedly:", err);
    return [];
  }
}

type Chr = { properties: { write: boolean; writeWithoutResponse: boolean }; writeValue: (v: BufferSource) => Promise<void>; writeValueWithoutResponse?: (v: BufferSource) => Promise<void> };
type Gatt = { connect: () => Promise<Gatt>; getPrimaryServices: () => Promise<{ getCharacteristics: () => Promise<Chr[]> }[]> };
type BtDevice = { gatt?: Gatt };
type BtNav = { bluetooth?: { requestDevice: (o: unknown) => Promise<BtDevice> } };

const cached = new Map<string, { device: BtDevice; chr: Chr }>();

export const paperOf = (p: PrinterSettings): PaperSize => (p?.paper_size === "58mm" || p?.paper_size === "80mm" ? p.paper_size : "54mm");

async function connect(settings: PrinterSettings): Promise<Chr> {
  const key = settings?.printer_name?.trim() || "*";
  if (cached.get(key)?.chr) return cached.get(key)!.chr;
  const bt = (navigator as unknown as BtNav).bluetooth!;
  const name = settings?.printer_name?.trim();
  const device = await bt.requestDevice(name ? { filters: [{ name }], optionalServices: PRINT_SERVICES } : { acceptAllDevices: true, optionalServices: PRINT_SERVICES });
  const server = await device.gatt!.connect();
  for (const svc of await server.getPrimaryServices()) {
    for (const c of await svc.getCharacteristics()) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        cached.set(key, { device, chr: c });
        return c;
      }
    }
  }
  throw new Error("No writable printer channel found on that device");
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// PosPrinterPlugin.java already rejects with one of these canonical prefixes (optionally
// followed by ": <the real IOException/SecurityException message>", which is kept intact
// below rather than collapsed away). This list is a fallback for anything that doesn't
// already match one of them — an older app build's plain exception message, for instance.
const CANONICAL_NATIVE_ERRORS = ["Bluetooth Connect Permission Denied", "Printer MAC Address Missing", "Socket Connection Failed", "This device has no Bluetooth adapter"];

/** Maps a raw Java exception message onto a short, operator-facing phrase — without losing whatever real detail the plugin appended after it. */
function friendlyNativeError(raw: string): string {
  if (CANONICAL_NATIVE_ERRORS.some((p) => raw.startsWith(p))) return raw;
  const s = raw.toLowerCase();
  if (s.includes("permission")) return "Bluetooth Connect Permission Denied";
  if (s.includes("no bluetooth adapter")) return "This device has no Bluetooth hardware";
  if (s.includes("timed out")) return "Printer did not respond (timed out)";
  if (s.includes("connect") || s.includes("socket") || s.includes("read failed") || s.includes("broken pipe")) return `Socket Connection Failed: ${raw}`;
  return raw;
}

export async function printSlip(lines: SlipLine[], settings: PrinterSettings): Promise<PrintResult> {
  // No printer row at all — a configuration problem, not a connection failure. Say so
  // instead of quietly firing an unaddressed RawBT intent that can look like it worked.
  if (!settings) {
    log("no printer configured — skipping RawBT, showing the slip instead");
    window.dispatchEvent(new CustomEvent("pms-pos-preview", { detail: slipText(lines, "54mm", 0) }));
    return { mode: "preview", message: "No printer configured. Add one in POS Settings → Printers." };
  }

  const paper = paperOf(settings);
  const bytes = slipBytes(lines, paper, settings.left_margin ?? 0);
  const type = settings.printer_type ?? "Bluetooth";
  const mac = settings.mac_address?.trim();
  const roleLabel = settings.assigned_role || "the printer";
  const isNativeApp = Capacitor.isNativePlatform();

  if (type === "Bluetooth") {
    // Inside the Android app this native RFCOMM bridge is the ONLY way to reach a classic-Bluetooth
    // printer (Web Bluetooth is BLE/GATT-only and this WebView doesn't expose it anyway). So on native,
    // a failure here is reported straight to the operator with the real reason — it never falls through
    // to RawBT or a silent on-screen preview and gets mistaken for "it printed".
    if (!mac) {
      logErr(`no MAC address saved for ${roleLabel} (${settings.printer_name ?? "unnamed"})`);
      if (isNativeApp) return { mode: "native-error", message: `No MAC address configured for ${roleLabel}. Set one in POS Settings → Printers.` };
      log("browser session with no MAC — trying Web Bluetooth / RawBT instead");
    } else {
      const native = nativePrinter();
      if (native) {
        log("attempting native Bluetooth (RFCOMM) write to", mac);
        try {
          // A hung/unlinked plugin call must never freeze the print button forever (see capacitor-utils.ts's withTimeout doc).
          const outcome = await withTimeout(
            native
              .write({ mac, data: toBase64(bytes) })
              .then(() => ({ ok: true as const }))
              .catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err);
                logErr("native write failed:", message);
                return { ok: false as const, message };
              }),
            8000,
            { ok: false as const, message: "timed out after 8 seconds" },
          );
          if (outcome.ok) return { mode: "native", message: "Sent to printer" };
          logErr(`native write to ${roleLabel} (${mac}) failed:`, outcome.message);
          if (isNativeApp) return { mode: "native-error", message: `${friendlyNativeError(outcome.message)} — ${roleLabel} (${mac}). Check it is powered on, in range and paired.` };
        } catch (err) {
          logErr("native bridge threw unexpectedly:", err);
          if (isNativeApp) return { mode: "native-error", message: `${friendlyNativeError(err instanceof Error ? err.message : String(err))} — ${roleLabel} (${mac})` };
        }
      } else {
        log("native PosPrinter plugin not available (not running in the Android app, or an older build without it)");
        if (isNativeApp) return { mode: "native-error", message: "The printer plugin isn't available in this app build. Reinstall the latest Plix PMS app." };
      }
    }
  } else if (isNativeApp) {
    log(`${type} printer — the native Bluetooth bridge only handles Bluetooth, falling through to RawBT for this one`);
  }

  if (type === "Bluetooth" && typeof navigator !== "undefined" && (navigator as unknown as BtNav).bluetooth) {
    log("attempting Web Bluetooth (BLE/GATT)");
    try {
      const chr = await connect(settings);
      for (let i = 0; i < bytes.length; i += 100) {
        const chunk = bytes.slice(i, i + 100);
        if (chr.properties.writeWithoutResponse && chr.writeValueWithoutResponse) await chr.writeValueWithoutResponse(chunk);
        else await chr.writeValue(chunk);
      }
      return { mode: "bluetooth", message: "Sent to printer" };
    } catch (err) {
      cached.delete(settings.printer_name?.trim() || "*");
      logErr("Web Bluetooth failed:", err instanceof Error ? err.message : err);
      if (err instanceof Error && err.name === "NotFoundError") return { mode: "preview", message: "No printer selected" };
      // fall through to RawBT / preview
    }
  }
  if (typeof window !== "undefined" && /Android/i.test(navigator.userAgent)) {
    log("falling back to the RawBT app intent (its own connection to the printer, outside this app's control)");
    window.location.href = `rawbt:base64,${toBase64(bytes)}`;
    return { mode: "rawbt", message: "Handed to RawBT — check it actually printed; nothing here confirms RawBT is installed or connected" };
  }
  window.dispatchEvent(new CustomEvent("pms-pos-preview", { detail: slipText(lines, paper, settings.left_margin ?? 0) }));
  return { mode: "preview", message: "No printer available. Showing the slip instead" };
}
