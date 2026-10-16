/**
 * Reports the weight of each built page in `dist/`:
 * the HTML, plus the stylesheets, scripts, fonts, and images it references.
 * Each image counts once per page, as the file that a browser downloads
 * in a window 1440 pixels wide at 2x: the `srcset` candidate that `sizes` selects,
 * or the URL in `src` for an image without `srcset`.
 * Then lists the largest article images and the pages that use them,
 * marking the images that have smaller or WebP copies in `srcset`.
 *
 * Usage: node scripts/audit-page-weight.ts [dist-directory] [count]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { imageMetadata } from "astro/assets/utils";

const DIST = path.resolve(process.argv[2] ?? "dist");
const COUNT = Number(process.argv[3] ?? 20);
/** The window width in CSS pixels and the pixel density that select `srcset` candidates. */
const VIEWPORT = { width: 1440, density: 2 };

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory).sort()) {
    const file = path.join(directory, entry);
    if (statSync(file).isDirectory()) yield* walk(file);
    else yield file;
  }
}

const size = (pathname: string): number => {
  const file = path.join(DIST, decodeURIComponent(pathname));
  return existsSync(file) && statSync(file).isFile() ? statSync(file).size : 0;
};

const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(0).padStart(6)} KB`;

const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** The width in CSS pixels of a `sizes` length: `Npx`, `Nvw`, or `calc(100vw - Npx)`. */
function slotWidth(length: string): number | undefined {
  const pixels = length.match(/^(\d+(?:\.\d+)?)px$/);
  if (pixels) return Number(pixels[1]);
  const viewport = length.match(/^(\d+(?:\.\d+)?)vw$/);
  if (viewport) return (Number(viewport[1]) * VIEWPORT.width) / 100;
  const calc = length.match(/^calc\(100vw\s*-\s*(\d+(?:\.\d+)?)px\)$/);
  if (calc) return VIEWPORT.width - Number(calc[1]);
  return undefined;
}

/** The URL that a browser downloads for an `<img>`, choosing among `srcset` width descriptors as `sizes` directs. */
function selectedSource(tag: string): string | undefined {
  const src = attribute(tag, "src");
  const srcset = attribute(tag, "srcset");
  if (!srcset) return src;
  const candidates = srcset
    .split(/,\s+/)
    .map((candidate) => candidate.trim().split(/\s+/))
    .map(([url, descriptor]) => ({ url: url!, width: Number(descriptor?.match(/^(\d+)w$/)?.[1]) }))
    .filter((candidate) => candidate.width > 0)
    .sort((a, b) => a.width - b.width);
  if (candidates.length === 0) return src;
  let slot = VIEWPORT.width;
  for (const entry of (attribute(tag, "sizes") ?? "100vw").split(/,\s*(?![^(]*\))/)) {
    const match = entry.trim().match(/^(?:\(min-width:\s*(\d+)px\)\s+)?(.+)$/);
    if (!match || (match[1] && VIEWPORT.width < Number(match[1]))) continue;
    slot = slotWidth(match[2]!.trim()) ?? slot;
    break;
  }
  const needed = slot * VIEWPORT.density;
  return (candidates.find((candidate) => candidate.width >= needed) ?? candidates.at(-1)!).url;
}

interface Page {
  route: string;
  html: number;
  resources: number;
  images: number;
}

const pages: Page[] = [];
const images = new Map<string, Set<string>>();
const responsive = new Set<string>();

for (const file of [...walk(DIST)].filter((entry) => entry.endsWith(".html"))) {
  const route =
    "/" +
    path
      .relative(DIST, file)
      .split(path.sep)
      .join("/")
      .replace(/index\.html$/, "")
      .replace(/\.html$/, "");
  const html = readFileSync(file, "utf8");
  const resources = new Set<string>();
  for (const match of html.matchAll(/<link\s[^>]*?rel="(?:stylesheet|preload)"[^>]*?href="(\/[^"#?]+)"/g))
    resources.add(match[1]!);
  for (const match of html.matchAll(/<script\s[^>]*?src="(\/[^"#?]+)"/g)) resources.add(match[1]!);
  const pageImages = new Set<string>();
  const downloads = new Set<string>();
  for (const match of html.matchAll(/<img\s[^>]*?src="(\/[^"#?]+)"[^>]*>/g)) {
    pageImages.add(match[1]!);
    downloads.add(selectedSource(match[0]) ?? match[1]!);
    if (/\ssrcset="/.test(match[0])) responsive.add(match[1]!);
  }
  for (const image of pageImages) {
    if (!images.has(image)) images.set(image, new Set());
    images.get(image)!.add(route);
  }
  const sum = (urls: Set<string>) => [...urls].reduce((total, url) => total + size(url), 0);
  pages.push({ route, html: Buffer.byteLength(html), resources: sum(resources), images: sum(downloads) });
}

const total = (page: Page) => page.html + page.resources + page.images;
console.log(
  `Heaviest pages (HTML + stylesheets, scripts, and fonts + images at ${VIEWPORT.width} pixels, ${VIEWPORT.density}x):`,
);
for (const page of pages.sort((a, b) => total(b) - total(a)).slice(0, COUNT)) {
  console.log(
    `${kilobytes(total(page))}  ${page.route}  (HTML ${kilobytes(page.html).trim()}, ` +
      `resources ${kilobytes(page.resources).trim()}, images ${kilobytes(page.images).trim()})`,
  );
}

console.log(`\nLargest images:`);
const largest = [...images.keys()]
  .filter((url) => url.startsWith("/assets/"))
  .sort((a, b) => size(b) - size(a))
  .slice(0, COUNT);
for (const url of largest) {
  const data = readFileSync(path.join(DIST, decodeURIComponent(url)));
  const { width, height } = await imageMetadata(data, url).catch(() => ({ width: 0, height: 0 }));
  const copies = responsive.has(url) ? "  [has copies in srcset]" : "";
  console.log(`${kilobytes(size(url))}  ${width}×${height}  ${url}  (${[...images.get(url)!].join(", ")})${copies}`);
}
