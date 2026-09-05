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
            <p>An initiative by Plix Hospitality Private Limited</p>
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

      {/* Floating action buttons — a single WhatsApp pill (not a separate
          circular FAB stacked behind it; that was a real duplicate this app
          used to render from two different components at once) plus the
          back-to-top button, both anchored bottom-right. */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {showBackToTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Back to top"
            className="flex size-11 items-center justify-center rounded-full bg-navy text-white shadow-lg transition-transform hover:scale-105"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        )}
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Hi The Plix Goa, I have an inquiry regarding a booking.")}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on WhatsApp"
          className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
        >
          <svg viewBox="0 0 24 24" className="size-4 shrink-0 fill-white" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
          Chat on WhatsApp
        </a>
      </div>
    </>
  );
}
