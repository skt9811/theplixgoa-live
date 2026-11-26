import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, Download, MapPin } from "lucide-react";
import { propertyQuery } from "@/lib/plix-queries";
import { resolveImages } from "@/lib/plix";
import { isMultiRoomProperty } from "@/lib/rates";
import { poolDisplayLabel, SITE_PHONE_1 } from "@/lib/seo";
import { buildSpaceCards } from "@/components/plix/property-sections";

// A printable brochure for each property, built only from the property's own
// data and photos. "Download / Print" uses the browser's print dialog, which
// also offers "Save as PDF".
export const Route = createFileRoute("/properties_/$slug/brochure")({
  loader: async ({ context, params }) => {
    const property = await context.queryClient.ensureQueryData(propertyQuery(params.slug));
    if (!property) throw notFound();
    return { name: property.name };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Property"} brochure – The Plix Goa` },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: Brochure,
});

function Brochure() {
  const { slug } = Route.useParams();
  const { data: property } = useSuspenseQuery(propertyQuery(slug));

  useEffect(() => {
    document.documentElement.dataset["brochure"] = "1";
    return () => {
      delete document.documentElement.dataset["brochure"];
    };
  }, []);

  if (!property) return null;
  const images = resolveImages(property.image_keys);
  const spaces = buildSpaceCards(images, property.image_keys).slice(0, 6);
  const pool = poolDisplayLabel(property);
  const multiRoom = isMultiRoomProperty(property.slug);
  const facts = [
    ["Guests", `Up to ${property.max_guests}`],
    [multiRoom ? "Rooms" : "Bedrooms", String(property.bedrooms)],
    ["Bathrooms", String(property.bathrooms)],
    ...(pool ? [["Pool", pool]] : []),
    ["Check-in / out", "2:00 PM / 11:00 AM"],
  ];

  return (
    <div className="mx-auto max-w-4xl bg-card px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link to="/properties/$slug" params={{ slug }} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Back to {property.name}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-navy-foreground"
        >
          <Download className="size-4" aria-hidden />
          Download / Print
        </button>
      </div>

      <article className="overflow-hidden rounded-3xl border border-border print:rounded-none print:border-0">
        {images[0] && <img src={images[0]} alt={property.name} className="h-72 w-full object-cover sm:h-96 print:h-80" />}
        <div className="p-6 sm:p-10 print:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">The Plix Goa · Brochure</p>
          <h1 className="mt-2 text-4xl font-semibold text-navy">{property.name}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 text-primary" aria-hidden />
            {property.location}, {property.region}
            {property.distance_to_beach ? ` · ${property.distance_to_beach}` : ""}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border p-3">
                <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                <dd className="mt-1 text-sm font-semibold text-navy">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 leading-relaxed text-foreground/90">{property.description}</p>

          {spaces.length > 0 && (
            <section className="mt-8 break-inside-avoid">
              <h2 className="text-xl font-semibold text-navy">Spaces</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {spaces.map((sp) => (
                  <figure key={sp.label} className="overflow-hidden rounded-xl border border-border">
                    <img src={sp.src} alt={`${property.name} — ${sp.label}`} className="aspect-[4/3] w-full object-cover" />
                    <figcaption className="px-3 py-2 text-xs font-semibold text-navy">{sp.label}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section className="mt-8 break-inside-avoid">
            <h2 className="text-xl font-semibold text-navy">Amenities</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-foreground/90 sm:grid-cols-3">
              {property.amenity_tags.map((a) => (
                <li key={a}>• {a}</li>
              ))}
            </ul>
          </section>

          <section className="mt-8 break-inside-avoid rounded-2xl bg-muted p-5">
            <h2 className="text-lg font-semibold text-navy">Book direct with The Plix</h2>
            <p className="mt-1 text-sm text-foreground/90">
              theplixgoa.com/properties/{property.slug} · Reservations {SITE_PHONE_1}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Prices vary by date; see the website for live rates. Free cancellation 30+ days before check-in.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
