import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { chromium, type Browser, type BrowserContextOptions } from "playwright";
import { startPreview, type PreviewServer } from "./server.ts";

let server: PreviewServer;
let browser: Browser;

beforeAll(async () => {
  server = await startPreview();
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

const url = (pathname: string) => new URL(pathname, server.url).href;

/** Opens a page and collects errors, separating failures of external services. */
async function open(pathname: string, options: BrowserContextOptions = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const requestURL = new URL(request.url());
    if (requestURL.host !== server.url.host) external.push(`${requestURL.host}: ${request.failure()?.errorText}`);
    else errors.push(`Failed to load ${requestURL.pathname}`);
  });
  const response = await page.goto(url(pathname), { waitUntil: "load" });
  return { page, context, errors, external, response };
}

describe("routing", () => {
  const fetchManual = (pathname: string) => fetch(url(pathname), { redirect: "manual" });

  it("serves articles with trailing slashes and the status page without one", async () => {
    expect((await fetchManual("/nscache/")).status).toBe(200);
    expect((await fetchManual("/nscache")).headers.get("location")).toBe("/nscache/");
    expect((await fetchManual("/status")).status).toBe(200);
    expect((await fetchManual("/status.html")).headers.get("location")).toBe("/status");
    expect((await fetchManual("/swift-1.2/")).status).toBe(200);
    expect((await fetchManual("/__attribute__/")).status).toBe(200);
  });

  it("responds to missing pages with the custom 404 page", async () => {
    const response = await fetchManual("/this-page-does-not-exist/");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("NSError");
  });

  it("redirects renamed articles and authors", async () => {
    for (const [from, to] of [
      ["/wkwebkit", "/wkwebview/"],
      ["/nsformatter/", "/formatter/"],
      ["/authors/mattt-thompson", "/authors/mattt/"],
      ["/propertyWrapper", "/propertywrapper/"],
      ["/CocoaPods/", "/cocoapods/"],
    ]) {
      const response = await fetchManual(from!);
      expect(response.status, from).toBe(301);
      expect(response.headers.get("location"), from).toBe(to);
    }
  });

  it("keeps the article at /clang-diagnostics/ instead of redirecting", async () => {
    expect((await fetchManual("/clang-diagnostics/")).status).toBe(200);
  });

  it("serves feeds, sitemaps, and manifests with their content types", async () => {
    expect((await fetchManual("/feed.xml")).headers.get("content-type")).toBe("application/atom+xml; charset=utf-8");
    expect((await fetchManual("/sitemap.xml")).headers.get("content-type")).toMatch(/^application\/xml/);
    expect((await fetchManual("/site.webmanifest")).headers.get("content-type")).toBe(
      "application/manifest+json; charset=utf-8",
    );
    expect((await fetchManual("/robots.txt")).headers.get("content-type")).toMatch(/^text\/plain/);
    expect((await fetchManual("/.well-known/favicon.ico")).status).toBe(200);
    expect(await (await fetch(url("/robots.txt"))).text()).toContain("Sitemap: https://nshipster.com/sitemap.xml");
    const humans = await (await fetch(url("/humans.txt"))).text();
    expect(humans).toContain("Language: en-US");
    expect(humans).not.toContain("---");
    expect(humans).not.toContain("{{");
  });

  it("redirects asset URLs from the previous site", async () => {
    const aliases = (await import("../../src/data/legacy-assets.json", { with: { type: "json" } })).default as Record<
      string,
      string
    >;
    const legacy = Object.keys(aliases).find((alias) => alias.includes("/logo-"))!;
    const response = await fetchManual(legacy);
    expect(response.status).toBe(301);
    const target = await fetch(url(response.headers.get("location")!));
    expect(target.status).toBe(200);
  });

  it("sends security headers", async () => {
    const response = await fetchManual("/");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("pages", () => {
  it("includes the article author's Twitter handle", async () => {
    const html = await (await fetch(url("/replay/"))).text();
    expect(html).toContain('<meta name="twitter:creator" content="@mattt">');
  });

  it("loads representative pages without errors", async () => {
    for (const pathname of [
      "/",
      "/nscache/",
      "/authors/mattt/",
      "/status",
      "/flight-school/",
      "/return/",
      "/secrets/",
    ]) {
      const { errors, context, response } = await open(pathname);
      expect(response?.status(), pathname).toBe(200);
      expect(errors, pathname).toEqual([]);
      await context.close();
    }
  });

  it("is readable with JavaScript disabled", async () => {
    const { page, context } = await open("/addressbookui/", { javaScriptEnabled: false });
    await expect(page.locator("article .content p").first().isVisible()).resolves.toBe(true);
    await expect(page.locator(".highlight-group pre:not([hidden])").first().isVisible()).resolves.toBe(true);
    await context.close();
  });

  it("switches code tabs with the keyboard and remembers the language across pages", async () => {
    const { page, context } = await open("/addressbookui/");
    const firstTab = page.locator('[role="tab"]').first();
    await firstTab.focus();
    await page.keyboard.press("ArrowRight");
    const selected = page.locator('[role="tab"][aria-selected="true"]').first();
    await expect(selected.getAttribute("class")).resolves.toBe("objective-c");
    await expect(page.evaluate(() => document.activeElement?.className)).resolves.toBe("objective-c");

    await page.goto(url("/nsexpression/"));
    await expect(page.locator("#code-listing-1-objective-c").isVisible()).resolves.toBe(true);
    await expect(page.locator("#code-listing-1-swift").isVisible()).resolves.toBe(false);
    await context.close();
  });

  it("animates the logo on touch devices only without reduced motion", async () => {
    const touch = { hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } };
    const moving = await open("/", { ...touch, reducedMotion: "no-preference" });
    await moving.page.waitForTimeout(1200);
    await expect(moving.page.locator("#logo svg.animated").count()).resolves.toBe(1);
    await moving.context.close();

    const still = await open("/", { ...touch, reducedMotion: "reduce" });
    await still.page.waitForTimeout(1200);
    await expect(still.page.locator("#logo svg.animated").count()).resolves.toBe(0);
    await still.context.close();
  });

  it("hides article navigation in print", async () => {
    const { page, context } = await open("/nscache/");
    await page.emulateMedia({ media: "print" });
    await expect(page.locator('[role="complementary"]').isVisible()).resolves.toBe(false);
    await context.close();
  });
});

describe("article demos", () => {
  it("renders the CAEmitterLayer confetti", async () => {
    const { page, context, errors } = await open("/caemitterlayer/");
    await expect(page.locator("#webgl-confetti canvas").count()).resolves.toBe(1);
    expect(errors).toEqual([]);
    await context.close();
  });

  it("shows the swift-format listing that fits the container width", async () => {
    const { page, context, errors } = await open("/swift-format/", { viewport: { width: 1280, height: 900 } });
    await page.waitForTimeout(300);
    const visible = await page.locator(".variable-width [data-width]:not([hidden])").count();
    expect(visible).toBe(1);
    expect(errors).toEqual([]);
    await context.close();
  });

  it("plays the WWDC 2020 video when the details are opened", async () => {
    const { page, context, errors } = await open("/wwdc-2020/");
    const details = page.locator("details").first();
    await details.locator("summary").click();
    await page.waitForTimeout(300);
    await expect(
      page
        .locator("video")
        .first()
        .evaluate((video: HTMLVideoElement) => video.loop),
    ).resolves.toBe(true);
    expect(errors.filter((error) => !/play\(\)|NotAllowedError|NotSupportedError/.test(error))).toEqual([]);
    await context.close();
  });

  it("loads the MapKit JS example, recording external service failures separately", async (test) => {
    const { page, context, errors, external } = await open("/mapkit-js/");
    await page.waitForTimeout(1000);
    const mapkitLoaded = await page.evaluate(() => "mapkit" in window);
    if (!mapkitLoaded || external.length > 0) {
      await test.annotate(`MapKit JS was unavailable: ${external.join("; ") || "mapkit is undefined"}`);
    }
    // Errors caused by the external service are not migration defects.
    const local = errors.filter((error) => !/mapkit|apple-mapkit|Failed to load resource/i.test(error));
    expect(local).toEqual([]);
    await context.close();
  });
});
