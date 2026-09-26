import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { PmsShell } from "@/components/pms/pms-shell";
import { PmsContext } from "@/components/pms/pms-context";
import { CreateReservationModal } from "@/components/pms/create-reservation-modal";
import { pms } from "@/lib/pms-client";

// Standalone Plix PMS shell for every /pms/* route except /pms/login (which
// opts out of this layout via the pms_ prefix). Gated by its own PMS session.
export const Route = createFileRoute("/pms")({
  head: () => ({ meta: [{ title: "Plix PMS" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PmsLayout,
});

function PmsLayout() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
    <PmsContext.Provider value={{ openCreate: () => setCreating(true), refreshKey }}>
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
