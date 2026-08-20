import { Link, useRouterState } from "@tanstack/react-router";
import { MapPin, Menu, Phone, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SearchBar } from "@/components/plix/search-bar";
import { AuthModal } from "@/components/plix/auth-modal";
import { PROPERTIES } from "@/lib/plix";
import { getGuestUser, onGuestAuthChange, signOutGuest, type GuestUser } from "@/lib/guest-auth";

const links = [
  { to: "/blog", label: "Blog" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [guestUser, setGuestUser] = useState<GuestUser | null>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isHome = pathname === "/";

  // Auto-close mobile menu on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    setGuestUser(getGuestUser());
    return onGuestAuthChange(() => setGuestUser(getGuestUser()));
  }, []);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  const homeSolid = isHome && scrolled;

  return (
    <header
      className={
        isHome
          ? `fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
              homeSolid
                ? "bg-bronze text-white shadow-md"
                : "bg-transparent text-white"
            }`
          : "sticky top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur-xl"
      }
    >
      {/* Top utility contact strip — always visible */}
      <div
        className={`border-b transition-colors duration-300 ${
          isHome
            ? homeSolid
              ? "border-white/20 bg-bronze text-white"
              : "border-white/15 bg-black/20 text-white"
            : "border-border/60 bg-navy text-navy-foreground"
        }`}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 text-xs md:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <a
              href="tel:+919009800809"
              className={`flex items-center gap-1.5 transition-colors ${isHome ? "text-white/85 hover:text-white" : "text-navy-foreground/80 hover:text-primary-glow"}`}
            >
              <Phone className="size-3" aria-hidden />
              +91-9009800809
            </a>
            <a
              href="tel:+919009800895"
              className={`flex items-center gap-1.5 transition-colors ${isHome ? "text-white/85 hover:text-white" : "text-navy-foreground/80 hover:text-primary-glow"}`}
            >
              <Phone className="size-3" aria-hidden />
              +91-9009800895
            </a>
            <span className={`hidden items-center gap-1.5 sm:flex ${isHome ? "text-white/70" : "text-navy-foreground/70"}`}>
              <MapPin className="size-3" aria-hidden />
              Pequen, Chivar, 1561/3A, Anjuna, Vagator, Goa 403413
            </span>
          </div>
          <div className="flex items-center gap-3">
            {guestUser ? (
              <button
                onClick={() => {
                  void signOutGuest();
                  setGuestUser(null);
                }}
                className={`flex items-center gap-1.5 transition-colors ${isHome ? "text-white/85 hover:text-white" : "text-navy-foreground/80 hover:text-primary-glow"}`}
                title="Sign out"
              >
                <User className="size-3" aria-hidden />
                {guestUser.fullName?.split(" ")[0] ?? guestUser.email}
              </button>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className={`flex items-center gap-1.5 transition-colors ${isHome ? "text-white/85 hover:text-white" : "text-navy-foreground/80 hover:text-primary-glow"}`}
              >
                <User className="size-3" aria-hidden />
                Sign In
              </button>
            )}
            <Link
              to="/stays"
              className={`rounded-full px-4 py-1 text-xs font-semibold transition-colors ${
                isHome
                  ? homeSolid
                    ? "bg-white text-bronze hover:bg-white/90"
                    : "bg-white/90 text-navy hover:bg-white"
                  : "bg-[oklch(0.828_0.189_84.429)] text-navy hover:bg-[oklch(0.78_0.17_80)]"
              }`}
            >
              Book Now
            </Link>
          </div>
        </div>
      </div>

      {/* Main nav bar */}
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-all duration-300 md:px-6 ${
          homeSolid ? "py-2.5" : "py-3.5"
        }`}
      >
        <Link to="/" className="flex items-center gap-2.5" aria-label="The Plix Goa home">
          <img
            src="/Plix_Transparent_(1).png"
            alt="Plix Hospitality"
            width={70}
            height={70}
            className={`h-10 w-auto object-contain transition-all duration-300 md:h-12 lg:h-14 ${
              isHome && !homeSolid
                ? "brightness-0 invert drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)]"
                : homeSolid
                  ? "brightness-0 invert"
                  : ""
            }`}
          />
        </Link>

        <nav className="hidden items-center gap-1 text-sm font-medium lg:flex">
          <Link
            to="/"
            activeProps={{ className: isHome && !homeSolid ? "bg-white/15 text-white" : homeSolid ? "bg-white/20 text-white" : "bg-accent text-accent-foreground" }}
            className={
              isHome
                ? "rounded-full px-3 py-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white"
                : "rounded-full px-3 py-2 text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
            }
          >
            Home
          </Link>

          <div className="group relative">
            <Link
              to="/stays"
              className={
                isHome
                  ? "flex items-center gap-1 rounded-full px-3 py-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white"
                  : "flex items-center gap-1 rounded-full px-3 py-2 text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
              }
            >
              Stays
            </Link>
            <div className="invisible absolute left-0 top-full min-w-[220px] w-max whitespace-nowrap translate-y-1 rounded-xl border border-border bg-popover p-1.5 opacity-0 shadow-card transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              {PROPERTIES.map((p) => (
                <Link
                  key={p.id}
                  to="/stays"
                  search={{ location: p.location }}
                  className="block rounded-lg px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </div>

          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeProps={{ className: isHome && !homeSolid ? "bg-white/15 text-white" : homeSolid ? "bg-white/20 text-white" : "bg-accent text-accent-foreground" }}
              className={
                isHome
                  ? "rounded-full px-3 py-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white"
                  : "rounded-full px-3 py-2 text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
              }
            >
              {l.label}
            </Link>
          ))}
          <Link
            to="/stays"
            className={
              isHome
                ? "ml-2 rounded-full border border-white/70 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-white hover:text-navy"
                : "ml-2 rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-navy-foreground transition-transform duration-200 hover:scale-[1.03]"
            }
          >
            Book Now
          </Link>
        </nav>

        <button
          className={
            isHome
              ? "rounded-lg border border-white/40 p-2 text-white"
              : "rounded-lg border border-border p-2"
          }
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div
          className={
            isHome
              ? "border-t border-white/15 bg-black/70 px-4 py-4 backdrop-blur-xl lg:hidden"
              : "border-t border-border bg-card px-4 py-4 lg:hidden"
          }
        >
          <div className="grid gap-1 text-sm font-medium">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-3 ${isHome ? "text-white/90 hover:bg-white/15" : "hover:bg-accent"}`}
            >
              Home
            </Link>
            <Link
              to="/stays"
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-3 ${isHome ? "text-white/90 hover:bg-white/15" : "hover:bg-accent"}`}
            >
              Stays
            </Link>
            <Link
              to="/blog"
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-3 ${isHome ? "text-white/90 hover:bg-white/15" : "hover:bg-accent"}`}
            >
              Blog
            </Link>
            {PROPERTIES.map((p) => (
              <Link
                key={p.id}
                to="/stays"
                search={{ location: p.location }}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-3 pl-6 ${isHome ? "text-white/70 hover:bg-white/15" : "text-foreground/70 hover:bg-accent"}`}
              >
                {p.name}
              </Link>
            ))}
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-3 ${isHome ? "text-white/90 hover:bg-white/15" : "hover:bg-accent"}`}
              >
                {l.label}
              </Link>
            ))}
            {/* Contact info in mobile menu on homepage */}
            {isHome && (
              <div className="mt-2 flex flex-col gap-1 border-t border-white/15 pt-3 text-xs text-white/70">
                <a href="tel:+919009800809" className="flex items-center gap-1.5">
                  <Phone className="size-3" /> +91-9009800809
                </a>
                <a href="tel:+919009800895" className="flex items-center gap-1.5">
                  <Phone className="size-3" /> +91-9009800895
                </a>
                <span className="flex items-start gap-1.5">
                  <MapPin className="size-3 mt-0.5 shrink-0" /> Pequen, Chivar, 1561/3A, Anjuna, Vagator, Goa 403413
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {!isHome && (
        <div className="border-t border-border/60 bg-background/70">
          <div className="mx-auto max-w-7xl px-4 py-3 md:px-6">
            <SearchBar compact />
          </div>
        </div>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}
