import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { AssetManifest, IMAGE_WIDTHS, assetManifest, isAnimated, svgSize } from "../../src/lib/assets.ts";
import { portraits } from "../../src/lib/images.ts";
import { ROOT, paths } from "../../src/lib/site.ts";

describe("images", () => {
  it("imports a portrait for each author with an image", () => {
    const directory = path.join(ROOT, paths.authors);
    const images = readdirSync(directory)
      .map((file) => readFileSync(path.join(directory, file), "utf8").match(/^image:\s*(\S+)/m)?.[1])
      .filter((image) => image !== undefined);
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(portraits).toHaveProperty([image]);
  });

  it("finds animated PNG and WebP images", () => {
    const assets = assetManifest();
    const animated = (name: string) => isAnimated(assets.build(assets.resolve(name)).contents);
    expect(animated("caemitterlayer-confetti.png")).toBe(true);
    expect(animated("uiactivity-airDrop.png")).toBe(false);
    expect(animated("wwdc-2019.jpg")).toBe(false);
    expect(animated("model-context-protocol-now-form-a-band.webp")).toBe(false);
    // A WebP file with the animation flag in its `VP8X` chunk.
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0, "latin1");
    webp.write("WEBPVP8X", 8, "latin1");
    expect(isAnimated(webp)).toBe(false);
    webp[20] = 0x02;
    expect(isAnimated(webp)).toBe(true);
  });
});

describe("WebP copies of images", () => {
  let cache: string;
  beforeEach(() => {
    cache = mkdtempSync(path.join(tmpdir(), "nshipster-images-"));
  });
  afterEach(() => rmSync(cache, { recursive: true, force: true }));

  it("makes smaller WebP copies at each width up to the image's own, without making the image larger", async () => {
    const assets = new AssetManifest(ROOT, { imageCache: cache });
    const asset = assets.resolve("uncertainty-screenshot--light.png");
    const original = assets.build(asset);
    const variants = await assets.variants(asset);
    expect(variants.map(({ width }) => width)).toEqual([...IMAGE_WIDTHS, 2916]);
    for (const { url, width } of variants) {
      expect(url).toMatch(new RegExp(`^/assets/uncertainty-screenshot--light-${width}w-[0-9a-f]{16}\\.webp$`));
      const contents = (await assets.variantOutput(url))!;
      expect(contents.length).toBeLessThan(original.contents.length);
      const metadata = await sharp(contents).metadata();
      expect([metadata.format, metadata.width]).toEqual(["webp", width]);
    }
    // An image narrower than every width gets a copy at its own width only.
    const small = await assets.variants(assets.resolve("1password-database.png"));
    expect(small.map(({ width }) => width)).toEqual([128]);
    expect(await assets.variants(assets.resolve("alert.gif"))).toEqual([]);
    expect(await assets.variants(assets.resolve("gpuimage-pipeline.svg"))).toEqual([]);
    expect(await assets.variants(assets.resolve("NSShowMe.tiff"))).toEqual([]);
    expect(await assets.variantOutput("/assets/uncertainty-screenshot--light-123w-0123456789abcdef.webp")).toBe(
      undefined,
    );
  });

  it("reuses copies from the cache in later builds and deletes unused ones", async () => {
    const name = "wwdc-2019.jpg";
    const first = new AssetManifest(ROOT, { imageCache: cache });
    const variants = await first.variants(first.resolve(name));
    expect(first.imageCacheStatistics).toEqual({ encoded: variants.length, cached: 0 });
    const files = readdirSync(cache).sort();
    expect(files).toHaveLength(variants.length);
    for (const file of files) expect(file).toMatch(/^[0-9a-f]{64}\.webp$/);

    // A later build reads the copies from the cache instead of encoding them again.
    const marker = path.join(cache, files[0]!);
    const cached = Buffer.concat([readFileSync(marker), Buffer.from("cached")]);
    writeFileSync(marker, cached);
    writeFileSync(path.join(cache, "unused.webp"), "unused");
    const second = new AssetManifest(ROOT, { imageCache: cache });
    const urls = (await second.variants(second.resolve(name))).map(({ url }) => url);
    expect(urls).toEqual(variants.map(({ url }) => url));
    expect(second.imageCacheStatistics).toEqual({ encoded: 0, cached: variants.length });
    const outputs = await Promise.all(urls.map((url) => second.variantOutput(url)));
    expect(outputs.some((contents) => contents!.equals(cached))).toBe(true);

    expect(second.pruneImageCache()).toBe(1);
    expect(readdirSync(cache).sort()).toEqual(files);
  });
});

describe("svgSize", () => {
  const svg = (attributes: string) => `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>`;

  it("reads the width and height in CSS pixels", () => {
    expect(svgSize(svg('width="600" height="300"'))).toEqual({ width: 600, height: 300 });
    expect(svgSize(svg('width="553.192px" height="42.000px"'))).toEqual({ width: 553, height: 42 });
    expect(svgSize(svg('height="76pt" width="565pt"'))).toEqual({ width: 753, height: 101 });
  });

  it("uses the view box for a missing or relative dimension", () => {
    expect(svgSize(svg('viewBox="0 0 1012 600"'))).toEqual({ width: 1012, height: 600 });
    expect(svgSize(svg('viewBox="0,0,600,200" width="300"'))).toEqual({ width: 300, height: 100 });
    expect(svgSize(svg('viewBox="0 0 600 200" width="100%" height="50"'))).toEqual({ width: 150, height: 50 });
  });

  it("has no size without absolute dimensions or a view box", () => {
    expect(svgSize(svg(""))).toBeUndefined();
    expect(svgSize(svg('width="100%" height="100%"'))).toBeUndefined();
    expect(svgSize(svg('width="10em" height="2em"'))).toBeUndefined();
  });
});
