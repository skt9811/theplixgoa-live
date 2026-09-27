// Gets a server-rendered PDF from inside the Capacitor Android app onto the
// user's device. `<a download>` and `window.print()` are both silently
// inert in the Capacitor WebView (there's no download manager or print
// bridge listening), so a PDF a guest or operator taps "Download" on there
// never actually reaches them — this is the only path that does.
import { Capacitor } from "@capacitor/core";
import { apiUrl } from "@/lib/capacitor-utils";

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000; // avoids a call-stack overflow from spreading a large array into String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/**
 * Fetches a same-origin PDF endpoint and hands it to the OS via the native
 * Filesystem + Share sheet, so the user can save, open in a PDF viewer, or
 * print from there — all things Android's own chooser offers once a real
 * file exists on disk.
 *
 * This deliberately does NOT fall back to opening the URL in the system
 * browser (`window.open(url, "_system")`) on failure, even though that
 * needs no plugin and would sidestep an unrebuilt APK: the PDF endpoint is
 * only reachable with the PMS session cookie, and the system browser is a
 * separate, unauthenticated browsing context from this app's WebView —
 * that would silently redirect to the login page instead of the voucher,
 * which is worse than a clear error. Throws on failure; callers show a
 * message built from `nativeFileErrorMessage` below.
 */
export async function saveAndSharePdf(url: string, fileName: string, title: string): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const res = await fetch(apiUrl(url), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Could not fetch the PDF (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const written = await Filesystem.writeFile({ path: fileName, data: bytesToBase64(bytes), directory: Directory.Documents });
  await Share.share({ title, url: written.uri, dialogTitle: title });
}

const PLUGIN_MISSING_RE = /not implemented/i;

/**
 * Turns "'Filesystem' plugin is not implemented on android" (thrown when
 * the installed app predates the Gradle build that linked this plugin in)
 * into an actionable message instead of a raw Capacitor error string.
 */
export function nativeFileErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (PLUGIN_MISSING_RE.test(raw)) return "Opening the voucher in your browser instead...";
  return raw || "Could not save the PDF";
}

export function isPluginMissingError(err: unknown): boolean {
  return PLUGIN_MISSING_RE.test(err instanceof Error ? err.message : String(err));
}

/**
 * Fallback for an installed app build that predates the Filesystem/Share
 * plugins being linked in (see nativeFileErrorMessage above) — asks the
 * server for a short-lived, booking-scoped link (pms-voucher-link.server.ts)
 * and opens it in the system browser. That link works without the PMS
 * session cookie the WebView holds (a separate, unauthenticated browsing
 * context never sees it), which a plain `apiUrl(pdfHref)` would not.
 */
export async function openVoucherInSystemBrowser(bookingId: string): Promise<void> {
  const { pms } = await import("@/lib/pms-client");
  const { url } = await pms<{ url: string }>("vouchers/link", { method: "POST", body: JSON.stringify({ bookingId }) });
  window.open(apiUrl(url), "_system");
}
