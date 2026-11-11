// Moves blog covers stored as base64 data: URIs in public.blogs.cover_image
// into compressed static files under public/blog-covers/, served by Vercel's
// CDN instead of /api/blog-cover through the server function.
//
//   node scripts/migrate-blog-covers.ts            # write the files only
//   node scripts/migrate-blog-covers.ts --update-db  # then repoint the rows
//
// Run --update-db only after the files are deployed. Idempotent: a row is
// updated only while it still holds a data: URI.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVER_DIR = path.join(ROOT, "public", "blog-covers");
const MAX_BYTES = 150 * 1024;

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { ssl: "require" });

try {
  const rows = await sql<{ slug: string; cover_image: string }[]>`
    SELECT slug, cover_image FROM public.blogs WHERE cover_image LIKE 'data:%'`;
  for (const row of rows) {
    const match = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/is.exec(row.cover_image);
    if (!match?.[1]) {
      console.log(`skip (not a raster data URI)  ${row.slug}`);
      continue;
    }
    const file = path.join(COVER_DIR, `${row.slug}.jpg`);
    if (!fs.existsSync(file)) {
      const source = Buffer.from(match[1], "base64");
      let out: Buffer | null = null;
      for (const quality of [80, 72, 64, 56, 48, 40]) {
        out = await sharp(source).rotate().resize(1200, 800, { fit: "cover" }).jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
        if (out.length <= MAX_BYTES) break;
      }
      if (!out || out.length > MAX_BYTES) throw new Error(`${row.slug}: could not compress under 150KB`);
      fs.writeFileSync(file, out);
      console.log(`wrote ${(row.cover_image.length / 1024).toFixed(0).padStart(5)}KB -> ${(out.length / 1024).toFixed(0).padStart(4)}KB  ${row.slug}.jpg`);
    }
    if (process.argv.includes("--update-db")) {
      await sql`UPDATE public.blogs SET cover_image = ${`/blog-covers/${row.slug}.jpg`} WHERE slug = ${row.slug} AND cover_image LIKE 'data:%'`;
      console.log(`db  -> /blog-covers/${row.slug}.jpg`);
    }
  }
} finally {
  await sql.end();
}
