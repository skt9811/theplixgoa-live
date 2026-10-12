import { MessageCircle, Phone } from "lucide-react";
import { SITE_PHONE_1, whatsappLink } from "@/lib/seo";
import { trackFunnelEvent } from "@/lib/gtag";

const WHATSAPP_NUMBER = SITE_PHONE_1.replace(/\D/g, "");

export function PropertyConnectHostCard({
  propertyName,
  propertySlug,
}: {
  propertyName: string;
  propertySlug: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="text-sm font-semibold text-navy">Connect with the host</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Questions about {propertyName}, group bookings, or a custom itinerary? Our team replies fast.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <a
          href={`tel:${SITE_PHONE_1}`}
          onClick={() =>
            trackFunnelEvent("click_call", {
              property_slug: propertySlug,
              location: "connect_host_card",
            })
          }
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-xs font-semibold text-navy transition-colors hover:bg-accent"
        >
          <Phone className="size-3.5" aria-hidden />
          Call Reservations
        </a>
        <a
          href={whatsappLink(WHATSAPP_NUMBER, `Hi! I'd like to know more about ${propertyName}.`)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackFunnelEvent("click_whatsapp", {
              property_slug: propertySlug,
              location: "connect_host_card",
            })
          }
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <MessageCircle className="size-3.5" aria-hidden />
          Request Callback
        </a>
      </div>
    </div>
  );
}
