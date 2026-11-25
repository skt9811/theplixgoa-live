// Regenerates every Android launcher icon and splash image from the site's
// own PWA brand artwork (../../../public/icon-512.png + icon-512-maskable.png
// — the same icons theplixgoa.com's manifest.json already serves). Run from
// packages/guest-app:
//   npm run icons
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const res = path.resolve(here, "../android/app/src/main/res");
const iconPng = path.resolve(here, "../../../public/icon-512.png");
const maskablePng = path.resolve(here, "../../../public/icon-512-maskable.png");
const BG = "#0F172A";

// Legacy icon px, adaptive foreground px (108dp canvas), per density.
const DENSITIES = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };

for (const [density, [icon, fg]] of Object.entries(DENSITIES)) {
  const dir = path.join(res, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith("ic_launcher")) fs.unlinkSync(path.join(dir, f));

  await sharp(iconPng).resize(icon, icon).png().toFile(path.join(dir, "ic_launcher.png"));

  const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${icon}" height="${icon}"><circle cx="${icon / 2}" cy="${icon / 2}" r="${icon / 2}"/></svg>`);
  await sharp(iconPng).resize(icon, icon).composite([{ input: circle, blend: "dest-in" }]).png().toFile(path.join(dir, "ic_launcher_round.png"));

  // Maskable PWA icons are already drawn with the adaptive-icon safe zone in
  // mind (logo inside the center ~80%), so the full-size resize (no extra
  // inset math) is correct here, unlike a plain square logo would need.
  await sharp(maskablePng).resize(fg, fg).png().toFile(path.join(dir, "ic_launcher_foreground.png"));
}
// ldpi is unused on API 24+; drop any stale default artwork.
const ldpi = path.join(res, "mipmap-ldpi");
if (fs.existsSync(ldpi)) fs.rmSync(ldpi, { recursive: true });

// Splash: solid brand navy with the logo centred, at each file's own size.
let splashes = 0;
for (const dir of fs.readdirSync(res).filter((d) => d.startsWith("drawable"))) {
  const file = path.join(res, dir, "splash.png");
  if (!fs.existsSync(file)) continue;
  const { width, height } = await sharp(file).metadata();
  const side = Math.round(Math.min(width, height) * 0.4);
  const logo = await sharp(iconPng).resize(side, side).png().toBuffer();
  const out = await sharp({ create: { width, height, channels: 4, background: BG } }).composite([{ input: logo, gravity: "center" }]).png().toBuffer();
  fs.writeFileSync(file, out);
  splashes++;
}
console.log(`Regenerated launcher icons for ${Object.keys(DENSITIES).length} densities and ${splashes} splash variants.`);
