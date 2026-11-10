// Seeds the 8 Christmas / New Year 2026–27 peak-season posts
// (13 Nov – 8 Dec 2026, 09:00 IST) with covers made from Plix's own photos.
//
//   node scripts/seed-peak-season-blogs.ts --validate-only   # checks only
//   node scripts/seed-peak-season-blogs.ts --covers-only     # + write covers
//   node scripts/seed-peak-season-blogs.ts                   # + insert into the DB
//
// Idempotent: an existing slug is skipped, never overwritten. Scheduling is
// the blogs table's own: a post is hidden until published_at <= now().
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import sharp from "sharp";
import { posts } from "./seed-peak-season-blogs/posts.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVER_DIR = path.join(ROOT, "public", "blog-covers");
const ASSETS = path.join(ROOT, "src", "assets");
const MAX_COVER_BYTES = 150 * 1024;
const AUTHOR = "Plix Hospitality";

function validate(): void {
  const errors: string[] = [];
  const seen = new Set<string>();
  const live = new Set(posts.map((p) => `/blog/${p.slug}`));
  for (const p of posts) {
    if (seen.has(p.slug)) errors.push(`${p.slug}: duplicate slug`);
    seen.add(p.slug);
    if (p.excerpt.length > 165) errors.push(`${p.slug}: excerpt ${p.excerpt.length} chars (max 165)`);
    if (!fs.existsSync(path.join(ASSETS, p.cover))) errors.push(`${p.slug}: missing cover ${p.cover}`);
    const faqs = p.html.match(/<strong>Q:/g)?.length ?? 0;
    if (faqs < 3 || faqs > 4) errors.push(`${p.slug}: ${faqs} FAQs (want 3–4)`);
    // Links to other posts in this series must already be live on this date.
    for (const [, href] of p.html.matchAll(/href="([^"]+)"/g)) {
      if (!href || !live.has(href)) continue;
      const target = posts.find((q) => `/blog/${q.slug}` === href)!;
      if (target.date >= p.date) errors.push(`${p.slug}: links to ${target.slug}, not live until ${target.date}`);
    }
    const words = p.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    console.log(`${p.date} ${String(words).padStart(5)} words  ${faqs} FAQs  ${p.slug}`);
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
}

async function writeCover(slug: string, source: string): Promise<number> {
  const out = path.join(COVER_DIR, `${slug}.jpg`);
  if (fs.existsSync(out)) return fs.statSync(out).size;
  for (const quality of [80, 72, 64, 56, 48, 40]) {
    const buf = await sharp(path.join(ASSETS, source))
      .resize(1200, 800, { fit: "cover" })
      .jpeg({ quality, mozjpeg: true, progressive: true })
      .toBuffer();
    if (buf.length <= MAX_COVER_BYTES) {
      fs.writeFileSync(out, buf);
      return buf.length;
    }
  }
  throw new Error(`cover for ${slug} could not be compressed under 150KB`);
}

async function main(): Promise<void> {
  validate();
  if (process.argv.includes("--validate-only")) return;

  for (const p of posts) {
    const bytes = await writeCover(p.slug, p.cover);
    console.log(`cover ${(bytes / 1024).toFixed(0).padStart(4)}KB ${p.slug}.jpg`);
  }
  if (process.argv.includes("--covers-only")) return;

  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { ssl: "require" });
  try {
    for (const p of posts) {
      const publishedAt = new Date(`${p.date}T09:00:00+05:30`);
      const rows = await sql`
        INSERT INTO public.blogs (title, slug, excerpt, content, cover_image, category, author, published_at)
        VALUES (${p.title}, ${p.slug}, ${p.excerpt}, ${p.html}, ${`/blog-covers/${p.slug}.jpg`}, ${p.category}, ${AUTHOR}, ${publishedAt})
        ON CONFLICT (slug) DO NOTHING
        RETURNING slug`;
      console.log(`${rows.length ? "inserted" : "skipped (exists)"}  ${publishedAt.toISOString()}  ${p.slug}`);
    }
  } finally {
    await sql.end();
  }
}

await main();
