import { describe, expect, it } from "vite-plus/test";
import { SECURITY_HEADERS } from "../../src/lib/security-headers.ts";
import { pageLinks, SITE_LINKS } from "../../src/lib/site-links.ts";
import worker, { type Env } from "../../src/worker.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

const NOT_FOUND_PAGE = "<!DOCTYPE html><title>NSError</title>";
const PAGE = "<!DOCTYPE html><title>NSCache</title>";
const MARKDOWN = "# NSCache\n";
const STATUS_PAGE = "<!DOCTYPE html><title>Status</title>";
const HOME_PAGE = "<!DOCTYPE html><title>NSHipster</title>";

/** Files in the static assets, with the headers that `_headers` adds to some of them. */
const FILES: Record<string, { body: string; type: string; etag: string; headers?: Record<string, string> }> = {
  "/nscache": { body: PAGE, type: "text/html; charset=utf-8", etag: '"page"' },
  "/nscache.md": {
    body: MARKDOWN,
    type: "text/markdown; charset=utf-8",
    etag: '"markdown"',
    headers: { "X-Robots-Tag": "noindex" },
  },
  "/status": { body: STATUS_PAGE, type: "text/html; charset=utf-8", etag: '"status"' },
  "/": { body: HOME_PAGE, type: "text/html; charset=utf-8", etag: '"home"' },
};

/**
 * Static assets with the files in `FILES` and the 404 page, which treat other paths as missing.
 * Like Cloudflare's, they redirect a path with a trailing slash and answer conditional and range requests.
 */
const assets = (notFoundPage: string | null = NOT_FOUND_PAGE): Env => ({
  ASSETS: {
    fetch: async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname.length > 1 && pathname.endsWith("/")) {
        return new Response(null, { status: 307, headers: { Location: pathname.slice(0, -1) } });
      }
      if (pathname === "/404" && notFoundPage !== null) {
        return new Response(request.method === "HEAD" ? null : notFoundPage, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
      const file = FILES[pathname];
      if (!file) return new Response(null, { status: 404 });
      const headers = {
        "Content-Type": file.type,
        "Cache-Control": "public, max-age=0, must-revalidate",
        ETag: file.etag,
        ...file.headers,
      };
      if (request.headers.get("If-None-Match") === file.etag) return new Response(null, { status: 304, headers });
      const range = request.headers.get("Range")?.match(/^bytes=(\d+)-(\d+)$/);
      if (range) {
        const body = file.body.slice(Number(range[1]), Number(range[2]) + 1);
        return new Response(request.method === "HEAD" ? null : body, { status: 206, headers });
      }
      return new Response(request.method === "HEAD" ? null : file.body, { headers });
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
    expect(await response.text()).toBe(PAGE);
    expect(response.headers.get("ETag")).toBe('"page"');
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name), name).toBe(value);
    }
  });

  it("serves the original for a Cloudflare Image Transformations URL in local previews", async () => {
    const response = await fetchWorker("/cdn-cgi/image/width=400,format=auto,onerror=redirect/nscache");
    expect(await response.text()).toBe(PAGE);
  });

  it("links a page to its Markdown version, and says that the page varies by Accept", async () => {
    const response = await fetchWorker("/nscache");
    expect(response.headers.get("Link")).toBe(pageLinks("/nscache.md"));
    expect(response.headers.get("Link")).toContain('</nscache.md>; rel="alternate"; type="text/markdown"');
    expect(response.headers.get("Vary")).toBe("Accept");

    const other = await fetchWorker("/status");
    expect(other.headers.get("Link")).toBe(SITE_LINKS);
    expect(other.headers.get("Vary")).toBeNull();
  });

  it("serves the Markdown version at the page's URL to requests that prefer it", async () => {
    const response = await fetchWorker("/nscache", { headers: { Accept: "text/markdown, text/html;q=0.9" } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(MARKDOWN);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("Content-Location")).toBe("/nscache.md");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(response.headers.get("Link")).toBe(pageLinks("/nscache.md"));
    expect(response.headers.get("ETag")).toBe('"markdown"');
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name), name).toBe(value);
    }
  });

  it("serves HTML to browsers", async () => {
    const accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    for (const init of [{ headers: { Accept: accept } }, { headers: { Accept: "*/*" } }, {}]) {
      const response = await fetchWorker("/nscache", init);
      expect(await response.text()).toBe(PAGE);
      expect(response.headers.get("Vary")).toBe("Accept");
    }
  });

  it("serves HTML to requests that prefer Markdown when a page has no Markdown version", async () => {
    const response = await fetchWorker("/status", { headers: { Accept: "text/markdown" } });
    expect(await response.text()).toBe(STATUS_PAGE);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Vary")).toBeNull();

    const missing = await fetchWorker("/missing", { headers: { Accept: "text/markdown" } });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe(NOT_FOUND_PAGE);
  });

  it("answers conditional and HEAD requests for either version", async () => {
    const page = await fetchWorker("/nscache", { headers: { "If-None-Match": '"page"' } });
    expect(page.status).toBe(304);
    expect(page.headers.get("Link")).toBe(pageLinks("/nscache.md"));
    expect(page.headers.get("Vary")).toBe("Accept");

    const markdown = await fetchWorker("/nscache", {
      headers: { Accept: "text/markdown", "If-None-Match": '"markdown"' },
    });
    expect(markdown.status).toBe(304);
    expect(markdown.headers.get("Content-Location")).toBe("/nscache.md");
    expect(markdown.headers.get("Vary")).toBe("Accept");

    const head = await fetchWorker("/nscache", { method: "HEAD", headers: { Accept: "text/markdown" } });
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(await head.text()).toBe("");
  });

  it("answers range requests for either version", async () => {
    const page = await fetchWorker("/nscache", { headers: { Range: "bytes=0-8" } });
    expect(page.status).toBe(206);
    expect(await page.text()).toBe("<!DOCTYPE");
    expect(page.headers.get("Link")).toBe(pageLinks("/nscache.md"));
    expect(page.headers.get("Vary")).toBe("Accept");

    const markdown = await fetchWorker("/nscache", { headers: { Accept: "text/markdown", Range: "bytes=0-1" } });
    expect(markdown.status).toBe(206);
    expect(await markdown.text()).toBe("# ");
    expect(markdown.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(markdown.headers.get("Vary")).toBe("Accept");
  });

  it("looks for a Markdown version on this site when the path starts with //", async () => {
    // `new URL("//nscache.md", base)` would be `https://nscache.md/`, which the static assets serve as the home page.
    const response = await worker.fetch(
      new Request("https://nshipster.com//nscache", { headers: { Accept: "text/markdown" } }),
      env,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe(NOT_FOUND_PAGE);
  });

  it("passes redirects through without negotiating", async () => {
    const response = await fetchWorker("/nscache/", { headers: { Accept: "text/markdown" } });
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/nscache");
    expect(response.headers.get("Vary")).toBeNull();
    expect(response.headers.get("Link")).toBe(SITE_LINKS);
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
