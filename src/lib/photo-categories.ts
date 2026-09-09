// Per-image-key photo categories for the gallery filter pills. Image keys
// (e.g. "chico1", "serenity12") are opaque camera-export identifiers with no
// descriptive filename to keyword-match against, so every entry here was
// assigned by actually looking at the photo (via generated contact-sheet
// montages, one per property) — never guessed from the key string. A key
// with no entry simply has no category and only shows up under the "All"
// filter; that's a real gap in this map, not a bug in the component that
// reads it.
//
// Casa Meadows, Casa Marina, Casa Moana, Harbor Court, Morjim Pride, The
// Plix Resort, The Plix Villa, and Villa Madera all had their entire photo
// sets replaced by a full asset migration (new harborcourt*/morjimpride*/
// etc. keys) — their old categorization entries are gone since those keys
// no longer exist in imageMap. The new photos for those 8 properties are
// uncategorized until someone reviews them again.
export type PhotoCategory = "Outdoors" | "Amenities" | "Indoors" | "Bed & Bath";

export const PHOTO_CATEGORIES: readonly PhotoCategory[] = [
  "Outdoors",
  "Amenities",
  "Indoors",
  "Bed & Bath",
];

export const IMAGE_CATEGORY: Partial<Record<string, PhotoCategory>> = {
  // Vivenda Chico (chico*) — all 11 reviewed.
  "chico": "Outdoors",
  "chico1": "Bed & Bath",
  "chico3": "Bed & Bath",
  "chico4": "Outdoors",
  "chico5": "Outdoors",
  "chico6": "Outdoors",
  "chico8": "Outdoors",
  "chico9": "Outdoors",
  "chico10": "Outdoors",
  "chico16": "Bed & Bath",
  "chico17": "Bed & Bath",

  // Casa Serenita (serenity*) — all 47 reviewed.
  "serenity1": "Outdoors",
  "serenity2": "Outdoors",
  "serenity3": "Outdoors",
  "serenity4": "Outdoors",
  "serenity5": "Outdoors",
  "serenity6": "Outdoors",
  "serenity7": "Outdoors",
  "serenity8": "Bed & Bath",
  "serenity9": "Bed & Bath",
  "serenity10": "Bed & Bath",
  "serenity11": "Bed & Bath",
  "serenity12": "Bed & Bath",
  "serenity13": "Bed & Bath",
  "serenity14": "Bed & Bath",
  "serenity15": "Bed & Bath",
  "serenity16": "Bed & Bath",
  "serenity17": "Bed & Bath",
  "serenity18": "Bed & Bath",
  "serenity19": "Bed & Bath",
  "serenity20": "Bed & Bath",
  "serenity21": "Bed & Bath",
  "serenity22": "Bed & Bath",
  "serenity23": "Bed & Bath",
  "serenity24": "Bed & Bath",
  "serenity25": "Bed & Bath",
  "serenity26": "Indoors",
  "serenity27": "Indoors",
  "serenity28": "Indoors",
  "serenity29": "Outdoors",
  "serenity30": "Outdoors",
  "serenity31": "Outdoors",
  "serenity32": "Outdoors",
  "serenity33": "Bed & Bath",
  "serenity34": "Bed & Bath",
  "serenity35": "Bed & Bath",
  "serenity36": "Bed & Bath",
  "serenity37": "Bed & Bath",
  "serenity38": "Bed & Bath",
  "serenity39": "Bed & Bath",
  "serenity40": "Bed & Bath",
  "serenity41": "Bed & Bath",
  "serenity42": "Indoors",
  "serenity43": "Indoors",
  "serenity44": "Indoors",
  "serenity45": "Indoors",
  "serenity46": "Indoors",
  "serenity47": "Indoors",
};

export function categoryForImageKey(key: string): PhotoCategory | null {
  return IMAGE_CATEGORY[key] ?? null;
}
