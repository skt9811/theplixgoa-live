// Content shared by the on-screen Stay Voucher, its PDF and the email.
import { PROPERTIES } from "@/lib/plix";
import { PMS_COMPANY } from "@/lib/pms-company";
import { DEFAULT_CHECK_IN_TIME, DEFAULT_CHECK_OUT_TIME, getPropertyPmsConfig } from "@/lib/pms-properties-config";

export const HOUSE_RULES = [
  "Swimming pool timings: 8:00 AM to 10:00 PM. Swimwear is mandatory in the pool.",
  "No loud music after 10:00 PM.",
  "A valid government-issued photo ID (Aadhaar, Passport, Driving Licence or PAN) is required from every guest at check-in.",
  "A refundable security deposit is collected at check-in (cash or UPI) and returned in full within 48 hours of check-out, subject to no damage to the property.",
];

export type VoucherDetails = {
  propertyName: string;
  /** Just the locality (e.g. "Vagator"), for the "Harbor Court, Vagator"
   * header line — distinct from `address`, which is the fuller postal line. */
  location: string;
  address: string;
  mapUrl: string | null;
  hasCaretaker: boolean;
  caretakerLabel: string;
  caretakerPhone: string;
  conciergePhones: readonly string[];
  contactLine: string;
};

/**
 * Default property rules for the confirmation email's "Property Rules"
 * section — the same ones already shown on every Stay Voucher. No property
 * has its own distinct list on file yet; add one to PMS_PROPERTIES_CONFIG's
 * `rules` field when the business supplies it, and it overrides this.
 */
// Deliberately no security-deposit rule here: whether one applies is
// property-specific (PropertyPmsConfig.securityDeposit) and already stated as
// its own Payment Details line when it does — repeating it here would mention
// it for every property, including the ones that must have no deposit text at all.
export const DEFAULT_PROPERTY_RULES: { title: string; description: string }[] = [
  { title: "Swimming Pool Timing", description: "8:00 AM to 10:00 PM. Swimwear is mandatory in the pool." },
  { title: "Noise", description: "No loud music after 10:00 PM." },
  { title: "ID at Check-in", description: "A valid government photo ID (Aadhaar, Passport, Driving Licence or PAN) is required from every guest." },
];

export const DEFAULT_CANCELLATION_POLICY =
  "This is a non-cancellable booking. In case of cancellation, no refund will be initiated. Modification of booking dates is not permitted and, in certain exceptional circumstances, may be considered subject to availability.";

export function voucherDetails(propertyId: string): VoucherDetails {
  const property = PROPERTIES.find((p) => p.slug === propertyId);
  const config = getPropertyPmsConfig(propertyId, property?.name.split(" - ")[0]);
  const caretakerPhone = config.caretakerPhone.trim();
  const hasCaretaker = caretakerPhone.replace(/\D/g, "").length >= 10;
  const caretakerName = config.caretakerName.trim();
  const showName = caretakerName !== "" && !/\(tbd\)/i.test(caretakerName);
  return {
    propertyName: config.name,
    location: property?.location ?? "Goa",
    address: config.address.trim() || (property ? `${property.location}, ${property.region}` : "Goa"),
    mapUrl: config.mapsUrl.trim() || property?.google_maps_url || null,
    hasCaretaker,
    caretakerLabel: showName ? caretakerName : "Caretaker",
    caretakerPhone,
    conciergePhones: PMS_COMPANY.phones,
    contactLine: hasCaretaker ? `${showName ? caretakerName : "Caretaker"}: ${caretakerPhone}` : `Concierge: ${PMS_COMPANY.phones.join(" / ")}`,
  };
}

// Only used when a booking has no per-room breakdown of its own
// (room_allocations/room_details) — one descriptive label for the whole
// stay instead of the generic "Room" the voucher used to fall back to.
// Only Harbor Court's real room-type name is confirmed by the business;
// every other property uses its actual bedroom count instead of a guessed
// brand name (e.g. "Luxury Suite") that has no source anywhere in this
// codebase or from the business.
const NAMED_ROOM_CATEGORY: Record<string, string> = {
  "harbor-court": "Deluxe Room",
};

export function defaultRoomCategory(propertyId: string, roomsCount: number): string {
  const named = NAMED_ROOM_CATEGORY[propertyId];
  if (named) return roomsCount > 1 ? `${roomsCount} x ${named}` : named;
  const property = PROPERTIES.find((p) => p.slug === propertyId);
  return property?.bedrooms ? `${property.bedrooms}BHK Private Villa with Pool` : "Villa";
}

function escHtml(v: string): string {
  return v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function fmtEmailDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function inr(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

export type ConfirmationEmailInput = {
  propertyId: string;
  referenceNumber: string;
  guestFirstName: string;
  guestFullName: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  bookingType: string;
  roomCount: number;
  guestCount: number;
  totalAmount: number;
  advancePaid: number;
  balanceAmount: number;
};

export type ConfirmationEmail = { subject: string; html: string; text: string };

/**
 * The guest-facing booking confirmation — one builder shared by the
 * website's auto-send (confirmBookingAndSendEmails) and the PMS staff's
 * "Email voucher" action, so every booking gets the same structure. Property
 * rules and the cancellation policy fall back to the defaults above; a
 * property's own values (once the business supplies them) go in
 * PMS_PROPERTIES_CONFIG. The "Contact Person" is the property's caretaker
 * when one is on file, otherwise the central concierge number — there's no
 * separate per-property "manager" on file for any property yet.
 */
export function buildBookingConfirmationEmail(b: ConfirmationEmailInput): ConfirmationEmail {
  const property = PROPERTIES.find((p) => p.slug === b.propertyId);
  const config = getPropertyPmsConfig(b.propertyId, property?.name.split(" - ")[0]);
  const details = voucherDetails(b.propertyId);
  const rules = config.rules && config.rules.length > 0 ? config.rules : DEFAULT_PROPERTY_RULES;
  const cancellationPolicy = config.cancellationPolicy?.trim() || DEFAULT_CANCELLATION_POLICY;
  const checkInTime = config.checkInTime?.trim() || DEFAULT_CHECK_IN_TIME;
  const checkOutTime = config.checkOutTime?.trim() || DEFAULT_CHECK_OUT_TIME;
  const contactName = details.hasCaretaker ? details.caretakerLabel : "Property Manager";
  const contactPhone = details.hasCaretaker ? details.caretakerPhone : PMS_COMPANY.phones[0];
  const guestFirstName = escHtml(b.guestFirstName);
  const guestFullName = escHtml(b.guestFullName);
  const guestPhone = escHtml(b.guestPhone);
  const propertyLine = `${details.propertyName}, ${details.location}`;
  const securityDeposit = config.securityDeposit && config.securityDeposit > 0 ? config.securityDeposit : null;
  const depositLineHtml =
    securityDeposit !== null
      ? `<li><b>Security Deposit:</b> ₹${inr(securityDeposit)} (Refundable at checkout subject to property inspection)</li>`
      : "";
  const depositLineText =
    securityDeposit !== null
      ? `\n- Security Deposit: ₹${inr(securityDeposit)} (Refundable at checkout subject to property inspection)`
      : "";

  const subject = `Booking Confirmation - ${details.propertyName} (${b.referenceNumber})`;

  const rulesHtml = rules.map((r) => `<li><b>${escHtml(r.title)}:</b> ${escHtml(r.description)}</li>`).join("");
  const rulesText = rules.map((r) => `- ${r.title}: ${r.description}`).join("\n");

  const html = `<!DOCTYPE html><html><body style="font-family:Manrope,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a2238">
<h1 style="color:#0f766e;font-size:22px;margin-bottom:4px">Booking Confirmation</h1>
<p>Hi ${guestFirstName},</p>
<p>Your booking is confirmed at <strong>${propertyLine}</strong>. Please find the booking details below:</p>
<h2 style="font-size:16px;color:#1a2238;margin-top:24px">Booking Details</h2>
<ul style="padding-left:18px;line-height:1.7;margin:8px 0">
<li><b>Guest Name:</b> ${guestFullName}</li>
<li><b>Contact No.:</b> ${guestPhone}</li>
<li><b>Check-in Date:</b> ${fmtEmailDate(b.checkIn)}</li>
<li><b>Check-out Date:</b> ${fmtEmailDate(b.checkOut)}</li>
<li><b>Booking Type:</b> ${escHtml(b.bookingType)}</li>
<li><b>Property:</b> ${propertyLine}</li>
<li><b>No. of Rooms:</b> ${b.roomCount}</li>
<li><b>Guests:</b> ${b.guestCount}</li>
</ul>
<h2 style="font-size:16px;color:#1a2238;margin-top:24px">Payment Details</h2>
<ul style="padding-left:18px;line-height:1.7;margin:8px 0">
<li><b>Total Amount:</b> ₹${inr(b.totalAmount)}</li>
<li><b>Advance Paid:</b> ₹${inr(b.advancePaid)}</li>
<li><b>Balance Amount:</b> ₹${inr(b.balanceAmount)}</li>
<li><b>Balance Payment:</b> To be paid at the time of check-in</li>
${depositLineHtml}
</ul>
<h2 style="font-size:16px;color:#1a2238;margin-top:24px">Check-in &amp; Check-out</h2>
<ul style="padding-left:18px;line-height:1.7;margin:8px 0">
<li><b>Check-in Time:</b> ${checkInTime}</li>
<li><b>Check-out Time:</b> ${checkOutTime}</li>
</ul>
<h2 style="font-size:16px;color:#1a2238;margin-top:24px">Property Rules</h2>
<ul style="padding-left:18px;line-height:1.7;margin:8px 0">${rulesHtml}</ul>
<h2 style="font-size:16px;color:#1a2238;margin-top:24px">Cancellation &amp; Modification Policy</h2>
<p>${escHtml(cancellationPolicy)}</p>
<p style="margin-top:20px;font-weight:600">${propertyLine}</p>
<h2 style="font-size:16px;color:#1a2238;margin-top:24px">Contact Person</h2>
<p>${escHtml(contactName)}<br/>📞 ${escHtml(contactPhone)}</p>
<p style="margin-top:24px;color:#0f766e;font-weight:600">Thanks &amp; Regards,<br/>The Plix Hospitality</p>
</body></html>`;

  const text = `Booking Confirmation

Hi ${b.guestFirstName},

Your booking is confirmed at ${propertyLine}. Please find the booking details below:

Booking Details
- Guest Name: ${b.guestFullName}
- Contact No.: ${b.guestPhone}
- Check-in Date: ${fmtEmailDate(b.checkIn)}
- Check-out Date: ${fmtEmailDate(b.checkOut)}
- Booking Type: ${b.bookingType}
- Property: ${propertyLine}
- No. of Rooms: ${b.roomCount}
- Guests: ${b.guestCount}

Payment Details
- Total Amount: ₹${inr(b.totalAmount)}
- Advance Paid: ₹${inr(b.advancePaid)}
- Balance Amount: ₹${inr(b.balanceAmount)}
- Balance Payment: To be paid at the time of check-in${depositLineText}

Check-in & Check-out
- Check-in Time: ${checkInTime}
- Check-out Time: ${checkOutTime}

Property Rules
${rulesText}

Cancellation & Modification Policy
${cancellationPolicy}

${propertyLine}

Contact Person
${contactName}
${contactPhone}

Thanks & Regards,
The Plix Hospitality`;

  return { subject, html, text };
}
