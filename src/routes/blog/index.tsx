import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Calendar, Clock, Loader } from "lucide-react";
import { blogsQuery, BLOG_CATEGORIES, estimateReadingTime, formatDate } from "@/lib/blog";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Goa Travel & Luxury Villa Guides | The Plix Goa Blog" },
      {
        name: "description",
        content:
          "Expert Goa travel guides, luxury stay recommendations, party venues, and insider tips from Plix Hospitality. Plan your North Goa getaway.",
      },
      { property: "og:title", content: "Goa Travel & Luxury Villa Guides | The Plix Goa Blog" },
      {
        property: "og:description",
        content:
          "Expert Goa travel guides, luxury stay recommendations, party venues, and insider tips from Plix Hospitality. Plan your North Goa getaway.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/blog") }],
  }),
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(blogsQuery);
  },
  component: BlogIndex,
});

function BlogIndex() {
  const { data: blogs = [], isLoading } = useQuery(blogsQuery);
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filtered = activeCategory === "All"
    ? blogs
    : blogs.filter((b) => b.category === activeCategory);

  const featured = blogs[0] ?? null;
  const gridPosts = activeCategory === "All" ? blogs.slice(1) : filtered.filter((b) => b.id !== featured?.id);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <section className="border-b border-border bg-navy py-16 text-navy-foreground md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-glow">
            The Plix Goa Journal
          </p>
          <h1 className="mt-3 text-4xl font-serif font-normal tracking-wide md:text-6xl">
            Stories from North Goa
          </h1>
          <p className="mt-4 max-w-2xl text-base font-light text-navy-foreground/80 md:text-lg">
            Sunset spots, insider guides, and luxury travel tips — curated by the Plix Goa team.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        {featured && activeCategory === "All" && (
          <Link
            to="/blog/$slug"
            params={{ slug: featured.slug }}
            className="group mb-12 block overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
          >
            <div className="grid md:grid-cols-2">
              <div className="relative aspect-[16/10] overflow-hidden md:aspect-auto">
                {featured.cover_image ? (
                  <img
                    src={featured.cover_image}
                    alt={featured.title}
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-accent" />
                )}
                <span className="absolute left-4 top-4 rounded-full bg-bronze px-3 py-1 text-xs font-semibold text-bronze-foreground">
                  Featured
                </span>
              </div>
              <div className="flex flex-col justify-center p-6 md:p-10">
                <span className="inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {featured.category}
                </span>
                <h2 className="mt-4 font-serif text-2xl font-normal leading-tight text-navy md:text-3xl">
                  {featured.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                  {featured.excerpt}
                </p>
                <div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {formatDate(featured.published_at)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {estimateReadingTime(featured.content)} min read
                  </span>
                </div>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-transform group-hover:gap-3">
                  Read article
                  <ArrowRight className="size-4" />
                </span>
              </div>
            </div>
          </Link>
        )}

        <div className="mb-8 flex flex-wrap gap-2">
          {BLOG_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-navy text-navy-foreground"
                  : "border border-border bg-card text-foreground/80 hover:bg-accent"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {gridPosts.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No posts in this category yet.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {gridPosts.map((post) => (
              <Link
                key={post.id}
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  {post.cover_image ? (
                    <img
                      src={post.cover_image}
                      alt={post.title}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-accent" />
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-navy backdrop-blur-sm">
                    {post.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-serif text-lg font-normal leading-snug text-navy">
                    {post.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {post.excerpt}
                  </p>
                  <div className="mt-auto pt-4 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3" />
                      {formatDate(post.published_at)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3" />
                      {estimateReadingTime(post.content)} min
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
