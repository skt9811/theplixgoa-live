import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // React Query's defaults (staleTime 0, refetch on every window focus)
  // re-ran each active query — a server-function call through Vercel — every
  // time a guest switched back to the tab. Site data changes rarely; a minute
  // of freshness and no focus refetch cut that origin traffic.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
