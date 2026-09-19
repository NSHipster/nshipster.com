/**
 * Captures facts about a Jekyll reference build for comparison with the Astro build.
 *
 * Usage: node scripts/capture-reference.ts <reference-site-directory> [revisions-file]
 *
 * Writes:
 * - `src/data/legacy-assets.json`: legacy asset URLs mapped to logical asset paths,
 *   which become redirects so that old asset URLs keep working.
 * - `tests/reference/reference.json`: routes, canonical URLs, Atom entry IDs,
 *   heading anchors, and asset references, with the source revisions.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const [siteArgument, revisionsArgument] = process.argv.slice(2);
if (!siteArgument) {
  console.error("Usage: node scripts/capture-reference.ts <reference-site-directory> [revisions-file]");
  process.exit(1);
}
const site = path.resolve(siteArgument);

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory).sort()) {
    const file = path.join(directory, entry);
    if (statSync(file).isDirectory()) yield* walk(file);
    else yield file;
  }
}

/** The reference build used the production origin; normalize a local origin if present. */
const normalizeOrigin = (url: string) =>
  url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, "https://nshipster.com");

const legacyAssets: Record<string, string> = {};
const assetsDirectory = path.join(site, "assets");
for (const file of walk(assetsDirectory)) {
  const relative = path.relative(assetsDirectory, file).split(path.sep).join("/");
  const match = relative.match(/^(.*)-([0-9a-f]{64,128})(\.[^./]+)$/);
  if (!match) continue;
  legacyAssets[`/assets/${relative}`] = `${match[1]}${match[3]}`;
}

interface PageFacts {
  canonical?: string;
  robots?: string;
  anchors: string[];
  assets: string[];
}

const pages: Record<string, PageFacts> = {};
for (const file of walk(site)) {
  if (!file.endsWith(".html")) continue;
  const relative = path.relative(site, file).split(path.sep).join("/");
  const route = "/" + relative.replace(/index\.html$/, "").replace(/\.html$/, "");
  const html = readFileSync(file, "utf8");
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1];
  const anchors = [...html.matchAll(/<a class="anchor"[^>]*\sid="([^"]*)"/g)].map((match) => match[1]!);
  // Record logical asset paths; layout assets such as fonts are omitted.
  const assets = [
    ...new Set([...html.matchAll(/["'(](\/assets\/[^"')\s]+)/g)].map((match) => legacyAssets[match[1]!] ?? match[1]!)),
  ]
    .filter((asset) => !/\.(woff2?)$/.test(asset) && !/^(application\.js|screen\.css|mattt\.jpg)$/.test(asset))
    .sort();
  pages[route] = { canonical: canonical && normalizeOrigin(canonical), robots, anchors, assets };
}

const feed = readFileSync(path.join(site, "feed.xml"), "utf8");
const atomIDs = [...feed.matchAll(/<entry>[\s\S]*?<id>([^<]*)<\/id>/g)].map((match) => normalizeOrigin(match[1]!));
const sitemap = readFileSync(path.join(site, "sitemap.xml"), "utf8");
const sitemapURLs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => normalizeOrigin(match[1]!));

const revisions =
  revisionsArgument && existsSync(revisionsArgument) ? readFileSync(revisionsArgument, "utf8").trim().split(/\s+/) : [];

mkdirSync(path.join(ROOT, "src/data"), { recursive: true });
writeFileSync(path.join(ROOT, "src/data/legacy-assets.json"), JSON.stringify(legacyAssets, null, 2) + "\n");

mkdirSync(path.join(ROOT, "tests/reference"), { recursive: true });
writeFileSync(
  path.join(ROOT, "tests/reference/reference.json"),
  JSON.stringify(
    {
      description: "Facts captured from the Jekyll build of NSHipster.com, used as the migration reference.",
      revisions: { site: revisions[0], articles: revisions[1] },
      atomIDs,
      sitemapURLs,
      pages,
    },
    null,
    1,
  ) + "\n",
);
console.log(`Captured ${Object.keys(pages).length} pages and ${Object.keys(legacyAssets).length} legacy asset URLs.`);
