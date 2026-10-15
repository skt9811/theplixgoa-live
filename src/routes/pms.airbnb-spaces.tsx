import { createFileRoute } from "@tanstack/react-router";
import { AirbnbSpacesView } from "@/components/pms/airbnb-spaces-view";

export const Route = createFileRoute("/pms/airbnb-spaces")({
  // ?space=<partitionKey> — opened by a "Add to Home Screen" direct link
  // (PWA/browser fallback) so it lands straight on that Space instead of
  // the grid. The native Android path skips this route entirely (its
  // pinned shortcut launches AirbnbHostActivity directly).
  validateSearch: (search: Record<string, unknown>): { space?: string | undefined } => ({
    space: typeof search["space"] === "string" ? search["space"] : undefined,
  }),
  component: AirbnbSpacesView,
});
