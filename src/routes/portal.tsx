import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PortalErrorBoundary } from "@/components/plix/portal-error-boundary";
import { PortalForceUpdateGate } from "@/components/plix/portal-force-update-gate";

// Shared layout for every /portal/* route (welcome, login, dashboard) — its
// job is wrapping them in PortalErrorBoundary so a rendering bug in one tab
// can't blank the whole app or read as an unexplained bounce to login, and
// mounting the force-update gate once so it covers every screen regardless
// of which one the app happens to land on.
export const Route = createFileRoute("/portal")({
  component: PortalLayout,
});

function PortalLayout() {
  return (
    <PortalErrorBoundary>
      <Outlet />
      <PortalForceUpdateGate />
    </PortalErrorBoundary>
  );
}
