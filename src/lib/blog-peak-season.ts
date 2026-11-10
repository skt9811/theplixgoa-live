// The Christmas / New Year 2026–27 peak-season posts (seeded by
// scripts/seed-peak-season-blogs.ts, scheduled 13 Nov – 8 Dec 2026). Each
// gets a two-property "stay highlight" mid-article, the book-direct mobile
// bar, and sitemap priority 0.8 once published.
export const PEAK_SEASON_HIGHLIGHTS: Record<string, [string, string]> = {
  "sunburn-festival-goa-2026-dates-venue-stay-guide": ["harbor-court", "casa-serenita"],
  "goa-new-year-party-2027-clubs-tickets-where-to-stay": ["harbor-court", "casa-marina"],
  "where-to-stay-in-north-goa-for-new-year-2027": ["casa-serenita", "the-plix-resort-morjim"],
  "mopa-vs-dabolim-airport-goa-transfers-cab-rates-peak-season-guide": ["the-plix-resort-morjim", "harbor-court"],
  "underground-techno-sundowner-circuit-goa-nye-2027": ["casa-serenita", "casa-meadows"],
  "christmas-and-new-year-family-villas-in-goa": ["casa-meadows", "vivenda-chico"],
  "best-beach-shacks-fireworks-spots-new-year-eve-goa": ["morjim-pride", "the-plix-resort-morjim"],
  "booking-large-group-villas-goa-new-year-2027": ["casa-meadows", "casa-moana"],
};

export const PEAK_SEASON_SLUGS = new Set(Object.keys(PEAK_SEASON_HIGHLIGHTS));

type Faq = { q: string; a: string };

/** FAQ pairs from a post's HTML, written as `<strong>Q: …</strong><br>A: …`
 * (the format every seeded post uses) — for FAQPage JSON-LD. */
export function extractBlogFaqs(html: string): Faq[] {
  const strip = (s: string) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const faqs: Faq[] = [];
  const re = /<strong>\s*Q:\s*([\s\S]*?)<\/strong>\s*<br\s*\/?>\s*A:\s*([\s\S]*?)<\/p>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const q = strip(m[1] ?? "");
    const a = strip(m[2] ?? "");
    if (q && a) faqs.push({ q, a });
  }
  return faqs;
}
