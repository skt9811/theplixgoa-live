import { useNavigate } from "@tanstack/react-router";
import { CircleCheck as CheckCircle2, Loader as Loader2, ShieldCheck, Tag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthModal } from "@/components/plix/auth-modal";
import {
  createRazorpayOrder,
  openRazorpayCheckout,
  sendBookingConfirmationEmails,
  updateBookingPayment,
  type CreateOrderResponse,
} from "@/lib/booking";
import { redeemCoupon, validateCoupon, type CouponValidationResult } from "@/lib/coupons";
import { getGuestUser, onGuestAuthChange, type GuestUser } from "@/lib/guest-auth";
import { GOOGLE_ADS_ACCOUNT_ID, trackConversion } from "@/lib/gtag";
import { formatINR, gstLabel, type Property } from "@/lib/plix";
import { autoBlockDatesForStay, isMultiRoomProperty, quoteWithDiscount } from "@/lib/rates";

type Props = {
  property: Property;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  rooms?: number;
  nightlyRates?: number[];
  /** A coupon already applied in the property page's booking widget — pre-filled and re-validated on mount. */
  initialCouponCode?: string;
  onClose: () => void;
};

type Status = "idle" | "creating_order" | "checkout_open" | "confirming" | "done" | "error";

export function CheckoutModal({
  property,
  checkIn,
  checkOut,
  guests,
  nights,
  rooms = 1,
  nightlyRates,
  initialCouponCode,
  onClose,
}: Props) {
  const navigate = useNavigate();

  const effectiveNightlyRates =
    nightlyRates && nightlyRates.length > 0
      ? nightlyRates
      : Array.from({ length: nights }, () => property.base_price);

  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResult | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const couponDiscount = appliedCoupon?.valid ? appliedCoupon.discountAmount : 0;

  const {
    subtotal: computedSubtotal,
    discountAmount,
    taxes: computedTaxes,
    total,
    rate: gstRate,
  } = quoteWithDiscount(effectiveNightlyRates, property.bedrooms, couponDiscount);

  const [form, setForm] = useState({ name: "", email: "", mobile: "" });
  const [status, setStatus] = useState<Status>("idle");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [guestUser, setGuestUser] = useState<GuestUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    setGuestUser(getGuestUser());
    return onGuestAuthChange(() => setGuestUser(getGuestUser()));
  }, []);

  useEffect(() => {
    if (!guestUser) return;
    setForm((f) => ({
      ...f,
      email: f.email || guestUser.email,
      name: f.name || guestUser.fullName || f.name,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestUser]);

  async function handleApplyCoupon() {
    setCouponChecking(true);
    const result = await validateCoupon(couponInput, computedSubtotal);
    setCouponChecking(false);
    setAppliedCoupon(result);
    if (result.valid) {
      toast.success(`✓ Applied ${formatINR(result.discountAmount)} discount`);
    } else {
      toast.error(result.error);
    }
  }

  // A coupon already applied on the property page carries into checkout —
  // pre-fill and silently re-validate it here (it's just a read, so it
  // doesn't spend a single-use code; only redeemCoupon() on payment success does).
  useEffect(() => {
    if (!initialCouponCode) return;
    setCouponInput(initialCouponCode);
    setCouponChecking(true);
    void validateCoupon(initialCouponCode, computedSubtotal).then((result) => {
      setCouponChecking(false);
      setAppliedCoupon(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCouponCode]);

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
  }

  const input =
    "mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40 min-h-[44px]";

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();

    if (!guestUser) {
      setAuthOpen(true);
      return;
    }

    await proceedToCheckout();
  }

  // Split out of handlePay so a successful sign-in/sign-up from the auth
  // modal can resume checkout immediately afterward, without requiring the
  // guest to press "Pay" a second time — the modal only opens because this
  // same form already passed its native `required` validation, so form.*
  // is already filled in by the time either caller reaches here.
  async function proceedToCheckout() {
    setStatus("creating_order");

    let order: CreateOrderResponse;
    try {
      order = await createRazorpayOrder({
        property,
        guestName: form.name,
        guestEmail: form.email,
        guestMobile: form.mobile,
        checkIn,
        checkOut,
        guests,
        nights,
        rooms,
        nightlyRates,
        couponCode: appliedCoupon?.valid ? appliedCoupon.code : undefined,
        discountAmount: appliedCoupon?.valid ? appliedCoupon.discountAmount : undefined,
      });
      setBookingId(order.booking_id);
    } catch (error) {
      // Order creation (createRazorpayOrderServerFn) failed — most commonly
      // missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET in the deployment (see
      // that function's own "[createRazorpayOrderServerFn] Razorpay
      // credentials not configured" server-side log), or a Razorpay API
      // error. Returning here means the popup is never opened — there is no
      // path from this catch block to new window.Razorpay(...).
      console.error("[RAZORPAY ORDER CREATION FAILED]", error);
      setStatus("error");
      const message = error instanceof Error ? error.message : "We couldn't start the checkout. Please try again or contact us.";
      toast.error(message);
      return;
    }

    setStatus("checkout_open");

    try {
      await openRazorpayCheckout({
        order,
        property,
        guestName: form.name,
        guestEmail: form.email,
        guestMobile: form.mobile,
        onSuccess: (result) => handlePaymentSuccess(order, result),
        onDismiss: () => {
          setStatus("idle");
          toast.error("Payment cancelled. Your booking was not completed.");
        },
      });
    } catch (error) {
      console.error("[Razorpay Init Error]:", error);
      setStatus("error");
      toast.error("Could not open Razorpay checkout. Please try again.");
    }
  }

  async function handlePaymentSuccess(
    order: CreateOrderResponse,
    result: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string },
  ) {
    setStatus("confirming");

    // Write payment details directly to the bookings table
    const paymentConfirmed = await updateBookingPayment(
      order.booking_id,
      result.razorpay_payment_id,
      result.razorpay_order_id,
      result.razorpay_signature,
    );

    // Guest + host confirmation emails — awaited, not fire-and-forget, so
    // the guest's "confirmed" state only shows once dispatch has actually
    // been attempted. This is the fast, client-triggered path; the Razorpay
    // webhook (razorpay-webhook.server.ts) fires independently as a
    // reliability backstop that doesn't depend on this browser tab staying
    // open. Both can legitimately run for the same booking —
    // confirmBookingAndSendEmails's own atomic confirmation_sent_at guard
    // is what prevents a double send, not anything here. A failure here
    // must never block or reverse the already-successful payment, so it's
    // reported (via the toast below) but never thrown.
    const emailResult = await sendBookingConfirmationEmails(order.booking_id, {
      razorpay_payment_id: result.razorpay_payment_id,
      razorpay_order_id: result.razorpay_order_id,
      razorpay_signature: result.razorpay_signature,
    });

    // Whole-villa properties: auto-block every night of the stay so the
    // property reads as fully unavailable. Fire-and-forget: this must never
    // block or reverse an already-successful payment.
    //
    // Multi-room resorts need no equivalent step here: availability is
    // computed live from bookings.payment_status = "paid" (see
    // lib/inventory.ts), so the row updateBookingPayment() just wrote is
    // already all the "deduction" that's needed — nothing separate to
    // decrement or store.
    if (!isMultiRoomProperty(property.id)) {
      void autoBlockDatesForStay(property.id, checkIn, checkOut);
    }

    trackConversion(GOOGLE_ADS_ACCOUNT_ID, {
      value: total,
      currency: "INR",
      transaction_id: order.booking_id,
    });

    if (!emailResult.ok) {
      console.error("[handlePaymentSuccess] confirmation email dispatch failed:", emailResult.error ?? emailResult.emailsFailed);
    }

    if (paymentConfirmed) {
      toast.success("Payment successful! Your booking is confirmed.");
    } else {
      toast.success("Payment received! We'll confirm your booking shortly.");
    }

    // Only spend a single-use coupon once the booking has actually gone
    // through — not at Apply-time, when the guest might still abandon checkout.
    if (appliedCoupon?.valid) {
      void redeemCoupon(appliedCoupon.code, appliedCoupon.source);
    }

    setStatus("done");
    setTimeout(() => {
      navigate({
        to: "/booking-success",
        search: {
          id: order.booking_id,
          property: property.name,
          location: property.location,
          checkin: checkIn,
          checkout: checkOut,
          guests: String(guests),
          nights: String(nights),
          total: String(total),
          payment: result.razorpay_payment_id,
        },
      });
    }, 1800);
  }

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-navy/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="animate-rise max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-6 shadow-lift sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Razorpay Secure Checkout
            </p>
            <h2 className="mt-1 text-xl font-semibold text-navy">{property.name}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close checkout"
            disabled={status === "confirming" || status === "creating_order"
              || status === "checkout_open"}
            className="rounded-lg p-1.5 hover:bg-accent disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </div>

        {status === "done" ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto size-14 text-primary" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold text-navy">Booking confirmed</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {form.name}, your stay at {property.name} is locked in for {nights} night
              {nights > 1 ? "s" : ""}. Redirecting to your confirmation page…
            </p>
            {bookingId && (
              <p className="mt-3 rounded-xl bg-muted px-4 py-2 font-mono text-xs text-muted-foreground">
                Booking ref: {bookingId.slice(0, 8).toUpperCase()}
              </p>
            )}
          </div>
        ) : status === "confirming" ? (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto size-10 animate-spin text-primary" aria-hidden />
            <h3 className="mt-4 text-lg font-semibold text-navy">Confirming your booking…</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Recording payment and saving your booking.
            </p>
          </div>
        ) : status === "checkout_open" ? (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto size-10 animate-spin text-primary" aria-hidden />
            <h3 className="mt-4 text-lg font-semibold text-navy">Checkout open</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Complete the payment in the Razorpay popup.
            </p>
          </div>
        ) : (
          <form onSubmit={handlePay} className="mt-5 grid gap-4">
            <div className="rounded-2xl bg-muted p-4 text-sm">
              {nightlyRates && nightlyRates.length > 0 ? (
                <div className="space-y-1">
                  {nightlyRates.map((r, i) => (
                    <div key={i} className="flex justify-between text-muted-foreground">
                      <span>Night {i + 1}</span>
                      <span className="text-foreground">{formatINR(r)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Row
                  label={`${formatINR(property.base_price)} × ${nights} night${nights === 1 ? "" : "s"}`}
                  value={formatINR(computedSubtotal)}
                />
              )}
              <div className="mt-2 border-t border-border pt-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Tag className="size-3.5 text-primary" aria-hidden />
                  Have a promo code?
                </p>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleApplyCoupon();
                      }
                    }}
                    disabled={Boolean(appliedCoupon?.valid) || couponChecking || status === "creating_order"}
                    placeholder="Enter code"
                    className="min-h-[38px] w-full rounded-lg border border-input bg-background px-3 py-2 text-xs uppercase tracking-wide outline-none transition-shadow focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
                  />
                  {appliedCoupon?.valid ? (
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      disabled={status === "creating_order"}
                      className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-60"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleApplyCoupon()}
                      disabled={!couponInput.trim() || couponChecking || status === "creating_order"}
                      className="shrink-0 rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-navy-foreground disabled:opacity-60"
                    >
                      {couponChecking ? <Loader2 className="size-3.5 animate-spin" /> : "Apply"}
                    </button>
                  )}
                </div>
                {appliedCoupon && !appliedCoupon.valid && (
                  <p className="mt-1.5 text-xs text-red-600">{appliedCoupon.error}</p>
                )}
                {appliedCoupon?.valid && (
                  <p className="mt-1.5 text-xs font-medium text-primary">
                    ✓ Applied {formatINR(appliedCoupon.discountAmount)} discount
                  </p>
                )}
              </div>
              {discountAmount > 0 && appliedCoupon?.valid && (
                <Row label={`Coupon (${appliedCoupon.code})`} value={`-${formatINR(discountAmount)}`} />
              )}
              <Row label={gstLabel(gstRate)} value={formatINR(computedTaxes)} />
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold text-navy">
                <span>Amount payable</span>
                <span>{formatINR(total)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {checkIn} → {checkOut} · {guests} guest{guests > 1 ? "s" : ""}
                {rooms > 1 ? ` · ${rooms} rooms` : ""}
              </p>
            </div>

            <label className="block text-sm font-medium text-foreground">
              Guest name
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={input}
                placeholder="Ananya Menon"
                disabled={status === "creating_order"}
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Email
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={input}
                placeholder="you@email.com"
                disabled={status === "creating_order"}
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Mobile number
              <input
                required
                type="tel"
                pattern="[0-9+ ]{10,15}"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                className={input}
                placeholder="+91 98765 43210"
                disabled={status === "creating_order"}
              />
            </label>

            <button
              type="submit"
              disabled={status === "creating_order"}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-emerald px-6 py-4 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:opacity-70 min-h-[44px]"
            >
              {status === "creating_order" ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Preparing checkout…
                </>
              ) : (
                <>Pay {formatINR(total)}</>
              )}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" aria-hidden />
              Secured by Razorpay — your payment is encrypted and protected.
            </p>
          </form>
        )}
      </div>
    </div>
    <AuthModal
      open={authOpen}
      onClose={() => setAuthOpen(false)}
      onSuccess={(user) => {
        setGuestUser(user);
        setForm((f) => ({
          ...f,
          email: f.email || user.email,
          name: f.name || user.fullName || f.name,
        }));
        setAuthOpen(false);
        // The auth modal only opened because this checkout form had already
        // passed submission — resume straight into Razorpay checkout instead
        // of making the guest press "Pay" again.
        void proceedToCheckout();
      }}
    />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
