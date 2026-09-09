import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("/tmp/asset-migration-manifest.json", "utf8"));
let src = readFileSync("src/lib/plix.ts", "utf8");

function importBlock(keys) {
  return keys.map((k) => `import ${k} from "@/assets/${k}.jpg";`).join("\n");
}
function mapBlock(keys) {
  return keys.map((k) => `  ${k},`).join("\n");
}
function keysArray(keys) {
  return `[\n      ${keys.map((k) => `"${k}"`).join(",\n      ")},\n    ]`;
}

function replaceOnce(label, oldStr, newStr) {
  const count = src.split(oldStr).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly 1 occurrence of old string, found ${count}`);
  }
  src = src.replace(oldStr, newStr);
  console.log(`${label}: replaced`);
}

// ---- 1. Import blocks ----
replaceOnce(
  "harbor-court imports",
  `// Harbor Court
import HC1 from "@/assets/HC1.jpg";
import HC2 from "@/assets/HC2.jpg";
import HC3 from "@/assets/HC3.jpg";
import HC4 from "@/assets/HC4.jpg";
import HC5 from "@/assets/HC5.jpg";
import HC6 from "@/assets/HC6.jpg";
import HC7 from "@/assets/HC7.jpg";
import HC8 from "@/assets/HC8.jpg";`,
  `// Harbor Court\n${importBlock(manifest["harbor-court"].keys)}`,
);

replaceOnce(
  "morjim-pride imports",
  `// Morjim Pride
import MP from "@/assets/MP.jpg";
import MP1 from "@/assets/MP1.jpg";
import MP2 from "@/assets/MP2.jpg";
import MP3 from "@/assets/MP3.jpg";
import MP4 from "@/assets/MP4.jpg";
import MP5 from "@/assets/MP5.jpg";
import MP6 from "@/assets/MP6.jpg";
import MP7 from "@/assets/MP7.jpg";
import MP8 from "@/assets/MP8.jpg";
import MP9 from "@/assets/MP9.jpg";
import MP10 from "@/assets/MP10.jpg";
import MP11 from "@/assets/MP11.jpg";`,
  `// Morjim Pride\n${importBlock(manifest["morjim-pride"].keys)}`,
);

replaceOnce(
  "casa-moana imports",
  `// Casa Moana (4 BHK) images — asset files are named 3bhk* despite belonging to Casa Moana
import bhk3 from "@/assets/3bhk.jpg";
import bhk3_1 from "@/assets/3bhk1.jpg";
import bhk3_2 from "@/assets/3bhk2.jpg";
import bhk3_3 from "@/assets/3bhk3.jpg";
import bhk3_4 from "@/assets/3bhk4.jpg";
import bhk3_5 from "@/assets/3bhk5.jpg";
import bhk3_6 from "@/assets/3bhk6.jpg";
import bhk3_7 from "@/assets/3bhk7.jpg";
import bhk3_8 from "@/assets/3bhk8.jpg";
import bhk3_9 from "@/assets/3bhk9.jpg";
import bhk3_10 from "@/assets/3bhk10.jpg";
import bhk3_11 from "@/assets/3bhk11.jpg";`,
  `// Casa Moana\n${importBlock(manifest["casa-moana"].keys)}`,
);

replaceOnce(
  "casa-marina imports",
  `// Casa Marina (3 BHK) images — asset files are named 4bhk* despite belonging to Casa Marina
import bhk4 from "@/assets/4bhk.jpg";
import bhk4_1 from "@/assets/4bhk1.jpg";
import bhk4_2 from "@/assets/4bhk2.jpg";
import bhk4_3 from "@/assets/4bhk3.jpg";
import bhk4_4 from "@/assets/4bhk4.jpg";
import bhk4_5 from "@/assets/4bhk5.jpg";
import bhk4_6 from "@/assets/4bhk6.jpg";
import bhk4_7 from "@/assets/4bhk7.jpg";
import bhk4_8 from "@/assets/4bhk8.jpg";
import bhk4_9 from "@/assets/4bhk9.jpg";
import bhk4_10 from "@/assets/4bhk10.jpg";
import bhk4_11 from "@/assets/4bhk11.jpg";`,
  `// Casa Marina\n${importBlock(manifest["casa-marina"].keys)}`,
);

replaceOnce(
  "casa-meadows imports",
  `// Casa Meadows (5bhk)
import bhk5 from "@/assets/5bhk.jpg";
import bhk5_1 from "@/assets/5bhk1.jpg";
import bhk5_2 from "@/assets/5bhk2.jpg";
import bhk5_3 from "@/assets/5bhk3.jpg";
import bhk5_4 from "@/assets/5bhk4.jpg";
import bhk5_5 from "@/assets/5bhk5.jpg";
import bhk5_6 from "@/assets/5bhk6.jpg";
import bhk5_7 from "@/assets/5bhk7.jpg";
import bhk5_8 from "@/assets/5bhk8.jpg";
import bhk5_9 from "@/assets/5bhk9.jpg";
import bhk5_10 from "@/assets/5bhk10.jpg";
import bhk5_11 from "@/assets/5bhk11.jpg";
import bhk5_12 from "@/assets/5bhk12.jpg";
import bhk5_13 from "@/assets/5bhk13.jpg";
import bhk5_14 from "@/assets/5bhk14.jpg";`,
  `// Casa Meadows\n${importBlock(manifest["casa-meadows"].keys)}`,
);

replaceOnce(
  "plix-villa imports",
  `// The Plix Villa
import plix from "@/assets/plix.jpeg";
import plix1 from "@/assets/plix1.jpeg";
import plix2 from "@/assets/plix2.jpeg";
import plix3 from "@/assets/plix3.jpeg";
import plix4 from "@/assets/plix4.jpeg";
import plix5 from "@/assets/plix5.jpeg";
import plix6 from "@/assets/plix6.jpeg";
import plix7 from "@/assets/plix7.jpeg";
import plix8 from "@/assets/plix8.jpeg";
import plix9 from "@/assets/plix9.jpeg";
import plix10 from "@/assets/plix10.jpeg";
import plix11 from "@/assets/plix11.jpeg";
import plix12 from "@/assets/plix12.jpeg";
import plix13 from "@/assets/plix13.jpeg";
import plix14 from "@/assets/plix14.jpeg";`,
  `// The Plix Villa\n${importBlock(manifest["the-plix-villa"].keys)}`,
);

replaceOnce(
  "plix-resort imports",
  `// The Plix Resort - Morjim
import plixResort1 from "@/assets/plixresort1.jpg";
import plixResort2 from "@/assets/plixresort2.jpg";
import plixResort3 from "@/assets/plixresort3.jpg";
import plixResort4 from "@/assets/plixresort4.jpg";
import plixResort5 from "@/assets/plixresort5.jpg";
import plixResort6 from "@/assets/plixresort6.jpg";
import plixResort7 from "@/assets/plixresort7.jpg";
import plixResort8 from "@/assets/plixresort8.jpg";`,
  `// The Plix Resort - Morjim\n${importBlock(manifest["the-plix-resort-morjim"].keys)}`,
);

replaceOnce(
  "villa-madera imports",
  `// Villa Madera
import madera1 from "@/assets/madera1.jpg";
import madera2 from "@/assets/madera2.jpg";
import madera3 from "@/assets/madera3.jpg";
import madera4 from "@/assets/madera4.jpg";
import madera5 from "@/assets/madera5.jpg";
import madera6 from "@/assets/madera6.jpg";`,
  `// Villa Madera\n${importBlock(manifest["villa-madera"].keys)}`,
);

// ---- 2. imageMap entries ----
replaceOnce(
  "harbor-court imageMap",
  `  HC1,
  HC2,
  HC3,
  HC4,
  HC5,
  HC6,
  HC7,
  HC8,`,
  mapBlock(manifest["harbor-court"].keys),
);

replaceOnce(
  "morjim-pride imageMap",
  `  MP,
  MP1,
  MP2,
  MP3,
  MP4,
  MP5,
  MP6,
  MP7,
  MP8,
  MP9,
  MP10,
  MP11,`,
  mapBlock(manifest["morjim-pride"].keys),
);

replaceOnce(
  "casa-moana imageMap",
  `  "3bhk": bhk3,
  "3bhk1": bhk3_1,
  "3bhk2": bhk3_2,
  "3bhk3": bhk3_3,
  "3bhk4": bhk3_4,
  "3bhk5": bhk3_5,
  "3bhk6": bhk3_6,
  "3bhk7": bhk3_7,
  "3bhk8": bhk3_8,
  "3bhk9": bhk3_9,
  "3bhk10": bhk3_10,
  "3bhk11": bhk3_11,`,
  mapBlock(manifest["casa-moana"].keys),
);

replaceOnce(
  "casa-marina imageMap",
  `  "4bhk": bhk4,
  "4bhk1": bhk4_1,
  "4bhk2": bhk4_2,
  "4bhk3": bhk4_3,
  "4bhk4": bhk4_4,
  "4bhk5": bhk4_5,
  "4bhk6": bhk4_6,
  "4bhk7": bhk4_7,
  "4bhk8": bhk4_8,
  "4bhk9": bhk4_9,
  "4bhk10": bhk4_10,
  "4bhk11": bhk4_11,`,
  mapBlock(manifest["casa-marina"].keys),
);

replaceOnce(
  "casa-meadows imageMap",
  `  "5bhk": bhk5,
  "5bhk1": bhk5_1,
  "5bhk2": bhk5_2,
  "5bhk3": bhk5_3,
  "5bhk4": bhk5_4,
  "5bhk5": bhk5_5,
  "5bhk6": bhk5_6,
  "5bhk7": bhk5_7,
  "5bhk8": bhk5_8,
  "5bhk9": bhk5_9,
  "5bhk10": bhk5_10,
  "5bhk11": bhk5_11,
  "5bhk12": bhk5_12,
  "5bhk13": bhk5_13,
  "5bhk14": bhk5_14,`,
  mapBlock(manifest["casa-meadows"].keys),
);

replaceOnce(
  "plix-villa imageMap",
  `  plix,
  plix1,
  plix2,
  plix3,
  plix4,
  plix5,
  plix6,
  plix7,
  plix8,
  plix9,
  plix10,
  plix11,
  plix12,
  plix13,
  plix14,`,
  mapBlock(manifest["the-plix-villa"].keys),
);

replaceOnce(
  "plix-resort imageMap",
  `  plixResort1,
  plixResort2,
  plixResort3,
  plixResort4,
  plixResort5,
  plixResort6,
  plixResort7,
  plixResort8,`,
  mapBlock(manifest["the-plix-resort-morjim"].keys),
);

replaceOnce(
  "villa-madera imageMap",
  `  madera1,
  madera2,
  madera3,
  madera4,
  madera5,
  madera6,`,
  mapBlock(manifest["villa-madera"].keys),
);

// ---- 3. image_keys arrays ----
replaceOnce(
  "harbor-court image_keys",
  `image_keys: ["HC5", "HC1", "HC2", "HC3", "HC4", "HC6", "HC7", "HC8"],`,
  `image_keys: ${keysArray(manifest["harbor-court"].keys)},`,
);

replaceOnce(
  "morjim-pride image_keys",
  `image_keys: ["MP8", "MP", "MP1", "MP2", "MP3", "MP4", "MP5", "MP6", "MP7", "MP9", "MP10", "MP11"],`,
  `image_keys: ${keysArray(manifest["morjim-pride"].keys)},`,
);

replaceOnce(
  "casa-moana image_keys",
  `    image_keys: [
      "3bhk4",
      "3bhk1",
      "3bhk3",
      "3bhk5",
      "3bhk6",
      "3bhk7",
      "3bhk9",
      "3bhk10",
      "3bhk11",
      "3bhk",
      "3bhk2",
      "3bhk8",
    ],`,
  `    image_keys: ${keysArray(manifest["casa-moana"].keys)},`,
);

replaceOnce(
  "casa-marina image_keys",
  `    image_keys: [
      "4bhk1",
      "4bhk",
      "4bhk2",
      "4bhk3",
      "4bhk4",
      "4bhk5",
      "4bhk6",
      "4bhk7",
      "4bhk8",
      "4bhk9",
      "4bhk10",
      "4bhk11",
    ],`,
  `    image_keys: ${keysArray(manifest["casa-marina"].keys)},`,
);

replaceOnce(
  "casa-meadows image_keys",
  `    image_keys: [
      "5bhk6",
      "5bhk12",
      "5bhk",
      "5bhk1",
      "5bhk2",
      "5bhk3",
      "5bhk4",
      "5bhk7",
      "5bhk8",
      "5bhk9",
      "5bhk10",
      "5bhk11",
      "5bhk13",
      "5bhk14",
    ],`,
  `    image_keys: ${keysArray(manifest["casa-meadows"].keys)},`,
);

replaceOnce(
  "plix-villa image_keys",
  `image_keys: ["plix4", "plix", "plix1", "plix2", "plix3", "plix5", "plix6", "plix7", "plix8", "plix9", "plix10", "plix11", "plix12", "plix13", "plix14"],`,
  `image_keys: ${keysArray(manifest["the-plix-villa"].keys)},`,
);

replaceOnce(
  "plix-resort image_keys",
  `image_keys: ["plixResort1", "plixResort2", "plixResort3", "plixResort4", "plixResort5", "plixResort6", "plixResort7", "plixResort8"],`,
  `image_keys: ${keysArray(manifest["the-plix-resort-morjim"].keys)},`,
);

replaceOnce(
  "villa-madera image_keys",
  `image_keys: ["madera1", "madera2", "madera3", "madera4", "madera5", "madera6"],`,
  `image_keys: ${keysArray(manifest["villa-madera"].keys)},`,
);

writeFileSync("src/lib/plix.ts", src);
console.log("\nAll replacements applied successfully.");
