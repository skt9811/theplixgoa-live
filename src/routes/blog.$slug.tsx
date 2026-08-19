import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Calendar, Clock, Facebook, Hop as Home, Link2, Loader, Twitter } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { blogQuery, blogsQuery, estimateReadingTime, formatDate } from "@/lib/blog";
import {
  SITE_URL,
  canonicalUrl,
} from "@/lib/seo";

export const Route = createFileRoute("/blog/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — The Plix Goa Blog` },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl(`/blog/${params.slug}`) }],
  }),
  loader: async ({ params, context }) => {
    await context.queryClient.prefetchQuery(blogQuery(params.slug));
  },
  component: BlogPostPage,
});

function BlogPostPage() {
  const { slug } = Route.useParams();
  const { data: post, isLoading } = useQuery(blogQuery(slug));
  const { data: allBlogs = [] } = useQuery(blogsQuery);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold text-navy">Article not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This blog post may have been removed or moved.
        </p>
        <Link
          to="/blog"
          className="mt-6 inline-block rounded-full bg-navy px-6 py-3 text-sm font-semibold text-navy-foreground"
        >
          Back to Blog
        </Link>
      </div>
    );
  }

  const related = allBlogs.filter((b) => b.id !== post.id).slice(0, 3);
  const shareUrl = `${SITE_URL}/blog/${post.slug}`;

  return (
    <>
      <section className="relative h-[45vh] min-h-[320px] w-full overflow-hidden md:h-[55vh]">
        {post.cover_image ? (
          <img
            src={post.cover_image}
            alt={post.title}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-navy" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/70" />
        <div className="relative z-10 mx-auto flex h-full max-w-3xl flex-col items-center justify-end px-4 pb-10 text-center">
          <span className="rounded-full bg-bronze px-3 py-1 text-xs font-semibold text-bronze-foreground">
            {post.category}
          </span>
          <h1 className="mt-4 font-serif text-2xl font-normal leading-tight text-white md:text-4xl lg:text-5xl">
            {post.title}
          </h1>
          <div className="mt-4 flex items-center gap-4 text-xs text-white/80">
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {formatDate(post.published_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {estimateReadingTime(post.content)} min read
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
        <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="flex items-center gap-1 hover:text-primary">
            <Home className="size-3.5" />
            Home
          </Link>
          <span>/</span>
          <Link to="/blog" className="hover:text-primary">Blog</Link>
          <span>/</span>
          <span className="truncate text-foreground">{post.title}</span>
        </nav>

        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-gradient-emerald text-sm font-semibold text-primary-foreground">
            {post.author.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-navy">{post.author}</p>
            <p className="text-xs text-muted-foreground">Plix Goa Editorial</p>
          </div>
        </div>

        <div className="mb-8 flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Share:</span>
          <ShareButtons url={shareUrl} title={post.title} />
        </div>

        <article
          className="prose-blog"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        <div className="mt-10 rounded-2xl border border-border bg-gradient-to-br from-navy to-[#1a2a1a] p-8 text-center text-navy-foreground">
          <h3 className="font-serif text-xl font-normal md:text-2xl">
            Book Your Luxury Stay in North Goa
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-navy-foreground/80">
            Private pool villas, boutique resorts, and heritage bungalows across Anjuna, Vagator, Assagao, and Morjim.
          </p>
          <Link
            to="/stays"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-bronze px-6 py-3 text-sm font-semibold text-bronze-foreground shadow-lg transition-transform hover:scale-[1.03]"
          >
            Explore Villas
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
          <h2 className="text-xl font-semibold text-navy md:text-2xl">More from the Journal</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.id}
                to="/blog/$slug"
                params={{ slug: r.slug }}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  {r.cover_image ? (
                    <img
                      src={r.cover_image}
                      alt={r.title}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-accent" />
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-navy">
                    {r.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-serif text-lg font-normal leading-snug text-navy">
                    {r.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {r.excerpt}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mx-auto max-w-3xl px-4 pb-12">
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:gap-3"
        >
          <ArrowLeft className="size-4" />
          Back to all articles
        </Link>
      </div>
    </>
  );
}

function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex size-9 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:bg-accent"
        aria-label="Share on Twitter"
      >
        <Twitter className="size-4" />
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex size-9 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:bg-accent"
        aria-label="Share on Facebook"
      >
        <Facebook className="size-4" />
      </a>
      <button
        onClick={copyLink}
        className="flex size-9 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:bg-accent"
        aria-label="Copy link"
      >
        <Link2 className="size-4" />
      </button>
    </div>
  );
}
