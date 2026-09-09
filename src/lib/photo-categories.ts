// Per-image-key photo categories for the gallery filter pills. Image keys
// (e.g. "5bhk12", "HC5") are opaque camera-export identifiers with no
// descriptive filename to keyword-match against, so every entry here was
// assigned by actually looking at the photo (via generated contact-sheet
// montages, one per property) — never guessed from the key string. A key
// with no entry simply has no category and only shows up under the "All"
// filter; that's a real gap in this map, not a bug in the component that
// reads it.
export type PhotoCategory = "Outdoors" | "Amenities" | "Indoors" | "Bed & Bath";

export const PHOTO_CATEGORIES: readonly PhotoCategory[] = [
  "Outdoors",
  "Amenities",
  "Indoors",
  "Bed & Bath",
];

export const IMAGE_CATEGORY: Partial<Record<string, PhotoCategory>> = {
  // Casa Meadows (5bhk*) — all 14 reviewed.
  "5bhk12": "Outdoors",
  "5bhk13": "Outdoors",
  "5bhk11": "Outdoors",
  "5bhk14": "Outdoors",
  "5bhk": "Indoors",
  "5bhk10": "Indoors",
  "5bhk1": "Bed & Bath",
  "5bhk2": "Bed & Bath",
  "5bhk3": "Bed & Bath",
  "5bhk4": "Bed & Bath",
  "5bhk6": "Bed & Bath",
  "5bhk9": "Bed & Bath",
  "5bhk7": "Bed & Bath",
  "5bhk8": "Bed & Bath",

  // Casa Marina (4bhk*) — all 12 reviewed.
  "4bhk": "Outdoors",
  "4bhk1": "Outdoors",
  "4bhk2": "Outdoors",
  "4bhk3": "Outdoors",
  "4bhk4": "Bed & Bath",
  "4bhk5": "Bed & Bath",
  "4bhk6": "Indoors",
  "4bhk7": "Indoors",
  "4bhk8": "Bed & Bath",
  "4bhk9": "Indoors",
  "4bhk10": "Bed & Bath",
  "4bhk11": "Bed & Bath",

  // Casa Moana (3bhk*) — all 12 reviewed.
  "3bhk4": "Bed & Bath",
  "3bhk1": "Outdoors",
  "3bhk3": "Bed & Bath",
  "3bhk5": "Indoors",
  "3bhk6": "Bed & Bath",
  "3bhk7": "Bed & Bath",
  "3bhk9": "Outdoors",
  "3bhk10": "Outdoors",
  "3bhk11": "Outdoors",
  "3bhk": "Bed & Bath",
  "3bhk2": "Bed & Bath",
  "3bhk8": "Indoors",

  // Harbor Court (HC*) — all 8 reviewed.
  "HC5": "Outdoors",
  "HC1": "Bed & Bath",
  "HC2": "Bed & Bath",
  "HC3": "Bed & Bath",
  "HC4": "Bed & Bath",
  "HC6": "Outdoors",
  "HC7": "Outdoors",
  "HC8": "Outdoors",

  // Morjim Pride (MP*) — all 12 reviewed.
  "MP8": "Outdoors",
  "MP": "Outdoors",
  "MP1": "Outdoors",
  "MP2": "Amenities",
  "MP3": "Outdoors",
  "MP4": "Outdoors",
  "MP5": "Outdoors",
  "MP6": "Amenities",
  "MP7": "Outdoors",
  "MP9": "Bed & Bath",
  "MP10": "Bed & Bath",
  "MP11": "Bed & Bath",

  // The Plix Resort Morjim (plixResort*) — all 8 reviewed.
  "plixResort1": "Outdoors",
  "plixResort2": "Outdoors",
  "plixResort3": "Outdoors",
  "plixResort4": "Bed & Bath",
  "plixResort5": "Outdoors",
  "plixResort6": "Outdoors",
  "plixResort7": "Outdoors",
  "plixResort8": "Bed & Bath",

  // Villa Madera (madera*) — all 6 reviewed.
  "madera1": "Outdoors",
  "madera2": "Outdoors",
  "madera3": "Bed & Bath",
  "madera4": "Bed & Bath",
  "madera5": "Bed & Bath",
  "madera6": "Bed & Bath",

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

  // The Plix Villa (plix*) — all 15 reviewed.
  "plix4": "Bed & Bath",
  "plix": "Outdoors",
  "plix1": "Indoors",
  "plix2": "Indoors",
  "plix3": "Bed & Bath",
  "plix5": "Bed & Bath",
  "plix6": "Bed & Bath",
  "plix7": "Bed & Bath",
  "plix8": "Amenities",
  "plix9": "Indoors",
  "plix10": "Indoors",
  "plix11": "Outdoors",
  "plix12": "Outdoors",
  "plix13": "Outdoors",
  "plix14": "Amenities",

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
