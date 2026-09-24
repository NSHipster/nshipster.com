/**
 * Reports the weight of each built page in `dist/`:
 * the HTML, plus the stylesheets, scripts, fonts, and images it references.
 * Images count once per page, at the URL in `src`,
 * which is what a browser that ignores `srcset` downloads.
 * Then lists the largest article images and the pages that use them,
 * marking the images that already have smaller copies in `srcset`
 * (see `src/data/responsive-images.json`).
 *
 * Usage: node scripts/audit-page-weight.ts [dist-directory] [count]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { imageMetadata } from "astro/assets/utils";

const DIST = path.resolve(process.argv[2] ?? "dist");
const COUNT = Number(process.argv[3] ?? 20);

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
      .replace(/index\.html$/, "");
  const html = readFileSync(file, "utf8");
  const resources = new Set<string>();
  for (const match of html.matchAll(/<link\s[^>]*?rel="(?:stylesheet|preload)"[^>]*?href="(\/[^"#?]+)"/g))
    resources.add(match[1]!);
  for (const match of html.matchAll(/<script\s[^>]*?src="(\/[^"#?]+)"/g)) resources.add(match[1]!);
  const pageImages = new Set<string>();
  for (const match of html.matchAll(/<img\s[^>]*?src="(\/[^"#?]+)"[^>]*>/g)) {
    pageImages.add(match[1]!);
    if (/\ssrcset="/.test(match[0])) responsive.add(match[1]!);
  }
  for (const image of pageImages) {
    if (!images.has(image)) images.set(image, new Set());
    images.get(image)!.add(route);
  }
  const sum = (urls: Set<string>) => [...urls].reduce((total, url) => total + size(url), 0);
  pages.push({ route, html: Buffer.byteLength(html), resources: sum(resources), images: sum(pageImages) });
}

const total = (page: Page) => page.html + page.resources + page.images;
console.log(`Heaviest pages (HTML + stylesheets, scripts, and fonts + images):`);
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
  const copies = responsive.has(url) ? "  [has smaller copies]" : "";
  console.log(`${kilobytes(size(url))}  ${width}×${height}  ${url}  (${[...images.get(url)!].join(", ")})${copies}`);
}
