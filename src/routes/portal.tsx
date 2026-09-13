import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PortalErrorBoundary } from "@/components/plix/portal-error-boundary";

// Shared layout for every /portal/* route (welcome, login, dashboard) — its
// only job is wrapping them in PortalErrorBoundary so a rendering bug in one
// tab can't blank the whole app or read as an unexplained bounce to login.
export const Route = createFileRoute("/portal")({
  component: PortalLayout,
});

function PortalLayout() {
  return (
    <PortalErrorBoundary>
      <Outlet />
    </PortalErrorBoundary>
  );
}
