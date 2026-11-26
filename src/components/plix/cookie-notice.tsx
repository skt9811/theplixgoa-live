import { useEffect, useState } from "react";

const CONSENT_STORAGE_KEY = "plix_cookie_consent"; // "granted" | "denied"

function applyConsent(granted: boolean): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: granted ? "granted" : "denied",
    ad_user_data: granted ? "granted" : "denied",
    ad_personalization: granted ? "granted" : "denied",
  });
}

/**
 * Simple accept/decline banner backing Consent Mode v2. Defaults are set
 * inline in __root.tsx, before gtag.js loads, per Google's own requirement
 * that the default fire before any config/event call: analytics granted /
 * ads denied globally, everything denied in the EEA + GB + CH. Accept grants
 * all four signals, Decline denies all four. A prior
 * choice is read from localStorage and re-applied silently on every load —
 * the banner itself only ever shows once per browser.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored === "granted" || stored === "denied") {
        applyConsent(stored === "granted");
        return;
      }
    } catch {
      // localStorage unavailable — fall through and ask every visit rather
      // than silently assuming consent either way.
    }
    setVisible(true);
  }, []);

  function choose(granted: boolean) {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, granted ? "granted" : "denied");
    } catch {
      // Choice won't persist across visits, but still applies to this one.
    }
    applyConsent(granted);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      // A small card in the bottom-left corner (the right side has the
      // WhatsApp / back-to-top buttons), not a full-width bar over the page.
      className="fixed bottom-3 left-3 right-3 z-[90] rounded-2xl border border-border bg-card p-4 shadow-lift sm:right-auto sm:max-w-sm"
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          We use cookies to understand how guests use this site and to improve the booking
          experience. See our{" "}
          <a href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={() => choose(false)}
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-navy-foreground transition-colors hover:bg-navy/90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
