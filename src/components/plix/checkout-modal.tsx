import { useNavigate } from "@tanstack/react-router";
import { CircleCheck as CheckCircle2, Loader as Loader2, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createRazorpayOrder,
  openRazorpayCheckout,
  updateBookingPayment,
  type CreateOrderResponse,
} from "@/lib/booking";
import { formatINR, gstLabel, type Property } from "@/lib/plix";
import { quoteFromRates } from "@/lib/rates";

type Props = {
  property: Property;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  rooms?: number;
  nightlyRates?: number[];
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
  onClose,
}: Props) {
  const navigate = useNavigate();

  const effectiveNightlyRates =
    nightlyRates && nightlyRates.length > 0
      ? nightlyRates
      : Array.from({ length: nights }, () => property.base_price);
  const {
    subtotal: computedSubtotal,
    taxes: computedTaxes,
    total,
    rate: gstRate,
  } = quoteFromRates(effectiveNightlyRates, property.bedrooms);

  const [form, setForm] = useState({ name: "", email: "", mobile: "" });
  const [status, setStatus] = useState<Status>("idle");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState(false);

  const input =
    "mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40 min-h-[44px]";

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
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
      });
      setBookingId(order.booking_id);
      setSimulation(order.simulation);
    } catch (error) {
      console.error("[Razorpay Init Error]:", error);
      setStatus("error");
      toast.error("We couldn't start the checkout. Please try again or contact us.");
      return;
    }

    if (order.simulation) {
      toast.info("Demo mode: simulating payment (no live payment was created).");
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

    let paymentConfirmed = true;
    if (!order.simulation) {
      // Write payment details directly to the bookings table
      paymentConfirmed = await updateBookingPayment(
        order.booking_id,
        result.razorpay_payment_id,
        result.razorpay_order_id,
        result.razorpay_signature,
      );
    }

    if (paymentConfirmed) {
      if (order.simulation) {
        toast.success("Booking confirmed (demo mode). No real payment was processed.");
      } else {
        toast.success("Payment successful! Your booking is confirmed.");
      }
    } else {
      toast.success("Payment received! We'll confirm your booking shortly.");
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
          sim: order.simulation ? "1" : "",
        },
      });
    }, 1800);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-navy/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="animate-rise max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-6 shadow-lift sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              {simulation ? "Demo Checkout" : "Razorpay Secure Checkout"}
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
        ) : status === "checkout_open" && !simulation ? (
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
              {simulation
                ? "Demo mode — no real payment is processed."
                : "Secured by Razorpay — your payment is encrypted and protected."}
            </p>
          </form>
        )}
      </div>
    </div>
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
