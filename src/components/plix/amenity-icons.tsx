import {
  Ban,
  BatteryCharging,
  BedDouble,
  Car,
  Coffee,
  ConciergeBell,
  Droplet,
  Flame,
  Gamepad2,
  MapPin,
  PawPrint,
  Plane,
  Refrigerator,
  Shield,
  ShieldCheck,
  Snowflake,
  Sofa,
  Sparkles,
  Star,
  Stethoscope,
  Trees,
  Tv,
  Umbrella,
  Users,
  UtensilsCrossed,
  WashingMachine,
  Waves,
  Wifi,
  Wine,
} from "lucide-react";
import type { ComponentType } from "react";

export type AmenityCategory = "Outdoor" | "Kitchen" | "Media" | "Services" | "Safety" | "Comfort";

type Rule = {
  // Matched as case-insensitive substrings against the tag, in order —
  // first match wins. Amenity tags here are free-form strings like "Full
  // Kitchen (Oven, Microwave, Fridge, Kitchenware)", not fixed enum values,
  // so exact-match lookup would miss almost everything; keyword matching is
  // the only way this stays accurate as new property data gets added.
  keywords: string[];
  icon: ComponentType<{ className?: string }>;
  category: AmenityCategory;
};

const RULES: Rule[] = [
  { keywords: ["pool"], icon: Waves, category: "Outdoor" },
  { keywords: ["bbq", "grill"], icon: Flame, category: "Outdoor" },
  { keywords: ["beach"], icon: Umbrella, category: "Outdoor" },
  { keywords: ["sun loung", "sun terrace", "patio"], icon: Umbrella, category: "Outdoor" },
  { keywords: ["gazebo", "lawn", "garden", "terrace", "balcony"], icon: Trees, category: "Outdoor" },

  { keywords: ["fridge", "refrigerator"], icon: Refrigerator, category: "Kitchen" },
  { keywords: ["kettle"], icon: Coffee, category: "Kitchen" },
  { keywords: ["dining"], icon: UtensilsCrossed, category: "Kitchen" },
  { keywords: ["kitchen"], icon: UtensilsCrossed, category: "Kitchen" },

  { keywords: ["board game", "game room"], icon: Gamepad2, category: "Media" },
  { keywords: ["flat-screen", "flatscreen", "living room tv", " tv", "tv)"], icon: Tv, category: "Media" },

  { keywords: ["caretaker", "concierge", "front desk", "tour desk"], icon: ConciergeBell, category: "Services" },
  { keywords: ["housekeeping", "laundry", "ironing"], icon: Sparkles, category: "Services" },
  { keywords: ["washing machine"], icon: WashingMachine, category: "Services" },
  { keywords: ["restaurant", "bar", "room service", "breakfast", "kids' meals", "kids meals"], icon: Wine, category: "Services" },
  { keywords: ["shuttle", "airport", "station"], icon: Plane, category: "Services" },

  { keywords: ["security", "cctv"], icon: ShieldCheck, category: "Safety" },
  { keywords: ["fire"], icon: Flame, category: "Safety" },
  { keywords: ["first-aid", "first aid", "doctor"], icon: Stethoscope, category: "Safety" },
  { keywords: ["safety deposit", "safe"], icon: Shield, category: "Safety" },
  { keywords: ["sanitizer"], icon: Droplet, category: "Safety" },

  { keywords: ["wi-fi", "wifi"], icon: Wifi, category: "Comfort" },
  { keywords: ["air condition"], icon: Snowflake, category: "Comfort" },
  { keywords: ["power backup", "power"], icon: BatteryCharging, category: "Comfort" },
  { keywords: ["parking"], icon: Car, category: "Comfort" },
  { keywords: ["family room"], icon: Users, category: "Comfort" },
  { keywords: ["pet friendly", "pet "], icon: PawPrint, category: "Comfort" },
  { keywords: ["non-smoking"], icon: Ban, category: "Comfort" },
  { keywords: ["hair dryer", "geyser", "shower", "bath"], icon: Droplet, category: "Comfort" },
  { keywords: ["mattress"], icon: BedDouble, category: "Comfort" },
  { keywords: ["living room", "lounge", "sofa"], icon: Sofa, category: "Comfort" },
  { keywords: ["map", "nearby", "location"], icon: MapPin, category: "Comfort" },
];

// Exact matches checked first — for the small set of short tags (like plain
// "AC") that would otherwise false-positive against an unrelated keyword
// (e.g. "AC" as a substring of "Package").
export const amenityIcons: Record<string, ComponentType<{ className?: string }>> = {
  "Swimming Pool": Waves,
  "Private Pool": Waves,
  "Free Wi-Fi": Wifi,
  "Wi-Fi": Wifi,
  AC: Snowflake,
  "Air Conditioning": Snowflake,
  Caretaker: ConciergeBell,
  "Breakfast Included": Coffee,
  "Pet Friendly": PawPrint,
  "Free Parking": Car,
  Parking: Car,
  "Smart TV": Tv,
};

const exactCategory: Partial<Record<string, AmenityCategory>> = {
  "Swimming Pool": "Outdoor",
  "Private Pool": "Outdoor",
  "Free Wi-Fi": "Comfort",
  "Wi-Fi": "Comfort",
  AC: "Comfort",
  "Air Conditioning": "Comfort",
  Caretaker: "Services",
  "Breakfast Included": "Services",
  "Pet Friendly": "Comfort",
  "Free Parking": "Comfort",
  Parking: "Comfort",
  "Smart TV": "Media",
};

export function amenityIcon(tag: string): ComponentType<{ className?: string }> {
  if (amenityIcons[tag]) return amenityIcons[tag];
  const lower = tag.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.icon;
  }
  return Star;
}

export function amenityCategory(tag: string): AmenityCategory {
  if (exactCategory[tag]) return exactCategory[tag];
  const lower = tag.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.category;
  }
  return "Comfort";
}
