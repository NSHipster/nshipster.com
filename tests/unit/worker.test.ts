import { describe, expect, it } from "vite-plus/test";
import { SECURITY_HEADERS } from "../../src/lib/security-headers.ts";
import worker, { type Env } from "../../src/worker.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

const env: Env = {
  ASSETS: { fetch: async (request) => new Response(`asset ${new URL(request.url).pathname}`) },
};

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

  it("adds the site's security headers to the responses it creates", async () => {
    const response = await fetchWorker("/.well-known/security.txt");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name), name).toBe(value);
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
});
