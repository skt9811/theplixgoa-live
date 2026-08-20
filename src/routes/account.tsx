import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarCheck, Download, Hop as Home, Loader as Loader2, LogOut, Mail, MapPin, User, Users } from "lucide-react";
import { fetchBookingsForGuest, type BookingRow } from "@/lib/booking";
import { getGuestUser, onGuestAuthChange, signOutGuest, type GuestUser } from "@/lib/guest-auth";
import { formatINR } from "@/lib/plix";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "My Account — The Plix Goa" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountPage,
});

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function AccountPage() {
  const [guestUser, setGuestUser] = useState<GuestUser | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loadedBookings, setLoadedBookings] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownloadVoucher(booking: BookingRow) {
    setDownloadingId(booking.id);
    try {
      // Dynamically imported — pdf-lib is ~120KB gzip and must not be part of
      // the account page's critical bundle for guests who never download a
      // voucher.
      const { downloadVoucherPdf } = await import("@/lib/pdf-voucher");
      await downloadVoucherPdf(booking);
    } catch (err) {
      console.error("[Voucher Download Error]:", err);
    } finally {
      setDownloadingId(null);
    }
  }

  useEffect(() => {
    setGuestUser(getGuestUser());
    setCheckedAuth(true);
    return onGuestAuthChange(() => setGuestUser(getGuestUser()));
  }, []);

  useEffect(() => {
    if (!guestUser?.email) return;
    let cancelled = false;
    void fetchBookingsForGuest(guestUser.email).then((rows) => {
      if (!cancelled) {
        setBookings(rows);
        setLoadedBookings(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [guestUser?.email]);

  if (!checkedAuth) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (!guestUser) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <User className="mx-auto size-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold text-navy">You're not signed in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in from the menu at the top of the page to view your bookings.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-emerald px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
        >
          <Home className="size-4" aria-hidden />
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 md:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy md:text-3xl">My Account</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="size-3.5" aria-hidden />
            {guestUser.email}
          </p>
        </div>
        <button
          onClick={() => void signOutGuest()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <LogOut className="size-3.5" aria-hidden />
          Sign out
        </button>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-navy">Your Bookings</h2>

      {!loadedBookings ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
        </div>
      ) : bookings.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No bookings yet with this email.</p>
          <Link
            to="/stays"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-gradient-emerald px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
          >
            Browse stays
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {bookings.map((b) => (
            <div key={b.id} className="rounded-3xl border border-border bg-card p-6 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy">{b.property_name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden />
                    {b.property_location}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {b.id.slice(0, 8).toUpperCase()}
                </span>
              </div>

              <dl className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                    <CalendarCheck className="size-3.5" aria-hidden />
                    Check-in
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-navy">{formatDate(b.check_in)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                    <CalendarCheck className="size-3.5" aria-hidden />
                    Check-out
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-navy">{formatDate(b.check_out)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                    <Users className="size-3.5" aria-hidden />
                    Guests
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-navy">{b.guests}</dd>
                </div>
              </dl>

              <div className="mt-4 flex items-center justify-between rounded-2xl bg-muted px-4 py-3">
                <span className="text-sm font-medium text-muted-foreground">Total Paid</span>
                <span className="text-lg font-semibold text-navy">{formatINR(b.total_amount)}</span>
              </div>

              <button
                onClick={() => void handleDownloadVoucher(b)}
                disabled={downloadingId === b.id}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-accent disabled:opacity-50"
              >
                {downloadingId === b.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-4" aria-hidden />
                )}
                Download Voucher
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
