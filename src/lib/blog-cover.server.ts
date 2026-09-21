// Server-only. Decodes a stored base64 data: URI cover into a real image
// response, so blog cards can reference a normal cacheable URL instead of
// embedding megabytes of base64 in the page HTML (see
// fetchBlogSummariesServerFn). Raster formats only — never SVG/HTML from a
// data: URI, which would be served same-origin and could carry script.
import { fetchPublishedBlogCoverDataUri } from "@/lib/blogs-core.server";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const SLUG_PATTERN = /^[a-z0-9-]{1,200}$/;

export async function handleBlogCoverRequest(slug: string): Promise<Response> {
  if (!SLUG_PATTERN.test(slug)) return new Response("Not found", { status: 404 });
  const dataUri = await fetchPublishedBlogCoverDataUri(slug);
  const match = dataUri?.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  const mime = match?.[1]?.toLowerCase();
  const payload = match?.[2];
  if (!mime || !payload || !ALLOWED_MIME.has(mime)) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(payload, "base64"), {
    status: 200,
    headers: {
      "Content-Type": mime,
      // A post's cover only changes when an admin re-uploads it; a day at the
      // edge plus a week of stale-while-revalidate keeps card images instant.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
