import { BadgeCheck, CalendarCheck, MessageCircle, Receipt, ShieldCheck } from "lucide-react";
import { WHATSAPP_REPLY_MINUTES } from "@/lib/trust-config";

type Props = { propertyName: string };

/**
 * Trust signals shown directly under the price/booking widget. Four are
 * fixed, real facts about how this site operates (payment gateway, refund
 * window — mirrors cancellation.tsx's own published policy, same pattern
 * property-refund-timeline.tsx already uses); the fifth (WhatsApp reply
 * time) hides itself until trust-config.ts's TODO is filled, rather than
 * guessing a number. GST invoices are generated manually by PMS staff on
 * request (tax-invoice-modal.tsx / pms.invoices_.new.tsx), not issued
 * automatically at booking — worded as "available on request" rather than
 * "provided" for that reason.
 */
export function PropertyTrustStrip({ propertyName }: Props) {
  return (
    <ul className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
      <li className="flex items-center gap-2">
        <BadgeCheck className="size-4 shrink-0 text-primary" aria-hidden />
        Official website of {propertyName} by The Plix
      </li>
      <li className="flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        Secure payment via Razorpay
      </li>
      <li className="flex items-center gap-2">
        <CalendarCheck className="size-4 shrink-0 text-primary" aria-hidden />
        Free cancellation 30+ days before check-in
      </li>
      <li className="flex items-center gap-2">
        <Receipt className="size-4 shrink-0 text-primary" aria-hidden />
        GST invoice available on request
      </li>
      {WHATSAPP_REPLY_MINUTES != null && (
        <li className="flex items-center gap-2">
          <MessageCircle className="size-4 shrink-0 text-primary" aria-hidden />
          Reply on WhatsApp in {WHATSAPP_REPLY_MINUTES} minute
          {WHATSAPP_REPLY_MINUTES === 1 ? "" : "s"}
        </li>
      )}
    </ul>
  );
}
