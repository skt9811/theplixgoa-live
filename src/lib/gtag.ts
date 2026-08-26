// gtag.js itself is loaded globally in src/routes/__root.tsx (Google Ads
// tag AW-18001047926, alongside the existing GA4 tag) — this file only adds
// a safe helper for firing conversion events against it from anywhere in
// the app, most importantly the booking checkout flow.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const GOOGLE_ADS_ACCOUNT_ID = "AW-18001047926";

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
