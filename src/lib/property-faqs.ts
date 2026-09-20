import type { Property } from "./plix";

export type PropertyFaqItem = { q: string; a: string };

function hasAmenity(tags: string[], pattern: RegExp): boolean {
  return tags.some((t) => pattern.test(t));
}

// Single source of truth for a property's FAQ content — consumed by both
// the rendered accordion (PropertyFaq) and the FAQPage JSON-LD script in
// routes/properties.$slug.tsx, so the two can never drift out of sync (a
// mismatch between what's shown to guests and what's claimed in structured
// data is exactly the kind of thing that gets a site penalized in Search
// Console). Wi-Fi, power backup, and parking are each real amenity_tags
// entries on some properties and genuinely absent on others (e.g. Harbor
// Court and The Plix Villa both have Power Backup but no WiFi tag;
// Vivenda Chico has WiFi but no Parking tag) — so these three answers are
// generated per-property from the real data rather than asserted as a
// blanket "yes" for every listing.
export function buildPropertyFaqs(property: Property): PropertyFaqItem[] {
  const hasWifi = hasAmenity(property.amenity_tags, /wi-?fi/i);
  const hasPowerBackup = hasAmenity(property.amenity_tags, /power backup/i);
  const hasParking = hasAmenity(property.amenity_tags, /park/i);
  const hasRestaurant = hasAmenity(property.amenity_tags, /restaurant/i);
  const hasBreakfast = hasAmenity(property.amenity_tags, /breakfast/i);
  const isPetFriendly = hasAmenity(property.amenity_tags, /pet/i);

  let powerWifiAnswer: string;
  if (hasPowerBackup && hasWifi) {
    powerWifiAnswer = `Yes — ${property.name} has full power backup for uninterrupted electricity and high-speed Wi-Fi throughout the property.`;
  } else if (hasWifi) {
    powerWifiAnswer = `${property.name} offers high-speed Wi-Fi throughout the property. Power backup isn't listed for this specific property — contact our concierge team to confirm details for your stay.`;
  } else if (hasPowerBackup) {
    powerWifiAnswer = `${property.name} is equipped with power backup for uninterrupted electricity. Wi-Fi isn't listed for this specific property — contact our concierge team to confirm connectivity for your stay.`;
  } else {
    powerWifiAnswer = `Contact our concierge team to confirm power backup and Wi-Fi availability at ${property.name} for your dates.`;
  }

  let mealsAnswer: string;
  if (hasRestaurant) {
    mealsAnswer = `${property.name} has an on-site restaurant serving local and international dishes, so you can eat in without leaving the property.`;
  } else if (hasBreakfast) {
    mealsAnswer = `Breakfast is included during your stay at ${property.name}. The kitchen is also fully equipped to cook your own meals, or your caretaker can arrange a private chef or a home-cooked Goan spread on request.`;
  } else {
    mealsAnswer = `${property.name} is a self-catered stay with a fully equipped kitchen — cook your own meals, or ask your caretaker to arrange a private chef, a local market run, or a home-cooked Goan spread on request.`;
  }

  const parkingAnswer = hasParking
    ? `Yes, on-site parking is available for guests at ${property.name}.`
    : `${property.name} doesn't list dedicated on-site parking — contact our concierge team for nearby parking options.`;

  return [
    {
      q: `What are the check-in and check-out times at ${property.name}?`,
      a: "Standard check-in is at 2:00 PM and check-out is at 11:00 AM. Early check-in or late check-out is subject to availability and prior notice.",
    },
    {
      q: `What is the cancellation and refund policy for ${property.name}?`,
      a: "Cancellations made 30+ days before check-in receive a 100% refund, 15–29 days before receive 50%, 7–14 days before receive 25%, and cancellations made less than 7 days before check-in are non-refundable.",
    },
    {
      q: "Is there power backup and Wi-Fi available?",
      a: powerWifiAnswer,
    },
    {
      q: "Are meals or private chefs available?",
      a: mealsAnswer,
    },
    {
      q: "Is private parking available on premises?",
      a: parkingAnswer,
    },
    {
      q: "Is a security deposit required?",
      a: "Yes, a refundable security deposit is collected at check-in via cash or UPI and returned in full within 48 hours of check-out, subject to no damage to the property.",
    },
    {
      q: "What documents do I need at check-in?",
      a: "All guests aged 18 and above must present a valid government-issued photo ID (Aadhaar, Passport, Driving Licence, or PAN card), as required by local authorities.",
    },
    {
      q: `Is ${property.name} pet-friendly?`,
      a: isPetFriendly
        ? "Yes — this property welcomes pets. Reach out to us before booking so we can confirm any specific requirements for your stay."
        : "This property doesn't currently list pet-friendly amenities. Contact us directly and we'll check what's possible for your dates.",
    },
    {
      q: "How do I book, and is it really cheaper than an OTA?",
      a: "Booking direct with The Plix Goa means no OTA commission is baked into the rate — pick your dates, pay securely via Razorpay, and get an instant confirmation with your booking voucher by email.",
    },
  ];
}
