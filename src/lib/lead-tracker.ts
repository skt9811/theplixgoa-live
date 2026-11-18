// Client-side lead-click tracker for Call/WhatsApp CTAs across the public
// site. Logs to the lead_clicks table (via POST /api/track-lead, non-
// blocking) and, separately, fires a dedicated GA4 event when window.gtag
// is present — in ADDITION to, not instead of, each call site's existing
// trackFunnelEvent("click_call"/"click_whatsapp", ...) call (src/lib/gtag.ts),
// which already covers funnel analytics for most of these links. This fires
// its own lead_call/lead_whatsapp events specifically so "lead" can be
// filtered/reported on in GA4 independently of the broader click_* funnel
// events, without touching that existing instrumentation.
export type LeadClickParams = {
  channel: "call" | "whatsapp";
  intent: "guest_booking" | "partner_onboarding" | "general";
  propertySlug?: string | null;
  ctaLocation: string;
};

export function trackLeadClick(params: LeadClickParams): void {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({
    channel: params.channel,
    intent: params.intent,
    property_slug: params.propertySlug || null,
    cta_location: params.ctaLocation,
    source_path: window.location.pathname,
    referrer: document.referrer || null,
  });

  // Non-blocking beacon so tel:/wa.me navigation is never delayed —
  // sendBeacon queues the request and returns immediately, surviving the
  // page unload that opening tel:/wa.me triggers. A plain fetch would risk
  // being cancelled mid-flight by that same navigation on a browser without
  // sendBeacon, hence the keepalive fallback.
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/track-lead", blob);
    } else {
      void fetch("/api/track-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Never block or surface a failure here — the guest is already
        // on their way to the dialer/WhatsApp.
      });
    }
  } catch {
    // Same — a tracking failure must never interfere with the actual CTA.
  }

  if (typeof window.gtag === "function") {
    window.gtag("event", `lead_${params.channel}`, {
      event_category: params.intent,
      event_label: params.propertySlug || window.location.pathname,
      cta_location: params.ctaLocation,
    });
  }
}
