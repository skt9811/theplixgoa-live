import { supabase } from "@/lib/rates";

export type CouponType = "percentage" | "flat";

export type Coupon = {
  code: string;
  type: CouponType;
  value: number; // percentage points (0-100) for "percentage", rupees for "flat"
  description: string;
  minSubtotal?: number;
};

export const COUPONS: Coupon[] = [
  { code: "PLIX10", type: "percentage", value: 10, description: "10% off your stay" },
  { code: "WELCOME500", type: "flat", value: 500, description: "₹500 off for new guests", minSubtotal: 2000 },
  { code: "GOAVIBES", type: "percentage", value: 15, description: "15% off — Goa vibes special" },
];

export type CouponValidationResult =
  | { valid: true; code: string; description: string; discountAmount: number; source: "static" | "db" }
  | { valid: false; error: string };

/**
 * Validates a coupon code against a room-rate subtotal (pre-tax, pre-discount)
 * and returns the rupee discount it earns. Checks the static promo list
 * first (no network round trip), then falls back to the Supabase-backed
 * single-use `coupons` table (PLIX500A..PLIX2000E). This only reads —
 * usage is only ever incremented by redeemCoupon() after a booking
 * actually completes, via the redeem_coupon() DB function.
 */
export async function validateCoupon(rawCode: string, subtotal: number): Promise<CouponValidationResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { valid: false, error: "Enter a coupon code." };

  const staticCoupon = COUPONS.find((c) => c.code === code);
  if (staticCoupon) {
    if (staticCoupon.minSubtotal && subtotal < staticCoupon.minSubtotal) {
      return {
        valid: false,
        error: `This code needs a minimum booking value of ₹${staticCoupon.minSubtotal.toLocaleString("en-IN")}.`,
      };
    }
    const rawDiscount =
      staticCoupon.type === "percentage" ? subtotal * (staticCoupon.value / 100) : staticCoupon.value;
    return {
      valid: true,
      code: staticCoupon.code,
      description: staticCoupon.description,
      discountAmount: Math.min(rawDiscount, subtotal),
      source: "static",
    };
  }

  try {
    const { data, error } = await supabase
      .from("coupons")
      .select("code, discount_amount, max_uses, current_uses, is_active")
      .eq("code", code)
      .maybeSingle();

    if (error || !data) return { valid: false, error: "Invalid coupon code." };
    if (!data.is_active || data.current_uses >= data.max_uses) {
      return { valid: false, error: "This coupon has already been used or is no longer active." };
    }

    const discountAmount = Math.min(Number(data.discount_amount), subtotal);
    return {
      valid: true,
      code: data.code,
      description: `₹${Number(data.discount_amount).toLocaleString("en-IN")} off`,
      discountAmount,
      source: "db",
    };
  } catch {
    return { valid: false, error: "Invalid coupon code." };
  }
}

/**
 * Marks a single-use DB-backed coupon as redeemed. Call this once a booking
 * has actually succeeded, not at Apply-time — a guest can apply a code and
 * abandon checkout without spending it. No-ops for static coupons, which
 * don't track usage. Best-effort: if this loses a race to another booking
 * redeeming the same last-remaining use, the already-completed payment for
 * this guest still reflected the discount — there's no way to claw that
 * back client-side, so failure here is intentionally silent.
 */
export async function redeemCoupon(code: string, source: "static" | "db"): Promise<void> {
  if (source !== "db") return;
  try {
    await supabase.rpc("redeem_coupon", { p_code: code.trim().toUpperCase() });
  } catch {
    // best-effort bookkeeping only
  }
}
