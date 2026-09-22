// Seeds 30 scheduled blog posts (2026-09-24 .. 2026-10-23, 09:00 IST) with
// locally hosted, compressed cover images.
//
//   node scripts/seed-30-blogs.ts --validate-only   # check every guardrail, touch nothing
//   node scripts/seed-30-blogs.ts --covers-only     # validate + download/compress covers
//   node scripts/seed-30-blogs.ts                   # validate + covers + insert into the DB
//
// Idempotent: a slug that already exists in public.blogs is skipped, never
// overwritten, and covers are re-downloaded only if the file is missing.
// Reads DATABASE_URL from .env.local; the connection string is never printed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import sharp from "sharp";
import { ALLOWED_LINK_PATHS, CTA, buildContent, internalLinks, wordCount, type PostSpec } from "./seed-30-blogs/helpers.ts";
import { posts1 } from "./seed-30-blogs/posts-1.ts";
import { posts2 } from "./seed-30-blogs/posts-2.ts";
import { posts3 } from "./seed-30-blogs/posts-3.ts";
import { extras, outroAdd } from "./seed-30-blogs/extras.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVER_DIR = path.join(ROOT, "public", "blog-covers");
const MAX_COVER_BYTES = 150 * 1024;
const AUTHOR = "Plix Hospitality";

// The brief, restated as data so the posts are checked against it rather than
// against themselves: [n, date, category, slug, title, links].
const EXPECTED: [number, string, string, string, string, string[]][] = [
  [1, "2026-09-24", "Luxury Stays", "diwali-villa-booking-goa-planning-guide-2026", "Diwali Villa Booking in Goa: Complete Planning Guide [2026]", ["/stays/private-pool-villas", "/properties/the-plix-villa", "/locations/assagao"]],
  [2, "2026-09-25", "Villas", "best-5-bedroom-luxury-villas-vagator-families", "Best 5-Bedroom Luxury Villas in Vagator for Large Families", ["/locations/vagator", "/properties/harbor-court", "/stays/large-groups"]],
  [3, "2026-09-26", "Local Guides", "north-goa-beach-shacks-reopening-october-guide", "North Goa Beach Shacks Reopening: What to Expect in October", ["/locations/morjim", "/locations/anjuna", "/stays/private-pool-villas"]],
  [4, "2026-09-27", "Food & Dining", "private-chef-in-villa-dining-services-plix-goa", "Private Chef Experience: In-Villa Dining Services at The Plix", ["/stays/private-pool-villas", "/properties/casa-marina", "/faq"]],
  [5, "2026-09-28", "Travel Tips", "north-goa-villa-etiquette-music-parties-pets", "North Goa Villa Etiquette: Rules for Music, Parties & Pets", ["/properties/vivenda-chico", "/faq", "/stays"]],
  [6, "2026-09-29", "Villas", "dussehra-long-weekend-goa-private-pool-villas", "Dussehra Long Weekend in Goa: Best Private Pool Villas", ["/stays/private-pool-villas", "/locations/assagao", "/properties/the-plix-villa"]],
  [7, "2026-09-30", "Local Guides", "chapora-fort-sunset-secret-viewpoints-guide", "Chapora Fort Sunset & Secret Viewpoints: The Insider Guide", ["/locations/vagator", "/properties/casa-meadows", "/properties/harbor-court"]],
  [8, "2026-10-01", "Villas", "large-group-villas-morjim-beach-20-guests", "Top Large Group Villas Near Morjim Beach for 20+ Guests", ["/stays/large-groups", "/properties/morjim-pride", "/locations/morjim"]],
  [9, "2026-10-02", "Luxury Stays", "boutique-villa-estates-vs-resort-chains-north-goa", "Why Boutique Villa Estates Beat Big Resort Chains in North Goa", ["/locations/vagator", "/properties/casa-moana", "/stays/private-pool-villas"]],
  [10, "2026-10-03", "Nightlife", "curated-nightlife-guide-speakeasies-lounges-anjuna", "Curated Nightlife Guide: Best Speakeasies & Lounges in Anjuna", ["/locations/anjuna", "/properties/casa-marina", "/locations/vagator"]],
  [11, "2026-10-04", "Local Guides", "assagao-heritage-walk-mansions-boutiques-cafes", "Assagao Heritage Walk: Portuguese Mansions, Boutiques & Cafes", ["/locations/assagao", "/properties/the-plix-villa", "/stays"]],
  [12, "2026-10-05", "Villas", "corporate-leadership-retreats-north-goa-villas", "Corporate Leadership Retreats: North Goa Executive Villa Guide", ["/stays/large-groups", "/properties/vivenda-chico", "/properties/morjim-pride"]],
  [13, "2026-10-06", "Food & Dining", "top-organic-breakfast-brunch-cafes-vagator-anjuna", "Top Organic Breakfast & Brunch Cafes in Vagator & Anjuna", ["/locations/vagator", "/locations/anjuna", "/properties/casa-meadows"]],
  [14, "2026-10-07", "Travel Tips", "goa-taxi-scams-safe-airport-transfers-self-drive", "Goa Taxi Scams to Avoid: Safe Airport Transfers & Self-Drive", ["/about", "/contact", "/faq"]],
  [15, "2026-10-08", "Luxury Stays", "private-pool-villa-vs-5-star-hotel-suites-cost", "Private Pool Villa vs 5-Star Hotel Suites: Cost Breakdown", ["/stays/private-pool-villas", "/properties/casa-serenita", "/stays"]],
  [16, "2026-10-09", "Local Guides", "morjim-turtle-nesting-season-traveler-guide", "Morjim Turtle Nesting Season: Responsible Traveler Guide", ["/locations/morjim", "/properties/the-plix-resort-morjim", "/stays"]],
  [17, "2026-10-10", "Villas", "candolim-heritage-bungalows-portuguese-history", "Candolim Heritage Bungalows: Staying in Portuguese History", ["/locations/candolim", "/properties/vivenda-chico", "/stays/large-groups"]],
  [18, "2026-10-11", "Travel Tips", "traveling-with-toddlers-goa-baby-friendly-villas", "Traveling with Toddlers in Goa: Baby-Friendly Villa Amenities", ["/stays/private-pool-villas", "/properties/the-plix-villa", "/faq"]],
  [19, "2026-10-12", "Nightlife", "sunset-cocktails-midnight-beats-vagator-circuit", "Sunset Cocktails to Midnight Beats: Ultimate Vagator Circuit", ["/locations/vagator", "/properties/harbor-court", "/properties/casa-marina"]],
  [20, "2026-10-13", "Local Guides", "quiet-beaches-north-goa-ashwem-mandrem-morjim", "Quiet Beaches in North Goa: Ashwem, Mandrem & Morjim Escapes", ["/locations/morjim", "/properties/the-plix-resort-morjim", "/stays"]],
  [21, "2026-10-14", "Food & Dining", "goan-seafood-secrets-what-to-order-dishes", "Goan Seafood Secrets: What to Order Beyond Fish Curry Rice", ["/locations/candolim", "/locations/anjuna", "/stays"]],
  [22, "2026-10-15", "Luxury Stays", "december-villa-bookings-goa-book-in-october", "December Villa Bookings in Goa: Why You Must Book in October", ["/stays/private-pool-villas", "/properties/the-plix-villa", "/stays/large-groups"]],
  [23, "2026-10-16", "Villas", "private-enclave-living-marina-villas-vagator", "Private Enclave Living: The Marina Villas Experience in Vagator", ["/locations/vagator", "/properties/casa-marina", "/properties/casa-meadows"]],
  [24, "2026-10-17", "Travel Tips", "goa-workation-essentials-wifi-power-backup-villas", "Goa Workation Essentials: High-Speed Wi-Fi & Power Backup Stays", ["/properties/harbor-court", "/stays", "/locations/vagator"]],
  [25, "2026-10-18", "Local Guides", "mapusa-friday-market-spices-pottery-antiques", "Mapusa Friday Market Guide: Spices, Pottery & Antiques", ["/locations/assagao", "/locations/anjuna", "/properties/the-plix-villa"]],
  [26, "2026-10-19", "Villas", "intimate-wedding-anniversary-villas-north-goa", "Intimate Wedding & Anniversary Celebrations in North Goa Villas", ["/stays/large-groups", "/properties/morjim-pride", "/properties/vivenda-chico"]],
  [27, "2026-10-20", "Nightlife", "top-sundowner-spots-north-goa-cliffside-views", "Top Sundowner Spots in North Goa: Cliffside Views & Golden Hour", ["/locations/vagator", "/properties/casa-meadows", "/locations/anjuna"]],
  [28, "2026-10-21", "Food & Dining", "fine-dining-assagao-north-goa-culinary-capital", "Fine Dining in Assagao: North Goa's Culinary Capital Revealed", ["/locations/assagao", "/properties/the-plix-villa", "/stays/private-pool-villas"]],
  [29, "2026-10-22", "Travel Tips", "direct-booking-privileges-ota-portals-extra-cost", "Direct Booking Privileges: Why OTA Portals Cost You 15% More", ["/stays", "/faq", "/about"]],
  [30, "2026-10-23", "Luxury Stays", "curated-luxury-concierge-services-yachting-chefs", "Curated Luxury Concierge Services: Yachting, Cars & Chefs", ["/about", "/contact", "/stays/private-pool-villas"]],
];

// Appends the extra paragraph (extras.ts) to the end of each section's prose
// and, where present, a closing sentence to the outro.
function withExtras(post: PostSpec): PostSpec {
  const extra = extras[post.n];
  const closing = outroAdd[post.n];
  return {
    ...post,
    outro: closing ? `${post.outro} ${closing}` : post.outro,
    sections: extra
      ? [
          { ...post.sections[0], paragraphs: [...post.sections[0].paragraphs, extra[0]] },
          { ...post.sections[1], paragraphs: [...post.sections[1].paragraphs, extra[1]] },
        ]
      : post.sections,
  };
}

function validate(posts: PostSpec[]): string[] {
  const problems: string[] = [];
  const add = (n: number, msg: string) => problems.push(`#${n}: ${msg}`);
  if (posts.length !== 30) problems.push(`expected 30 posts, got ${posts.length}`);
  const slugs = new Set<string>();
  const photos = new Set<string>();
  for (const [n, date, category, slug, title, links] of EXPECTED) {
    const post = posts.find((p) => p.n === n);
    if (!post) { add(n, "missing"); continue; }
    if (post.date !== date) add(n, `date ${post.date} != ${date}`);
    if (post.category !== category) add(n, `category ${post.category} != ${category}`);
    if (post.slug !== slug) add(n, `slug ${post.slug} != ${slug}`);
    if (post.title !== title) add(n, `title differs from brief`);
    if (post.title.length < 50 || post.title.length > 63) add(n, `title length ${post.title.length} (want 50-63)`);
    if (post.excerpt.length < 125 || post.excerpt.length > 150) add(n, `excerpt length ${post.excerpt.length} (want 125-150)`);
    if (!post.excerpt.endsWith(CTA)) add(n, `excerpt must end with "${CTA}"`);
    const content = buildContent(post);
    const words = wordCount(content);
    if (words < 500 || words > 700) add(n, `${words} words (want 500-700)`);
    const found = internalLinks(content);
    if (found.length < 2 || found.length > 3) add(n, `${found.length} internal links (want 2-3)`);
    if (new Set(found).size !== found.length) add(n, "duplicate link target");
    for (const href of found) if (!ALLOWED_LINK_PATHS.has(href)) add(n, `link ${href} is not an allowed path`);
    if ([...links].sort().join() !== [...found].sort().join()) add(n, `links ${found.join(", ")} != brief ${links.join(", ")}`);
    if (!/^[0-9a-z]+(-[0-9a-z]+)*$/.test(post.photo.replace(/^photo-/, "")) ) add(n, "bad photo id");
    if (slugs.has(post.slug)) add(n, "duplicate slug");
    if (photos.has(post.photo)) add(n, "duplicate cover photo");
    slugs.add(post.slug);
    photos.add(post.photo);
    if (!/<ul><li>/.test(content)) add(n, "no bullet list");
    if ((content.match(/<h2>/g) ?? []).length !== 3) add(n, "expected 2 content <h2> + 1 FAQ <h2>");
    if ((content.match(/<strong>Q: /g) ?? []).length !== 2) add(n, "expected exactly 2 FAQ questions");
  }
  return problems;
}

async function downloadCover(post: PostSpec): Promise<{ file: string; bytes: number; width: number; height: number }> {
  const file = path.join(COVER_DIR, `${post.slug}.jpg`);
  if (!fs.existsSync(file)) {
    // images.unsplash.com only: that host serves the free Unsplash License
    // photos (Unsplash+ premium images live on plus.unsplash.com).
    const url = `https://images.unsplash.com/photo-${post.photo}?w=1200&h=800&fit=crop&q=85&fm=jpg`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`cover download failed for ${post.slug}: HTTP ${res.status}`);
    const source = Buffer.from(await res.arrayBuffer());
    let out: Buffer | null = null;
    for (let quality = 82; quality >= 40; quality -= 4) {
      const candidate = await sharp(source).resize(1200, 800, { fit: "cover" }).jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
      out = candidate;
      if (candidate.length <= MAX_COVER_BYTES - 5 * 1024) break;
    }
    if (!out || out.length > MAX_COVER_BYTES) throw new Error(`cover for ${post.slug} could not be compressed under 150KB`);
    fs.writeFileSync(file, out);
  }
  const buf = fs.readFileSync(file);
  const meta = await sharp(buf).metadata();
  if (buf.length > MAX_COVER_BYTES) throw new Error(`${post.slug}.jpg is ${buf.length} bytes (over 150KB)`);
  if (meta.format !== "jpeg") throw new Error(`${post.slug}.jpg is not a JPEG`);
  return { file, bytes: buf.length, width: meta.width ?? 0, height: meta.height ?? 0 };
}

function databaseUrl(): string {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const match = env.match(/^DATABASE_URL=(.*)$/m);
  if (!match?.[1]) throw new Error("DATABASE_URL not found in .env.local");
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

async function main() {
  const validateOnly = process.argv.includes("--validate-only");
  const coversOnly = process.argv.includes("--covers-only");
  const posts = [...posts1, ...posts2, ...posts3].sort((a, b) => a.n - b.n).map(withExtras);

  const problems = validate(posts);
  if (problems.length) {
    console.error(`VALIDATION FAILED (${problems.length}):\n  ` + problems.join("\n  "));
    process.exit(1);
  }
  const words = posts.map((p) => wordCount(buildContent(p)));
  console.log(`validation OK: 30 posts | words ${Math.min(...words)}-${Math.max(...words)} | titles ${Math.min(...posts.map((p) => p.title.length))}-${Math.max(...posts.map((p) => p.title.length))} | excerpts ${Math.min(...posts.map((p) => p.excerpt.length))}-${Math.max(...posts.map((p) => p.excerpt.length))}`);
  if (validateOnly) return;

  fs.mkdirSync(COVER_DIR, { recursive: true });
  let totalBytes = 0;
  for (const post of posts) {
    const cover = await downloadCover(post);
    totalBytes += cover.bytes;
    console.log(`cover ${String(post.n).padStart(2)} ${(cover.bytes / 1024).toFixed(0).padStart(4)}KB ${cover.width}x${cover.height} ${post.slug}.jpg`);
  }
  console.log(`covers OK: 30 files, ${(totalBytes / 1024 / 1024).toFixed(2)}MB total`);
  if (coversOnly) return;

  const sql = postgres(databaseUrl(), { ssl: "require", max: 1 });
  try {
    const existing = await sql<{ slug: string }[]>`SELECT slug FROM public.blogs WHERE slug = ANY(${posts.map((p) => p.slug)})`;
    const taken = new Set(existing.map((r) => r.slug));
    const toInsert = posts.filter((p) => !taken.has(p.slug));
    await sql.begin(async (tx) => {
      for (const post of toInsert) {
        const publishedAt = `${post.date}T03:30:00.000Z`; // 09:00:00 IST (UTC+5:30)
        await tx`
          INSERT INTO public.blogs (title, slug, excerpt, content, cover_image, category, author, published_at)
          VALUES (${post.title}, ${post.slug}, ${post.excerpt}, ${buildContent(post)}, ${`/blog-covers/${post.slug}.jpg`}, ${post.category}, ${AUTHOR}, ${publishedAt})
        `;
      }
    });
    console.log(`database: inserted ${toInsert.length}, skipped ${taken.size} already present`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
