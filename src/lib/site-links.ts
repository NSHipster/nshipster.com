/**
 * The value of the `Link` header for every response,
 * which advertises the site's machine-readable resources to agents and other programs
 * that don't read the HTML of a page.
 *
 * The feed and `llms.txt` match the `<link>` elements in `src/layouts/Base.astro`.
 * The build writes this value into the `/*` rule of Cloudflare's `_headers` file,
 * and the Worker in `src/worker.ts` adds it to the responses it creates.
 *
 * This module has no Node.js imports, so that the Worker can use it.
 */
export const SITE_LINKS = [
  '</feed.xml>; rel="alternate"; type="application/atom+xml"',
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
].join(", ");
