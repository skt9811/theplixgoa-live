import { useEffect, useState } from "react";
import { Loader as Loader2, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { heroImage } from "@/lib/plix";
import { subscribeToNewsletter } from "@/lib/newsletter";

const SEEN_KEY = "has_seen_newsletter_modal";
const SHOW_AFTER_MS = 4000;
const SHOW_AFTER_SCROLL_RATIO = 0.3;

function hasSeenModal(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(SEEN_KEY) === "true";
  } catch {
    return true;
  }
}

function markModalSeen(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SEEN_KEY, "true");
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
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hasSeenModal()) return;

    const timer = window.setTimeout(() => setOpen(true), SHOW_AFTER_MS);

    function onScroll() {
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
    const result = await subscribeToNewsletter(email);
    setSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Something went wrong. Please try again.");
      return;
    }

    markModalSeen();
    setSubmitted(true);
    toast.success("Thank you for joining! Check your inbox for your 5% discount code.");
    window.setTimeout(() => setOpen(false), 2200);
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
              <Mail className="size-14 text-primary" aria-hidden />
              <h2 className="mt-4 font-serif text-2xl font-normal text-navy">You're in!</h2>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                Check your inbox for your 5% discount code.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-primary md:mt-0">
                The Plix Club
              </p>
              <h2 className="mt-3 font-serif text-3xl font-normal leading-tight text-navy">
                Join The Plix Club
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Sign up for our newsletter to receive insider travel guides, secret villa deals, and 5%
                off your first direct stay.
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
                    "SUBSCRIBE & GET 5% OFF"
                  )}
                </button>
              </form>

              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                By subscribing, you agree to receive email updates from The Plix. You can unsubscribe at
                any time.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
