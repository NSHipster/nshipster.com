import { describe, expect, it } from "vite-plus/test";
import { SECURITY_HEADERS } from "../../src/lib/security-headers.ts";
import { SITE_LINKS } from "../../src/lib/site-links.ts";
import worker, { type Env } from "../../src/worker.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

const NOT_FOUND_PAGE = "<!DOCTYPE html><title>NSError</title>";

/** Static assets with a page at `/nscache` and the 404 page, which treat other paths as missing. */
const assets = (notFoundPage: string | null = NOT_FOUND_PAGE): Env => ({
  ASSETS: {
    fetch: async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === "/nscache") return new Response(`asset ${pathname}`);
      if (pathname === "/404" && notFoundPage !== null) {
        return new Response(request.method === "HEAD" ? null : notFoundPage, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
      return new Response(null, { status: 404 });
    },
  },
});

const env = assets();

const fetchWorker = (pathname: string, init?: RequestInit) =>
  worker.fetch(new Request(new URL(pathname, "https://nshipster.com"), init), env);

describe("worker", () => {
  it("exports only the default handler, which the Workers runtime requires", async () => {
    expect(Object.keys(await import("../../src/worker.ts"))).toEqual(["default"]);
  });

  it("serves a security.txt file with a rolling expiry", async () => {
    const requestedAt = Date.now();
    const response = await fetchWorker("/.well-known/security.txt");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");

    const body = await response.text();
    expect(body).toContain("Contact: https://github.com/NSHipster/nshipster.com/security/advisories/new\n");
    expect(body).toContain("Preferred-Languages: en\n");
    expect(body).toContain("Canonical: https://nshipster.com/.well-known/security.txt\n");

    const expires = body.match(/^Expires: (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)$/m)?.[1];
    expect(expires).toBeDefined();
    const expiresAt = Date.parse(expires ?? "");
    expect(expiresAt).toBeGreaterThan(requestedAt + 363 * DAY_MS);
    expect(expiresAt).toBeLessThan(requestedAt + 365 * DAY_MS);
  });

  it("adds the site's security headers and links to the responses it creates", async () => {
    for (const pathname of ["/.well-known/security.txt", "/missing"]) {
      const response = await fetchWorker(pathname);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(response.headers.get(name), `${pathname} ${name}`).toBe(value);
      }
      expect(response.headers.get("Link"), pathname).toBe(SITE_LINKS);
    }
  });

  it("answers HEAD requests without a body and rejects other methods", async () => {
    const head = await fetchWorker("/.well-known/security.txt", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    const post = await fetchWorker("/.well-known/security.txt", { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("passes other requests to the static assets", async () => {
    const response = await fetchWorker("/nscache");
    expect(await response.text()).toBe("asset /nscache");
  });

  it("serves the original for a Cloudflare Image Transformations URL in local previews", async () => {
    const response = await fetchWorker("/cdn-cgi/image/width=400,format=auto,onerror=redirect/nscache");
    expect(await response.text()).toBe("asset /nscache");
  });

  it("serves the 404 page for missing paths without caching it for long", async () => {
    for (const pathname of ["/assets/missing.png", "/_astro/missing.js", "/missing"]) {
      const response = await fetchWorker(pathname);
      expect(response.status, pathname).toBe(404);
      expect(response.headers.get("Content-Type"), pathname).toBe("text/html; charset=utf-8");
      expect(response.headers.get("Cache-Control"), pathname).toBe("public, max-age=0, must-revalidate");
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(response.headers.get(name), `${pathname} ${name}`).toBe(value);
      }
      expect(await response.text(), pathname).toBe(NOT_FOUND_PAGE);
    }
  });

  it("answers HEAD requests for missing paths without a body", async () => {
    const response = await fetchWorker("/assets/missing.png", { method: "HEAD" });
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe("");
  });

  it("responds with plain text when the 404 page is missing", async () => {
    const response = await worker.fetch(new Request("https://nshipster.com/missing"), assets(null));
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(await response.text()).toBe("Not Found\n");
  });
});
