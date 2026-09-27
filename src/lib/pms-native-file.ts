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
 * file exists on disk. Throws on failure; callers show their own message.
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
