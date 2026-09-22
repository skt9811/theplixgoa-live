// Category-specific 3-touch outreach copy. Plain, honest claims only —
// checked against src/lib/plix.ts and src/lib/seo.ts before writing:
//   - Pet-friendly villas are in Anjuna (Casa Marina, Casa Moana, Casa
//     Meadows) and Candolim (Vivenda Chico) — NOT Vagator, which the
//     original brief for this template named. Corrected here.
//   - "15-30 pax" enclaves: Marina Villas (Casa Marina 6 + Casa Moana 8 +
//     Casa Meadows 10 = up to 24 combined) and Vivenda Chico (up to 24
//     alone, bookable by room or as the whole bungalow) both genuinely
//     support that range.
//   - Private chef and direct-booking (zero OTA commission) are real,
//     already-documented services, not invented for this pitch.
//
// Kept independent of src/lib/seo.ts on purpose: this runs under plain
// `node`, not the app's Vite build, so it can't resolve the "@/" path
// alias or rely on the app's module graph. If the brand's site URL,
// address or phone ever change, update BRAND below to match seo.ts.
import type { Target } from "./mailer-types.ts";

export const BRAND = {
  siteUrl: "https://theplixgoa.com",
  name: "The Plix",
  legalName: "Plix Hospitality Private Limited",
  address: "Pequen, Chivar, 1561/3A, Anjuna, Vagator, Goa 403413, India",
  phone: "+91-9009800895",
};

export type EmailContent = { subject: string; text: string };

function footer(): string {
  return [
    "",
    "—",
    `${BRAND.legalName}, ${BRAND.address}`,
    `${BRAND.phone} | ${BRAND.siteUrl}`,
    "If you'd rather not hear from us again, just reply and say so — we'll stop reaching out.",
  ].join("\n");
}

function sign(name = "The Plix Concierge Team"): string {
  return `\nWarm regards,\n${name}\n${BRAND.name} | ${BRAND.siteUrl}`;
}

// ---- Initial pitch, by category ----------------------------------------

function initialLifestyle(t: Target): EmailContent {
  return {
    subject: `Villa photo assets + a direct-booking story for ${t.domain}`,
    text: `Hi ${t.recipientName},

I run outreach for ${BRAND.name} (${BRAND.siteUrl}), a small collection of private-pool villas and boutique estates across Vagator, Anjuna, Assagao, Morjim and Candolim in North Goa.

I think a feature or roundup on ${t.domain} could be a good fit — happy to share:
- High-resolution photo assets of the villas (pools, interiors, gardens) for editorial use.
- A short, honest write-up on what direct booking actually saves guests versus an OTA (no commission built into the rate).
- Access to a private chef and in-villa dining as a genuine differentiator for a luxury-stay angle.

No pressure at all — if this isn't useful for ${t.domain} right now, just let me know and I won't follow up again. If it is, I'd love to send over photos and a short brief.${sign()}${footer()}`,
  };
}

function initialPet(t: Target): EmailContent {
  return {
    subject: `Pet-friendly private-pool villas in Goa for ${t.domain}`,
    text: `Hi ${t.recipientName},

I'm reaching out from ${BRAND.name} (${BRAND.siteUrl}) — we run a handful of pet-friendly private-pool villas in Anjuna and Candolim, North Goa, each with its own enclosed lawn and garden (not a shared resort space), so dogs can actually run around off-lead.

Given ${t.domain}'s focus on pet-friendly travel, I wondered if a Goa villa guide or listing might be a fit. I can send over:
- Photos of the villas' gardens and pools.
- Specifics on our pet policy (a refundable cleaning fee applies, and we ask that pets stay off furniture — happy to share the exact rules).
- A quote from our side if useful for a feature.

If this isn't relevant for ${t.domain}, no worries at all — just say so and I'll leave it there.${sign()}${footer()}`,
  };
}

function initialWedding(t: Target): EmailContent {
  return {
    subject: `Intimate destination-wedding villas (15-30 guests) for ${t.domain}`,
    text: `Hi ${t.recipientName},

I work with ${BRAND.name} (${BRAND.siteUrl}), a North Goa villa collection with two settings that keep coming up for small destination weddings and anniversary celebrations:

- Marina Villas, a private enclave of three pool villas in Vagator/Anjuna that can host up to 24 guests together.
- Vivenda Chico, an 8-bedroom heritage bungalow in Candolim with a lawn and gazebo, bookable as a whole venue for up to 24 guests.

Both suit an intimate 15-30 pax ceremony far better than a hotel ballroom — private, self-contained, and every guest can actually stay on-site. I'd be glad to send photos and a short brief if ${t.domain} covers venues like this, or if a listing would be useful.

Happy to hear "not a fit" too — just let me know either way.${sign()}${footer()}`,
  };
}

function initialAggregator(t: Target): EmailContent {
  return {
    subject: `Listing submission: ${BRAND.name} villas, North Goa`,
    text: `Hi ${t.recipientName},

I'd like to submit ${BRAND.name} (${BRAND.siteUrl}) for a listing on ${t.domain} — we're a curated collection of private-pool villas and boutique estates across Vagator, Anjuna, Assagao, Morjim and Candolim, North Goa, ranging from a 3-bedroom villa for six guests up to a 22-room beachfront estate for fifty.

If there's a standard submission process or a form I should use instead of email, just point me to it and I'll follow it. Otherwise I'm happy to send photos, property details and pricing for whichever properties fit your collection.${sign()}${footer()}`,
  };
}

const INITIAL: Record<Target["category"], (t: Target) => EmailContent> = {
  lifestyle: initialLifestyle,
  pet: initialPet,
  wedding: initialWedding,
  aggregator: initialAggregator,
};

export function initialPitch(t: Target): EmailContent {
  return INITIAL[t.category](t);
}

// ---- Day 3 follow-up (brief, polite bump) -------------------------------

export function followUp1(t: Target): EmailContent {
  return {
    subject: `Re: ${initialPitch(t).subject}`,
    text: `Hi ${t.recipientName},

Just a quick bump in case my note below got buried — no pressure either way, and happy to send photos or details if useful for ${t.domain}.${sign()}${footer()}`,
  };
}

// ---- Day 7 follow-up (final check-in) -----------------------------------

export function followUp2(t: Target): EmailContent {
  return {
    subject: `Re: ${initialPitch(t).subject}`,
    text: `Hi ${t.recipientName},

Last note from me on this — with the North Goa season picking up over the next couple of months, I wanted to check in once more before I stop following up. If a feature, listing or photo set would be useful for ${t.domain} at any point, I'm just a reply away. Otherwise, thanks for reading, and I'll leave it here.${sign()}${footer()}`,
  };
}

export function contentFor(touch: "initial" | "followup1" | "followup2", t: Target): EmailContent {
  if (touch === "initial") return initialPitch(t);
  if (touch === "followup1") return followUp1(t);
  return followUp2(t);
}
