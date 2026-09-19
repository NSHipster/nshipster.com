/**
 * Compares the Astro build in `dist/` with the Jekyll reference.
 *
 * Usage: node scripts/compare-reference.ts [reference-site-directory] [--verbose] [--only=slug]
 *
 * Always compares routes, canonical URLs, robots directives, heading anchors,
 * asset references, Atom IDs, and sitemap URLs with `tests/reference/reference.json`.
 * With a reference site directory, also compares the text and structure of each page's content.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Element, Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { select, selectAll } from "hast-util-select";
import { toString } from "hast-util-to-string";
import { AssetManifest } from "../src/lib/assets.ts";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const only = args.find((arg) => arg.startsWith("--only="))?.slice(7);
const referenceSite = args.find((arg) => !arg.startsWith("--"));

interface Reference {
  atomIDs: string[];
  sitemapURLs: string[];
  pages: Record<string, { canonical?: string; robots?: string; anchors: string[]; assets: string[] }>;
}
const reference = JSON.parse(readFileSync(path.join(ROOT, "tests/reference/reference.json"), "utf8")) as Reference;

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory).sort()) {
    const file = path.join(directory, entry);
    if (statSync(file).isDirectory()) yield* walk(file);
    else yield file;
  }
}

const routeFile = (route: string) => {
  const candidates = route.endsWith("/")
    ? [path.join(route, "index.html")]
    : [`${route}.html`, path.join(route, "index.html")];
  return candidates.map((candidate) => path.join(DIST, candidate)).find(existsSync);
};

const manifest = new AssetManifest();
const logicalByURL = new Map<string, string>();
for (const [url, { asset }] of manifest.outputs()) logicalByURL.set(url, asset.logical);

const problems: string[] = [];
const notes: string[] = [];
const report = (message: string) => problems.push(message);

// Routes present in the reference but missing from the Astro build.
const builtRoutes = new Set<string>();
for (const file of walk(DIST)) {
  if (!file.endsWith(".html")) continue;
  const relative = path.relative(DIST, file).split(path.sep).join("/");
  builtRoutes.add("/" + relative.replace(/index\.html$/, "").replace(/\.html$/, ""));
}
for (const route of Object.keys(reference.pages)) {
  if (!builtRoutes.has(route)) report(`Missing route ${route}`);
}
for (const route of builtRoutes) {
  if (!(route in reference.pages)) notes.push(`New route ${route}`);
}

// Author avatars now use Astro's image pipeline instead of `/assets/`.
const avatars = new Set(
  readdirSync(path.join(ROOT, "collections/en/_authors"))
    .map(
      (file) => readFileSync(path.join(ROOT, "collections/en/_authors", file), "utf8").match(/^image:\s*(\S+)/m)?.[1],
    )
    .filter(Boolean),
);
// Compare without extensions: the Jekyll pipeline renamed some, e.g. `.m4v` to `.mp4`.
const withoutExtension = (asset: string) => asset.replace(/\.[^./]+$/, "");
const normalizeAssets = (assets: string[]) =>
  [...new Set(assets.filter((asset) => !avatars.has(asset)).map(withoutExtension))].sort();
const logicalAssets = (html: string) =>
  normalizeAssets(
    [...html.matchAll(/["'(](\/assets\/[^"')\s]+)/g)]
      .map((match) => logicalByURL.get(match[1]!) ?? match[1]!)
      .filter((asset) => !/\.(woff2?)$/.test(asset) && !/^(application\.js|screen\.css)$/.test(asset)),
  );

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

for (const [route, facts] of Object.entries(reference.pages)) {
  if (only && !route.includes(only)) continue;
  const file = routeFile(route);
  if (!file) continue;
  const html = readFileSync(file, "utf8");
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  if (canonical !== facts.canonical && !(route === "/status" && canonical === "https://nshipster.com/status")) {
    report(`${route}: canonical ${canonical} differs from ${facts.canonical}`);
  }
  const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1];
  if (robots !== facts.robots) report(`${route}: robots ${robots} differs from ${facts.robots}`);

  const anchors = [...html.matchAll(/<a class="anchor"[^>]*\sid="([^"]*)"/g)].map((match) => match[1]!);
  if (!sameList(anchors, facts.anchors)) {
    const missing = facts.anchors.filter((anchor) => !anchors.includes(anchor));
    const added = anchors.filter((anchor) => !facts.anchors.includes(anchor));
    report(
      `${route}: heading anchors differ (missing: ${missing.join(", ") || "none"}; added: ${added.join(", ") || "none"})`,
    );
  }
  const assets = logicalAssets(html);
  const expectedAssets = normalizeAssets(facts.assets);
  if (!sameList(assets, expectedAssets)) {
    const missing = expectedAssets.filter((asset) => !assets.includes(asset));
    const added = assets.filter((asset) => !expectedAssets.includes(asset));
    if (missing.length || added.length) {
      report(
        `${route}: asset references differ (missing: ${missing.join(", ") || "none"}; added: ${added.join(", ") || "none"})`,
      );
    }
  }
}

const feed = readFileSync(path.join(DIST, "feed.xml"), "utf8");
const atomIDs = [...feed.matchAll(/<entry>[\s\S]*?<id>([^<]*)<\/id>/g)].map((match) => match[1]!);
if (!sameList(atomIDs, reference.atomIDs))
  report(`Atom IDs differ:\n  ${atomIDs.join("\n  ")}\nexpected:\n  ${reference.atomIDs.join("\n  ")}`);

const sitemap = readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
const sitemapURLs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]!);
if (!sameList([...sitemapURLs].sort(), [...reference.sitemapURLs].sort())) {
  const missing = reference.sitemapURLs.filter((url) => !sitemapURLs.includes(url));
  const added = sitemapURLs.filter((url) => !reference.sitemapURLs.includes(url));
  report(`Sitemap URLs differ (missing: ${missing.join(", ") || "none"}; added: ${added.join(", ") || "none"})`);
}

/** Compares the text and element counts of each page's main content. */
function compareContent(site: string): void {
  const normalize = (text: string) =>
    text
      .replace(/[​­]/g, "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      // Whitespace differs with HTML formatting, so compare without it.
      .replace(/\s+/g, "");
  const content = (tree: Root) => (select("main .content", tree) ?? select("main", tree)) as Element | undefined;
  const TAGS = [
    "p",
    "pre",
    "code",
    "table",
    "dl",
    "dt",
    "dd",
    "img",
    "aside",
    "figure",
    "li",
    "blockquote",
    "h2",
    "h3",
    "a",
    "var",
    "sup",
  ];

  for (const route of Object.keys(reference.pages)) {
    if (only && !route.includes(only)) continue;
    const ours = routeFile(route);
    const theirs = route.endsWith("/")
      ? path.join(site, route, "index.html")
      : [path.join(site, `${route}.html`), path.join(site, route, "index.html")].find(existsSync);
    if (!ours || !theirs || !existsSync(theirs)) continue;

    const withoutTabs = (html: string) => html.replace(/<div role="tablist"[\s\S]*?<\/div>/g, "");
    const a = content(fromHtml(withoutTabs(readFileSync(theirs, "utf8"))));
    const b = content(fromHtml(withoutTabs(readFileSync(ours, "utf8"))));
    if (!a || !b) continue;

    const expected = normalize(toString(a));
    const actual = normalize(toString(b));
    if (expected !== actual) {
      let index = 0;
      while (index < expected.length && expected[index] === actual[index]) index++;
      const context = (text: string) => JSON.stringify(text.slice(Math.max(0, index - 60), index + 80));
      report(
        `${route}: content text differs at ${index}\n    expected ${context(expected)}\n    actual   ${context(actual)}`,
      );
    }
    const counts: string[] = [];
    for (const tag of TAGS) {
      const x = selectAll(tag, a).length;
      const y = selectAll(tag, b).length;
      if (x !== y) counts.push(`${tag} ${x}→${y}`);
    }
    if (counts.length) report(`${route}: element counts differ: ${counts.join(", ")}`);
  }
}

if (referenceSite) compareContent(path.resolve(referenceSite));

const accepted = new Set(
  (
    JSON.parse(readFileSync(path.join(ROOT, "tests/reference/accepted-differences.json"), "utf8")) as {
      accepted: Array<{ difference: string }>;
    }
  ).accepted.map(({ difference }) => difference),
);
// A difference's key is its first line, without the position of a text difference.
const key = (problem: string) => problem.split("\n")[0]!.replace(/(content text differs) at \d+/, "$1");
const unexpected = problems.filter((problem) => !accepted.has(key(problem)));

if (verbose) for (const note of notes) console.log(`note: ${note}`);
for (const problem of verbose ? problems : unexpected) console.log(problem);
console.log(
  `\n${unexpected.length} unexpected differences from the reference; ${problems.length - unexpected.length} accepted.`,
);
process.exitCode = unexpected.length > 0 ? 1 : 0;
