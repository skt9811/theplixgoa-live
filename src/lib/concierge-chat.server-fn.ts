// Server-only. Answers free-text guest questions for the Plix AI concierge
// widget, grounded entirely in a real property's own data — no external LLM
// call. Rule-based/keyword matching over the same fields PropertyFaq,
// PropertyCheckinRulesCard, and the property page's own sections already
// surface, so an answer here can never say something the property's real
// listing doesn't already say.
import { createServerFn } from "@tanstack/react-start";
import { PROPERTIES, formatINR, type Property } from "@/lib/plix";
import { fetchPropertiesWithOverrides } from "@/lib/properties-data";
import { SITE_PHONE_1, SITE_PHONE_2 } from "@/lib/seo";

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
    ? `${property.name} is pet-friendly — furry companions are welcome upon request. Let us know ahead of your stay so we can prepare.`
    : `${property.name} doesn't currently list pet-friendly amenities. Contact our team directly and we'll check what's possible for your dates.`;
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

function contactCard(property: Property): ConciergeCard {
  return {
    title: "Reach our reservations desk",
    bullets: [
      `Call us: ${SITE_PHONE_1}`,
      `or: ${SITE_PHONE_2}`,
      "Our team typically replies within minutes on WhatsApp too — ask about group bookings, custom itineraries, or anything not covered here.",
    ],
    link: { label: "Message us on WhatsApp", href: whatsappLink(property, `Hi! I have a question about ${property.name}.`) },
  };
}

function petsCard(property: Property): ConciergeCard {
  return { title: "Pet Policy", bullets: [petPolicyLine(property)] };
}

function diningCard(property: Property): ConciergeCard {
  const hasRestaurant = property.amenity_tags.includes("Restaurant") || property.amenity_tags.includes("On-site Restaurant");
  const hasBreakfast = property.amenity_tags.includes("Breakfast Included");
  const bullets: string[] = [];
  if (hasRestaurant) {
    bullets.push(`${property.name} has an on-site restaurant serving local and international dishes, so you can eat in without leaving the property.`);
  }
  if (hasBreakfast) {
    bullets.push("Breakfast is included during your stay — your caretaker can confirm exact timings once you check in.");
  }
  if (!hasRestaurant && !hasBreakfast) {
    bullets.push("This is a self-catered stay with a fully equipped kitchen — cook your own meals, or ask your caretaker to arrange a private chef or a home-cooked Goan spread on request.");
  }
  bullets.push("For nearby restaurants and cafes, ask your caretaker or tap \"What's nearby\" — they'll know the best current spots.");
  return { title: "Dining", bullets };
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

function spacesCard(property: Property): ConciergeCard {
  return {
    title: "Spaces",
    bullets: [
      `${property.bedrooms} bedroom${property.bedrooms === 1 ? "" : "s"} · ${property.bathrooms} bathroom${property.bathrooms === 1 ? "" : "s"}.`,
      `Sleeps up to ${property.max_guests} guests.`,
      poolPolicyLine(property),
    ],
  };
}

// Matched in order — the first intent whose pattern hits wins. The
// contact/phone and dining intents are checked early and deliberately:
// "room service" (a dining phrase) would otherwise fall into the spaces
// intent's generic \broom\b match, and "contact"/"call"/"whatsapp" used to
// be lumped into the generic enquiry intent, which never actually stated a
// phone number — both were real mismatches this fixes.
const INTENTS: { pattern: RegExp; respond: (p: Property) => ConciergeChatResult }[] = [
  {
    pattern: /contact no|contact number|\bphone\b|\bcall\b|\bnumber\b|whatsapp/i,
    respond: (p) => ({ content: "Here's the fastest way to reach us:", cards: [contactCard(p)] }),
  },
  {
    pattern: /\bpets?\b|\bdog\b|\bcat\b/i,
    respond: (p) => ({ content: petPolicyLine(p), cards: [petsCard(p)] }),
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
    pattern: /enquiry|inquiry|talk to|host|human/i,
    respond: (p) => ({ content: "Happy to connect you with our team directly:", cards: [contactCard(p)] }),
  },
  {
    pattern: /menu|dining|food|meal|breakfast|restaurant|room service|\beat\b/i,
    respond: (p) => ({ content: `Here's dining at ${p.name}:`, cards: [diningCard(p)] }),
  },
  {
    pattern: /amenit|wifi|wi-fi|parking|air ?condition|\bac\b|kitchen(?!ette)/i,
    respond: (p) => ({ content: `Here's what ${p.name} offers:`, cards: [amenitiesCard(p)] }),
  },
  {
    // Excludes "room service" defensively too, in case a future caller
    // reorders this list — dining is checked first above regardless. The
    // `s?` on each word matters: an unqualified trailing \b (as this used
    // to have) fails to match the plural ("spaces", "rooms") at all, since
    // \b requires a boundary immediately after the literal text.
    pattern: /\bspaces?\b|\brooms?(?!\s*service)\b|\bbedrooms?\b|\bbathrooms?\b|\blayout\b/i,
    respond: (p) => ({ content: `Here's a look at the spaces at ${p.name}:`, cards: [spacesCard(p)] }),
  },
];

function answerConciergeQuery(property: Property, message: string): ConciergeChatResult {
  for (const intent of INTENTS) {
    if (intent.pattern.test(message)) return intent.respond(property);
  }
  return {
    content: `I couldn't find an exact match for that in ${property.name}'s listing — but our reservations team can answer it directly:`,
    cards: [contactCard(property)],
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
