import { readFileSync } from "node:fs";
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
    const feed = await (await fetch(url("/feed.xml"))).text();
    const updated = feed.match(/<feed[\s\S]*?<updated>([^<]+)<\/updated>/)?.[1];
    expect(Date.now() - new Date(updated!).getTime()).toBeLessThan(10 * 60 * 1000);
    // Feed readers don't load the site's styles, so code keeps its line breaks and indentation (#81).
    const blocks = feed.match(/&lt;pre class=&quot;highlight&quot;[\s\S]*?&lt;\/pre&gt;/g) ?? [];
    expect(blocks.some((block) => /\n {2,}\S/.test(block))).toBe(true);
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

  it("keeps the original URL of an image with smaller copies", async () => {
    const aliases = (await import("../../src/data/legacy-assets.json", { with: { type: "json" } })).default as Record<
      string,
      string
    >;
    const legacy = Object.keys(aliases).find((alias) => aliases[alias] === "uncertainty-screenshot--light.png")!;
    const location = (await fetchManual(legacy)).headers.get("location")!;
    const html = await (await fetch(url("/uncertainty/"))).text();
    expect(html).toContain(`<img src="${location}"`);
    expect(html).toContain(`${location} 2916w"`);
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
    const authorHTML = await (await fetch(url("/authors/mattt/"))).text();
    expect(authorHTML).toContain('<meta name="twitter:creator" content="@mattt">');
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

  it("links the shared stylesheet and preloads only the body font", async () => {
    const { page, context } = await open("/nscache/");
    // Astro's <Font> component inlines only the @font-face rules.
    const inline = await page.locator("style").allTextContents();
    for (const style of inline) expect(style).toMatch(/^@font-face\{/);
    const stylesheet = await page.locator('link[rel="stylesheet"]').getAttribute("href");
    expect(stylesheet).toMatch(/^\/assets\/screen-[0-9a-f]+\.css$/);
    expect((await fetch(url(stylesheet!))).headers.get("cache-control")).toContain("immutable");
    const preloads = await page
      .locator('link[rel="preload"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
    expect(preloads).toHaveLength(1);
    const preloaded = Buffer.from(await (await fetch(preloads[0]!)).arrayBuffer());
    expect(preloaded.equals(readFileSync("assets/fonts/Merriweather-Light.woff2"))).toBe(true);
    await expect(
      page
        .locator("article .content p")
        .first()
        .evaluate((p) => getComputedStyle(p).fontWeight),
    ).resolves.toBe("300");
    await context.close();
  });

  it("loads a smaller copy of a large screenshot on a narrow screen", async () => {
    const currentSource = async (options: BrowserContextOptions) => {
      const { page, context } = await open("/uncertainty/", options);
      const image = page.locator("article .content img").first();
      const source = await image.evaluate((img) => (img as HTMLImageElement).currentSrc);
      await context.close();
      return new URL(source).pathname;
    };
    const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
    expect(await currentSource(phone)).toMatch(/^\/assets\/uncertainty-screenshot--light-800w-/);
    expect(await currentSource({ ...phone, colorScheme: "dark" })).toMatch(
      /^\/assets\/uncertainty-screenshot--dark-800w-/,
    );
    expect(await currentSource({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).toMatch(
      /^\/assets\/uncertainty-screenshot--light-[0-9a-f]+\.png$/,
    );
  });

  it("loads images after the first one lazily", async () => {
    const html = await (await fetch(url("/character-viewer/"))).text();
    const content = html.slice(html.indexOf('<div class="content">'), html.indexOf('<footer role="complementary">'));
    const images = [...content.matchAll(/<img [^>]*>/g)].map((match) => match[0]);
    expect(images.length).toBeGreaterThan(1);
    expect(images[0]).not.toContain('loading="lazy"');
    for (const image of images.slice(1)) expect(image).toContain('loading="lazy"');
    for (const image of images) expect(image).toMatch(/ width="\d+" height="\d+"| height="\d+".* width="\d+"/);
  });

  it("is readable with JavaScript disabled", async () => {
    const { page, context } = await open("/addressbookui/", { javaScriptEnabled: false });
    await expect(page.locator("article .content p").first().isVisible()).resolves.toBe(true);
    // Tabs can't switch listings without JavaScript, so every listing is shown instead.
    const group = page.locator(".highlight-group").first();
    await expect(group.locator('[role="tablist"]').isVisible()).resolves.toBe(false);
    for (const panel of await group.locator('[role="tabpanel"]').all()) {
      await expect(panel.isVisible()).resolves.toBe(true);
    }
    await context.close();
  });

  it("starts keyboard navigation with a link that skips to the main content", async () => {
    const { page, context } = await open("/nscache/");
    const skipLink = page.locator(".skip-link");
    await expect(skipLink.boundingBox().then((box) => box!.width)).resolves.toBeLessThanOrEqual(1);
    await page.keyboard.press("Tab");
    await expect(page.evaluate(() => document.activeElement?.className)).resolves.toBe("skip-link");
    await expect(skipLink.boundingBox().then((box) => box!.width)).resolves.toBeGreaterThan(1);
    await expect(skipLink.evaluate((link) => getComputedStyle(link).outlineStyle)).resolves.toBe("solid");
    await page.keyboard.press("Enter");
    expect(new URL(page.url()).hash).toBe("#main");
    await context.close();
  });

  it("keeps heading anchors out of the tab order", async () => {
    const { page, context } = await open("/dark-mode/");
    await expect(page.locator('a.anchor:not([tabindex="-1"])').count()).resolves.toBe(0);
    await context.close();
  });

  it("underlines links in running text but not titles", async () => {
    for (const colorScheme of ["light", "dark"] as const) {
      const { page, context } = await open("/addressbookui/", { colorScheme });
      const line = (selector: string) =>
        page
          .locator(selector)
          .first()
          .evaluate((element) => getComputedStyle(element).textDecorationLine);
      await expect(line(".content p a"), colorScheme).resolves.toBe("underline");
      await expect(line(".byline a"), colorScheme).resolves.toBe("underline");
      await expect(line("h1.title a"), colorScheme).resolves.toBe("none");
      await context.close();
    }
    // Lists of links alone have nothing to set the links apart from.
    const { page, context } = await open("/");
    await expect(
      page
        .locator(".archive dd a")
        .first()
        .evaluate((link) => getComputedStyle(link).textDecorationLine),
    ).resolves.toBe("none");
    await context.close();
  });

  it("makes the underline of a text link solid on hover", async () => {
    const { page, context } = await open("/addressbookui/");
    const link = page.locator(".content p a").first();
    const underline = () =>
      link.evaluate((element) => ({
        color: getComputedStyle(element).textDecorationColor,
        thickness: getComputedStyle(element).textDecorationThickness,
        text: getComputedStyle(element).color,
      }));
    await page.mouse.move(0, 0);
    const resting = await underline();
    expect(resting.color).not.toBe(resting.text);
    await link.hover();
    const hovered = await underline();
    expect(hovered.color).toBe(hovered.text);
    expect(hovered.thickness).toBe("2px");
    await context.close();
  });

  it("underlines links and darkens the link color when more contrast is requested", async () => {
    const linkStyle = async (contrast: "more" | "no-preference") => {
      const { page, context } = await open("/nscache/", { contrast, colorScheme: "light" });
      const style = await page
        .locator("#revisions a")
        .first()
        .evaluate((link) => ({ color: getComputedStyle(link).color, line: getComputedStyle(link).textDecorationLine }));
      await context.close();
      return style;
    };
    const standard = await linkStyle("no-preference");
    const more = await linkStyle("more");
    expect(more.line).toBe("underline");
    expect(more.color).not.toBe(standard.color);
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

  it("sizes article titles to the header width without JavaScript", async () => {
    for (const [width, expected] of [
      [375, 33.2],
      [1280, 72],
    ] as const) {
      const { page, context } = await open("/nscache/", { javaScriptEnabled: false, viewport: { width, height: 800 } });
      const size = await page
        .locator('[role="heading"] h1.title')
        .evaluate((title) => Number.parseFloat(getComputedStyle(title).fontSize));
      expect(size, `${width}px`).toBeCloseTo(expected, 0);
      await context.close();
    }
  });

  it("prefetches the latest article when a reader hovers over its link", async () => {
    const { page, context, errors } = await open("/");
    const latest = page.locator("#latest h1 a");
    const path = new URL((await latest.getAttribute("href"))!, server.url).pathname;
    const request = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === path);
    await latest.hover();
    await expect(request).resolves.toBeTruthy();
    expect(errors).toEqual([]);
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

  it("cross-fades between pages unless the reader prefers reduced motion", async () => {
    for (const [reducedMotion, expected] of [
      ["no-preference", true],
      ["reduce", false],
    ] as const) {
      const { page, context } = await open("/", { reducedMotion });
      await page.addInitScript(() => {
        addEventListener("pagereveal", (event) => {
          document.documentElement.dataset.viewTransition = String(Boolean(event.viewTransition));
        });
      });
      await page.locator("#latest h1 a").click();
      await page.waitForLoadState("load");
      await expect(
        page.evaluate(() => document.documentElement.dataset.viewTransition),
        reducedMotion,
      ).resolves.toBe(String(expected));
      await context.close();
    }
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
    const shown = page.locator(".variable-width [data-width]:not([hidden])");
    await expect(shown.count()).resolves.toBe(1);
    await expect(shown.getAttribute("data-width")).resolves.toBe("40");
    // Readers resize the container by hand; the native ResizeObserver then shows a wider listing.
    await page.locator(".variable-width").evaluate((container: HTMLElement) => (container.style.width = "100%"));
    await page.waitForTimeout(300);
    await expect(shown.count()).resolves.toBe(1);
    await expect(shown.getAttribute("data-width")).resolves.toBe("90");
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
