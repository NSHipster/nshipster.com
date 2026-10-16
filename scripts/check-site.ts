/**
 * Checks the built site in `dist/`:
 * - internal links and fragments resolve,
 * - element IDs are unique within each page,
 * - each page has one `h1`, before any other heading,
 * - local images have a width and height,
 * - each page has an Open Graph image of the declared size, and each article has its own,
 * - referenced assets exist,
 * - unpublished articles are not published,
 * - the Atom feed and sitemap are well-formed and complete,
 * - redirect destinations exist.
 *
 * Usage: node scripts/check-site.ts [dist-directory]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SyntaxValidator } from "fast-xml-validator";
import { transformationSource } from "../src/lib/image-transformations.ts";

const DIST = path.resolve(process.argv[2] ?? "dist");
const ROOT = process.cwd();
const problems: string[] = [];

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory).sort()) {
    const file = path.join(directory, entry);
    if (statSync(file).isDirectory()) yield* walk(file);
    else yield file;
  }
}

/** Resolves a URL path to a built file the way Cloudflare's static asset routing does. */
function resolve(pathname: string): string | undefined {
  const decoded = decodeURIComponent(pathname);
  const candidates = decoded.endsWith("/")
    ? // Cloudflare redirects `/slug/` to the extensionless `/slug`, which serves `slug.html`.
      [path.join(decoded, "index.html"), `${decoded.slice(0, -1)}.html`]
    : [decoded, `${decoded}.html`, path.join(decoded, "index.html")];
  return candidates
    .map((candidate) => path.join(DIST, candidate))
    .find((file) => existsSync(file) && statSync(file).isFile());
}

const redirects = new Map<string, string>();
const redirectsFile = path.join(DIST, "_redirects");
if (existsSync(redirectsFile)) {
  for (const line of readFileSync(redirectsFile, "utf8").split("\n")) {
    const [from, to] = line.trim().split(/\s+/);
    if (from && to) redirects.set(from, to);
  }
}

const ids = new Map<string, Set<string>>();
const pages = [...walk(DIST)].filter((file) => file.endsWith(".html"));
const idsOf = (file: string) => {
  let set = ids.get(file);
  if (!set) {
    set = new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!));
    ids.set(file, set);
  }
  return set;
};

for (const file of pages) {
  const route =
    "/" +
    path
      .relative(DIST, file)
      .split(path.sep)
      .join("/")
      .replace(/index\.html$/, "")
      .replace(/\.html$/, "");
  const html = readFileSync(file, "utf8");

  // Unique IDs. Scripts and styles are excluded from the markup scan.
  const markup = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  const seen = new Map<string, number>();
  for (const match of markup.matchAll(/<[a-zA-Z][^>]*\sid="([^"]+)"/g))
    seen.set(match[1]!, (seen.get(match[1]!) ?? 0) + 1);
  for (const [id, count] of seen) if (count > 1) problems.push(`${route}: duplicate id "${id}" (${count} times)`);

  // One `h1` titles each page and comes before any other heading.
  const headings = [...markup.matchAll(/<h([1-6])[\s>]/g)].map((match) => match[1]!);
  const titles = headings.filter((level) => level === "1").length;
  if (titles !== 1) problems.push(`${route}: ${titles} h1 elements instead of 1`);
  else if (headings[0] !== "1") problems.push(`${route}: h${headings[0]} before the h1`);

  // Local images give their size so the page doesn't shift as they load.
  for (const [img] of markup.matchAll(/<img\s[^>]*>/g)) {
    const src = img.match(/\ssrc="([^"]+)"/)?.[1] ?? "";
    if (!src.startsWith("/") || src.startsWith("//")) continue;
    if (!/\swidth="\d+"/.test(img) || !/\sheight="\d+"/.test(img))
      problems.push(`${route}: image ${src} has no width and height`);
  }

  // The Open Graph image exists at the size its tags give, and each article has an image of its own.
  const meta = (property: string) => html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))?.[1];
  const image = meta("og:image") ?? "";
  const imagePath = image.startsWith("https://nshipster.com/") ? new URL(image).pathname : undefined;
  const imageFile = imagePath && resolve(imagePath);
  if (!imageFile) {
    problems.push(`${route}: missing Open Graph image ${image}`);
  } else {
    // A PNG's width and height follow the 8-byte signature and the IHDR chunk's length and type.
    const png = readFileSync(imageFile);
    const size = `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`;
    const declared = `${meta("og:image:width")}×${meta("og:image:height")}`;
    if (size !== declared) problems.push(`${route}: Open Graph image ${imagePath} is ${size}, not ${declared}`);
  }
  if (html.includes(`"@type": "Article"`) && !imagePath?.startsWith(`/assets/og${route}-`))
    problems.push(`${route}: article has no Open Graph image of its own`);

  for (const match of markup.matchAll(
    /<(?:a|link|img|source|script|video|audio|track)\s[^>]*?(?:href|src|srcset|poster)="([^"]+)"/g,
  )) {
    for (const reference of match[1]!.split(/,\s+/).map((candidate) => candidate.trim().split(/\s+/)[0]!)) {
      if (!reference.startsWith("/") || reference.startsWith("//")) {
        if (reference.startsWith("#")) {
          const fragment = decodeURIComponent(reference.slice(1));
          if (fragment && !seen.has(fragment)) problems.push(`${route}: missing fragment ${reference}`);
        }
        continue;
      }
      // Cloudflare serves transformed images from the original image.
      const url = new URL(transformationSource(reference), "https://nshipster.com");
      const target = resolve(url.pathname);
      if (!target) {
        const redirect = redirects.get(url.pathname) ?? redirects.get(url.pathname.replace(/\/$/, ""));
        if (!redirect) problems.push(`${route}: broken link ${reference}`);
        continue;
      }
      const fragment = decodeURIComponent(url.hash.slice(1));
      if (fragment && target.endsWith(".html") && !idsOf(target).has(fragment)) {
        problems.push(`${route}: missing fragment ${reference}`);
      }
    }
  }
}

// Unpublished articles must not be built.
const postsDirectory = path.join(ROOT, "collections/en/_posts");
for (const file of readdirSync(postsDirectory).filter((entry) => entry.endsWith(".md"))) {
  const source = readFileSync(path.join(postsDirectory, file), "utf8");
  const frontMatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  if (!/^published:\s*false\s*$/m.test(frontMatter)) continue;
  const slug = file.replace(/^\d{4}-\d{1,2}-\d{1,2}-/, "").replace(/\.md$/, "");
  if (existsSync(path.join(DIST, `${slug}.html`)) || existsSync(path.join(DIST, slug)))
    problems.push(`Unpublished article ${file} was built at /${slug}`);
  for (const document of ["feed.xml", "sitemap.xml"]) {
    const contents = readFileSync(path.join(DIST, document), "utf8");
    if (contents.includes(`/${slug}<`) || contents.includes(`/${slug}"`))
      problems.push(`Unpublished article ${file} appears in ${document}`);
  }
}

// Feed and sitemap.
for (const document of ["feed.xml", "sitemap.xml"]) {
  const xml = readFileSync(path.join(DIST, document), "utf8");
  try {
    SyntaxValidator.validate(xml);
  } catch (error) {
    problems.push(`${document} is not well-formed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
const feed = readFileSync(path.join(DIST, "feed.xml"), "utf8");
const entries = feed.match(/<entry>/g)?.length ?? 0;
if (entries !== 10) problems.push(`feed.xml has ${entries} entries instead of 10`);
for (const url of readFileSync(path.join(DIST, "sitemap.xml"), "utf8").matchAll(
  /<loc>https:\/\/nshipster\.com([^<]*)<\/loc>/g,
)) {
  if (!resolve(url[1] || "/")) problems.push(`sitemap.xml lists missing page ${url[1]}`);
}

// Internal redirect destinations.
for (const [from, to] of redirects) {
  if (to.startsWith("/") && !resolve(to)) problems.push(`_redirects: ${from} points to missing ${to}`);
}

const known = new Set(
  (JSON.parse(readFileSync(path.join(ROOT, "tests/reference/known-issues.json"), "utf8")) as { issues: string[] })
    .issues,
);
const unexpected = problems.filter((problem) => !known.has(problem));
for (const problem of unexpected) console.log(problem);
console.log(
  `Checked ${pages.length} pages and ${redirects.size} redirects: ` +
    `${unexpected.length} problems, ${problems.length - unexpected.length} known content issues.`,
);
process.exitCode = unexpected.length > 0 ? 1 : 0;
