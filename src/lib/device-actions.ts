// Handing off to the device: dialer, and anything else that leaves the app.
// Client-side only.

/**
 * Turns a stored phone number into a dialable E.164-style string, or null when
 * it can't be dialed. A bare 10-digit number and a 12-digit "91…" number are
 * treated as Indian, matching guest-phone.ts. "00" is the international prefix.
 */
export function dialablePhone(raw: string | null | undefined): string | null {
  let n = (raw ?? "").replace(/[^0-9+]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  const digits = n.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && !n.startsWith("+")) return `+${digits}`;
  if (digits.length < 7 || digits.length > 15) return null;
  return n.startsWith("+") ? `+${digits}` : digits;
}

/**
 * Opens the phone dialer. Returns false when the number can't be dialed, so the
 * caller can say so instead of doing nothing.
 *
 * This assigns the location rather than calling window.open(..., "_system").
 * Capacitor's Android WebView (Bridge.launchIntent) sends any non-http navigation,
 * including tel:, to the system through Intent.ACTION_VIEW. Capacitor does not
 * implement a "_system" window target. On Android 11+ the dialer intent only
 * resolves when the app declares a <queries> entry for the tel scheme.
 */
export function triggerPhoneCall(phone: string | null | undefined): boolean {
  const tel = dialablePhone(phone);
  if (!tel) return false;
  window.location.href = `tel:${tel}`;
  return true;
}
