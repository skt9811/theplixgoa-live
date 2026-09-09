import { Plane } from "lucide-react";

// Fixed pricing, identical across every property — not sourced from
// per-property data, so no props here.
const AIRPORT_FARES = [
  {
    label: "Airport Drop to GOI",
    price: "₹2,000 + taxes",
    detail: "Property to Dabolim Airport (Night charges extra, if applicable)",
  },
  {
    label: "Airport Drop to GOX",
    price: "₹1,400 + taxes",
    detail: "Property to MOPA Airport (Night charges extra, if applicable)",
  },
  {
    label: "Airport Pickup from GOI",
    price: "₹2,050 + taxes",
    detail: "Dabolim Airport to Property (Night charges extra, if applicable)",
  },
  {
    label: "Airport Pickup from GOX",
    price: "₹1,400 + taxes",
    detail: "MOPA Airport to Property (Night charges extra, if applicable)",
  },
] as const;

export function PropertyAirportFares() {
  return (
    <section id="on-demand-services" className="mt-10">
      <h2 className="text-2xl font-semibold text-navy">On-Demand Services</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Airport transfers arranged on request — ask your caretaker or add this at checkout.
      </p>
      <div className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
        {AIRPORT_FARES.map((fare) => (
          <div key={fare.label} className="flex items-start gap-3 px-5 py-4">
            <Plane className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-semibold text-foreground">{fare.label}</span>
                <span className="text-sm font-semibold text-navy">{fare.price}</span>
              </div>
              <p className="mt-0.5 text-xs italic text-muted-foreground">{fare.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
