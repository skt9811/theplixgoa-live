// Shared by airbnb-spaces-view.tsx (the grid UI) and pms-push.ts (notification
// tap routing) — the storage shape, the native-plugin bridge, and host-name
// matching all live here once so both stay in sync instead of drifting.
import { Capacitor } from "@capacitor/core";

export type AirbnbSpaceInstance = {
  id: string;
  indexNumber: number;
  name: string;
  createdAt: number;
  /** What AirbnbHostActivity keys its per-Space androidx.webkit cookie Profile on. */
  partitionKey: string;
};

const STORAGE_KEY = "plix_pms_airbnb_spaces";

export const HOSTING_URL = "https://www.airbnb.com/hosting";
export const INBOX_URL = "https://www.airbnb.com/hosting/inbox";
export const CALENDAR_URL = "https://www.airbnb.com/multicalendar";

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `space_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function seedDefaults(): AirbnbSpaceInstance[] {
  const now = Date.now();
  return [
    { id: newId(), indexNumber: 1, name: "Rohit", createdAt: now, partitionKey: newId() },
    { id: newId(), indexNumber: 2, name: "Abhishek", createdAt: now, partitionKey: newId() },
  ];
}

export function loadSpaces(): AirbnbSpaceInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedDefaults();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return seedDefaults();
    return parsed as AirbnbSpaceInstance[];
  } catch {
    return seedDefaults();
  }
}

export function saveSpaces(spaces: AirbnbSpaceInstance[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces));
  } catch {
    // localStorage full/unavailable — the grid still works for this
    // session, it just won't persist across a restart.
  }
}

/** Case-insensitive match against each stored Space's own display name (e.g. the "Shalini"/"Ghanshyam"/"Rohit" names in pms-host-names.ts's HOST_NAME_MAP). */
export function findSpaceByHostName(hostName: string): AirbnbSpaceInstance | null {
  const needle = hostName.trim().toLowerCase();
  if (!needle) return null;
  return loadSpaces().find((s) => s.name.trim().toLowerCase() === needle) ?? null;
}

/** Used when a push notification names a host with no existing tile yet — auto-creates one rather than silently opening an unrelated Space's (already-logged-in) account. */
export function createSpaceForHost(name: string): AirbnbSpaceInstance {
  const spaces = loadSpaces();
  const nextIndex = Math.max(0, ...spaces.map((s) => s.indexNumber)) + 1;
  const space: AirbnbSpaceInstance = { id: newId(), indexNumber: nextIndex, name, createdAt: Date.now(), partitionKey: newId() };
  saveSpaces([...spaces, space]);
  return space;
}

type NativeAirbnbHostPlugin = {
  openSpace(opts: { spaceId: string; spaceName: string; url: string }): Promise<{ launched: boolean }>;
};

/** Same access pattern pms-pos-print.ts's nativePrinter() uses for PosPrinterPlugin — null in the browser or an app build older than this plugin. */
export function nativeAirbnbHost(): NativeAirbnbHostPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  const plugins = (Capacitor as unknown as { Plugins?: Record<string, NativeAirbnbHostPlugin> }).Plugins;
  return plugins?.["AirbnbHost"] ?? null;
}

/** spaceId sent to the native side is the space's own partitionKey, not its id — see AirbnbSpaceInstance's own field doc. */
export async function openSpaceUrl(space: AirbnbSpaceInstance, url: string): Promise<void> {
  const plugin = nativeAirbnbHost();
  if (plugin) {
    try {
      await plugin.openSpace({ spaceId: space.partitionKey, spaceName: space.name, url });
      return;
    } catch (err) {
      console.warn("[airbnb-spaces] native openSpace failed, falling back to system browser:", err);
    }
  }
  // Same convention pms-native-file.ts's openVoucherInSystemBrowser uses —
  // "_system" is what actually leaves the Capacitor WebView for the real
  // system browser on Android; a plain "_blank" would try (and fail) to
  // open a new tab inside the app's own WebView instead. Also the only
  // path at all in a plain browser.
  window.open(url, "_system");
}
