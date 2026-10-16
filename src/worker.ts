import { transformationSource } from "./lib/image-transformations.ts";
import { markdownPath, prefersMarkdown } from "./lib/markdown-negotiation.ts";
import { SECURITY_HEADERS } from "./lib/security-headers.ts";
import { securityTxt } from "./lib/security-txt.ts";
import { pageLinks, SITE_LINKS } from "./lib/site-links.ts";

/**
 * The Worker in front of the static site.
 *
 * Cloudflare runs this Worker first for the paths in `assets.run_worker_first` in `wrangler.jsonc`:
 * pages, redirects, and missing paths.
 * It serves the files in `dist/` that those rules exclude, such as `/assets/` and `/feed.xml`, directly.
 * For a page, the Worker fetches the static asset, which applies `_redirects` and `_headers`,
 * and adds the page's `Link` header, which names its Markdown version.
 * A request that prefers Markdown gets the Markdown version at the page's URL.
 * A path that matches no asset or redirect gets the 404 page.
 * Add a path to `routes` to generate its response here.
 * `_headers` rules don't apply to responses that this Worker creates,
 * so `respond` adds the security headers and the site's `Link` header itself.
 *
 * The Workers runtime treats every value export of this module as an entry point,
 * so export only the default handler and types; put other code in `src/lib/`.
 */

/** The bindings in `wrangler.jsonc`. */
export interface Env {
  /** The built site in `dist/`. */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

type Handler = (request: Request) => Response;

const routes: Record<string, Handler> = {
  "/.well-known/security.txt": (request) =>
    respond(request, securityTxt(new Date()), {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    }),
};

/** Creates a response with the security headers and site links, and without a body for `HEAD` requests. */
function respond(request: Request, body: BodyInit | null, headers: Record<string, string>, status = 200): Response {
  return new Response(request.method === "HEAD" ? null : body, {
    status,
    headers: { ...SECURITY_HEADERS, Link: SITE_LINKS, ...headers },
  });
}

/**
 * Responds with the site's 404 page.
 *
 * The browser revalidates the response like a page,
 * so that a file that is missing during a deploy isn't cached as missing.
 */
async function notFound(request: Request, env: Env): Promise<Response> {
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  const page = await env.ASSETS.fetch(new Request(new URL("/404", request.url), { method }));
  const cacheControl = "public, max-age=0, must-revalidate";
  if (!page.ok) {
    return respond(
      request,
      "Not Found\n",
      { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cacheControl },
      404,
    );
  }
  return respond(
    request,
    page.body,
    { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cacheControl },
    404,
  );
}

/**
 * Copies a response from the static assets with changed headers.
 * The security headers and site links that `_headers` gives every path are added if they're missing,
 * and the headers in `headers` replace any with the same name.
 * The status, body, `ETag`, and `Cache-Control` stay the same.
 */
function withHeaders(response: Response, headers: Record<string, string> = {}): Response {
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, Link: SITE_LINKS })) {
    if (!result.headers.has(name)) result.headers.set(name, value);
  }
  for (const [name, value] of Object.entries(headers)) result.headers.set(name, value);
  return result;
}

/** Adds `Accept` to the `Vary` header of a response with a Markdown version. */
function varyAccept(response: Response): Response {
  const vary = response.headers.get("Vary");
  if (!vary?.split(",").some((name) => name.trim().toLowerCase() === "accept")) {
    response.headers.set("Vary", vary ? `${vary}, Accept` : "Accept");
  }
  return response;
}

const found = (response: Response) => response.status === 200 || response.status === 304;

/**
 * Responds with a page or other file from the static assets.
 *
 * A page with a Markdown version links to it in the `Link` header,
 * and a request that prefers Markdown gets the Markdown version instead, with `Content-Location` naming it.
 * Both answers vary by `Accept`.
 * The Markdown version at the page's URL isn't marked `noindex` like the one at its own URL,
 * because it is the same resource as the page.
 *
 * To learn whether a page has a Markdown version,
 * the Worker requests the Markdown version with `HEAD` alongside the page,
 * which takes no longer than the page and needs no list of pages built into the Worker.
 */
async function page(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  // A page's URL has no trailing slash, except the home page's; the static assets redirect other URLs with one.
  const negotiable =
    (request.method === "GET" || request.method === "HEAD") && (pathname === "/" || !pathname.endsWith("/"));
  if (!negotiable) {
    const response = await env.ASSETS.fetch(request);
    return response.status === 404 ? notFound(request, env) : withHeaders(response);
  }

  const markdown = markdownPath(pathname);
  const markdownURL = new URL(markdown, request.url);
  if (prefersMarkdown(request.headers.get("Accept"))) {
    // Conditional request headers apply to the Markdown version, which has its own `ETag`.
    const response = await env.ASSETS.fetch(new Request(markdownURL, request));
    if (found(response)) {
      const result = withHeaders(response, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Location": markdown,
        Link: pageLinks(markdown),
      });
      result.headers.delete("X-Robots-Tag");
      return varyAccept(result);
    }
  }

  const [response, alternate] = await Promise.all([
    env.ASSETS.fetch(request),
    env.ASSETS.fetch(new Request(markdownURL, { method: "HEAD" })),
  ]);
  if (response.status === 404) return notFound(request, env);
  const html = found(response) && response.headers.get("Content-Type")?.startsWith("text/html");
  if (!html || alternate.status !== 200) return withHeaders(response);
  return varyAccept(withHeaders(response, { Link: pageLinks(markdown) }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const handler = routes[pathname];
    if (!handler) {
      // Cloudflare handles `/cdn-cgi/image/` URLs before they reach the Worker,
      // so only local previews get here; they serve the original image.
      const source = transformationSource(pathname);
      if (source === pathname) return page(request, env);
      const response = await env.ASSETS.fetch(new Request(new URL(source, request.url), request));
      return response.status === 404 ? notFound(request, env) : response;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return respond(
        request,
        "Method Not Allowed\n",
        { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" },
        405,
      );
    }
    return handler(request);
  },
};
