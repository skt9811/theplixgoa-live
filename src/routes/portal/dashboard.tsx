import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader as Loader2, Lock } from "lucide-react";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import { PortalBottomNav, type PortalTab } from "@/components/plix/portal-bottom-nav";
import { PortalDashboardTab } from "@/components/plix/portal-dashboard-tab";
import { PortalBookingsTab } from "@/components/plix/portal-bookings-tab";
import { PortalRatesTab } from "@/components/plix/portal-rates-tab";
import { PortalInsightsTab } from "@/components/plix/portal-insights-tab";
import { PortalSettingsTab } from "@/components/plix/portal-settings-tab";

export const Route = createFileRoute("/portal/dashboard")({
  head: () => ({
    meta: [
      { title: "Partner Portal — The Plix Goa" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalDashboardPage,
});

function PortalDashboardPage() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [propertySlug, setPropertySlug] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string>("Your Property");
  const [tab, setTab] = useState<PortalTab>("dashboard");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/portal/bookings");
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
    }
    void load();
  }, [navigate]);

  useEffect(() => {
    if (!propertySlug) return;
    fetch("/api/portal/me")
      .then((res) => res.json())
      .then((data: { propertyName?: string }) => {
        if (data.propertyName) setPropertyName(data.propertyName);
      })
      .catch(() => {});
  }, [propertySlug]);

  if (!loaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-navy">
        <Loader2 className="size-6 animate-spin text-white/40" />
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
    <div className="min-h-[100dvh] bg-navy px-4 pb-24 pt-6 text-white">
      <div className="mx-auto w-full max-w-lg">
        {tab === "dashboard" && (
          <PortalDashboardTab propertySlug={propertySlug} propertyName={propertyName} bookings={bookings} />
        )}
        {tab === "bookings" && <PortalBookingsTab bookings={bookings} />}
        {tab === "rates" && <PortalRatesTab propertySlug={propertySlug} />}
        {tab === "insights" && <PortalInsightsTab propertySlug={propertySlug} bookings={bookings} />}
        {tab === "settings" && <PortalSettingsTab propertySlug={propertySlug} propertyName={propertyName} />}
      </div>

      <PortalBottomNav active={tab} onChange={setTab} />
    </div>
  );
}
