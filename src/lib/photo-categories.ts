// Per-image-key photo categories for the gallery filter pills. Image keys
// (e.g. "5bhk12", "HC5") are opaque camera-export identifiers with no
// descriptive filename to keyword-match against, so categories here are only
// ever added after actually looking at the photo — never guessed from the
// key string. A key with no entry simply has no category and only shows up
// under the "All" filter; that's a real gap in this map, not a bug in the
// component that reads it.
export type PhotoCategory = "Outdoors" | "Amenities" | "Indoors" | "Bed & Bath";

export const PHOTO_CATEGORIES: readonly PhotoCategory[] = [
  "Outdoors",
  "Amenities",
  "Indoors",
  "Bed & Bath",
];

// Reviewed this session while sourcing/optimizing each property's photos.
export const IMAGE_CATEGORY: Partial<Record<string, PhotoCategory>> = {
  // Casa Meadows — reviewed room-by-room while picking hero/slot images.
  "5bhk12": "Outdoors", // dusk pool/garden
  "5bhk13": "Outdoors", // dusk pool/garden
  "5bhk11": "Outdoors", // garden/landscaping
  "5bhk14": "Outdoors", // garden/landscaping
  "5bhk": "Indoors", // lounge / kids' play area
  "5bhk10": "Indoors", // dining table + kitchen counter + staircase
  "5bhk1": "Bed & Bath", // yellow/orange bedroom
  "5bhk2": "Bed & Bath",
  "5bhk3": "Bed & Bath",
  "5bhk4": "Bed & Bath",
  "5bhk6": "Bed & Bath",
  "5bhk9": "Bed & Bath",

  // Casa Marina — the two photos actually reviewed while picking the hero.
  "4bhk": "Outdoors", // dusk exterior
  "4bhk1": "Outdoors", // dusk pool

  // Casa Moana — the one photo actually reviewed while picking the hero.
  "3bhk1": "Outdoors", // dusk entrance/exterior
};

export function categoryForImageKey(key: string): PhotoCategory | null {
  return IMAGE_CATEGORY[key] ?? null;
}
