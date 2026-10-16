import { SECURITY_HEADERS } from "./lib/security-headers.ts";
import { securityTxt } from "./lib/security-txt.ts";

/**
 * The Worker in front of the static site.
 *
 * Cloudflare serves the files in `dist/` directly
 * and runs this Worker only for the paths in `assets.run_worker_first` in `wrangler.jsonc`.
 * Add a path there and in `routes` to handle it here.
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
function respond(request: Request, body: string, headers: Record<string, string>, status = 200): Response {
  return new Response(request.method === "HEAD" ? null : body, {
    status,
    headers: { ...SECURITY_HEADERS, ...headers },
  });
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const handler = routes[new URL(request.url).pathname];
    if (!handler) return env.ASSETS.fetch(request);
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
