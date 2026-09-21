import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Calendar, ChevronDown, Clock, Loader } from "lucide-react";
import { blogSummariesQuery, BLOG_CATEGORIES, formatDate } from "@/lib/blog";
import {
  SITE_URL,
  SITE_NAME,
  EDGE_CACHE_CONTROL,
  canonicalUrl,
  blogJsonLd,
  blogPostingJsonLd,
  jsonLdScript,
} from "@/lib/seo";

const BLOG_INDEX_TITLE = "Goa Travel & Luxury Villa Guides | The Plix Goa Blog";
const BLOG_INDEX_DESCRIPTION =
  "Expert Goa travel guides, luxury stay recommendations, party venues, and insider tips from Plix Hospitality. Plan your North Goa getaway.";

export const Route = createFileRoute("/blog/")({
  // loader precedes head/headers on purpose: TanStack infers loaderData for
  // those from the options declared before them.
  loader: async ({ context }) => {
    const posts = await context.queryClient.ensureQueryData(blogSummariesQuery);
    // posts[0] is the same post the page renders as its featured hero card
    // (see `featured` in BlogIndex), so the Article schema below describes
    // an article that is genuinely on this page.
    const first = posts[0];
    return {
      recent: posts.slice(0, 10).map((p) => ({ name: p.title, slug: p.slug })),
      featured: first
        ? {
            name: first.title,
            slug: first.slug,
            excerpt: first.excerpt,
            coverImage: first.cover_image,
            author: first.author,
            publishedAt: first.published_at,
          }
        : null,
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: BLOG_INDEX_TITLE },
      { name: "description", content: BLOG_INDEX_DESCRIPTION },
      { property: "og:title", content: BLOG_INDEX_TITLE },
      { property: "og:description", content: BLOG_INDEX_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/blog` },
      { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
      { property: "og:site_name", content: SITE_NAME },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: BLOG_INDEX_TITLE },
      { name: "twitter:description", content: BLOG_INDEX_DESCRIPTION },
      { name: "twitter:image", content: `${SITE_URL}/og-home.jpg` },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/blog") }],
    // Only emitted when there are posts to list — a transient DB miss
    // shouldn't advertise a blog with zero articles.
    //
    // The /blog page itself is a listing, so it's described as a Blog — not
    // as an Article. The Article block is for the featured post, the one
    // real article this page presents in full (typed as both Article and
    // BlogPosting: the latter is a subtype of the former, but checkers that
    // look for a literal "Article" don't follow that hierarchy).
    scripts:
      loaderData && loaderData.recent.length > 0
        ? [
            {
              type: "application/ld+json",
              id: "blog-jsonld",
              children: jsonLdScript(
                blogJsonLd({
                  posts: loaderData.recent
                    .filter((p) => p.slug !== loaderData.featured?.slug)
                    .map((p) => ({ name: p.name, url: `${SITE_URL}/blog/${p.slug}` })),
                }),
              ),
            },
            ...(loaderData.featured
              ? [
                  {
                    type: "application/ld+json",
                    id: "blog-featured-article-jsonld",
                    children: jsonLdScript({
                      ...blogPostingJsonLd({
                        title: loaderData.featured.name,
                        excerpt: loaderData.featured.excerpt,
                        coverImage: loaderData.featured.coverImage.startsWith("/")
                          ? `${SITE_URL}${loaderData.featured.coverImage}`
                          : loaderData.featured.coverImage || `${SITE_URL}/og-home.jpg`,
                        author: loaderData.featured.author,
                        publishedAt: loaderData.featured.publishedAt,
                        url: `${SITE_URL}/blog/${loaderData.featured.slug}`,
                      }),
                      "@type": ["Article", "BlogPosting"],
                    }),
                  },
                ]
              : []),
          ]
        : [],
  }),
  // The list itself changes at most a few times a day (new/edited posts);
  // it doesn't need to be recomputed on every single request. s-maxage
  // caches the SSR response at Vercel's edge; stale-while-revalidate means
  // a visitor during that window still gets an instant cached response
  // while a fresh one is fetched in the background for the next request,
  // rather than ever blocking on a slow origin render.
  // Not cached when the list came back empty (Neon's first query after
  // idle can transiently return nothing) — otherwise that empty page would
  // be what the edge serves for the next hour.
  headers: ({ loaderData }) =>
    loaderData && loaderData.recent.length > 0 ? { "Cache-Control": EDGE_CACHE_CONTROL } : undefined,
  component: BlogIndex,
});

const VISIBLE_COUNT = 10;

function BlogIndex() {
  const { data: blogs = [], isLoading } = useQuery(blogSummariesQuery);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [showAll, setShowAll] = useState(false);

  const filtered = activeCategory === "All"
    ? blogs
    : blogs.filter((b) => b.category === activeCategory);

  const featured = blogs[0] ?? null;
  const gridPosts = activeCategory === "All" ? blogs.slice(1) : filtered.filter((b) => b.id !== featured?.id);
  const hasMore = gridPosts.length > VISIBLE_COUNT;

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
                    {featured.reading_time_minutes} min read
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
              onClick={() => {
                setActiveCategory(cat);
                setShowAll(false);
              }}
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
            {gridPosts.map((post, index) => (
              <Link
                key={post.id}
                to="/blog/$slug"
                params={{ slug: post.slug }}
                // Every post link stays in the server-rendered HTML — hiding
                // extras past VISIBLE_COUNT with CSS (instead of only
                // mounting them after a click) keeps them fully crawlable
                // for internal-link discovery, while giving the same
                // collapsed look for human visitors.
                className={`group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card ${
                  !showAll && index >= VISIBLE_COUNT ? "hidden" : ""
                }`}
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
                      {post.reading_time_minutes} min
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {hasMore && !showAll && (
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-navy shadow-soft transition-colors hover:bg-accent"
            >
              Show more
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
