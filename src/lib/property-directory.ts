// Pure, image-free mirror of a few PROPERTIES (src/lib/plix.ts) fields, for
// server modules that only need to validate or resolve a property SLUG —
// never the full Property record (photos, description, SEO copy, etc).
//
// plix.ts opens with ~100 unconditional .jpg/.webp/.mp4 imports for property
// galleries. That's fine for Vite (which bundles/rewrites them at build
// time), but plain Node/tsx cannot execute an image import at all — and
// scripts/pair-whatsapp.ts and scripts/test-whatsapp-audit.ts are run
// exactly that way (`tsx scripts/...ts`), never through Vite. Every module
// on their import chain (tenant-context.server.ts, pms-schema.server.ts,
// pms-users.server.ts, portal-session.server.ts) used to statically
// `import { PROPERTIES } from "@/lib/plix"` just to read `.slug`/`.name` off
// it, which dragged the asset imports in regardless of which export was
// actually used — `import type` erases at compile time, but these were all
// real value imports. This file exists so those modules (and these two
// scripts) can get the same slugs/names without ever touching plix.ts.
//
// Order matters for PROPERTY_SLUGS: portal-session.server.ts's admin
// property-selector fallback reads PROPERTY_SLUGS[0] as "the first
// property", mirroring plix.ts's own PROPERTIES[0] — this list is in the
// exact same order as PROPERTIES there.
//
// The 10 real Plix properties are static and have not changed since this
// codebase's first commit. If PROPERTIES in plix.ts ever gains, loses, or
// renames one, this file needs the matching update — cross-file
// type-checking can't catch that drift, since both are just string literals.
// (property-codes.ts already carries the same tradeoff for its own
// slug->login-code map, for the same reason.)
export const PROPERTY_SLUGS: readonly string[] = [
  "casa-marina",
  "casa-moana",
  "casa-meadows",
  "harbor-court",
  "the-plix-villa",
  "morjim-pride",
  "vivenda-chico",
  "the-plix-resort-morjim",
  "villa-madera",
  "casa-serenita",
];

export const PROPERTY_NAMES: Record<string, string> = {
  "casa-marina": "Casa Marina",
  "casa-moana": "Casa Moana",
  "casa-meadows": "Casa Meadows",
  "harbor-court": "Harbor Court - Boutique Resort Vagator",
  "the-plix-villa": "The Plix Villa - 3 BHK Luxury Private Pool Villa",
  "morjim-pride": "Morjim Pride",
  "vivenda-chico": "Vivenda Chico - 8 BHK Heritage Bungalow",
  "the-plix-resort-morjim": "The Plix Resort - Morjim",
  "villa-madera": "Villa Madera",
  "casa-serenita": "Casa Serenita",
};

/** Real logic (not PROPERTIES-derived), relocated from rates.ts — that file
 * itself statically imports gstRateForRoomRate from @/lib/plix, so even
 * these two plix-independent functions couldn't be imported from there
 * without dragging the same image imports in. rates.ts re-exports both from
 * here now, so its other ~15 existing importers are unaffected. */
export function isMultiRoomProperty(propertyId: string): boolean {
  return (
    propertyId === "harbor-court" ||
    propertyId === "morjim-pride" ||
    propertyId === "the-plix-resort-morjim" ||
    propertyId === "vivenda-chico"
  );
}

export function maxRoomsForProperty(propertyId: string): number {
  if (propertyId === "harbor-court") return 10;
  if (propertyId === "morjim-pride") return 22;
  if (propertyId === "the-plix-resort-morjim") return 10;
  if (propertyId === "vivenda-chico") return 8;
  return 1;
}
