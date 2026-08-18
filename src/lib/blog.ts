import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/rates";

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image: string;
  category: string;
  author: string;
  published_at: string;
  created_at: string;
};

export const BLOG_CATEGORIES = [
  "All",
  "Nightlife",
  "Travel Tips",
  "Local Guides",
  "Villas",
] as const;

export const blogsQuery = queryOptions({
  queryKey: ["blogs"],
  queryFn: async (): Promise<BlogPost[]> => {
    const { data, error } = await supabase
      .from("blogs")
      .select("id, title, slug, excerpt, content, cover_image, category, author, published_at, created_at")
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as BlogPost[];
  },
});

export const blogQuery = (slug: string) =>
  queryOptions({
    queryKey: ["blog", slug],
    queryFn: async (): Promise<BlogPost | null> => {
      const { data, error } = await supabase
        .from("blogs")
        .select("id, title, slug, excerpt, content, cover_image, category, author, published_at, created_at")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as BlogPost) ?? null;
    },
  });

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function estimateReadingTime(content: string): number {
  const text = content.replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
