import { useEffect, useState } from "react";
import { Loader as Loader2, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { heroImage } from "@/lib/plix";
import { subscribeToNewsletter } from "@/lib/newsletter";

const PLIX_NEWSLETTER_DISMISSED = "plix_newsletter_dismissed";
const SHOW_AFTER_MS = 4000;
const SHOW_AFTER_SCROLL_RATIO = 0.3;

function hasSeenModal(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(PLIX_NEWSLETTER_DISMISSED) === "true";
  } catch {
    return true;
  }
}

function markModalSeen(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PLIX_NEWSLETTER_DISMISSED, "true");
  } catch {
    // storage full or unavailable — the modal may reappear next visit, harmless
  }
}

/**
 * Homepage-only lead capture modal. Fully self-contained: mount it once
 * (unconditionally) and it decides for itself when to appear — after a
 * short delay or 30% scroll, whichever comes first — and never again once
 * the guest has closed or submitted it, via localStorage.
 */
export function NewsletterModal() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("PLIXCLUB15");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hasSeenModal()) return;

    const timer = window.setTimeout(() => setOpen(true), SHOW_AFTER_MS);

    function onScroll() {
      // Redundant with the hasSeenModal() gate above this effect never even
      // arming the listener when already dismissed — kept as an explicit
      // second check directly in the trigger so this stays safe even if a
      // future change ever attaches the listener unconditionally.
      if (localStorage.getItem(PLIX_NEWSLETTER_DISMISSED)) return;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      if (window.scrollY / scrollable >= SHOW_AFTER_SCROLL_RATIO) {
        setOpen(true);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  function handleClose() {
    setOpen(false);
    markModalSeen();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await subscribeToNewsletter(email, phone);
    setSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Something went wrong. Please try again.");
      return;
    }

    markModalSeen();
    if (result.code) setCode(result.code);
    setSubmitted(true);
    toast.success("You're in! Your discount code is ready.");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="animate-rise my-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-card shadow-lift md:flex-row">
        {/* Left — imagery */}
        <div className="relative hidden min-h-[380px] md:block md:w-2/5">
          <img
            src={heroImage}
            alt="Luxury Goan villa with private pool in North Goa"
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-navy/10 to-transparent" />
        </div>

        {/* Right — form */}
        <div className="relative w-full p-6 sm:p-8 md:w-3/5">
          <button
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-foreground/60 hover:bg-accent hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>

          {submitted ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center py-8 text-center">
              <Mail className="size-12 text-primary" aria-hidden />
              <h2 className="mt-4 font-serif text-2xl font-normal text-navy">You're in! Here's your code</h2>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => undefined);
                }}
                className="mt-4 rounded-2xl border-2 border-dashed border-bronze px-6 py-3 font-mono text-2xl font-bold tracking-widest text-navy transition-colors hover:bg-accent"
                aria-label={`Copy discount code ${code}`}
              >
                {code}
              </button>
              <p className="mt-1.5 text-xs font-semibold text-primary">{copied ? "Copied!" : "Tap to copy"}</p>
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                15% off stays above ₹30,000 (room total before GST), 5% off any other direct booking. Apply it at
                checkout. We've also emailed it to you.
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-5 rounded-full bg-navy px-6 py-2.5 text-sm font-semibold text-navy-foreground"
              >
                Start exploring
              </button>
            </div>
          ) : (
            <>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-primary md:mt-0">
                The Plix Club
              </p>
              <h2 className="mt-3 font-serif text-3xl font-normal leading-tight text-navy">
                Get up to 15% off your stay
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Enter your email and mobile number to get your discount code instantly: 15% off stays above
                ₹30,000, 5% off any other direct booking. Plus insider guides and secret villa deals.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 grid gap-3">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  autoComplete="email"
                  disabled={submitting}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
                />
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Mobile number (e.g. +91 98765 43210)"
                  autoComplete="tel"
                  minLength={10}
                  disabled={submitting}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
                />
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-bronze px-6 py-3.5 text-sm font-semibold text-bronze-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Subscribing…
                    </>
                  ) : (
                    "GET MY DISCOUNT CODE"
                  )}
                </button>
              </form>

              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                By continuing, you agree to receive offers by email, and calls or WhatsApp messages from The
                Plix about your stay. You can opt out at any time.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
