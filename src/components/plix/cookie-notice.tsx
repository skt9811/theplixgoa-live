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
 * Simple accept/decline banner backing Consent Mode v2 (default state is set
 * to "denied" inline in __root.tsx, before gtag.js loads, per Google's own
 * requirement that the default fire before any config/event call). A prior
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
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-border bg-card px-4 py-4 shadow-lift sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          We use cookies to understand how guests use this site and to improve the booking
          experience. See our{" "}
          <a href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
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
