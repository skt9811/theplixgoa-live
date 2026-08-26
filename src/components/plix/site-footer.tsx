import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUp, Facebook, Instagram, MessageCircle } from "lucide-react";
import { ObfuscatedEmail } from "@/components/plix/obfuscated-email";
import { fetchSiteConfig, type SiteConfig } from "@/lib/site-config";

const quickLinks = [
  { label: "About Us", to: "/about" as const },
  { label: "Contact Us", to: "/contact" as const },
  // No dedicated partner-inquiry page exists yet — routes to the real
  // contact form rather than a dead link or a placeholder page.
  { label: "Partner With Us", to: "/contact" as const },
  { label: "Terms & Conditions", to: "/terms" as const },
  { label: "Blogs", to: "/blog" as const },
  // Same reasoning: no standalone gallery page — /stays is the closest
  // real page (every property's full photo set) to what "Plix Gallery" means.
  { label: "Plix Gallery", to: "/stays" as const },
  { label: "Cancellation Policy", to: "/cancellation" as const },
];

export function SiteFooter() {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    void fetchSiteConfig().then(setConfig);
  }, []);

  useEffect(() => {
    function onStorageChange() {
      void fetchSiteConfig().then(setConfig);
    }
    window.addEventListener("storage", onStorageChange);
    return () => window.removeEventListener("storage", onStorageChange);
  }, []);

  useEffect(() => {
    function onScroll() {
      setShowBackToTop(window.scrollY > 500);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const phone1 = config?.contact_phone1 || "+91-9009800809";
  const phone2 = config?.contact_phone2 || "+91-9009800895";
  const whatsapp = config?.whatsapp_number || "919009800809";
  const facebook = config?.social_facebook || "https://facebook.com/theplixgoa";
  const instagram = config?.social_instagram || "https://instagram.com/theplixgoa";

  return (
    <>
      <footer className="bg-navy text-navy-foreground">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
          {/* Header row */}
          <div className="flex flex-col items-center justify-between gap-6 border-b border-white/15 pb-10 sm:flex-row">
            <Link to="/" aria-label="The Plix Goa home">
              <img
                src="/Plix_Transparent_(1).png"
                alt="The Plix Goa"
                width={70}
                height={70}
                className="h-12 w-auto object-contain brightness-0 invert"
              />
            </Link>
            <p className="font-serif text-3xl font-normal text-navy-foreground md:text-4xl">
              Let's <span className="italic text-bronze">Escape.</span>
            </p>
          </div>

          {/* Main 3-column content */}
          <div className="grid gap-10 py-12 md:grid-cols-3 md:gap-12">
            {/* Column 1 — company overview & transparency */}
            <div>
              <p className="max-w-sm text-sm leading-relaxed text-navy-foreground/80">
                Luxury stays and boutique resorts across North Goa. Unmatched comfort, privacy, and
                elegance. Book your escape today.
              </p>
              <p className="mt-5 max-w-sm text-xs leading-relaxed text-navy-foreground/60">
                The Plix Goa is proudly owned and operated by Plix Hospitality Private Limited, the
                parent company behind our hospitality services. Our business is GST-registered,
                ensuring transparency and compliance at every step.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <a
                  href={facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="flex size-9 items-center justify-center rounded-full border border-white/20 text-navy-foreground/80 transition-colors hover:border-bronze hover:text-bronze"
                >
                  <Facebook className="size-4" aria-hidden />
                </a>
                <a
                  href={instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="flex size-9 items-center justify-center rounded-full border border-white/20 text-navy-foreground/80 transition-colors hover:border-bronze hover:text-bronze"
                >
                  <Instagram className="size-4" aria-hidden />
                </a>
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="flex size-9 items-center justify-center rounded-full border border-white/20 text-navy-foreground/80 transition-colors hover:border-bronze hover:text-bronze"
                >
                  <MessageCircle className="size-4" aria-hidden />
                </a>
              </div>
            </div>

            {/* Column 2 — quick links */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-foreground/60">
                Quick Links
              </p>
              <div className="mt-4 grid gap-2.5 text-sm">
                {quickLinks.map((link) => (
                  <Link
                    key={link.label}
                    to={link.to}
                    className="w-fit text-navy-foreground/80 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Column 3 — address & contact */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-foreground/60">
                Address &amp; Contact
              </p>
              <div className="mt-4 grid gap-3 text-sm">
                <p className="text-navy-foreground/80">Morjim &amp; Vagator, North Goa, India</p>
                <a
                  href={`tel:${phone1}`}
                  className="w-fit text-navy-foreground/80 transition-colors hover:text-white"
                >
                  {phone1}
                </a>
                <a
                  href={`tel:${phone2}`}
                  className="w-fit text-navy-foreground/80 transition-colors hover:text-white"
                >
                  {phone2}
                </a>
                <ObfuscatedEmail className="w-fit text-navy-foreground/80 transition-colors hover:text-white" />
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-6 text-xs text-navy-foreground/60 sm:flex-row">
            <p>© {new Date().getFullYear()} The Plix Goa | All Rights Reserved.</p>
            <div className="flex items-center gap-5">
              <Link to="/privacy" className="transition-colors hover:text-white">
                Privacy Policy
              </Link>
              <Link to="/terms" className="transition-colors hover:text-white">
                Terms Of Services
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating action buttons */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
        {showBackToTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Back to top"
            className="flex size-11 items-center justify-center rounded-full bg-navy text-white shadow-lift transition-transform hover:scale-105"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        )}
        <a
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lift transition-transform hover:scale-105"
        >
          <MessageCircle className="size-4" aria-hidden />
          Chat on WhatsApp
        </a>
      </div>
    </>
  );
}
