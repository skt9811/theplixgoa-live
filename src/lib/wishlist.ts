// Guest wishlist (hearts on property photos/cards), kept in this browser only.
const WISHLIST_LS_KEY = "plix_wishlist_slugs";

export function readWishlist(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(WISHLIST_LS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function writeWishlist(slugs: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(WISHLIST_LS_KEY, JSON.stringify(Array.from(slugs)));
  } catch {
    // storage full or unavailable
  }
}

/** Adds or removes a slug; returns whether it is now wishlisted. */
export function toggleWishlistSlug(slug: string): boolean {
  const current = readWishlist();
  const now = !current.has(slug);
  if (now) current.add(slug);
  else current.delete(slug);
  writeWishlist(current);
  return now;
}
