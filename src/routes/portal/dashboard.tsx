import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Lock, RotateCw, TriangleAlert, X } from "lucide-react";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import { portalFetch } from "@/lib/portal-native-session";
import { useOnlineStatusToast } from "@/lib/use-online-status";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { PortalBottomNav, type PortalTab } from "@/components/plix/portal-bottom-nav";
import { PortalNotificationBell, type PortalAlert } from "@/components/plix/portal-notification-bell";
import { PortalHomeTab } from "@/components/plix/portal-home-tab";
import { PortalInventoryTab } from "@/components/plix/portal-inventory-tab";
import { PortalBookingTab } from "@/components/plix/portal-booking-tab";
import { PortalAnalyticsTab } from "@/components/plix/portal-analytics-tab";
import { PortalMenuTab } from "@/components/plix/portal-menu-tab";
import { PortalPullToRefresh } from "@/components/plix/portal-pull-to-refresh";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/portal/dashboard")({
  head: () => ({
    meta: [
      { title: "Partner Portal — The Plix Goa" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalDashboardPage,
});

const NEW_BOOKING_POLL_MS = 30_000;

function tryPlayChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // audio blocked (no user gesture yet, or unsupported) — the visual banner still shows
  }
}

function greetingWord(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function PortalDashboardPage() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [propertySlug, setPropertySlug] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string>("Your Property");
  const [role, setRole] = useState<"owner" | "admin" | null>(null);
  const [tab, setTab] = useState<PortalTab>("home");
  const [recentAlerts, setRecentAlerts] = useState<PortalAlert[]>([]);
  const [bannerAlert, setBannerAlert] = useState<PortalAlert | null>(null);
  const seenBookingIds = useRef<Set<string> | null>(null);

  useOnlineStatusToast();

  // Admin isn't bound to one property — this is the client-side selector's
  // own state, sent as `?property=` on every portal API call. An owner's
  // requests never carry it: the server derives their property from the
  // session alone (see resolveEffectivePropertySlug), so nothing here can
  // let an owner see another property's data even if this were tampered with.
  // A genuine 401 (the server explicitly rejecting the token/cookie) is the
  // only thing that should ever navigate away — anything else (a network
  // blip, a 500, a malformed response) must render as a retryable error
  // *within* this page instead. Conflating the two used to mean any
  // non-auth failure left propertySlug null forever, which fell into the
  // same "Redirecting to login…" branch below even though authed was still
  // true and no navigation was actually happening — a confusing dead end
  // that looked like an unexplained bounce-back but wasn't one.
  const load = useCallback(
    async (forProperty?: string) => {
      try {
        const query = forProperty ? `?property=${encodeURIComponent(forProperty)}` : "";
        const res = await portalFetch(`/api/portal/bookings${query}`);
        if (res.status === 401) {
          setAuthed(false);
          setLoaded(true);
          void navigate({ to: "/portal/login" });
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          bookings?: PortalBooking[];
          propertySlug?: string;
          role?: "owner" | "admin";
        };
        setBookings(data.bookings ?? []);
        if (data.propertySlug) setPropertySlug(data.propertySlug);
        if (data.role) setRole(data.role);
      } catch {
        toast.error("Could not load bookings");
      } finally {
        setLoaded(true);
      }
    },
    [navigate],
  );

  useEffect(() => {
    void load();
    // Only on mount — switching properties re-fetches via handleSelectProperty below,
    // not this effect, so it doesn't need propertySlug/role in its deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (!propertySlug) return;
    const query = role === "admin" ? `?property=${encodeURIComponent(propertySlug)}` : "";
    portalFetch(`/api/portal/me${query}`)
      .then((res) => res.json())
      .then((data: { propertyName?: string }) => {
        if (data.propertyName) setPropertyName(data.propertyName);
      })
      .catch(() => {});
  }, [propertySlug, role]);

  function handleSelectProperty(slug: string) {
    if (!slug || slug === propertySlug) return;
    setLoaded(false);
    seenBookingIds.current = null;
    setBannerAlert(null);
    setRecentAlerts([]);
    setPropertySlug(slug);
    void load(slug);
  }

  // In-app new-booking banner + notification bell history: purely
  // data-driven (no push infra needed) — poll while this screen is open and
  // diff booking IDs against the last fetch so a new punch-in or Razorpay
  // payment surfaces immediately.
  useEffect(() => {
    if (!propertySlug) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const query = role === "admin" ? `?property=${encodeURIComponent(propertySlug)}` : "";
      portalFetch(`/api/portal/bookings${query}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { bookings?: PortalBooking[] } | null) => {
          if (!data?.bookings) return;
          const currentIds = new Set(data.bookings.map((b) => b.id));
          if (seenBookingIds.current) {
            const fresh = data.bookings.filter((b) => !seenBookingIds.current!.has(b.id) && b.status !== "blocked");
            if (fresh.length > 0) {
              const newest = fresh[0]!;
              const alert: PortalAlert = { id: newest.id, guestName: newest.guest_name, amount: newest.booking_amount };
              setBannerAlert(alert);
              setRecentAlerts((prev) => [alert, ...prev].slice(0, 5));
              tryPlayChime();
            }
          }
          seenBookingIds.current = currentIds;
          setBookings(data.bookings);
        })
        .catch(() => {});
    }, NEW_BOOKING_POLL_MS);
    return () => window.clearInterval(interval);
  }, [propertySlug, role]);

  useEffect(() => {
    if (!loaded || seenBookingIds.current) return;
    seenBookingIds.current = new Set(bookings.map((b) => b.id));
  }, [loaded, bookings]);

  useEffect(() => {
    if (!bannerAlert) return;
    const timeout = window.setTimeout(() => setBannerAlert(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [bannerAlert]);

  if (!loaded) {
    return (
      <div className="min-h-[100dvh] bg-[#f7f8fc] px-4 pb-24 pt-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto grid w-full max-w-lg gap-3 pt-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-4 h-28 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-[#f7f8fc] text-slate-500">
        <Lock className="size-6 text-bronze" aria-hidden />
        <p className="text-sm">Redirecting to login…</p>
      </div>
    );
  }

  if (!propertySlug) {
    // Still authenticated — this is a failed/incomplete fetch, not a lost
    // session, so it gets a retry button here instead of silently landing
    // on the misleading "Redirecting to login…" screen above forever.
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#f7f8fc] px-6 text-center text-slate-500">
        <TriangleAlert className="size-8 text-bronze" aria-hidden />
        <p className="text-sm">Couldn't load your dashboard. Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => {
            setLoaded(false);
            void load();
          }}
          className="flex items-center gap-2 rounded-full bg-bronze px-6 py-3 text-sm font-semibold text-bronze-foreground"
        >
          <RotateCw className="size-4" aria-hidden />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f7f8fc] px-4 pb-24 pt-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)" }}>
      {bannerAlert && (
        <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="mt-3 flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-lg animate-in slide-in-from-top-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-bronze">New Booking Received</p>
              <p className="mt-0.5 text-sm text-slate-900">
                {bannerAlert.guestName} · {formatINR(bannerAlert.amount)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBannerAlert(null)}
              aria-label="Dismiss"
              className="shrink-0 text-slate-400 hover:text-slate-600"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Good {greetingWord()}, {role === "admin" ? "Admin" : propertyName}
            </h1>
            <p className="text-xs text-slate-500">Manage your villas, booking &amp; earnings</p>
          </div>
          <PortalNotificationBell
            alerts={recentAlerts}
            onDismiss={(id) => setRecentAlerts((prev) => prev.filter((a) => a.id !== id))}
          />
        </div>

        {role === "admin" && (
          <label className="mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm">
            <span className="shrink-0 text-slate-400">Property</span>
            <span className="relative flex-1">
              <select
                value={propertySlug}
                onChange={(e) => handleSelectProperty(e.target.value)}
                className="w-full appearance-none bg-transparent pr-6 font-semibold text-slate-900 outline-none"
              >
                {PROPERTIES.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            </span>
          </label>
        )}

        <div className="mt-4">
          {tab === "home" && (
            <PortalPullToRefresh onRefresh={() => load(role === "admin" ? propertySlug : undefined)}>
              <PortalHomeTab propertySlug={propertySlug} bookings={bookings} onNavigateTab={setTab} />
            </PortalPullToRefresh>
          )}
          {tab === "inventory" && <PortalInventoryTab propertySlug={propertySlug} bookings={bookings} role={role ?? "owner"} />}
          {tab === "booking" && (
            <PortalPullToRefresh onRefresh={() => load(role === "admin" ? propertySlug : undefined)}>
              <PortalBookingTab
                propertySlug={propertySlug}
                bookings={bookings}
                role={role ?? "owner"}
                onCreated={() => load(role === "admin" ? propertySlug : undefined)}
              />
            </PortalPullToRefresh>
          )}
          {tab === "analytics" && <PortalAnalyticsTab propertySlug={propertySlug} bookings={bookings} />}
          {tab === "menu" && <PortalMenuTab propertySlug={propertySlug} propertyName={propertyName} role={role ?? "owner"} />}
        </div>
      </div>

      <PortalBottomNav active={tab} onChange={setTab} />
    </div>
  );
}
