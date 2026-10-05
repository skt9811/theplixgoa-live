// Guest phone numbers come in as whatever the booking form or the website
// checkout stored: "9876543210", "+91 98765 43210", "0091-98765...". These
// helpers normalise them for display, tel: links and wa.me links. A bare
// 10-digit number is treated as Indian, matching the rest of the app.
export function guestPhoneDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits.length >= 8 ? digits : null;
}

export function formatGuestPhone(raw: string | null | undefined): string | null {
  const full = guestPhoneDigits(raw);
  if (!full) return null;
  if (full.startsWith("91") && full.length === 12) {
    return `+91 ${full.slice(2, 7)} ${full.slice(7)}`;
  }
  return `+${full}`;
}
