import { queryOptions } from "@tanstack/react-query";
import { logDbError } from "@/lib/rates";
import {
  fetchAllBlogsServerFn,
  fetchBlogBySlugServerFn,
  saveBlogPostServerFn,
  deleteBlogPostServerFn,
} from "@/lib/blogs-query.server-fn";

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
  "Luxury Stays",
  "Food & Dining",
] as const;

const LS_KEY = "plix_blog_posts";

const SEED_POSTS: BlogPost[] = [
  {
    id: "seed-nightlife",
    title: "Top 7 Sunset Clubs and Beach Shacks in Anjuna & Vagator",
    slug: "top-7-sunset-clubs-beach-shacks-anjuna-vagator",
    excerpt:
      "From cliff-top sundowners to barefoot beach parties, here are the seven best sunset clubs and shacks to experience North Goa's legendary nightlife.",
    content: `<p>North Goa's coastline between Anjuna and Vagator is legendary for its sunset spots. Here are our top seven picks for unforgettable evenings.</p>

<h2>1. Thalassa — Vagator</h2>
<p>Perched on a cliff overlooking the Arabian Sea, Thalassa is the undisputed king of Goan sunsets. With its Greek-inspired menu, fire shows, and panoramic views, it's the place to be as the sun dips below the horizon. Arrive by 5 PM to grab a good spot.</p>

<h2>2. Curlies — Anjuna</h2>
<p>A classic Anjuna institution, Curlies offers laid-back shacks right on the beach. The sunset sessions here are iconic, with ambient music and cold beers as the sky turns orange.</p>

<h2>3. Shiva Valley — Anjuna</h2>
<p>Known for its legendary Sunday sessions, Shiva Valley transforms from a quiet beach shack by day to a pulsating party spot by sunset. The vibe is raw, authentic, and unforgettable.</p>

<h2>4. Purple Martini — Vagator</h2>
<p>With its Mediterranean-inspired decor and expertly crafted cocktails, Purple Martini is the perfect spot for a sophisticated sunset. The tapas menu is excellent, and the views are stunning.</p>

<h2>5. La Plage — Ashwem</h2>
<p>A short drive north, La Plage is a French-run beach restaurant that serves some of the best food in Goa. Their sunset dinners are magical, with fresh seafood and a curated wine list.</p>

<h2>6. Artjuna — Anjuna</h2>
<p>More cafe than club, Artjuna is a bohemian haven with incredible food, artisanal crafts, and a relaxed garden setting. It's the perfect pre-party spot before heading to the clubs.</p>

<h2>7. HillTop — Vagator</h2>
<p>For the full party experience, HillTop is where you'll find trance and techno parties that go well into the night. The sunset views from the hill are a bonus before the music takes over.</p>

<p><strong>Tip:</strong> Most of these spots are within a 15-minute drive of our Vagator and Anjuna properties, making them perfect for a night out without worrying about long drives back.</p>`,
    cover_image:
      "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200",
    category: "Nightlife",
    author: "Plix Hospitality",
    published_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: "seed-direct",
    title: "Why Booking Direct Saves You Up to 15% on Goa Luxury Villas",
    slug: "why-booking-direct-saves-15-percent-goa-luxury-villas",
    excerpt:
      "OTA commissions, service fees, and hidden charges can inflate your villa holiday by 15% or more. Here's exactly how booking direct with Plix Goa puts that money back in your pocket.",
    content: `<p>When you book a luxury villa through an Online Travel Agency (OTA), you're paying more than you need to. Here's why booking direct with The Plix Goa is the smarter choice.</p>

<h2>The Hidden Cost of OTAs</h2>
<p>OTAs typically charge property owners 15-25% in commission. That cost is often built into the nightly rate you see on their platform. When you book direct, the property doesn't have to pay that commission — and we pass those savings directly to you.</p>

<h2>1. Lower Nightly Rates</h2>
<p>Our direct rates are consistently 10-15% lower than what you'll find on any OTA. That's because we don't have to inflate prices to cover commission fees.</p>

<h2>2. No Service Fees</h2>
<p>Many OTAs add a service fee at checkout — sometimes 5-12% on top of the listed price. Booking direct means what you see is what you pay.</p>

<h2>3. Flexible Cancellation</h2>
<p>When you book direct, you're dealing with us — not a faceless intermediary. Need to change your dates? We can accommodate. Want a late checkout? Just ask. OTAs make these simple requests complicated.</p>

<h2>4. Direct Communication</h2>
<p>Have a special request — extra mattresses, a birthday cake, airport pickup? When you book direct, you message us directly. No waiting for the OTA to relay your request to the property.</p>

<h2>5. Better Room Allocation</h2>
<p>Properties always prioritise direct-booked guests for the best rooms and views. OTA bookings often get assigned last, because they're the least profitable for the property.</p>

<h2>The Math</h2>
<p>On a 4-night stay at \u20B912,000/night, a 15% saving is \u20B97,200 — enough for a private dinner, a spa session, or a sunset cruise. Why give that to a booking platform?</p>

<p><strong>Ready to save?</strong> Browse our collection of luxury villas and book direct for the best price guaranteed.</p>`,
    cover_image:
      "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200",
    category: "Travel Tips",
    author: "Plix Hospitality",
    published_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "seed-itinerary",
    title: "The Ultimate 3-Day Luxury Itinerary for North Goa",
    slug: "ultimate-3-day-luxury-itinerary-north-goa",
    excerpt:
      "Three days of private pool mornings, cliff-top sundowners, spa afternoons, and fine dining — your perfectly curated luxury escape in North Goa.",
    content: `<p>Three days in North Goa is just enough to fall in love with it. Here's our carefully curated itinerary for the ultimate luxury escape.</p>

<h2>Day 1: Arrival & Anjuna Exploration</h2>

<h3>Morning</h3>
<p>Arrive at your villa, freshen up, and take a dip in your private pool. Enjoy a welcome breakfast prepared by your caretaker — fresh fruit, Goan pao, and filter coffee.</p>

<h3>Afternoon</h3>
<p>Head to Anjuna Flea Market (Wednesdays) or explore the Anjuna beach stretch. For lunch, try Burger Factory for gourmet burgers or Guru's for authentic Goan fish curry.</p>

<h3>Evening</h3>
<p>Drive to Vagator for sunset at Thalassa. Book a table in advance and arrive by 5 PM. After dinner, explore the nearby clubs or head back to your villa for a quiet night under the stars.</p>

<h2>Day 2: Beach Day & Spa</h2>

<h3>Morning</h3>
<p>After a leisurely breakfast, head to Morjim Beach. The calm waters and turtle nesting grounds make it one of Goa's most serene beaches.</p>

<h3>Afternoon</h3>
<p>Book a couples spa session at one of North Goa's luxury spas. Follow it with lunch at La Plage on Ashwem beach.</p>

<h3>Evening</h3>
<p>Return to your villa for a private poolside dinner. Your caretaker can arrange a chef to cook a bespoke Goan feast.</p>

<h2>Day 3: Culture & Celebration</h2>

<h3>Morning</h3>
<p>Visit Chapora Fort for panoramic views of the coastline, then explore the charming village of Assagao with its boutique cafes and art galleries.</p>

<h3>Afternoon</h3>
<p>Head to Candolim or Sinquerim for water sports. For lunch, try Suzie's in Candolim for great seafood.</p>

<h3>Evening</h3>
<p>Your last night deserves a celebration. Book a sunset cruise on the Mandovi, or have a farewell dinner at Ciao Bella in Assagao or Bomra's in Candolim.</p>

<h2>Where to Stay</h2>
<p>All our properties are within 15 minutes of these attractions. From intimate 3 BHK villas to grand 8 BHK estates, we have the perfect base for your North Goa adventure.</p>`,
    cover_image:
      "https://images.unsplash.com/photo-1582610116397-edb318620f90?w=1200",
    category: "Local Guides",
    author: "Plix Hospitality",
    published_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

function readLocalBlogs(): BlogPost[] {
  if (typeof localStorage === "undefined") return [...SEED_POSTS];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      localStorage.setItem(LS_KEY, JSON.stringify(SEED_POSTS));
      return [...SEED_POSTS];
    }
    return JSON.parse(raw) as BlogPost[];
  } catch {
    return [...SEED_POSTS];
  }
}

function writeLocalBlogs(posts: BlogPost[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(posts));
    window.dispatchEvent(new Event("storage"));
  } catch {
    // storage full or unavailable
  }
}

function sortByPublished(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
  );
}

function filterPublished(posts: BlogPost[]): BlogPost[] {
  const now = Date.now();
  return posts.filter((p) => new Date(p.published_at).getTime() <= now);
}

export async function fetchBlogs(): Promise<BlogPost[]> {
  try {
    const data = await fetchAllBlogsServerFn();
    // Database is authoritative — an empty table is a valid (if unlikely)
    // state, not a signal to fall back to stale localStorage seed data.
    if (data) {
      return sortByPublished(filterPublished(data as BlogPost[]));
    }
  } catch (err) {
    logDbError("fetchBlogs", err);
  }

  // Fallback to localStorage only when Neon is unreachable/misconfigured
  return sortByPublished(filterPublished(readLocalBlogs()));
}

export async function fetchAllBlogsAdmin(): Promise<BlogPost[]> {
  try {
    const data = await fetchAllBlogsServerFn();
    if (data) {
      return sortByPublished(data as BlogPost[]);
    }
  } catch (err) {
    logDbError("fetchAllBlogsAdmin", err);
  }

  return sortByPublished(readLocalBlogs());
}

export async function fetchBlogBySlug(slug: string): Promise<BlogPost | null> {
  try {
    const data = await fetchBlogBySlugServerFn({ data: { slug } });
    // Database is authoritative — a successful query with no match means
    // the post doesn't exist (or was deleted), not a signal to fall back.
    if (data) {
      const post = data as BlogPost;
      if (new Date(post.published_at).getTime() > Date.now()) return null;
      return post;
    }
    return null;
  } catch (err) {
    logDbError("fetchBlogBySlug", err);
  }

  // Fallback to localStorage only when Neon is unreachable/misconfigured
  const local = readLocalBlogs().find((p) => p.slug === slug);
  if (local && new Date(local.published_at).getTime() <= Date.now()) return local;
  return null;
}

export async function saveBlogPost(
  post: Omit<BlogPost, "id" | "created_at"> & { id?: string | undefined },
): Promise<{ error: string | null }> {
  const payload = {
    title: post.title,
    slug: post.slug,
    category: post.category,
    cover_image: post.cover_image,
    excerpt: post.excerpt,
    content: post.content,
    author: post.author || "Plix Hospitality",
    published_at: post.published_at,
  };

  if (post.id) {
    // Update — Neon is the source of truth for writes. A failure here must
    // be reported to the caller, not masked by a silent localStorage write
    // that leaves the admin believing the post is live for everyone.
    const result = await saveBlogPostServerFn({ data: { id: post.id, post: payload } });
    if (result.error) {
      logDbError("saveBlogPost (update)", result.error);
      return { error: result.error };
    }
    // Mirror to localStorage only after the Neon write succeeded.
    const posts = readLocalBlogs();
    const idx = posts.findIndex((p) => p.id === post.id);
    if (idx >= 0) {
      posts[idx] = { ...posts[idx], ...payload } as BlogPost;
      writeLocalBlogs(posts);
    }
    return { error: null };
  }

  // Insert
  const result = await saveBlogPostServerFn({ data: { post: payload } });
  if (result.error || !result.id) {
    const message = result.error ?? "No id returned";
    logDbError("saveBlogPost (insert)", message);
    return { error: message };
  }

  // Mirror to localStorage only after the Neon write succeeded.
  const posts = readLocalBlogs();
  const newPost: BlogPost = {
    id: result.id,
    ...payload,
    created_at: new Date().toISOString(),
  };
  posts.push(newPost);
  writeLocalBlogs(posts);
  return { error: null };
}

export async function deleteBlogPost(id: string): Promise<{ error: string | null }> {
  const result = await deleteBlogPostServerFn({ data: { id } }).catch((err: unknown) => ({
    error: logDbError("deleteBlogPost", err),
  }));
  if (result.error) return result;
  // Mirror to localStorage only after the Neon delete succeeded.
  const posts = readLocalBlogs();
  writeLocalBlogs(posts.filter((p) => p.id !== id));
  return { error: null };
}

export const blogsQuery = queryOptions({
  queryKey: ["blogs"],
  queryFn: fetchBlogs,
});

export const blogQuery = (slug: string) =>
  queryOptions({
    queryKey: ["blog", slug],
    queryFn: () => fetchBlogBySlug(slug),
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

export function autoFormatContent(raw: string): string {
  // Split by block-level HTML tags (h1-h3, p, ul, ol, li, blockquote, img, div, figure)
  // and wrap any loose text between them in <p> tags
  const blockTags = /<(?:h[1-3]|p|ul|ol|li|blockquote|img|div|figure|table|hr)\b[^>]*>[\s\S]*?<\/(?:h[1-3]|p|ul|ol|li|blockquote|div|figure|table)>|<(?:img|hr)\b[^>]*\/?>/gi;
  const parts = raw.split(blockTags);
  const matches = raw.match(blockTags) || [];

  let result = "";
  for (let i = 0; i < parts.length; i++) {
    const text = (parts[i] ?? "").trim();
    if (text) {
      // Wrap loose text in a styled paragraph
      result += `<p class="leading-relaxed">${text}</p>`;
    }
    if (i < matches.length) {
      result += matches[i] ?? "";
    }
  }

  // If no block tags were found, wrap the entire content
  if (!matches.length && result) return result;

  // Ensure h1/h2/h3 have consistent spacing by wrapping them with margin classes
  // (the prose-blog CSS already handles this, but we add classes for inline use)
  result = result.replace(/<h1\b/g, '<h1 class="mt-8 mb-4 font-serif text-2xl font-normal text-navy"');
  result = result.replace(/<h2\b/g, '<h2 class="mt-10 mb-4 font-serif text-xl font-normal text-navy"');
  result = result.replace(/<h3\b/g, '<h3 class="mt-8 mb-3 font-serif text-lg font-normal text-navy"');
  result = result.replace(/<p\b(?![^>]*class=)/g, '<p class="leading-relaxed mb-5"');
  result = result.replace(/<img\b(?![^>]*class=)/g, '<img class="rounded-xl shadow-md mx-auto my-8 max-w-full h-auto"');

  return result || raw;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
