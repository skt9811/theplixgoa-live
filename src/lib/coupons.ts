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
  { code: "PLIX5", type: "percentage", value: 5, description: "5% off — newsletter subscriber exclusive" },
];

export type CouponValidationResult =
  | { valid: true; code: string; description: string; discountAmount: number; source: "static" | "db" | "offline" }
  | { valid: false; error: string };

type DbCouponRow = {
  code: string;
  discount_amount: number;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
};

// The 20 seeded single-use codes follow a fixed, deterministic naming
// pattern (amount + letter). If the live is_active/current_uses check
// can't complete in time — table not migrated yet, connection drop — we
// can still recognize a genuine code by shape and let the guest through
// rather than hard-fail the whole coupon feature on a network hiccup.
// This can't know real-time usage, so redeemCoupon() still attempts the
// real DB call afterward; if that also fails, the increment is just lost,
// same best-effort tradeoff as the rest of this table's design.
const OFFLINE_CODE_PATTERN = /^PLIX(500|1000|1500|2000)[A-E]$/;
const DB_QUERY_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

async function fetchDbCoupon(code: string): Promise<{ ok: true; row: DbCouponRow | null } | { ok: false }> {
  try {
    const { data, error } = await supabase
      .from("coupons")
      .select("code, discount_amount, max_uses, current_uses, is_active")
      .eq("code", code)
      .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, row: data as DbCouponRow | null };
  } catch {
    return { ok: false };
  }
}

/**
 * Validates a coupon code against a room-rate subtotal (pre-tax, pre-discount)
 * and returns the rupee discount it earns. Checks the static promo list
 * first (no network round trip), then the Supabase-backed single-use
 * `coupons` table (PLIX500A..PLIX2000E) — with a 2.5s timeout, past which
 * it falls back to recognizing the code by its known naming pattern rather
 * than blocking checkout on a slow/unreachable database. This only reads —
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

  const dbResult = await withTimeout(fetchDbCoupon(code), DB_QUERY_TIMEOUT_MS, { ok: false } as const);

  if (dbResult.ok) {
    // A clean, on-time answer from Supabase is authoritative — trust it
    // completely, including "this code doesn't exist" or "already used".
    const row = dbResult.row;
    if (!row) return { valid: false, error: "Invalid coupon code." };
    if (!row.is_active || row.current_uses >= row.max_uses) {
      return { valid: false, error: "This coupon has already been used or is no longer active." };
    }
    const discountAmount = Math.min(Number(row.discount_amount), subtotal);
    return {
      valid: true,
      code: row.code,
      description: `₹${Number(row.discount_amount).toLocaleString("en-IN")} off`,
      discountAmount,
      source: "db",
    };
  }

  // Network failure or timeout — fall back to the known code shape.
  const patternMatch = code.match(OFFLINE_CODE_PATTERN);
  if (patternMatch) {
    const amount = Number(patternMatch[1]);
    return {
      valid: true,
      code,
      description: `₹${amount.toLocaleString("en-IN")} off`,
      discountAmount: Math.min(amount, subtotal),
      source: "offline",
    };
  }

  return { valid: false, error: "Invalid coupon code." };
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
export async function redeemCoupon(code: string, source: "static" | "db" | "offline"): Promise<void> {
  if (source === "static") return;
  try {
    await supabase.rpc("redeem_coupon", { p_code: code.trim().toUpperCase() });
  } catch {
    // best-effort bookkeeping only
  }
}
