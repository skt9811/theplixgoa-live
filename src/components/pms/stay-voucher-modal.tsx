import { MapPin, MessageCircle } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { PMS_COMPANY } from "@/lib/pms-company";
import { fmtDate, waLink, type PmsBooking } from "@/lib/pms-client";
import { PrintSheet } from "@/components/pms/print-sheet";

const HOUSE_RULES = [
  "Swimming pool timings: 8:00 AM to 10:00 PM. Swimwear is mandatory in the pool.",
  "No loud music after 10:00 PM.",
  "A valid government-issued photo ID (Aadhaar, Passport, Driving Licence or PAN) is required from every guest at check-in.",
  "A refundable security deposit is collected at check-in (cash or UPI) and returned in full within 48 hours of check-out, subject to no damage to the property.",
];

export function StayVoucherModal({ booking, onClose }: { booking: PmsBooking; onClose: () => void }) {
  const property = PROPERTIES.find((p) => p.slug === booking.property_id);
  const propertyName = property?.name.split(" - ")[0] ?? booking.property_id;
  const location = property ? `${property.location}, ${property.region}, Goa` : "Goa";
  const mapUrl = property?.google_maps_url ?? null;
  const contact = PMS_COMPANY.phones[0];
  const confirmed = booking.status === "confirmed";

  const message = [
    `Hello ${booking.guest_name}, greetings from ${PMS_COMPANY.brand}!`,
    `Your stay at ${propertyName} is ${confirmed ? "confirmed" : "reserved"}.`,
    "",
    `Check-in: ${fmtDate(booking.check_in)} (from 2:00 PM)`,
    `Check-out: ${fmtDate(booking.check_out)} (by 11:00 AM)`,
    `Guests: ${booking.adults} adult${booking.adults === 1 ? "" : "s"}${booking.children ? `, ${booking.children} child${booking.children === 1 ? "" : "ren"}` : ""}`,
    "",
    `Location: ${mapUrl ?? location}`,
    `Contact: ${contact}`,
    "",
    "We look forward to hosting you!",
  ].join("\n");

  const digits = (booking.guest_phone ?? "").replace(/\D/g, "");
  const shareUrl = digits ? `${waLink(booking.guest_phone!)}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <PrintSheet
      title="Stay Voucher"
      docTitle={`Stay-Voucher-${booking.ref}`}
      onClose={onClose}
      actions={
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          <MessageCircle className="size-4" aria-hidden /> Share to WhatsApp
        </a>
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-emerald-700 pb-4">
        <div>
          <p className="text-xl font-bold tracking-tight text-emerald-800">Plix Hospitality</p>
          <p className="text-xs text-slate-500">{PMS_COMPANY.brand} · {PMS_COMPANY.website.replace("https://", "")}</p>
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {confirmed ? "BOOKING CONFIRMED" : "RESERVATION"}
          </span>
          <p className="mt-1 text-xs text-slate-500">Booking ID: #{booking.ref}</p>
        </div>
      </div>

      <h2 className="mt-5 text-lg font-bold">Guest Stay Voucher</h2>

      <div className="pms-avoid-break mt-4 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Guest</h3>
          <p className="mt-1 text-base font-semibold">{booking.guest_name}</p>
          <p className="text-sm text-slate-600">
            {booking.adults} adult{booking.adults === 1 ? "" : "s"}
            {booking.children > 0 ? `, ${booking.children} child${booking.children === 1 ? "" : "ren"}` : ""}
          </p>
        </section>
        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Stay</h3>
          <p className="mt-1 text-sm">
            <span className="font-semibold">Check-in:</span> {fmtDate(booking.check_in)}, 14:00
          </p>
          <p className="text-sm">
            <span className="font-semibold">Check-out:</span> {fmtDate(booking.check_out)}, 11:00
          </p>
          <p className="text-sm text-slate-600">
            {booking.nights} night{booking.nights === 1 ? "" : "s"}
          </p>
        </section>
      </div>

      <section className="pms-avoid-break mt-4 rounded-xl border border-slate-200 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Property</h3>
        <p className="mt-1 text-base font-semibold">{propertyName}</p>
        <p className="flex items-center gap-1.5 text-sm text-slate-600">
          <MapPin className="size-3.5" aria-hidden /> {location}
        </p>
        <p className="mt-1 text-sm">
          <span className="font-semibold">Caretaker / concierge:</span> {PMS_COMPANY.phones.join(" / ")}
        </p>
        {mapUrl && (
          <p className="mt-1 text-sm">
            <a href={mapUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline">
              Open in Google Maps
            </a>
            <span className="hidden print:inline"> ({mapUrl})</span>
          </p>
        )}
      </section>

      <section className="pms-avoid-break mt-4 rounded-xl border border-slate-200 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">House Rules</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          {HOUSE_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <p className="mt-5 border-t border-slate-200 pt-3 text-center text-[11px] text-slate-500">
        {PMS_COMPANY.name} · {PMS_COMPANY.address} · {PMS_COMPANY.email}
      </p>
    </PrintSheet>
  );
}
