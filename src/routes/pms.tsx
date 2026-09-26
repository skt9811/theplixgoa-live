import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PROPERTIES } from "@/lib/plix";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { PmsShell } from "@/components/pms/pms-shell";
import { PmsBackButton } from "@/components/pms/pms-back-button";
import { PmsContext } from "@/components/pms/pms-context";
import { CreateReservationModal } from "@/components/pms/create-reservation-modal";
import { pms, tabForPath, TAB_HOME, TAB_LABELS, type PmsTab, type PmsUser } from "@/lib/pms-client";
import { PmsThemeProvider, type ThemePreference } from "@/components/pms/pms-theme";
import { pmsHead, usePmsBrandedHead } from "@/components/pms/pms-head";

// Standalone Plix PMS shell for every /pms/* route except /pms/login (which
// opts out of this layout via the pms_ prefix). Gated by its own PMS session.
export const Route = createFileRoute("/pms")({
  head: () => pmsHead,
  component: PmsLayout,
});

const PROPERTY_KEY = "plix_pms_property";

function isKnownProperty(value: string | null): value is string {
  return value === "all" || (value !== null && PROPERTIES.some((p) => p.slug === value));
}

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

  const allProperties = user?.props.includes("all") ?? true;
  const allowedProperties = allProperties ? PROPERTIES.map((p) => p.slug) : (user?.props ?? []).filter((sl) => PROPERTIES.some((p) => p.slug === sl));
  const isAllowed = (value: string | null): value is string => (value === "all" ? allProperties || allowedProperties.length > 1 : value !== null && allowedProperties.includes(value));

  // The active property survives tab changes and reloads: a ?property= link
  // wins when present, otherwise the last choice saved on this device. A user
  // restricted to some properties can never land on one they do not have.
  useEffect(() => {
    if (!user) return;
    let chosen: string | null = null;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("property");
      chosen = fromUrl ?? window.localStorage.getItem(PROPERTY_KEY);
    } catch {
      // storage unavailable: keep the default
    }
    setPropertyState(isKnownProperty(chosen) && isAllowed(chosen) ? chosen : allProperties ? "all" : allowedProperties.length > 1 ? "all" : (allowedProperties[0] ?? "all"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const setProperty = useCallback((next: string) => {
    if (!isKnownProperty(next) || !isAllowed(next)) return;
    setPropertyState(next);
    try {
      window.localStorage.setItem(PROPERTY_KEY, next);
    } catch {
      // ignore: the choice still applies for this session
    }
  }, []);

  useEffect(() => {
    pms("session")
      .then((res) => {
        setUser((res as { user: PmsUser }).user);
        pms<{ settings: { theme?: string } }>("settings")
          .then((r) => {
            const t = r.settings.theme;
            if (t === "system" || t === "dark" || t === "light") setServerTheme(t);
          })
          .catch(() => undefined);
      })
      .catch(() => void navigate({ to: "/pms/login" }));
  }, [navigate]);

  const saveTheme = useCallback((theme: ThemePreference) => {
    void pms("settings", { method: "POST", body: JSON.stringify({ key: "theme", value: theme }) }).catch(() => undefined);
  }, []);

  const logout = useCallback(async () => {
    await pms("logout", { method: "POST" }).catch(() => undefined);
    void navigate({ to: "/pms/login" });
  }, [navigate]);

  const needTab = tabForPath(pathname);
  const posDenied = user !== null && needTab === "pos" && !user.tabs.includes("pos");
  useEffect(() => {
    if (!posDenied) return;
    toast.error("Access restricted: your account does not include the Restaurant POS.");
    void navigate({ to: "/pms" });
  }, [posDenied, navigate]);

  if (!user) {
    return (
      <PmsThemeProvider>
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-50 text-sm text-slate-400">Loading...</div>
      </PmsThemeProvider>
    );
  }

  return (
    <PmsThemeProvider initialFromServer={serverTheme} onChange={saveTheme}>
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
      }}
    >
      <PmsBackButton />
      <PmsShell onLogout={() => void logout()}>
        {posDenied ? null : needTab && !user.tabs.includes(needTab) ? <NoAccess tab={needTab} tabs={user.tabs as PmsTab[]} /> : <Outlet />}
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
    </PmsThemeProvider>
  );
}

function NoAccess({ tab, tabs }: { tab: PmsTab; tabs: PmsTab[] }) {
  const first = (["dashboard", "bookings", "vouchers", "invoices", "expenses", "pos", "settings"] as PmsTab[]).find((t) => tabs.includes(t));
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-bold">No access</h1>
      <p className="mt-2 text-sm text-slate-500">Your account does not include the {TAB_LABELS[tab]} tab. Ask an administrator if you need it.</p>
      {first && (
        <Link to={TAB_HOME[first] as "/pms"} className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          Go to {TAB_LABELS[first]}
        </Link>
      )}
    </div>
  );
}
