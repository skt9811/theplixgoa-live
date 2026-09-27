// Server-only. Short-lived, booking-scoped tokens for the Stay Voucher PDF,
// used only as a fallback when the app can't save the PDF through the native
// Filesystem/Share plugins (see pms-native-file.ts) — an older installed APK
// that predates those plugins being linked in, for instance. That fallback
// opens the PDF in the system browser, which is a separate, unauthenticated
// context from the app's own WebView and never carries its PMS session
// cookie. A token minted here (only for an actor who already had access to
// the booking's property) stands in for that cookie for exactly one booking,
// for a few minutes — not a general-purpose bypass of the PMS session.
import { jwtVerify, SignJWT } from "jose";

const TOKEN_TTL_SECONDS = 5 * 60;

function secret(): Uint8Array {
  const s = process.env["AUTH_SECRET"];
  if (!s) throw new Error("AUTH_SECRET not configured on the server.");
  return new TextEncoder().encode(s);
}

export async function signVoucherToken(bookingId: string): Promise<string> {
  return new SignJWT({ purpose: "voucher-pdf" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(bookingId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secret());
}

/** Returns the booking id the token was minted for, or null if it's missing, expired, or doesn't match `bookingId`. */
export async function verifyVoucherToken(token: string, bookingId: string): Promise<boolean> {
  if (!token || !bookingId) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload["purpose"] === "voucher-pdf" && payload.sub === bookingId;
  } catch {
    return false;
  }
}
