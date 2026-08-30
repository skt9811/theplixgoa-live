import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { PROPERTIES, REVIEWS, type Property, type Review } from "@/lib/plix";
import { fetchPropertiesWithOverrides } from "@/lib/properties-data";

/**
 * @param targetDate "YYYY-MM-DD" — e.g. the guest's selected check-in date
 * on /stays, so card prices reflect that date's rate rather than today's.
 * Omit for the homepage grid, which has no search state (prices default to
 * today server-side — see fetchRatesForDateServerFn).
 */
export const propertiesQuery = (targetDate?: string) =>
  queryOptions({
    queryKey: ["properties", targetDate ?? "today"],
    queryFn: async (): Promise<Property[]> => {
      try {
        return await fetchPropertiesWithOverrides(targetDate);
      } catch {
        return PROPERTIES;
      }
    },
  });

export const propertyQuery = (slug: string) =>
  queryOptions({
    queryKey: ["property", slug],
    queryFn: async (): Promise<Property | null> => {
      try {
        const all = await fetchPropertiesWithOverrides();
        return all.find((p) => p.slug === slug) ?? PROPERTIES.find((p) => p.slug === slug) ?? null;
      } catch {
        return PROPERTIES.find((p) => p.slug === slug) ?? null;
      }
    },
  });

export const reviewsQuery = queryOptions({
  queryKey: ["reviews"],
  queryFn: async (): Promise<Review[]> => {
    return REVIEWS;
  },
});

/**
 * Refetches propertiesQuery when an admin edit fires plix-data-change (same
 * tab) or the storage event (another tab) — property-card.tsx used to do
 * this itself via its own per-card rate fetch; now that starting_price
 * comes from the bulk properties query, this needs to live at the grid
 * level instead. Call from any route that renders property cards (stays,
 * homepage).
 */
export function usePropertiesLiveRefresh(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    function refresh() {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
    }
    function onStorageChange(e: StorageEvent) {
      if (e.key === "plix_data_updated") refresh();
    }
    window.addEventListener("plix-data-change", refresh);
    window.addEventListener("storage", onStorageChange);
    return () => {
      window.removeEventListener("plix-data-change", refresh);
      window.removeEventListener("storage", onStorageChange);
    };
  }, [queryClient]);
}
