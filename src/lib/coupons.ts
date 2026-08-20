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
  | { valid: true; coupon: Coupon; discountAmount: number }
  | { valid: false; error: string };

/** Validates a coupon code against a room-rate subtotal (pre-tax, pre-discount) and returns the rupee discount it earns. */
export function validateCoupon(rawCode: string, subtotal: number): CouponValidationResult {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { valid: false, error: "Enter a coupon code." };

  const coupon = COUPONS.find((c) => c.code === code);
  if (!coupon) return { valid: false, error: "Invalid coupon code." };

  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
    return {
      valid: false,
      error: `This code needs a minimum booking value of ₹${coupon.minSubtotal.toLocaleString("en-IN")}.`,
    };
  }

  const rawDiscount = coupon.type === "percentage" ? subtotal * (coupon.value / 100) : coupon.value;
  const discountAmount = Math.min(rawDiscount, subtotal);

  return { valid: true, coupon, discountAmount };
}
