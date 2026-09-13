import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lock, X } from "lucide-react";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import { portalFetch } from "@/lib/portal-native-session";
import { useOnlineStatusToast } from "@/lib/use-online-status";
import { PortalBottomNav, type PortalTab } from "@/components/plix/portal-bottom-nav";
import { PortalDashboardTab } from "@/components/plix/portal-dashboard-tab";
import { PortalBookingsTab } from "@/components/plix/portal-bookings-tab";
import { PortalRatesTab } from "@/components/plix/portal-rates-tab";
import { PortalCalendarTab } from "@/components/plix/portal-calendar-tab";
import { PortalSettingsTab } from "@/components/plix/portal-settings-tab";
import { PortalPullToRefresh } from "@/components/plix/portal-pull-to-refresh";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/plix";

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

function PortalDashboardPage() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [propertySlug, setPropertySlug] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string>("Your Property");
  const [tab, setTab] = useState<PortalTab>("dashboard");
  const [ratesRefreshSignal, setRatesRefreshSignal] = useState(0);
  const [newBookingAlert, setNewBookingAlert] = useState<{ guestName: string; amount: number } | null>(null);
  const seenBookingIds = useRef<Set<string> | null>(null);

  useOnlineStatusToast();

  const load = useCallback(async () => {
    try {
      const res = await portalFetch("/api/portal/bookings");
      if (res.status === 401) {
        setAuthed(false);
        setLoaded(true);
        void navigate({ to: "/portal/login" });
        return;
      }
      const data = (await res.json()) as { bookings?: PortalBooking[]; propertySlug?: string };
      setBookings(data.bookings ?? []);
      if (data.propertySlug) setPropertySlug(data.propertySlug);
    } catch {
      toast.error("Could not load bookings");
    } finally {
      setLoaded(true);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!propertySlug) return;
    portalFetch("/api/portal/me")
      .then((res) => res.json())
      .then((data: { propertyName?: string }) => {
        if (data.propertyName) setPropertyName(data.propertyName);
      })
      .catch(() => {});
  }, [propertySlug]);

  // In-app new-booking banner: purely data-driven (no push infra needed) —
  // poll while this screen is open and diff booking IDs against the last
  // fetch so a new punch-in or Razorpay payment surfaces immediately.
  useEffect(() => {
    if (!propertySlug) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      portalFetch("/api/portal/bookings")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { bookings?: PortalBooking[] } | null) => {
          if (!data?.bookings) return;
          const currentIds = new Set(data.bookings.map((b) => b.id));
          if (seenBookingIds.current) {
            const fresh = data.bookings.filter((b) => !seenBookingIds.current!.has(b.id) && b.status !== "blocked");
            if (fresh.length > 0) {
              const newest = fresh[0]!;
              setNewBookingAlert({ guestName: newest.guest_name, amount: newest.booking_amount });
              tryPlayChime();
            }
          }
          seenBookingIds.current = currentIds;
          setBookings(data.bookings);
        })
        .catch(() => {});
    }, NEW_BOOKING_POLL_MS);
    return () => window.clearInterval(interval);
  }, [propertySlug]);

  useEffect(() => {
    if (!loaded || seenBookingIds.current) return;
    seenBookingIds.current = new Set(bookings.map((b) => b.id));
  }, [loaded, bookings]);

  useEffect(() => {
    if (!newBookingAlert) return;
    const timeout = window.setTimeout(() => setNewBookingAlert(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [newBookingAlert]);

  if (!loaded) {
    return (
      <div className="min-h-[100dvh] bg-navy px-4 pb-24 pt-6 text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto grid w-full max-w-lg gap-3 pt-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-4 h-28 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!authed || !propertySlug) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-navy text-white/70">
        <Lock className="size-6 text-bronze" aria-hidden />
        <p className="text-sm">Redirecting to login…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-navy px-4 pb-24 pt-6 text-white" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)" }}>
      {newBookingAlert && (
        <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="mt-3 flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl border border-bronze/40 bg-navy px-4 py-3 shadow-xl shadow-black/40 animate-in slide-in-from-top-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-bronze">New Booking Received</p>
              <p className="mt-0.5 text-sm text-white">
                {newBookingAlert.guestName} · {formatINR(newBookingAlert.amount)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewBookingAlert(null)}
              aria-label="Dismiss"
              className="shrink-0 text-white/50 hover:text-white"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-lg">
        {tab === "dashboard" && (
          <PortalPullToRefresh onRefresh={load}>
            <PortalDashboardTab propertySlug={propertySlug} propertyName={propertyName} bookings={bookings} onNavigateTab={setTab} />
          </PortalPullToRefresh>
        )}
        {tab === "bookings" && (
          <PortalPullToRefresh onRefresh={load}>
            <PortalBookingsTab bookings={bookings} />
          </PortalPullToRefresh>
        )}
        {tab === "rates" && (
          <PortalPullToRefresh onRefresh={() => setRatesRefreshSignal((n) => n + 1)}>
            <PortalRatesTab propertySlug={propertySlug} refreshSignal={ratesRefreshSignal} />
          </PortalPullToRefresh>
        )}
        {tab === "calendar" && <PortalCalendarTab propertySlug={propertySlug} bookings={bookings} />}
        {tab === "settings" && <PortalSettingsTab propertySlug={propertySlug} propertyName={propertyName} />}
      </div>

      <PortalBottomNav active={tab} onChange={setTab} />
    </div>
  );
}
