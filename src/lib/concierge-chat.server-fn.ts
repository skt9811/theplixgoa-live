// Server-only. Answers free-text guest questions for the Plix AI concierge
// widget, grounded entirely in a real property's own data — no external LLM
// call. Rule-based/keyword matching over the same fields PropertyFaq,
// PropertyCheckinRulesCard, and the property page's own sections already
// surface, so an answer here can never say something the property's real
// listing doesn't already say.
import { createServerFn } from "@tanstack/react-start";
import { PROPERTIES, formatINR, type Property } from "@/lib/plix";
import { fetchPropertiesWithOverrides } from "@/lib/properties-data";
import { SITE_PHONE_1 } from "@/lib/seo";

export type ConciergeCardTab = { label: string; bullets: string[] };
export type ConciergeCard = {
  title: string;
  tabs?: ConciergeCardTab[];
  bullets?: string[];
  link?: { label: string; href: string };
  /** A section id on the property page — the client scrolls to it on click. */
  action?: { label: string; sectionId: string };
};
export type ConciergeChatResult = { content: string; cards: ConciergeCard[] };

function isChatInput(data: unknown): data is { property_slug: string; message: string } {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d["property_slug"] === "string" && d["property_slug"].length > 0 &&
    typeof d["message"] === "string" && d["message"].trim().length > 0
  );
}

function whatsappLink(property: Property, message: string): string {
  const number = SITE_PHONE_1.replace(/\D/g, "");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function petPolicyLine(property: Property): string {
  return property.amenity_tags.includes("Pet Friendly")
    ? "Pets are welcome here — let us know ahead of your stay so we can prepare."
    : "This property doesn't currently list pet-friendly amenities. Contact us directly and we'll check what's possible for your dates.";
}

function poolPolicyLine(property: Property): string {
  if (property.amenity_tags.includes("Private Pool")) {
    return "The pool is private and exclusively for your group during your stay.";
  }
  if (property.amenity_tags.includes("Swimming Pool")) {
    return "There's a swimming pool on the property — pool hours and safety guidelines are shared at check-in.";
  }
  return "This property doesn't list a private or shared pool.";
}

function houseRulesCard(property: Property): ConciergeCard {
  return {
    title: "House Rules & Stay Information",
    tabs: [
      {
        label: "House Rules",
        bullets: [
          "Check-in is from 2:00 PM and check-out is by 11:00 AM.",
          "A refundable security deposit is collected at check-in (cash or UPI) and returned within 48 hours of check-out, subject to no damage.",
          "All guests aged 18+ must present a valid government-issued photo ID at check-in.",
          petPolicyLine(property),
        ],
      },
      {
        label: "Stay Information",
        bullets: [
          `${property.bedrooms} bedroom${property.bedrooms === 1 ? "" : "s"} · ${property.bathrooms} bathroom${property.bathrooms === 1 ? "" : "s"} · up to ${property.max_guests} guests.`,
          poolPolicyLine(property),
          property.distance_to_beach ? `${property.distance_to_beach} to the beach.` : "Beach distance available on request.",
        ],
      },
    ],
  };
}

function nearbyCard(property: Property): ConciergeCard {
  return {
    title: `Near ${property.name}`,
    bullets: property.nearby.length > 0
      ? property.nearby.slice(0, 6).map((n) => `${n.name} — ${n.distance}`)
      : ["Nothing listed yet for this property — ask us directly and we'll point you to the best nearby spots."],
  };
}

function pricingCard(property: Property): ConciergeCard {
  const price = property.starting_price ?? property.base_price;
  return {
    title: "Pricing & Availability",
    bullets: [
      `Starting from ${formatINR(price)} / night — the rate varies by date and season.`,
      "This is the direct rate — zero OTA commission baked in.",
      `Sleeps up to ${property.max_guests} guests.`,
    ],
    action: { label: "Check exact dates & pricing", sectionId: "book" },
  };
}

function enquiryCard(property: Property): ConciergeCard {
  return {
    title: "Talk to our team",
    bullets: [
      "Our team typically replies within minutes on WhatsApp.",
      "Ask about group bookings, custom itineraries, or anything not covered here.",
    ],
    link: { label: "Message us on WhatsApp", href: whatsappLink(property, `Hi! I have a question about ${property.name}.`) },
  };
}

function mapsCard(property: Property): ConciergeCard {
  const query = property.latitude != null && property.longitude != null
    ? `${property.latitude},${property.longitude}`
    : encodeURIComponent(`${property.name}, ${property.location}, Goa`);
  return {
    title: "Location",
    bullets: [`${property.location}, ${property.region}`, property.distance_to_beach ?? ""].filter(Boolean),
    link: { label: "Open in Google Maps", href: `https://www.google.com/maps/search/?api=1&query=${query}` },
  };
}

function amenitiesCard(property: Property): ConciergeCard {
  return {
    title: "Amenities",
    bullets: property.amenity_tags.length > 0 ? property.amenity_tags.slice(0, 10) : ["No amenities listed yet — ask us directly."],
  };
}

function diningAnswer(property: Property): string {
  const hasRestaurant = property.amenity_tags.includes("Restaurant") || property.amenity_tags.includes("On-site Restaurant");
  const hasBreakfast = property.amenity_tags.includes("Breakfast Included");
  if (hasRestaurant) {
    return `${property.name} has an on-site restaurant serving local and international dishes, so you can eat in without leaving the property.`;
  }
  if (hasBreakfast) {
    return "Breakfast is included during your stay. For lunch and dinner, the villa's kitchen is fully equipped, or ask your caretaker to arrange a private chef.";
  }
  return "This is a self-catered stay with a fully equipped kitchen — cook your own meals, or ask your caretaker to arrange a private chef or a home-cooked Goan spread on request.";
}

// Matched in order — the first intent whose pattern hits wins, so more
// specific phrasing (e.g. "pet friendly") should be checked before broader
// catch-alls (e.g. a generic "amenities" match).
const INTENTS: { pattern: RegExp; respond: (p: Property) => ConciergeChatResult }[] = [
  {
    pattern: /\bpet|dog|cat\b/i,
    respond: (p) => ({ content: petPolicyLine(p), cards: [houseRulesCard(p)] }),
  },
  {
    pattern: /house ?rule|check-?in|check-?out|deposit|id proof|document/i,
    respond: (p) => ({ content: "Here's what to know before you arrive:", cards: [houseRulesCard(p)] }),
  },
  {
    pattern: /near ?by|near me|around|attraction|distance|walk|drive/i,
    respond: (p) => ({ content: `Here's what's close to ${p.name}:`, cards: [nearbyCard(p)] }),
  },
  {
    pattern: /\bmap|location|address|where is|directions\b/i,
    respond: (p) => ({ content: `${p.name} is in ${p.location}, ${p.region}.`, cards: [mapsCard(p)] }),
  },
  {
    pattern: /price|pricing|rate|cost|available|availability|book|night/i,
    respond: (p) => ({ content: "Here's the current pricing:", cards: [pricingCard(p)] }),
  },
  {
    pattern: /enquiry|inquiry|contact|call|whatsapp|talk to|host|human/i,
    respond: (p) => ({ content: "Happy to connect you with our team directly:", cards: [enquiryCard(p)] }),
  },
  {
    pattern: /amenit|wifi|wi-fi|parking|air ?condition|\bac\b|kitchen(?!ette)/i,
    respond: (p) => ({ content: `Here's what ${p.name} offers:`, cards: [amenitiesCard(p)] }),
  },
  {
    pattern: /dining|food|meal|breakfast|restaurant|eat/i,
    respond: (p) => ({ content: diningAnswer(p), cards: [] }),
  },
];

function answerConciergeQuery(property: Property, message: string): ConciergeChatResult {
  for (const intent of INTENTS) {
    if (intent.pattern.test(message)) return intent.respond(property);
  }
  return {
    content: `I couldn't quite match that to something I know about ${property.name} — try asking about house rules, pricing, what's nearby, or tap below and our team will help directly.`,
    cards: [enquiryCard(property)],
  };
}

export const conciergeChatServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isChatInput(data)) {
      console.error("[conciergeChatServerFn] payload failed validation:", JSON.stringify(data));
      throw new Error("Missing property_slug or message");
    }
    return data;
  })
  .handler(async ({ data }): Promise<ConciergeChatResult> => {
    let property: Property | null = null;
    try {
      const all = await fetchPropertiesWithOverrides();
      property = all.find((p) => p.slug === data.property_slug) ?? null;
    } catch (err) {
      console.error("[conciergeChatServerFn] fetchPropertiesWithOverrides failed, falling back to static data:", err instanceof Error ? err.message : err);
    }
    property ??= PROPERTIES.find((p) => p.slug === data.property_slug) ?? null;

    if (!property) {
      return {
        content: "I couldn't find details for this property — please try again from the property page.",
        cards: [],
      };
    }

    return answerConciergeQuery(property, data.message);
  });
