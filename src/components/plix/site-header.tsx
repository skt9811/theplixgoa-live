import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, User, X } from "lucide-react";
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
  const linkClass = isHome
    ? "rounded-full px-3 py-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white"
    : "rounded-full px-3 py-2 text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground";
  const activeLinkClass = isHome && !homeSolid
    ? "bg-white/15 text-white"
    : homeSolid
      ? "bg-white/20 text-white"
      : "bg-accent text-accent-foreground";

  return (
    <header
      className={
        isHome
          ? `fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
              homeSolid ? "bg-bronze text-white shadow-md" : "bg-transparent text-white"
            }`
          : "sticky top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur-xl"
      }
    >
      {/* Main nav bar — logo left, links centered, CTA right (equal 3-column
          grid so the centered nav is optically centered in the full header,
          not just between the logo and the CTA, whichever is wider). */}
      <div
        className={`mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 transition-all duration-300 md:px-6 ${
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

        <nav className="hidden items-center justify-self-center gap-1 text-sm font-medium lg:flex">
          <div className="group relative">
            <Link to="/stays" className={`flex items-center gap-1 ${linkClass}`}>
              Villas &amp; Stays
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

          <a href="/#locations" className={linkClass}>
            Locations
          </a>

          {links.map((l) => (
            <Link key={l.to} to={l.to} activeProps={{ className: activeLinkClass }} className={linkClass}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 justify-self-end lg:flex">
          {guestUser ? (
            <div className="flex items-center gap-2">
              <Link
                to="/account"
                className={`flex items-center gap-1.5 text-sm transition-colors ${isHome ? "text-white/85 hover:text-white" : "text-foreground/80 hover:text-primary"}`}
                title="My account"
              >
                <User className="size-3.5" aria-hidden />
                {guestUser.fullName?.split(" ")[0] ?? guestUser.email}
              </Link>
              <button
                onClick={() => {
                  void signOutGuest();
                  setGuestUser(null);
                }}
                className={`transition-colors ${isHome ? "text-white/60 hover:text-white" : "text-foreground/50 hover:text-primary"}`}
                title="Sign out"
              >
                <LogOut className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className={`flex items-center gap-1.5 text-sm transition-colors ${isHome ? "text-white/85 hover:text-white" : "text-foreground/80 hover:text-primary"}`}
            >
              <User className="size-3.5" aria-hidden />
              Sign In
            </button>
          )}
          <Link
            to="/stays"
            className="rounded-full bg-bronze px-5 py-2.5 text-sm font-semibold text-bronze-foreground shadow-md transition-transform duration-200 hover:scale-[1.03]"
          >
            Book Direct &amp; Save
          </Link>
        </div>

        <button
          className={`justify-self-end ${isHome ? "rounded-lg border border-white/40 p-2 text-white" : "rounded-lg border border-border p-2"} lg:hidden`}
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
            {guestUser ? (
              <div className="flex items-center justify-between rounded-lg px-3 py-3">
                <Link
                  to="/account"
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-1.5 ${isHome ? "text-white/90" : "text-foreground"}`}
                >
                  <User className="size-4" aria-hidden />
                  {guestUser.fullName?.split(" ")[0] ?? guestUser.email}
                </Link>
                <button
                  onClick={() => {
                    void signOutGuest();
                    setGuestUser(null);
                  }}
                  className={`flex items-center gap-1.5 text-xs ${isHome ? "text-white/60" : "text-foreground/60"}`}
                >
                  <LogOut className="size-3.5" aria-hidden />
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAuthOpen(true);
                  setOpen(false);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-3 ${isHome ? "text-white/90 hover:bg-white/15" : "hover:bg-accent"}`}
              >
                <User className="size-4" aria-hidden />
                Sign In
              </button>
            )}
            <Link
              to="/stays"
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-3 ${isHome ? "text-white/90 hover:bg-white/15" : "hover:bg-accent"}`}
            >
              Villas &amp; Stays
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
            <a
              href="/#locations"
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-3 ${isHome ? "text-white/90 hover:bg-white/15" : "hover:bg-accent"}`}
            >
              Locations
            </a>
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
            <Link
              to="/stays"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full bg-bronze px-4 py-3 text-center font-semibold text-bronze-foreground"
            >
              Book Direct &amp; Save
            </Link>
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
