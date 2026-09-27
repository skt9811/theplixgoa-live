import { useState } from "react";
import { toast } from "sonner";
import { Download, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { PMS_COMPANY } from "@/lib/pms-company";
import { HOUSE_RULES } from "@/lib/pms-voucher-content";
import { getPropertyPmsConfig } from "@/lib/pms-properties-config";
import { fmtDate, pms, waLink, type PmsBooking } from "@/lib/pms-client";
import { isNativeApp, nativeFileErrorMessage, saveAndSharePdf } from "@/lib/pms-native-file";
import { PrintSheet } from "@/components/pms/print-sheet";

export function StayVoucherModal({ booking, onClose }: { booking: PmsBooking; onClose: () => void }) {
  const [emailTo, setEmailTo] = useState(booking.guest_email ?? "");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const pdfHref = `/api/pms/vouchers/pdf?booking=${booking.id}`;

  async function downloadNative() {
    setDownloading(true);
    try {
      await saveAndSharePdf(pdfHref, `Stay-Voucher-${booking.ref}.pdf`, "Stay Voucher");
    } catch (err) {
      toast.error(nativeFileErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  async function sendEmail() {
    setEmailError(null);
    setSending(true);
    try {
      await pms("vouchers/email", { method: "POST", body: JSON.stringify({ bookingId: booking.id, to: emailTo.trim() }) });
      setSentTo(emailTo.trim());
      toast.success(`Voucher emailed to ${emailTo.trim()}`);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Could not send the email");
    } finally {
      setSending(false);
    }
  }

  const property = PROPERTIES.find((p) => p.slug === booking.property_id);
  const config = getPropertyPmsConfig(booking.property_id, property?.name.split(" - ")[0]);
  const propertyName = config.name;
  const address = config.address.trim() || (property ? `${property.location}, ${property.region}` : "Goa");
  const mapUrl = config.mapsUrl.trim() || property?.google_maps_url || null;
  const confirmed = booking.status === "confirmed";

  // A caretaker is only shown once a real phone number is filled in the
  // config; until then guests get the central concierge numbers instead.
  const caretakerPhone = config.caretakerPhone.trim();
  const hasCaretaker = caretakerPhone.replace(/\D/g, "").length >= 10;
  const caretakerName = config.caretakerName.trim();
  const showCaretakerName = caretakerName !== "" && !/\(tbd\)/i.test(caretakerName);
  const contactLine = hasCaretaker
    ? `${showCaretakerName ? `${caretakerName}: ` : "Caretaker: "}${caretakerPhone}`
    : `Concierge: ${PMS_COMPANY.phones.join(" / ")}`;

  const message = [
    `Hello ${booking.guest_name}, greetings from ${PMS_COMPANY.brand}!`,
    `Your stay at ${propertyName} is ${confirmed ? "confirmed" : "reserved"}.`,
    "",
    `Check-in: ${fmtDate(booking.check_in)} (from 2:00 PM)`,
    `Check-out: ${fmtDate(booking.check_out)} (by 11:00 AM)`,
    `Guests: ${booking.adults} adult${booking.adults === 1 ? "" : "s"}${booking.children ? `, ${booking.children} child${booking.children === 1 ? "" : "ren"}` : ""}`,
    "",
    `Address: ${address}`,
    ...(mapUrl ? [`Location: ${mapUrl}`] : []),
    contactLine,
    ...(hasCaretaker ? [`Concierge: ${PMS_COMPANY.phones[0]}`] : []),
    "",
    "We look forward to hosting you!",
  ].join("\n");

  const digits = (booking.guest_phone ?? "").replace(/\D/g, "");
  const shareUrl = digits ? `${waLink(booking.guest_phone!)}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <PrintSheet
      title="Stay Voucher"
      docTitle={`Stay-Voucher-${booking.ref}`}
      pdfHref={pdfHref}
      onClose={onClose}
      actions={
        <>
        {isNativeApp() ? (
          <button
            type="button"
            onClick={() => void downloadNative()}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Download className="size-4" aria-hidden /> {downloading ? "Preparing..." : "Download PDF"}
          </button>
        ) : (
          <a
            href={pdfHref}
            download={`Stay-Voucher-${booking.ref}.pdf`}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="size-4" aria-hidden /> Download PDF
          </a>
        )}
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          <MessageCircle className="size-4" aria-hidden /> Share to WhatsApp
        </a>
        </>
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
          <MapPin className="size-3.5" aria-hidden /> {address}
        </p>
        {hasCaretaker ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span>
              <span className="font-semibold">Caretaker{showCaretakerName ? `: ${caretakerName}` : ""}</span> · {caretakerPhone}
            </span>
            <a
              href={`tel:${caretakerPhone.replace(/[^\d+]/g, "")}`}
              className="pms-no-print flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              <Phone className="size-3" aria-hidden /> Call Caretaker
            </a>
          </div>
        ) : (
          <p className="mt-1 text-sm">
            <span className="font-semibold">Concierge:</span> {PMS_COMPANY.phones.join(" / ")}
          </p>
        )}
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

      <section className="pms-no-print mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="text-sm font-bold text-emerald-800">Send this voucher by email</h3>
        <p className="mt-0.5 text-xs text-slate-600">The guest receives the voucher as a PDF attachment.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="email"
            value={emailTo}
            onChange={(e) => {
              setEmailTo(e.target.value);
              setSentTo(null);
            }}
            placeholder="guest@example.com"
            aria-label="Guest email"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <button
            type="button"
            onClick={() => void sendEmail()}
            disabled={sending || !emailTo.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Mail className="size-4" aria-hidden /> {sending ? "Sending..." : "Send Email"}
          </button>
        </div>
        {sentTo && <p className="mt-2 text-xs font-semibold text-emerald-700">Sent to {sentTo}.</p>}
        {emailError && <p className="mt-2 text-xs font-semibold text-red-600">{emailError}</p>}
      </section>

      <p className="mt-5 border-t border-slate-200 pt-3 text-center text-[11px] text-slate-500">
        {PMS_COMPANY.name} · {PMS_COMPANY.address} · {PMS_COMPANY.email}
      </p>
    </PrintSheet>
  );
}
