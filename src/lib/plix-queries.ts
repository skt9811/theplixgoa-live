import { queryOptions } from "@tanstack/react-query";
import { PROPERTIES, REVIEWS, type Property, type Review } from "@/lib/plix";
import { fetchPropertiesWithOverrides } from "@/lib/properties-data";

export const propertiesQuery = queryOptions({
  queryKey: ["properties"],
  queryFn: async (): Promise<Property[]> => {
    try {
      return await fetchPropertiesWithOverrides();
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
