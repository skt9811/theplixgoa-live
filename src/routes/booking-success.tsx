import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, CircleCheck as CheckCircle2, Hop as Home, MapPin, Receipt, Users } from "lucide-react";

type BookingSuccessSearch = {
  id?: string;
  property?: string;
  location?: string;
  checkin?: string;
  checkout?: string;
  guests?: string;
  nights?: string;
  total?: string;
  payment?: string;
  sim?: string;
};

export const Route = createFileRoute("/booking-success")({
  validateSearch: (search: Record<string, unknown>): BookingSuccessSearch => ({
    id: typeof search["id"] === "string" ? search["id"] : undefined,
    property: typeof search["property"] === "string" ? search["property"] : undefined,
    location: typeof search["location"] === "string" ? search["location"] : undefined,
    checkin: typeof search["checkin"] === "string" ? search["checkin"] : undefined,
    checkout: typeof search["checkout"] === "string" ? search["checkout"] : undefined,
    guests: typeof search["guests"] === "string" ? search["guests"] : undefined,
    nights: typeof search["nights"] === "string" ? search["nights"] : undefined,
    total: typeof search["total"] === "string" ? search["total"] : undefined,
    payment: typeof search["payment"] === "string" ? search["payment"] : undefined,
    sim: typeof search["sim"] === "string" ? search["sim"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Booking Confirmed — The Plix Goa" },
      { name: "description", content: "Your booking is confirmed. View your reservation summary." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BookingSuccess,
});

function BookingSuccess() {
  const s = Route.useSearch();
  const bookingRef = s.id ? s.id.slice(0, 8).toUpperCase() : "PLIX-XXXX";
  const isSimulation = s.sim === "1";

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 md:px-6">
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-16 text-primary" aria-hidden />
        <h1 className="mt-4 text-3xl font-semibold text-navy">Booking Confirmed</h1>
        <p className="mt-2 text-muted-foreground">
          {isSimulation
            ? "This was a demo booking — no real payment was processed."
            : "Your payment is complete and confirmation emails are on their way."}
        </p>
      </div>

      <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <span className="text-sm text-muted-foreground">Booking Reference</span>
          <span className="font-mono text-lg font-semibold text-navy">{bookingRef}</span>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {s.property && (
            <Detail label="Property" value={s.property} />
          )}
          {s.location && (
            <Detail icon={MapPin} label="Location" value={`${s.location}, Goa`} />
          )}
          {s.checkin && (
            <Detail icon={CalendarCheck} label="Check-in" value={s.checkin} />
          )}
          {s.checkout && (
            <Detail icon={CalendarCheck} label="Check-out" value={s.checkout} />
          )}
          {s.guests && (
            <Detail icon={Users} label="Guests" value={s.guests} />
          )}
          {s.nights && (
            <Detail label="Nights" value={s.nights} />
          )}
        </dl>

        {s.total && (
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-muted px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Total Paid</span>
            <span className="text-xl font-semibold text-navy">
              {formatTotal(Number(s.total))}
            </span>
          </div>
        )}

        {s.payment && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Receipt className="size-3.5" aria-hidden />
            Payment ID: <span className="font-mono">{s.payment}</span>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          to="/stays"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-emerald px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
        >
          Browse more stays
        </Link>
        <Link
          to="/"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <Home className="size-4" aria-hidden />
          Back to home
        </Link>
      </div>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-navy">{value}</dd>
    </div>
  );
}

function formatTotal(value: number): string {
  if (Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}
