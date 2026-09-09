// Generates src/lib/property-reviews-data.ts — a large, deterministic set of
// realistic-looking guest reviews (30-50 per property) for the property page
// reviews section. Deterministic (seeded PRNG) so re-running produces
// identical output and diffs stay clean.
import { writeFileSync } from "node:fs";

const PROPERTIES = [
  { id: "casa-marina", location: "Vagator" },
  { id: "casa-moana", location: "Anjuna" },
  { id: "casa-meadows", location: "Vagator" },
  { id: "harbor-court", location: "Vagator" },
  { id: "the-plix-villa", location: "Assagao" },
  { id: "morjim-pride", location: "Morjim" },
  { id: "vivenda-chico", location: "Candolim" },
  { id: "the-plix-resort-morjim", location: "Morjim" },
  { id: "villa-madera", location: "Anjuna" },
  { id: "casa-serenita", location: "Anjuna" },
];

const PLATFORMS = ["Google", "Airbnb", "Agoda", "MakeMyTrip"];
const CATEGORIES = ["Amenities", "Stay", "Food", "Service", "View"];

const DATE_LABELS = [
  "3 days ago", "5 days ago", "1 week ago", "2 weeks ago", "last week",
  "3 weeks ago", "a month ago", "1 month ago", "2 months ago", "a few months ago",
  "3 months ago", "4 months ago", "6 months ago", "8 months ago",
  "a year ago", "1 year ago", "2 years ago", "3 years ago",
];

const INDIAN_FIRST = [
  "Ananya", "Rohan", "Priya", "Arjun", "Sneha", "Vikram", "Karan", "Isha",
  "Meera", "Aditya", "Neha", "Rahul", "Divya", "Aman", "Pooja", "Siddharth",
  "Kavya", "Nikhil", "Riya", "Varun", "Shreya", "Manish", "Tanya", "Abhishek",
  "Anjali", "Gaurav", "Ritu", "Sanjay", "Nisha", "Vivek", "Simran", "Harsh",
  "Deepika", "Ashish", "Swati", "Kunal", "Pallavi", "Rajesh", "Namrata", "Yash",
];
const INDIAN_LAST = [
  "Menon", "Sharma", "Nair", "Kapoor", "Reddy", "Patel", "Mehta", "Kulkarni",
  "Iyer", "Verma", "Singh", "Gupta", "Rao", "Chatterjee", "Bose", "Malhotra",
  "Joshi", "Desai", "Pillai", "Agarwal", "Bhatia", "Chawla", "Krishnan", "Shetty",
];
const INDIAN_CITIES = [
  "Mumbai", "Bangalore", "Delhi", "Pune", "Hyderabad", "Chennai", "Ahmedabad",
  "Kolkata", "Jaipur", "Chandigarh", "Kochi", "Surat", "Nagpur", "Indore",
];

const INTL_NAMES = [
  "Sarah Thompson", "James Whitfield", "Emma Clarke", "Daniel Novak", "Olivia Bennett",
  "Lucas Meyer", "Charlotte Dubois", "Michael Anderson", "Sophie Larsson", "Ryan O'Connor",
  "Isabella Rossi", "Thomas Muller", "Grace Wilson", "Alexander Petrov", "Chloe Martin",
  "William Harper", "Natasha Ivanova", "Benjamin Foster", "Amelia Ross", "David Cohen",
];
const INTL_CITIES = [
  "London, UK", "Berlin, Germany", "Sydney, Australia", "Dubai, UAE", "Singapore",
  "New York, USA", "Toronto, Canada", "Amsterdam, Netherlands", "Tel Aviv, Israel",
  "Paris, France", "Moscow, Russia", "Auckland, New Zealand", "Zurich, Switzerland",
];

const OPENERS = [
  "Had an absolutely wonderful stay here.",
  "This place exceeded every expectation we had.",
  "One of the best villa experiences we've had in Goa.",
  "Booked this for a family trip and it was perfect.",
  "Came here for a weekend getaway and didn't want to leave.",
  "Second time staying and it just keeps getting better.",
  "A hidden gem — exactly what we needed for a relaxed break.",
  "Booked directly and the whole experience was seamless.",
  "Our group of friends had the most memorable time here.",
  "Celebrated our anniversary here and it was magical.",
  "Perfect base for exploring North Goa.",
  "Honestly one of the nicest stays we've had in a long time.",
];

const CATEGORY_FRAGMENTS = {
  Amenities: [
    "The private pool was spotless and so relaxing to lounge around all day.",
    "Rooms were spacious, tastefully furnished, and kept impeccably clean.",
    "Loved the well-equipped kitchen — made it easy to cook whenever we wanted.",
    "Wi-Fi was fast and reliable throughout, even for work calls.",
    "The AC and hot water worked flawlessly the entire stay.",
    "Beautiful interiors with a lot of thoughtful little touches.",
  ],
  Stay: [
    "Beds were extremely comfortable and the linen felt premium.",
    "The property was spotlessly clean from the moment we walked in.",
    "Loved the peaceful, private atmosphere — no noise from neighbours at all.",
    "Housekeeping was prompt and unobtrusive, exactly the right balance.",
    "Check-in and check-out were smooth and completely hassle-free.",
    "The ambience at night, with the lights around the pool, was gorgeous.",
  ],
  Food: [
    "Breakfast spread was fresh and generous every single morning.",
    "Arranged a private chef for one evening and the Goan food was outstanding.",
    "The on-site restaurant served genuinely great local and continental dishes.",
    "Loved that the kitchen was fully stocked so we could cook our own meals too.",
    "The caretaker organised a lovely home-cooked dinner on request.",
    "Coffee and evening snacks were a nice touch we didn't expect.",
  ],
  Service: [
    "The caretaker was incredibly attentive and responded within minutes on WhatsApp.",
    "Staff went out of their way to make our anniversary special.",
    "Check-in was smooth and the host walked us through everything patiently.",
    "Housekeeping team was courteous and always asked before entering.",
    "The concierge helped us book a boat trip and scooters within the hour.",
    "Genuinely warm hospitality — felt like staying with family, not a rental.",
  ],
  View: [
    "Waking up to the garden view every morning was pure bliss.",
    "The sunset views from the pool deck were unbeatable.",
    "Loved the panoramic views across the greenery from the upper floor.",
    "Being minutes from the beach made evening walks so easy.",
    "The balcony view was worth the trip alone.",
    "Surrounded by palms and paddy fields — incredibly scenic setting.",
  ],
};

const CLOSERS = [
  "Would 100% book again on our next Goa trip.",
  "Highly recommend to anyone looking for a private, comfortable stay.",
  "Already planning our next visit.",
  "Great value for what you get — book direct if you can.",
  "Can't wait to come back with the rest of the family.",
  "Five stars, no hesitation recommending this place.",
  "Perfect for couples and families alike.",
  "This is now our go-to stay whenever we're in Goa.",
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN(rng, arr, n) {
  const pool = [...arr];
  const out = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function shuffle(rng, arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildReview(rng, propertyId, index) {
  const isIndian = rng() < 0.72;
  const name = isIndian
    ? `${pick(rng, INDIAN_FIRST)} ${pick(rng, INDIAN_LAST)}`
    : pick(rng, INTL_NAMES);
  const location = isIndian ? pick(rng, INDIAN_CITIES) : pick(rng, INTL_CITIES);

  // Ratings skew high (4 or 5), with 5 far more common, keeping the
  // per-property average comfortably between 4.2 and 5.0.
  const rating = rng() < 0.78 ? 5 : 4;

  const categoryCount = 1 + Math.floor(rng() * 3);
  const categories = pickN(rng, CATEGORIES, categoryCount).sort(
    (a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b),
  );

  const fragments = categories.map((c) => pick(rng, CATEGORY_FRAGMENTS[c]));
  const comment = [pick(rng, OPENERS), ...fragments, pick(rng, CLOSERS)].join(" ");

  // ~60% carry an OTA badge; the rest read as direct/unlabelled bookings
  // with no platform badge at all.
  const platform = rng() < 0.6 ? pick(rng, PLATFORMS) : undefined;
  // Earlier-generated reviews (lower index) read as more recent so the
  // default "Most Recent" sort needs no extra timestamp field.
  const dateLabel = DATE_LABELS[Math.min(index, DATE_LABELS.length - 1)];
  const helpful = Math.floor(rng() * 46);

  return {
    id: `${propertyId}-rev-${index + 1}`,
    property_id: propertyId,
    guest_name: name,
    guest_location: location,
    rating,
    platform,
    date_label: dateLabel,
    categories,
    comment,
    helpful,
  };
}

function generateForProperty(property) {
  const rng = mulberry32(hashString(property.id) + 1);
  const count = 30 + Math.floor(rng() * 21); // 30-50
  const reviews = [];
  for (let i = 0; i < count; i++) reviews.push(buildReview(rng, property.id, i));
  // Shuffle date order slightly so it isn't a perfectly monotonic staircase,
  // then re-sort by original recency index to keep "Most Recent" sensible.
  return shuffle(rng, reviews).sort((a, b) => {
    const ai = DATE_LABELS.indexOf(a.date_label);
    const bi = DATE_LABELS.indexOf(b.date_label);
    return ai - bi;
  });
}

const allReviews = PROPERTIES.flatMap((p) => generateForProperty(p));

const header = `// AUTO-GENERATED by scripts/generate-property-reviews.mjs — do not hand-edit.
// Re-run \`node scripts/generate-property-reviews.mjs\` to regenerate.
// Deterministic (seeded per property id) so output is stable across runs.

export type ReviewCategory = "Amenities" | "Stay" | "Food" | "Service" | "View";
export type ReviewPlatform = "Google" | "Airbnb" | "Agoda" | "MakeMyTrip";

export type PropertyReview = {
  id: string;
  property_id: string;
  guest_name: string;
  guest_location: string;
  rating: number;
  platform?: ReviewPlatform;
  date_label: string;
  categories: ReviewCategory[];
  comment: string;
  helpful: number;
};

export const PROPERTY_REVIEWS: PropertyReview[] = `;

const body = JSON.stringify(allReviews, null, 2);
const footer = ";\n";

writeFileSync("src/lib/property-reviews-data.ts", header + body + footer);

console.log(`Generated ${allReviews.length} reviews across ${PROPERTIES.length} properties.`);
for (const p of PROPERTIES) {
  const forP = allReviews.filter((r) => r.property_id === p.id);
  const avg = forP.reduce((s, r) => s + r.rating, 0) / forP.length;
  console.log(`  ${p.id}: ${forP.length} reviews, avg ${avg.toFixed(2)}`);
}
