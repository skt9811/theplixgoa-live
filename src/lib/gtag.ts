// gtag.js itself is loaded globally in src/routes/__root.tsx — Google Ads
// (AW-18001047926) always; GA4 alongside it, through the exact same
// gtag/dataLayer (one script, a second `gtag('config', ...)` call — not a
// second tracking system), once VITE_GA4_ID is set. This is the one home
// for every helper that fires an event against either tag, or tags the
// Clarity session recording, from anywhere in the app — most importantly
// the booking funnel (property page → checkout → booking-success).
// Previously split across this file (Google Ads conversions only) and a
// separate analytics.ts (GA4 funnel events + UTM capture) — merged into
// one file so tracking code doesn't stay fragmented across two places that
// both ultimately push onto the same window.gtag/dataLayer.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    /** Microsoft Clarity's own global, installed by the deferred snippet in
     * __root.tsx (loadDeferredAnalytics) — see trackClarityEvent below. */
    clarity?: (...args: unknown[]) => void;
  }
}

export const GOOGLE_ADS_ACCOUNT_ID = "AW-18001047926";

/** The GA4 property's own Measurement ID (GA4 Admin → Data Streams → your
 * stream → "Measurement ID", looks like "G-XXXXXXXXXX"). Reads VITE_GA4_ID
 * first (the name this engagement standardized on), falling back to the
 * older VITE_GA_MEASUREMENT_ID (no "4") that was already set in .env.local/
 * Vercel — a leftover from the GA4 setup __root.tsx's own history says was
 * "removed entirely" at some point, carrying a real value this whole time
 * while unused. Confirmed real (non-empty) in .env.local; still worth
 * confirming with whoever set it that it's the intended property before
 * relying on it long-term. Unset (both names) means GA4 simply isn't
 * configured — __root.tsx skips the `gtag('config', ...)` call for it
 * entirely, same graceful-degradation pattern this codebase already uses
 * for every other optional integration (RESEND_API_KEY, VITE_FCM_CONFIGURED,
 * ...). */
export const GA4_MEASUREMENT_ID =
  (import.meta.env["VITE_GA4_ID"] as string | undefined) ||
  (import.meta.env["VITE_GA_MEASUREMENT_ID"] as string | undefined) ||
  "";

/** Clarity was already live before any of this GA4/funnel work (see
 * __root.tsx's loadDeferredAnalytics), hardcoded to project id
 * "y5emlw3hfs" — reading it from an env var here (with that same id as the
 * fallback) lets it be rotated without a code change, without going dark
 * if the env var isn't set. */
export const CLARITY_PROJECT_ID =
  (import.meta.env["VITE_CLARITY_PROJECT_ID"] as string | undefined) || "y5emlw3hfs";

/** TODO (user): set in .env.local / Vercel, once a "Purchase" Conversion
 * Action exists in Google Ads (Tools & Settings → Conversions → New →
 * Website → Purchase) — the LABEL half of that action's "AW-XXXXXXXXX/
 * LABEL" tag string (the account half is GOOGLE_ADS_ACCOUNT_ID above,
 * already fixed). Unset means trackPurchaseConversion below skips the Ads
 * side entirely (the GA4 purchase event, if VITE_GA4_ID is set, still
 * fires) rather than sending a half-correct event that can't attribute to
 * a real conversion action — see trackConversion's own doc comment below
 * on exactly that failure mode, which is what checkout-modal.tsx used to
 * do (passed GOOGLE_ADS_ACCOUNT_ID alone as `send_to`, with no label). */
export const GOOGLE_ADS_PURCHASE_CONVERSION_LABEL =
  (import.meta.env["VITE_GOOGLE_ADS_PURCHASE_LABEL"] as string | undefined) || "";

export type ConversionParams = {
  value?: number;
  currency?: string;
  /** A unique ID (e.g. the booking ID) so Google Ads can dedupe retried events. */
  transaction_id?: string;
};

/**
 * Fires a Google Ads conversion event. Safe to call unconditionally —
 * no-ops if gtag hasn't loaded yet (ad blockers, slow network, SSR) rather
 * than throwing, so it can never break the booking flow it's reporting on.
 *
 * `conversionId` should be the full "AW-XXXXXXXXX/LABEL" string for a
 * specific conversion action (Google Ads → Tools & Settings → Conversions
 * → your action → tag setup), not just the bare account ID — the account
 * ID alone fires an event but won't attribute it to a specific conversion
 * action for reporting/bidding.
 */
export function trackConversion(conversionId: string, params?: ConversionParams): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "conversion", {
    send_to: conversionId,
    ...params,
  });
}

export type FunnelEventName =
  | "view_property"
  | "select_dates"
  | "check_availability"
  | "click_book"
  | "begin_checkout"
  | "add_guest_details"
  | "add_payment_info"
  | "purchase"
  | "click_whatsapp"
  | "click_call"
  | "submit_enquiry"
  | "view_gallery"
  | "view_reviews";

function getDevice(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  try {
    return window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
  } catch {
    return "desktop";
  }
}

// Falls back to the current route when a call site doesn't know its own
// property (e.g. the sitewide footer's WhatsApp/call buttons) — undefined on
// any non-property page, which is the correct, honest value there.
export function currentPropertySlugFromPath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const m = window.location.pathname.match(/^\/properties\/([^/]+)/);
  return m ? m[1] : undefined;
}

/**
 * Fires a GA4 funnel event via the same shared gtag/dataLayer as the Google
 * Ads tag above — no `send_to`, so it lands in GA4's own event stream (GA4
 * doesn't need `send_to` scoping the way an Ads conversion action does; an
 * unrecognized event name is harmless noise in the Ads account at worst).
 * Safe to call unconditionally: a no-op if gtag hasn't loaded (ad blockers,
 * consent denied, slow network, SSR) rather than throwing, matching
 * trackConversion()'s own safety contract above.
 */
export function trackFunnelEvent(
  name: FunnelEventName,
  params: { property_slug?: string; source?: string; [key: string]: unknown } = {},
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, {
    property_slug: params.property_slug ?? currentPropertySlugFromPath(),
    device: getDevice(),
    source: getStoredUtmSource(),
    ...params,
  });
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const UTM_STORAGE_KEY = "plix_utm";

/**
 * Reads UTM params from the current URL and persists them in sessionStorage
 * so they survive client-side navigation to the checkout/booking flow. Only
 * overwrites the stored value when the URL actually carries UTM params —
 * internal navigation (no UTM params in the new URL) leaves the
 * originally-captured source intact for the rest of the session, which is
 * the whole point of "preserving" it.
 */
export function captureUtmParams(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const found: Record<string, string> = {};
    for (const key of UTM_KEYS) {
      const v = params.get(key);
      if (v) found[key] = v;
    }
    if (Object.keys(found).length > 0) {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(found));
    }
  } catch {
    // sessionStorage unavailable (private mode, etc.) — source just reads as "direct"
  }
}

export function getStoredUtm(): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getStoredUtmSource(): string {
  return getStoredUtm().utm_source ?? "direct";
}

// Booking IDs this browser has already reported a purchase for — a reload
// or revisit of /booking-success (back button, bookmark, refresh) must not
// refire a conversion that already happened. Capped so a long-lived browser
// profile's localStorage can't grow unbounded; losing the oldest entries
// only risks one duplicate event for a very old booking, never a missing one.
const FIRED_PURCHASES_STORAGE_KEY = "plix_purchase_conversions_fired";
const MAX_REMEMBERED_PURCHASES = 200;

function hasFiredPurchaseConversion(bookingId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(FIRED_PURCHASES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]).includes(bookingId) : false;
  } catch {
    return false; // can't tell — better to risk one duplicate event than silently never fire
  }
}

function markPurchaseConversionFired(bookingId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(FIRED_PURCHASES_STORAGE_KEY);
    const fired: string[] = raw ? JSON.parse(raw) : [];
    if (fired.includes(bookingId)) return;
    fired.push(bookingId);
    window.localStorage.setItem(
      FIRED_PURCHASES_STORAGE_KEY,
      JSON.stringify(fired.slice(-MAX_REMEMBERED_PURCHASES)),
    );
  } catch {
    /* best-effort dedup only — a failed write here risks one duplicate event, nothing worse */
  }
}

/**
 * Fires the Google Ads "Purchase" conversion (if
 * GOOGLE_ADS_PURCHASE_CONVERSION_LABEL is configured) and the GA4
 * `purchase` funnel event (always, via trackFunnelEvent — GA4 itself still
 * only receives it once VITE_GA4_ID is set), exactly once per bookingId.
 * Safe to call unconditionally on every mount of the booking-success page,
 * including a reload or revisit of the same URL — see the dedup helpers
 * above. Call this instead of trackConversion directly for a purchase.
 */
export function trackPurchaseConversion(bookingId: string, value: number, currency = "INR"): void {
  if (!bookingId || hasFiredPurchaseConversion(bookingId)) return;
  markPurchaseConversionFired(bookingId);
  if (GOOGLE_ADS_PURCHASE_CONVERSION_LABEL) {
    trackConversion(`${GOOGLE_ADS_ACCOUNT_ID}/${GOOGLE_ADS_PURCHASE_CONVERSION_LABEL}`, {
      value,
      currency,
      transaction_id: bookingId,
    });
  }
  trackFunnelEvent("purchase", { transaction_id: bookingId, value, currency });
}

/**
 * Tags the current Microsoft Clarity session recording with a custom event
 * name (Clarity's own "Filter by event" UI) — e.g. so a "reached_checkout"
 * tag with no matching "completed_booking" tag on the same recording marks
 * a real checkout abandonment. Safe to call unconditionally: no-ops before
 * the deferred Clarity snippet (loadDeferredAnalytics in __root.tsx) has
 * loaded, same "never throw, never block the real flow it's reporting on"
 * rule as trackConversion above. Not deduped — tagging a session twice
 * with the same event name is harmless (it's a label, not a counted metric
 * the way a conversion is), so no reload-guard is needed here.
 */
export function trackClarityEvent(eventName: string): void {
  if (typeof window === "undefined" || typeof window.clarity !== "function") return;
  window.clarity("event", eventName);
}
