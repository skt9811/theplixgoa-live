import { useState } from "react";
import { toast } from "sonner";
import { Download, Mail, MessageCircle, Share2 } from "lucide-react";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { PMS_COMPANY } from "@/lib/pms-company";
import { getPropertyPmsConfig } from "@/lib/pms-properties-config";
import { defaultRoomCategory } from "@/lib/pms-voucher-content";
import { channelLabel, fmtDate, pms, waLink, type PmsBooking, type RoomAllocation } from "@/lib/pms-client";
import { isNativeApp, isPluginMissingError, nativeFileErrorMessage, openPdfNative, openVoucherInSystemBrowser, sharePdfNative } from "@/lib/pms-native-file";
import { PrintSheet } from "@/components/pms/print-sheet";
import logo from "@/assets/plix-voucher-logo.png";

// Every stay is guaranteed at least one occupancy row on the voucher, whether
// or not staff filled in a per-room breakdown in the booking/edit form.
function occupancyRows(booking: PmsBooking): RoomAllocation[] {
  if (booking.room_allocations.length > 0) return booking.room_allocations;
  return [
    {
      category: defaultRoomCategory(booking.property_id, booking.rooms),
      adults: booking.adults,
      extraBed: 0,
      children: booking.children,
      infants: 0,
      mealPlan: "Room Only",
      rate: booking.total,
    },
  ];
}

const CANCELLATION_POLICY = "Advance paid is non-refundable. Any date change is subject to availability and must be requested at least 48 hours before check-in.";

export function StayVoucherModal({ booking, onClose }: { booking: PmsBooking; onClose: () => void }) {
  const [emailTo, setEmailTo] = useState(booking.guest_email ?? "");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sharingNative, setSharingNative] = useState(false);
  const pdfHref = `/api/pms/vouchers/pdf?booking=${booking.id}`;
  const voucherFileName = `Stay-Voucher-${booking.ref}.pdf`;

  async function runNativePdfAction(action: () => Promise<void>, setBusy: (v: boolean) => void) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      if (isPluginMissingError(err)) {
        // This install predates the Filesystem/FileOpener/Share plugins
        // being linked in — fall back to a signed link opened in the system
        // browser rather than dead-ending on an "update the app" message.
        toast.message(nativeFileErrorMessage(err));
        try {
          await openVoucherInSystemBrowser(booking.id);
        } catch {
          toast.error("Could not open the voucher. Please try again.");
        }
      } else {
        toast.error(nativeFileErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  // Opens straight in an installed PDF viewer (Android's ACTION_VIEW "Open
  // with" chooser) — what a plain "Open PDF" tap should do, distinct from
  // explicitly sharing the file below.
  async function openNative() {
    await runNativePdfAction(() => openPdfNative(pdfHref, voucherFileName), setDownloading);
  }

  async function shareNative() {
    await runNativePdfAction(() => sharePdfNative(pdfHref, voucherFileName, "Stay Voucher"), setSharingNative);
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
  const caretakerPhone = config.caretakerPhone.trim();
  const hasCaretaker = caretakerPhone.replace(/\D/g, "").length >= 10;

  const rows = occupancyRows(booking);
  const sourceType = booking.source === "online" ? "Online" : "Offline / Manual";
  const balanceDue = Math.max(0, Math.round((booking.total - booking.advance) * 100) / 100);

  const guestDetailRows: [string, string][] = [
    ["Guest Name", booking.guest_name],
    ["Guest Mobile", booking.guest_phone || "—"],
    ["Special Note", booking.notes || "—"],
  ];
  const bookingDetailRows: [string, string][] = [
    ["Check In Date", fmtDate(booking.check_in)],
    ["Check Out Date", fmtDate(booking.check_out)],
    ["Number Of Nights", String(booking.nights)],
    ["Number Of Rooms", String(rows.length)],
    ["Total Amount", `${formatINR(booking.total)}/-`],
    ["Created By", booking.created_by || "—"],
  ];
  const detailRows = Array.from({ length: Math.max(guestDetailRows.length, bookingDetailRows.length) }, (_, i) => ({
    leftLabel: guestDetailRows[i]?.[0] ?? "",
    leftValue: guestDetailRows[i]?.[1] ?? "",
    rightLabel: bookingDetailRows[i]?.[0] ?? "",
    rightValue: bookingDetailRows[i]?.[1] ?? "",
  }));

  const message = [
    `Hello ${booking.guest_name}, greetings from ${PMS_COMPANY.brand}!`,
    `Your stay at ${propertyName} is ${booking.status === "confirmed" ? "confirmed" : "reserved"}.`,
    "",
    `Check-in: ${fmtDate(booking.check_in)} (from 2:00 PM)`,
    `Check-out: ${fmtDate(booking.check_out)} (by 11:00 AM)`,
    `Guests: ${booking.adults} adult${booking.adults === 1 ? "" : "s"}${booking.children ? `, ${booking.children} child${booking.children === 1 ? "" : "ren"}` : ""}`,
    "",
    `Address: ${address}`,
    hasCaretaker ? `Caretaker: ${caretakerPhone}` : `Concierge: ${PMS_COMPANY.phones.join(" / ")}`,
    "",
    "We look forward to hosting you!",
  ].join("\n");

  const digits = (booking.guest_phone ?? "").replace(/\D/g, "");
  const shareUrl = digits ? `${waLink(booking.guest_phone!)}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <PrintSheet
      title="Booking Confirmation"
      docTitle={`Stay-Voucher-${booking.ref}`}
      pdfHref={pdfHref}
      onClose={onClose}
      actions={
        <>
        {isNativeApp() ? (
          <>
            <button
              type="button"
              onClick={() => void openNative()}
              disabled={downloading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Download className="size-4" aria-hidden /> {downloading ? "Preparing..." : "Open PDF"}
            </button>
            <button
              type="button"
              onClick={() => void shareNative()}
              disabled={sharingNative}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Share2 className="size-4" aria-hidden /> {sharingNative ? "Preparing..." : "Share PDF"}
            </button>
          </>
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
      {/* A. Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-emerald-700 pb-4">
        <div>
          <img src={logo} alt={PMS_COMPANY.brand} className="h-16 w-auto object-contain" />
          <p className="mt-1.5 text-sm font-semibold text-slate-800">
            {propertyName}{property?.location ? `, ${property.location}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-emerald-800">Booking Confirmation</p>
          <p className="mt-1 text-xs text-slate-600">Booking Date: {fmtDate(booking.created_at.slice(0, 10))}</p>
          <p className="text-xs text-slate-600">Booking ID: #{booking.ref}</p>
          <p className="text-xs text-slate-600">Booking Source: {channelLabel(booking.channel)}</p>
          <p className="text-xs text-slate-600">Source Type: {sourceType}</p>
        </div>
      </div>

      {/* B. Salutation */}
      <p className="mt-5 text-sm">
        Dear <span className="font-semibold">{booking.guest_name}</span>,
      </p>
      <p className="mt-1.5 text-sm text-slate-700">
        Thank you for making a reservation with us for your upcoming holiday. We are pleased to confirm your booking based on below given booking details.
      </p>

      {/* C. Master details — one grid table, guest columns left / booking
          columns right, matching the Booking Summary table's own border
          style below rather than the free-floating label/value pairs this
          used to be. Guest Email is deliberately not one of these rows. */}
      <section className="pms-avoid-break mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[480px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2" colSpan={2}>Guest Details</th>
              <th className="border-b border-l border-slate-200 px-3 py-2" colSpan={2}>Booking Details</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-slate-500">{r.leftLabel}</td>
                <td className="border-r border-slate-100 px-3 py-2 font-medium">{r.leftValue}</td>
                <td className="px-3 py-2 text-slate-500">{r.rightLabel}</td>
                <td className="px-3 py-2 font-medium">{r.rightValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* D. Booking summary table */}
      <section className="pms-avoid-break mt-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Booking Summary</h3>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2">Sr No</th>
                <th className="border-b border-slate-200 px-3 py-2">Room Category</th>
                <th className="border-b border-slate-200 px-3 py-2">Adult + E Bed</th>
                <th className="border-b border-slate-200 px-3 py-2">Child + Infant</th>
                <th className="border-b border-slate-200 px-3 py-2">Meal Plan</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{r.category || "Room"}</td>
                  <td className="px-3 py-2">{r.adults} + {r.extraBed}</td>
                  <td className="px-3 py-2">{r.children} + {r.infants}</td>
                  <td className="px-3 py-2">{r.mealPlan}</td>
                  <td className="px-3 py-2 text-right">{r.rate ? `${formatINR(r.rate)}/-` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex justify-end">
          <div className="grid gap-1 text-right text-sm">
            <p>Grand Total: <span className="font-bold">{formatINR(booking.total)}/-</span></p>
            <p>Paid / Advance Amount: <span className="font-bold text-emerald-700">{formatINR(booking.advance)}/-</span></p>
            <p>
              Balance Due:{" "}
              <span className={`font-bold ${balanceDue > 0 ? "text-red-600" : "text-emerald-700"}`}>
                {balanceDue > 0 ? `${formatINR(balanceDue)}/-` : "Fully Paid"}
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* E. Policies & declaration */}
      <section className="pms-avoid-break mt-5 rounded-xl border border-slate-200 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Cancellation Policy</h3>
        <p className="mt-1 text-sm text-slate-700">{CANCELLATION_POLICY}</p>
        <div className="mt-4 border-t border-dashed border-slate-200 pt-3 text-center text-xs text-slate-500">
          <p>Please provide Govt. Approved Photo Identity Card of All Adult person at the time of check in.</p>
          <p className="mt-0.5">This is computer generated reservation and does not require any signature.</p>
        </div>
      </section>

      {/* F. Footer */}
      <div className="mt-5 grid gap-4 border-t border-slate-200 pt-4 text-xs text-slate-600 sm:grid-cols-2">
        <div className="grid gap-0.5">
          <p className="font-semibold text-slate-800">Thanks &amp; Regards,</p>
          <p>Reservation Manager</p>
          <p>Add: {address}</p>
          {hasCaretaker && <p>For Any Clarification Contact Mobile: {caretakerPhone}</p>}
          <p>Landline / Support: {PMS_COMPANY.phones.join(" / ")}</p>
          <p>Email: {PMS_COMPANY.email}</p>
          <p>Website: {PMS_COMPANY.website.replace("https://", "")}</p>
          <p>GST Number: {PMS_COMPANY.gstin}</p>
        </div>
        <div className="grid gap-0.5 sm:text-right">
          <p>Check In Time: <span className="font-semibold text-slate-800">14:00 Hrs</span></p>
          <p>Check Out Time: <span className="font-bold text-red-600">11:00 Hrs</span></p>
        </div>
      </div>

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
    </PrintSheet>
  );
}
