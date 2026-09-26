import { useCallback, useEffect, useState } from "react";
import { PROPERTIES } from "@/lib/plix";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { PmsShell } from "@/components/pms/pms-shell";
import { PmsContext } from "@/components/pms/pms-context";
import { CreateReservationModal } from "@/components/pms/create-reservation-modal";
import { pms } from "@/lib/pms-client";
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
  const [authed, setAuthed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [property, setPropertyState] = useState("all");

  // The active property survives tab changes and reloads: a ?property= link
  // wins when present, otherwise the last choice saved on this device.
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("property");
      const saved = fromUrl ?? window.localStorage.getItem(PROPERTY_KEY);
      if (isKnownProperty(saved)) setPropertyState(saved);
    } catch {
      // storage unavailable: keep the in-memory default
    }
  }, []);

  const setProperty = useCallback((next: string) => {
    if (!isKnownProperty(next)) return;
    setPropertyState(next);
    try {
      window.localStorage.setItem(PROPERTY_KEY, next);
    } catch {
      // ignore: the choice still applies for this session
    }
  }, []);

  useEffect(() => {
    pms("session")
      .then(() => setAuthed(true))
      .catch(() => void navigate({ to: "/pms/login" }));
  }, [navigate]);

  const logout = useCallback(async () => {
    await pms("logout", { method: "POST" }).catch(() => undefined);
    void navigate({ to: "/pms/login" });
  }, [navigate]);

  if (!authed) {
    return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-50 text-sm text-slate-400">Loading...</div>;
  }

  return (
    <PmsContext.Provider value={{ openCreate: () => setCreating(true), refreshKey, property, setProperty }}>
      <PmsShell onLogout={() => void logout()}>
        <Outlet />
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
  );
}
