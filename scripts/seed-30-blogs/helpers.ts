// Shared shapes and builders for scripts/seed-30-blogs.ts. Erasable TypeScript
// only (no enums / parameter properties) so Node can run it directly.

export type Faq = [question: string, answer: string];

export type Section = {
  heading: string;
  paragraphs: string[];
  bullets: string[];
};

export type PostSpec = {
  n: number;
  date: string; // YYYY-MM-DD, published 09:00 IST
  category: string;
  title: string;
  slug: string;
  excerpt: string;
  photo: string; // Unsplash photo id (free-license images.unsplash.com host)
  intro: string;
  sections: [Section, Section];
  outro: string;
  faqs: [Faq, Faq];
};

export function buildContent(spec: PostSpec): string {
  const html: string[] = [];
  html.push(`<p>${spec.intro}</p>`);
  for (const section of spec.sections) {
    html.push(`<h2>${section.heading}</h2>`);
    for (const p of section.paragraphs) html.push(`<p>${p}</p>`);
    html.push(`<ul>${section.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`);
  }
  html.push(`<p>${spec.outro}</p>`);
  html.push(`<h2>Frequently Asked Questions</h2>`);
  for (const [q, a] of spec.faqs) html.push(`<p><strong>Q: ${q}</strong><br>A: ${a}</p>`);
  return html.join("\n");
}

export function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// Counts real words only: a token needs at least one letter or digit, so
// stand-alone dashes and bullets don't inflate the total.
export function wordCount(html: string): number {
  const text = visibleText(html);
  return text ? text.split(" ").filter((token) => /[A-Za-z0-9]/.test(token)).length : 0;
}

export const ALLOWED_LINK_PATHS = new Set([
  "/stays/large-groups",
  "/stays/private-pool-villas",
  "/properties/the-plix-villa",
  "/properties/casa-marina",
  "/properties/casa-moana",
  "/properties/casa-meadows",
  "/properties/casa-serenita",
  "/properties/vivenda-chico",
  "/properties/harbor-court",
  "/properties/morjim-pride",
  "/properties/the-plix-resort-morjim",
  "/properties/villa-madera",
  "/locations/vagator",
  "/locations/anjuna",
  "/locations/morjim",
  "/locations/candolim",
  "/locations/assagao",
  "/faq",
  "/stays",
  "/about",
  "/contact",
]);

export function internalLinks(html: string): string[] {
  return [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]!);
}

export const CTA = "Book direct with The Plix";
