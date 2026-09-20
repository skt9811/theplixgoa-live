// createServerFn splits the `.handler(...)` body into a server-side handler
// bundle — the Neon connection string and Razorpay secret key never reach
// the client bundle. This file itself IS imported by booking.ts (client-safe,
// used by checkout-modal.tsx/properties.$slug.tsx/admin.tsx/account.tsx/
// booking-success.tsx), so it must never import `postgres` directly — the
// actual order-creation/DB logic lives in razorpay-order-core.server.ts
// instead; see that file's header comment.
//
// No demo/simulation fallback: missing Razorpay credentials, a failed
// Razorpay API call, or a failed booking insert all throw — the client
// (booking.ts's createRazorpayOrder) surfaces the real error to the guest
// instead of silently proceeding with a fake order that isn't backed by a
// real payment or a real booking row.
import { createServerFn } from "@tanstack/react-start";
import { createRazorpayOrderCore, getAuthenticatedUserId, type OrderInput, type CreateRazorpayOrderResult } from "@/lib/razorpay-order-core.server";

export type { OrderInput, CreateRazorpayOrderResult } from "@/lib/razorpay-order-core.server";

export function isOrderInput(data: unknown): data is OrderInput {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d["property_id"] === "string" &&
    typeof d["property_name"] === "string" &&
    typeof d["property_location"] === "string" &&
    typeof d["guest_name"] === "string" &&
    typeof d["guest_email"] === "string" &&
    typeof d["guest_mobile"] === "string" &&
    typeof d["check_in"] === "string" &&
    typeof d["check_out"] === "string" &&
    typeof d["guests"] === "number" &&
    typeof d["nights"] === "number" &&
    typeof d["subtotal"] === "number" &&
    typeof d["taxes"] === "number" &&
    typeof d["total_amount"] === "number" &&
    (d["rooms"] === undefined || typeof d["rooms"] === "number")
  );
}

// Field-level diagnostic for a live checkout payload that fails the shape
// check — the guest-facing checkout form can legitimately produce empty
// strings (e.g. an optional field left blank) that still pass typeof checks,
// but a genuinely missing/wrong-typed field here throws before a booking row
// or Razorpay order ever gets created, so this needs to be visible from
// production logs rather than a generic "missing required booking fields".
export function describeOrderInputShape(data: unknown): string {
  if (!data || typeof data !== "object") return `payload is not an object (got ${typeof data})`;
  const d = data as Record<string, unknown>;
  const stringFields = [
    "property_id", "property_name", "property_location",
    "guest_name", "guest_email", "guest_mobile", "check_in", "check_out",
  ] as const;
  const numberFields = ["guests", "nights", "subtotal", "taxes", "total_amount"] as const;
  const parts = [
    ...stringFields.map((f) => `${f}=${typeof d[f] === "string" ? "ok" : JSON.stringify(d[f])}`),
    ...numberFields.map((f) => `${f}=${typeof d[f] === "number" ? "ok" : JSON.stringify(d[f])}`),
  ];
  return parts.join(", ");
}

export const createRazorpayOrderServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isOrderInput(data)) {
      console.error("[createRazorpayOrderServerFn] payload failed validation:", describeOrderInputShape(data));
      throw new Error("Missing required booking fields");
    }
    return data;
  })
  .handler(async ({ data }): Promise<CreateRazorpayOrderResult> => {
    const userId = await getAuthenticatedUserId();
    return createRazorpayOrderCore(data, userId);
  });
