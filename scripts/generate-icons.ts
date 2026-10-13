/**
 * Generates browser, home screen, and installed app icons from the site logo.
 *
 * Usage: node scripts/generate-icons.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const logo = await readFile(new URL("assets/images/logo.svg", root), "utf8");
const dimensions = logo.match(/\bviewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!dimensions) throw new Error("The logo must have a viewBox starting at 0 0.");
const width = Number(dimensions[1]);
const height = Number(dimensions[2]);
const artwork = logo.replace(/^<svg\b[^>]*>\s*/, "").replace(/\s*<\/svg>\s*$/, "");
const background = "#f8f7f5";

function iconSVG(canvas: number, radius = 0): string {
  const x = Number(((width - canvas) / 2).toFixed(2));
  const y = Number(((height - canvas) / 2).toFixed(2));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${x} ${y} ${canvas} ${canvas}">
    <rect x="${x}" y="${y}" width="${canvas}" height="${canvas}" rx="${radius}" fill="${background}"/>
    ${artwork}
</svg>
`;
}

const favicon = iconSVG(width + 80, 80);
const touchIcon = iconSVG(width + 80);
// Keep even the corners of the logo's bounds within a circle of radius 38%.
// The manifest specification guarantees visibility within a radius of 40%.
const maskableIcon = iconSVG(Math.ceil(Math.hypot(width, height) / 0.76));

const icons: Array<readonly [filename: string, size: number, svg: string]> = [
  ["favicon-16x16.png", 16, favicon],
  ["favicon-32x32.png", 32, favicon],
  ["apple-touch-icon.png", 180, touchIcon],
  ["android-chrome-192x192.png", 192, favicon],
  ["android-chrome-512x512.png", 512, favicon],
  ["maskable-icon-512x512.png", 512, maskableIcon],
  // Preserve the existing icon URLs for older clients and saved links.
  ["android-chrome-384x384.png", 384, favicon],
  ["touch-icon-iphone.png", 60, touchIcon],
  ["touch-icon-iphone-retina.png", 120, touchIcon],
  ["touch-icon-ipad.png", 76, touchIcon],
  ["touch-icon-ipad-retina.png", 152, touchIcon],
  ["mstile-150x150.png", 270, touchIcon],
  ["logo.png", 500, touchIcon],
];

async function png(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 144 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

await writeFile(new URL("public/favicon.svg", root), favicon);
for (const [filename, size, svg] of icons) {
  await writeFile(new URL(`public/${filename}`, root), await png(svg, size));
}

// ICO is a directory of images. PNG frames work in current browsers and Windows.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map((size) => png(favicon, size)));
const directory = Buffer.alloc(6 + 16 * frames.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
for (const [index, frame] of frames.entries()) {
  const entry = 6 + 16 * index;
  directory[entry] = sizes[index]!;
  directory[entry + 1] = sizes[index]!;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
}
await writeFile(new URL("public/favicon.ico", root), Buffer.concat([directory, ...frames]));
console.log(`Generated ${icons.length + 2} site icons in ${fileURLToPath(new URL("public/", root))}`);
