// Regenerates every Android launcher icon and splash image from the PMS
// brand artwork (../../public/pms-icon.svg). Run from packages/pms-mobile:
//   npm run icons
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const res = path.resolve(here, "../android/app/src/main/res");
const iconSvg = fs.readFileSync(path.resolve(here, "../../../public/pms-icon.svg"));
const BG = "#0E231D";

// The "P" + keyhole on its own, no rounded frame, for adaptive-icon
// foregrounds and the splash: same paths as pms-icon.svg.
const emblemSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#F3DE9A"/><stop offset="0.35" stop-color="#D4AF37"/><stop offset="0.65" stop-color="#E6C766"/><stop offset="1" stop-color="#A88427"/>
  </linearGradient></defs>
  <path d="M188 398V114H292a82 82 0 0 1 0 164H188" fill="none" stroke="url(#g)" stroke-width="46" stroke-linejoin="round"/>
  <path d="M282 168a24 24 0 1 1 0 48 24 24 0 0 1 0-48Zm-10 40h20l12 46h-44Z" fill="url(#g)"/>
  <circle cx="282" cy="192" r="10" fill="${BG}"/><path d="M277 200h10l6 28h-22Z" fill="${BG}"/>
</svg>`;

// Launcher densities: legacy icon px, adaptive foreground px (108dp canvas).
const DENSITIES = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };

for (const [density, [icon, fg]] of Object.entries(DENSITIES)) {
  const dir = path.join(res, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith("ic_launcher")) fs.unlinkSync(path.join(dir, f));

  await sharp(iconSvg, { density: 384 }).resize(icon, icon).png().toFile(path.join(dir, "ic_launcher.png"));

  const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${icon}" height="${icon}"><circle cx="${icon / 2}" cy="${icon / 2}" r="${icon / 2}"/></svg>`);
  await sharp(iconSvg, { density: 384 }).resize(icon, icon).composite([{ input: circle, blend: "dest-in" }]).png().toFile(path.join(dir, "ic_launcher_round.png"));

  // Adaptive foreground: emblem inside the 66/108 safe zone, transparent elsewhere.
  const inner = Math.round(fg * 0.56);
  const emblem = await sharp(Buffer.from(emblemSvg), { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: emblem, gravity: "center" }])
    .png()
    .toFile(path.join(dir, "ic_launcher_foreground.png"));
}
// ldpi is unused on API 24+; drop any stale default artwork.
const ldpi = path.join(res, "mipmap-ldpi");
if (fs.existsSync(ldpi)) fs.rmSync(ldpi, { recursive: true });

// Splash: solid #0E231D with the emblem centred, at each file's own size.
let splashes = 0;
for (const dir of fs.readdirSync(res).filter((d) => d.startsWith("drawable"))) {
  const file = path.join(res, dir, "splash.png");
  if (!fs.existsSync(file)) continue;
  const { width, height } = await sharp(file).metadata();
  const side = Math.round(Math.min(width, height) * 0.3);
  const emblem = await sharp(Buffer.from(emblemSvg), { density: 384 }).resize(side, side).png().toBuffer();
  const out = await sharp({ create: { width, height, channels: 4, background: BG } }).composite([{ input: emblem, gravity: "center" }]).png().toBuffer();
  fs.writeFileSync(file, out);
  splashes++;
}
console.log(`Icons written for ${Object.keys(DENSITIES).join(", ")}; ${splashes} splash images regenerated.`);
