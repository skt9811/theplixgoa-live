import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { PmsShell } from "@/components/pms/pms-shell";
import { PmsBackButton } from "@/components/pms/pms-back-button";
import { PmsContext } from "@/components/pms/pms-context";
import { CreateReservationModal } from "@/components/pms/create-reservation-modal";
import { setDynamicPropertyNames } from "@/components/pms/property-selector";
import {
  pms,
  PMS_PROPERTY_STORAGE_KEY,
  tabForPath,
  TAB_HOME,
  TAB_LABELS,
  type PmsProperty,
  type PmsTab,
  type PmsUser,
} from "@/lib/pms-client";
import { PmsThemeProvider, type ThemePreference } from "@/components/pms/pms-theme";
import { pmsHead, usePmsBrandedHead } from "@/components/pms/pms-head";
import { hidePmsSplash } from "@/lib/pms-splash";
import { PmsPushRequiredGate } from "@/components/pms/pms-push-required-gate";

// Standalone Plix PMS shell for every /pms/* route except /pms/login (which
// opts out of this layout via the pms_ prefix). Gated by its own PMS session.
export const Route = createFileRoute("/pms")({
  head: () => pmsHead,
  component: PmsLayout,
});

const PROPERTY_KEY = PMS_PROPERTY_STORAGE_KEY;

function PmsLayout() {
  usePmsBrandedHead();
  const navigate = useNavigate();
  const [user, setUser] = useState<PmsUser | null>(null);
  const authed = user !== null;
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [property, setPropertyState] = useState("all");
  const [serverTheme, setServerTheme] = useState<ThemePreference | null>(null);
  // null = not fetched yet. This actor's own organization's real properties
  // (GET /api/pms/properties) — replaces reading the static PROPERTIES array
  // here, which only ever listed the 10 real Plix villas/hotels and silently
  // excluded any other tenant's own property from their own switcher/POS.
  const [properties, setProperties] = useState<PmsProperty[] | null>(null);

  const isKnownProperty = useCallback(
    (value: string | null): value is string =>
      value === "all" || (value !== null && (properties ?? []).some((p) => p.id === value)),
    [properties],
  );

  const allProperties = user?.props.includes("all") ?? true;
  const allowedProperties = allProperties
    ? (properties ?? []).map((p) => p.id)
    : (user?.props ?? []).filter((sl) => (properties ?? []).some((p) => p.id === sl));
  // Memoized (not a plain const re-created every render) specifically so
  // setProperty below can list it as a dependency and never close over a
  // stale allowedProperties/allProperties pair from before `properties`
  // finished loading.
  const isAllowed = useCallback(
    (value: string | null): value is string =>
      value === "all"
        ? allProperties || allowedProperties.length > 1
        : value !== null && allowedProperties.includes(value),
    [allProperties, allowedProperties],
  );

  // The active property survives tab changes and reloads: a ?property= link
  // wins when present, otherwise the last choice saved on this device. A user
  // restricted to some properties can never land on one they do not have.
  // Waits on `properties` too now — isAllowed/isKnownProperty can't resolve
  // correctly against an empty list before that first fetch returns.
  useEffect(() => {
    if (!user || properties === null) return;
    let chosen: string | null = null;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("property");
      chosen = fromUrl ?? window.localStorage.getItem(PROPERTY_KEY);
    } catch {
      // storage unavailable: keep the default
    }
    setPropertyState(
      isKnownProperty(chosen) && isAllowed(chosen)
        ? chosen
        : allProperties
          ? "all"
          : allowedProperties.length > 1
            ? "all"
            : (allowedProperties[0] ?? "all"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, properties]);

  const setProperty = useCallback(
    (next: string) => {
      if (!isKnownProperty(next) || !isAllowed(next)) return;
      setPropertyState(next);
      try {
        window.localStorage.setItem(PROPERTY_KEY, next);
      } catch {
        // ignore: the choice still applies for this session
      }
    },
    [isKnownProperty, isAllowed],
  );

  useEffect(() => {
    pms("session")
      .then((res) => {
        setUser((res as { user: PmsUser }).user);
        // Reaching this means the dashboard is really the right screen to
        // show, so the native splash (see capacitor.config.ts's
        // launchAutoHide: false) can come down now.
        void hidePmsSplash();
        pms<{ settings: { theme?: string } }>("settings")
          .then((r) => {
            const t = r.settings.theme;
            if (t === "system" || t === "dark" || t === "light") setServerTheme(t);
          })
          .catch(() => undefined);
        // This actor's own organization's real properties — must resolve to
        // SOMETHING (even []) so the loading gate below can never hang
        // forever on a failed fetch.
        pms<{ properties: PmsProperty[] }>("properties")
          .then((r) => {
            setDynamicPropertyNames(r.properties);
            setProperties(r.properties);
          })
          .catch((err) => {
            console.error(
              "[pms] properties fetch failed:",
              err instanceof Error ? err.message : err,
            );
            setProperties([]);
          });
      })
      .catch(() => void navigate({ to: "/pms/login" }));
  }, [navigate]);

  const saveTheme = useCallback((theme: ThemePreference) => {
    void pms("settings", {
      method: "POST",
      body: JSON.stringify({ key: "theme", value: theme }),
    }).catch(() => undefined);
  }, []);

  const logout = useCallback(async () => {
    await pms("logout", { method: "POST" }).catch(() => undefined);
    // Drop the in-memory session immediately, before anything else — a
    // stale `user` would let PmsShell/Outlet render authed content for one
    // more tick even after the cookie is gone.
    setUser(null);
    try {
      window.localStorage.removeItem(PROPERTY_KEY);
    } catch {
      // best-effort — the cookie clear above is what actually ends the session
    }
    // A hard navigation, not the SPA router: this clears every bit of JS
    // memory state in one step, so there is nothing left for a backgrounded
    // app to resume into. See MainActivity.java's onPause/onStop for the
    // other half of this fix (the Android WebView's on-disk cookie jar can
    // lag an in-memory Set-Cookie clear by several seconds — a force-close
    // from the task switcher right after logout could resurrect the old
    // cookie from disk before Android ever flushed the deletion).
    window.location.assign("/pms/login");
  }, []);

  const needTab = tabForPath(pathname);
  const posDenied = user !== null && needTab === "pos" && !user.tabs.includes("pos");
  useEffect(() => {
    if (!posDenied) return;
    toast.error("Access restricted: your account does not include the Restaurant POS.");
    void navigate({ to: "/pms" });
  }, [posDenied, navigate]);

  if (!user || properties === null) {
    return (
      <PmsThemeProvider>
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-50 text-sm text-slate-400">
          Loading...
        </div>
      </PmsThemeProvider>
    );
  }

  return (
    <PmsThemeProvider initialFromServer={serverTheme} onChange={saveTheme}>
      <PmsPushRequiredGate
        onNavigate={(nav) => void navigate({ to: nav.to, search: nav.search } as never)}
      >
        <PmsContext.Provider
          value={{
            openCreate: () => setCreating(true),
            refreshKey,
            property,
            setProperty,
            user,
            can: (tab: PmsTab) => user.tabs.includes(tab),
            allowedProperties,
            allProperties,
            properties: allProperties
              ? properties
              : properties.filter((p) => allowedProperties.includes(p.id)),
          }}
        >
          <PmsBackButton />
          <PmsShell onLogout={() => void logout()}>
            {posDenied ? null : needTab && !user.tabs.includes(needTab) ? (
              <NoAccess tab={needTab} tabs={user.tabs as PmsTab[]} />
            ) : (
              <Outlet />
            )}
          </PmsShell>
          {creating && (
            <CreateReservationModal
              onClose={() => setCreating(false)}
              onCreated={() => {
                setCreating(false);
                setRefreshKey((k) => k + 1);
              }}
            />
          )}
        </PmsContext.Provider>
      </PmsPushRequiredGate>
    </PmsThemeProvider>
  );
}

function NoAccess({ tab, tabs }: { tab: PmsTab; tabs: PmsTab[] }) {
  const first = (
    ["dashboard", "bookings", "vouchers", "invoices", "expenses", "pos", "settings"] as PmsTab[]
  ).find((t) => tabs.includes(t));
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-bold">No access</h1>
      <p className="mt-2 text-sm text-slate-500">
        Your account does not include the {TAB_LABELS[tab]} tab. Ask an administrator if you need
        it.
      </p>
      {first && (
        <Link
          to={TAB_HOME[first] as "/pms"}
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Go to {TAB_LABELS[first]}
        </Link>
      )}
    </div>
  );
}
