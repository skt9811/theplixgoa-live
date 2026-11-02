// 800px-wide WebP copies of each property's hero photo (its first
// image_key), so a phone loads ~30–95 KB for the LCP image instead of the
// 1200–1920px original. Generated with sharp (width 800, WebP q72);
// FULL_WIDTH is each original's real pixel width, for an honest srcset.
import casamarina9_800 from "@/assets/casamarina9-800.webp";
import casamoana3_800 from "@/assets/casamoana3-800.webp";
import casameadows13_800 from "@/assets/casameadows13-800.webp";
import harborcourt31_800 from "@/assets/harborcourt31-800.webp";
import plixvilla27_800 from "@/assets/plixvilla27-800.webp";
import morjimpride6_800 from "@/assets/morjimpride6-800.webp";
import plixresortnew17_800 from "@/assets/plixresortnew17-800.webp";
import villamadera16_800 from "@/assets/villamadera16-800.webp";
import serenity3_800 from "@/assets/serenity3-800.webp";
import vivendachico1Mobile from "@/assets/vivendachico1-mobile.webp";
import { chicoHeroImage, chicoHeroImageDesktopWebp, chicoHeroImageMobileWebp } from "@/lib/plix";

const SMALL: Record<string, string> = {
  casamarina9: casamarina9_800,
  casamoana3: casamoana3_800,
  casameadows13: casameadows13_800,
  harborcourt31: harborcourt31_800,
  plixvilla27: plixvilla27_800,
  morjimpride6: morjimpride6_800,
  plixresortnew17: plixresortnew17_800,
  villamadera16: villamadera16_800,
  serenity3: serenity3_800,
  vivendachico1: vivendachico1Mobile,
};

const FULL_WIDTH: Record<string, number> = {
  casamarina9: 1920,
  casamoana3: 1600,
  casameadows13: 1920,
  harborcourt31: 1200,
  plixvilla27: 1400,
  morjimpride6: 1200,
  vivendachico1: 1200,
  plixresortnew17: 1920,
  villamadera16: 1600,
  serenity3: 1400,
};

/** "small 800w, full NNNNw" for a hero photo that has an 800px copy, else undefined. */
export function heroSrcSet(key: string | undefined, fullSrc: string): string | undefined {
  if (!key) return undefined;
  const small = SMALL[key];
  const width = FULL_WIDTH[key];
  return small && width && width > 800 ? `${small} 800w, ${fullSrc} ${width}w` : undefined;
}

/** Homepage hero (default slide 1): one srcset shared by its <img> and its
 * preload, so the browser fetches exactly one copy. */
export const HOME_HERO_SRCSET = `${chicoHeroImageMobileWebp} 800w, ${chicoHeroImage} 1200w, ${chicoHeroImageDesktopWebp} 1920w`;
export const HOME_HERO_SIZES = "100vw";
