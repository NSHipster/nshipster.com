/**
 * Captures screenshots of representative pages at mobile and desktop widths,
 * in light and dark modes, for visual comparison with the reference build.
 *
 * Usage: node scripts/screenshots.ts <base-url> <output-directory> [--print]
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [base, output] = process.argv.slice(2);
if (!base || !output) {
  console.error("Usage: node scripts/screenshots.ts <base-url> <output-directory> [--print]");
  process.exit(1);
}
const print = process.argv.includes("--print");

export const PAGES = [
  "/",
  "/nscache/",
  "/authors/mattt/",
  "/status",
  "/flight-school/",
  "/secrets/",
  "/customplaygrounddisplayconvertible/",
  "/swift-format/",
  "/caemitterlayer/",
  "/formatter/",
  "/xcconfig/",
  "/nope-404",
];

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 900 },
];

mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const problems: string[] = [];

for (const scheme of ["light", "dark"] as const) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`${page.url()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`${page.url()}: ${error.message}`));
    for (const pathname of PAGES) {
      const target = pathname === "/status" && process.argv.includes("--jekyll") ? "/status.html" : pathname;
      await page.goto(new URL(target, base).href, { waitUntil: "networkidle" }).catch(() => undefined);
      const name =
        `${pathname.replace(/\//g, "_") || "_"}-${viewport.name}-${scheme}.png`.replace(/^_+/, "") || "home.png";
      await page.screenshot({
        path: path.join(output, name === `-${viewport.name}-${scheme}.png` ? `home${name}` : name),
        fullPage: false,
      });
    }
    await context.close();
  }
}

if (print) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(new URL("/nscache/", base).href, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: path.join(output, "nscache-print.pdf") });
  await context.close();
}

await browser.close();
for (const problem of problems) console.log(problem);
console.log(`Captured ${PAGES.length * VIEWPORTS.length * 2} screenshots; ${problems.length} console errors.`);
