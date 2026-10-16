/**
 * Paths of the Markdown versions of pages, and content negotiation between a page and its Markdown version.
 *
 * This module has no imports, so that the Worker can use it
 * without the HTML conversion in `markdown-alternate.ts`.
 */

/** The path of the Markdown version of a page, e.g. `/nscache.md` for `/nscache`. */
export function markdownPath(pathname: string): string {
  return `${pathname.replace(/\/+$/, "") || "/index"}.md`;
}

/**
 * Whether a request with this `Accept` header prefers Markdown to HTML.
 *
 * Each type gets the quality of the most specific media range that matches it (RFC 9110, section 12.5.1).
 * The request prefers Markdown when it names `text/markdown` itself
 * with a quality above 0 and at least as high as that of HTML.
 * A wildcard range doesn't select Markdown,
 * so browsers, which don't name `text/markdown`, always get HTML.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const ranges = parseAccept(accept);
  const markdown = ranges.find((range) => range.type === "text/markdown");
  return markdown !== undefined && markdown.quality > 0 && markdown.quality >= quality(ranges, "text/html");
}

interface MediaRange {
  /** The media range in lowercase, such as `text/html` or `text/*`. */
  type: string;
  quality: number;
}

/** Parses an `Accept` header, skipping media ranges with an invalid quality. */
function parseAccept(accept: string): MediaRange[] {
  return accept.split(",").flatMap((part) => {
    const [type = "", ...parameters] = part.split(";").map((value) => value.trim().toLowerCase());
    if (!/^[^/\s]+\/[^/\s]+$/.test(type)) return [];
    const q = parameters
      .map((parameter) => parameter.replace(/\s+/g, ""))
      .find((parameter) => parameter.startsWith("q="));
    const quality = q === undefined ? 1 : Number(q.slice(2));
    return Number.isFinite(quality) && quality >= 0 && quality <= 1 ? [{ type, quality }] : [];
  });
}

/** The quality of a media type, from the most specific range that matches it, or 0 if none does. */
function quality(ranges: MediaRange[], type: string): number {
  const [major] = type.split("/");
  for (const candidate of [type, `${major}/*`, "*/*"]) {
    const range = ranges.find((range) => range.type === candidate);
    if (range) return range.quality;
  }
  return 0;
}
