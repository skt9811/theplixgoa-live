import { queryOptions } from "@tanstack/react-query";
import { PROPERTIES, REVIEWS, type Property, type Review } from "@/lib/plix";

export const propertiesQuery = queryOptions({
  queryKey: ["properties"],
  queryFn: async (): Promise<Property[]> => {
    return PROPERTIES;
  },
});

export const propertyQuery = (slug: string) =>
  queryOptions({
    queryKey: ["property", slug],
    queryFn: async (): Promise<Property | null> => {
      return PROPERTIES.find((p) => p.slug === slug) ?? null;
    },
  });

export const reviewsQuery = queryOptions({
  queryKey: ["reviews"],
  queryFn: async (): Promise<Review[]> => {
    return REVIEWS;
  },
});
