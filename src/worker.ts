import { SECURITY_HEADERS } from "./lib/security-headers.ts";
import { securityTxt } from "./lib/security-txt.ts";

/**
 * The Worker in front of the static site.
 *
 * Cloudflare serves the files in `dist/` and the rules in `_redirects` directly.
 * It runs this Worker for the paths in `assets.run_worker_first` in `wrangler.jsonc`,
 * and for requests that match no asset, which get the 404 page.
 * Add a path to `run_worker_first` and to `routes` to handle it here.
 * `_headers` rules don't apply to responses that this Worker creates,
 * so `respond` adds the security headers itself.
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

/** Creates a response with the security headers, and without a body for `HEAD` requests. */
function respond(request: Request, body: BodyInit | null, headers: Record<string, string>, status = 200): Response {
  return new Response(request.method === "HEAD" ? null : body, {
    status,
    headers: { ...SECURITY_HEADERS, ...headers },
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const handler = routes[new URL(request.url).pathname];
    if (!handler) {
      const response = await env.ASSETS.fetch(request);
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
