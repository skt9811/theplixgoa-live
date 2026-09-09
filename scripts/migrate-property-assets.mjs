import sharp from "sharp";
import path from "node:path";
import { readdirSync, statSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

const ASSETS = path.resolve(process.cwd(), "src/assets");

// filenamePrefix -> { keyPrefix, propertyId }
const PROPERTIES = [
  { filePrefix: "Morjim_Pride_", keyPrefix: "morjimpride", propertyId: "morjim-pride" },
  { filePrefix: "Harbor_Court_", keyPrefix: "harborcourt", propertyId: "harbor-court" },
  { filePrefix: "Plix_Villa_", keyPrefix: "plixvilla", propertyId: "the-plix-villa" },
  { filePrefix: "Casa_Marina_", keyPrefix: "casamarina", propertyId: "casa-marina" },
  { filePrefix: "Casa_Moana_", keyPrefix: "casamoana", propertyId: "casa-moana" },
  { filePrefix: "Casa_Meadows_", keyPrefix: "casameadows", propertyId: "casa-meadows" },
  { filePrefix: "Plix_Resort_", keyPrefix: "plixresortnew", propertyId: "the-plix-resort-morjim" },
  { filePrefix: "Villa_Madera_", keyPrefix: "villamadera", propertyId: "villa-madera" },
];

const manifest = {};

for (const { filePrefix, keyPrefix, propertyId } of PROPERTIES) {
  const files = readdirSync(ASSETS)
    .filter((f) => f.startsWith(filePrefix))
    .sort();
  const keys = [];
  let index = 1;
  for (const file of files) {
    const input = path.join(ASSETS, file);
    const key = `${keyPrefix}${index}`;
    const output = path.join(ASSETS, `${key}.jpg`);
    const tmp = path.join(ASSETS, `${key}.tmp.jpg`);
    const before = statSync(input).size;
    await sharp(input)
      .resize({ width: 1920, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(tmp);
    const after = statSync(tmp).size;
    unlinkSync(input);
    renameSync(tmp, output);
    console.log(`${file} -> ${key}.jpg: ${(before / 1048576).toFixed(2)}MB -> ${(after / 1024).toFixed(0)}KB`);
    keys.push(key);
    index++;
  }
  manifest[propertyId] = { keyPrefix, keys };
}

writeFileSync("/tmp/asset-migration-manifest.json", JSON.stringify(manifest, null, 2));
console.log("\nmanifest written to /tmp/asset-migration-manifest.json");
